# GrapesJS Component System — Project Context

Internship project at Uducat.com (PromoBullit Stores — B2B SaaS ecommerce
platform for managing multiple branded company stores). This file gives
Claude Code the context of what's been built and what's being planned, so
it doesn't need to be re-explained from scratch.

**Working style:** collaborative, not hierarchical ("как команда"). Explain
the logic behind changes, not just produce working code. Prefer generic,
reusable solutions over one-off hardcoded fixes.

---

## Stack

- Vite + React (`frontend/`)
- `grapesjs` 0.23.2 + `@grapesjs/react` 2.0.0
- Node.js + Express (`backend/`) — running, serves manifest, content, save/load

---

## Repo structure (monorepo)

```
grapesjs-components-poc/
  frontend/
    src/
      App.jsx              # async manifest fetch, save/restore, GjsEditor
      plugin.js            # registers pre-loaded modules + apiUrl injection
      components/
        themed-block.js    # base type (still bundled, always needed)
        _template.js
        footer.js          # fetches HTML from API on init
        header.js          # fetches HTML from API on init
        hero.js            # fetches HTML from API on init
        newsletter.js      # fetches HTML from API on init
        pricing-cards.js   # container — manages pricing-card children
        pricing-card.js    # child — own traits, draggable only inside container
        nav-container.js   # child container for nav items (inside header)
        nav-item.js        # child — label + url traits
    public/
      components/          # deployed component files (served as static assets)
      styles/              # per-client CSS overrides (planned, not yet wired)
      components.css       # base styles for all clients
  backend/
    server.js              # Express API
    data/
      acme.json            # manifest + HTML content for Acme
      beta.json            # manifest + HTML content for Beta
      acme.save.json       # saved editor state for Acme (auto-generated)
```

---

## Current architecture

### Dynamic component loading

Components are no longer bundled into the app. Flow on page load:

1. `App.jsx` reads `?store=acme` from query param (will be JWT in production)
2. `GET /api/manifest/acme` → array of `{ name, url }` from `backend/data/acme.json`
3. For each entry: `fetch(url)` → Blob → `import(blobUrl)` (Blob workaround needed
   because Vite blocks `import()` from `public/` in dev mode; not needed in production)
4. Pre-loaded modules passed to `plugin.js` via `pluginsOpts`
5. `plugin.js` registers each module — order in manifest determines registration order
   (child components must come before their containers)

### Content loading (server-rendered HTML)

- Each component has `apiUrl` in its `defaults`
- `plugin.js` injects the correct `apiUrl` for the current store before registration
- Component's `init()` fetches `GET /api/content/acme`, takes its slice (`data.hero`),
  and calls `this.components(html)`
- `updateContent()` only handles theme class — never touches content

Why: server knows the client's real data (products, company name, etc.). Component
just renders what it receives. Content changes = update the DB, no code change needed.

### Content persistence bug + fix (template + Traits pattern)

**Bug found:** every component's `init()` called `this.components(html)` unconditionally
with the server-fetched content. `init()` runs *after* GrapesJS has already set a
component's children from restored JSON (`editor.setComponents(saved.components)`), and
`this.components(html)` **replaces** children (not "insert if empty"). So on every reload,
the pristine server HTML silently overwrote any edits — text changes in the canvas
appeared to save but were wiped on next load.

**Fix — content is now a template, not raw HTML, for fields that need to be editable:**

- Server `content[name]` can be either a plain string (legacy, fully server-driven, never
  user-editable — footer/header/newsletter/pricing-cards today) or an object
  `{ template, ...fields }` (hero today) where `template` contains `{{fieldName}}`
  placeholders and `fields` gives their default values.
- `plugin.js` detects which shape it got: string → `defaults.content = content[name]`;
  object → destructure `{ template, ...fields }`, `Object.assign(defaults, fields)`,
  `defaults.content = template`.
- `themed-block.js` has a generic `renderContent()`: substitutes every `{{key}}` in
  `this.get("content")` with `this.get(key)` via regex, then `this.components(html)`.
  It's generic on purpose — it doesn't know or care which field names exist, it just
  reads whatever key the template names and looks it up on the model.
- Editable pieces (e.g. `hero`'s `buttonText`) are declared as normal GrapesJS **Traits**
  (`changeProp: 1`). Trait values live as plain model props, so they're included in
  `editor.getComponents().toJSON()` and correctly restored by `setComponents()` — unlike
  freeform RTE-edited children, which live in the `components` collection and get wiped
  every time `renderContent()` reruns. This is what actually fixes the bug: only
  Trait-backed fields survive save/reload; everything else in the template is safe to
  regenerate from the server on every load (and *should* — it's DB data, not user edits).
- `hero.js` no longer defines its own `init()` — it inherits `themed-block`'s generic
  `init()` (calls `renderContent()` + `updateContent()`, wires both to `watchProps`).
  Only `footer`/`header`/`newsletter`/`pricing-cards` still override `init()` themselves
  (not yet migrated to this pattern).

**v1 scope decision (2026-07-07):** only Traits-exposed fields are editable. Double-clicking
directly into canvas text (heading, button, anything not wired as a Trait) still *looks*
editable via GrapesJS's default RTE, but the edit is silently discarded next time
`renderContent()` runs (theme change, reload) — `editable: false` on the component's own
root blocks RTE on itself, but does **not** cascade to children inserted via
`this.components(html)`, which default to `editable: true` individually. Locking those
children too (loop over `this.components()` after render, set `editable: false` /
`removable: false` on each) was scoped out of v1 to avoid over-building before the
inline-edit-to-Trait sync (double-click writes back into the Trait prop) is designed —
tracked as follow-up work, not yet implemented.

### Interactive behavior in components (`script` / `script-props`)

- `defaults.script` is a plain function GrapesJS serializes and runs against the
  component's real DOM node (`this`) — works both in the canvas iframe and in exported
  production HTML. Must be self-contained (no outer closures), since it's stringified.
- `script` only executes once, at initial render. If the component's DOM gets
  regenerated (e.g. `renderContent()` rebuilding children on a trait change), the
  handler is lost on the new node unless `defaults["script-props"]` lists the trait
  names that should trigger a script re-run. Example on `hero`: click handler on
  `.hero-button` needs `"script-props": ["theme", "buttonText"]` to survive a theme
  change, because `watchProps` (our own mechanism, drives `renderContent`) and
  `script-props` (GrapesJS's own mechanism, drives script re-execution) are separate
  and must both list the same trait names.

### Save / restore editor state

- On every editor change (debounced 1s): `POST /api/save/acme` with
  `{ components, html, css }` from `editor.getComponents().toJSON()`,
  `editor.getHtml()`, `editor.getCss()`
- On editor init: `GET /api/load/acme` — if saved state exists, restore via
  `editor.setComponents()` + `editor.setStyle()`
- Saved to `backend/data/acme.save.json` (will be `store_pages` table in production)

### plugin.js

Accepts pre-loaded modules, no longer uses `import.meta.glob`:

```js
const { modules = [], apiUrl, ...clientOpts } = opts;
// modules   → array of { name, config } — register in order
// apiUrl    → injected into each component's defaults.apiUrl
// clientOpts → per-component default overrides (currently unused, storeConfig removed)
```

### Backend API

```
GET  /api/manifest/:storeId  → manifest array from data/*.json
GET  /api/content/:storeId   → HTML content map { hero: "<h1>...", footer: "..." }
GET  /api/load/:storeId      → saved editor state (404 if none)
POST /api/save/:storeId      → saves { components, html, css } to *.save.json
```

---

## Component patterns

### Themed components (hero, footer, header, newsletter)

`hero` is the reference implementation of the template + Traits pattern (see above).
It relies on `themed-block`'s generic `init()`/`renderContent()` and only overrides
`updateContent()` for its own theme classes:

```js
defaults: {
  tagName: "section",
  theme: "light",
  buttonText: "",       // editable field, default comes from server content
  content: "",          // template string with {{buttonText}}, injected by plugin.js
  editable: false,      // blocks RTE on the component's own root (not on its children — see gotchas)
  script: function () {
    const button = this.querySelector(".hero-button");
    if (button) button.addEventListener("click", () => console.log("button clicked"));
  },
  "script-props": ["theme", "buttonText"], // re-run script when either changes
  watchProps: ["theme", "buttonText"],     // re-run renderContent/updateContent when either changes
  traits: [
    { type: "select", name: "theme", changeProp: 1, options: [/* ... */] },
    { type: "text", name: "buttonText", label: "Button text", changeProp: 1 },
  ],
},

// no init() — inherited from themed-block

updateContent() {
  const theme = this.get("theme");
  this.removeClass(["hero-light", "hero-dark", "hero-image"]);
  this.addClass(`hero-${theme}`);
},
```

`footer`/`header`/`newsletter`/`pricing-cards` still use the older pattern (own `init()`,
plain-string `content`, no editable Traits beyond theme) — not yet migrated.

### Container/child components (pricing-cards + pricing-card)

`pricing-cards` manages children via `this.components().add/remove` instead of
HTML string regeneration — preserves inline edits when card count changes.

`pricing-card` has its own traits (title, price, description, image, buttonText).
`draggable: ".pricing-cards"` prevents dropping outside the container.

### nav-container + nav-item (inside header)

Same container/child pattern. Header fetches its full HTML from server — nav items
are part of that HTML, not managed as GrapesJS child components anymore.
`nav-container` and `nav-item` remain registered but are not used by header
in the current server-HTML approach.

---

## Known GrapesJS gotchas

- Traits need `changeProp: 1` — otherwise `updateContent()` never sees the new value.
- `editor.Components.addType()` must be called after `opts` overrides are applied.
- `themed-block.init()` is overridden when a component defines its own `init()` —
  must manually wire `watchProps` listeners and call `updateContent()`. (`hero` no
  longer does this — see template + Traits pattern above.)
- Dynamic `import()` from `public/` is blocked by Vite in dev — use fetch + Blob URL.
- Child components must be registered before their parent containers.
- **`this.components(html)` replaces children, it doesn't append/insert-if-empty.**
  Calling it unconditionally in `init()` wipes anything restored from saved JSON —
  this was the root cause of the "edits don't persist" bug (see above).
- **`editable: false` only blocks RTE on the component's own root**, not on children
  inserted via `this.components(html)` — those default to individually editable.
  Double-clicking them still looks like it works but the edit is discarded on next
  re-render. Not yet fixed (v1 scope decision, see above).
- **`script` runs once at initial render only.** If the component's DOM is regenerated
  on a trait change, the script (and any event listeners it attached) is gone on the
  new node unless `defaults["script-props"]` lists that trait's name.
- Editing files under `public/components/*.js` requires a **hard reload** (not just
  HMR) to see changes — they're fetched via `fetch()` + Blob URL + dynamic `import()`
  on app boot (see Dynamic component loading above), which the browser can cache like
  any other HTTP request.

---

## Production architecture (planned, not built)

```
JWT token → storeId (never from query param in production)
  ↓
GET /api/manifest  → [{ name, url: "cdn.com/hero/1.0.1/hero.js", css: "cdn.com/..." }]
GET /api/content   → { hero: "<h1>...</h1>", ... }
GET /api/load      → saved editor state (from store_pages DB table)
  ↓
Components fetched from CDN, CSS loaded in canvas
  ↓
POST /api/save → store_pages table
```

Per-client component update flow:
- Fix bug in `hero.js` → build → upload to CDN as `hero/1.0.2/hero.js`
- `UPDATE store_components SET version='1.0.2' WHERE store_id='acme' AND name='hero'`
- Client hits F5 → gets fix. Other clients unaffected.

DB tables (planned):
- `stores` — store registry
- `store_components` — per-client manifest (name, version, url, css)
- `store_content` — HTML content per component per store
- `store_pages` — saved editor state (components_json, css, html)

---

## Broader project context

- Shopify/Webflow-style multi-tenant store builder. GrapesJS PoC is the
  page-builder module. Product catalog, checkout, admin panel not yet started.
- Storage format decision: currently saving GrapesJS component JSON tree +
  HTML + CSS. Abstract JSON tree approach (`{ type, props, children }`) still
  an option for decoupling storefront rendering from GrapesJS — not resolved.
