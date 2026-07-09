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
      plugin.js            # registers pre-loaded modules + content-shape injection
      components/
        themed-block.js    # base type (bundled, always needed) — generic init/renderContent
        _template.js       # copy-paste starting point for a new component
    public/
      components/          # deployed component files (served as static assets, fetched at runtime)
        footer.js           # themed-block pattern, no editable fields beyond theme
        header.js           # themed-block pattern, no editable fields beyond theme
        hero.js              # reference impl of template + Traits + inline-edit pattern
        newsletter.js        # themed-block pattern, headingText editable inline
        pricing-cards.js     # container — builds pricing-card children from data, own init()
        pricing-card.js      # child — title (inline-editable), image (Traits-only), price (locked)
      styles/               # per-client CSS overrides (planned, not yet wired)
      components.css        # base styles for all clients
  backend/
    server.js              # Express API
    data/
      acme.json            # manifest + content for Acme
      beta.json            # manifest + content for Beta (still on the older per-name-string content shape)
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

- `App.jsx` fetches `GET /api/content/acme` once, up front — not per-component.
- The whole content map is passed into `plugin.js` as `opts.content`; for each module,
  `plugin.js` looks up `content[name]` and merges it into that component's `defaults`
  before `editor.Components.addType()` runs (see the three content shapes above).
- Components never fetch their own content — they just read `this.get("content")`
  (and whatever fields plugin.js merged in) at render time.
- `updateContent()` only handles theme class — never touches content.

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

- Server `content[name]` can be one of three shapes, detected in `plugin.js`:
  1. plain string → fully server-driven, nothing in it is user-editable. `defaults.content = content[name]`.
  2. object with a `template` key, `{ template, ...fields }` (hero, newsletter) → `template`
     has `{{fieldName}}` placeholders, `fields` gives their per-store values.
     `Object.assign(defaults, fields)`, `defaults.content = template`.
  3. object *without* a `template` key (pricing-cards' `{ cards: [...] }`) → structured data
     for a container that builds its own typed children, not a substitution template.
     `Object.assign(defaults, content[name])` directly — no `content` string involved at all.
- `themed-block.js` has a generic `renderContent()`: substitutes every `{{key}}` in
  `this.get("content")` with `this.get(key)` via regex, then `this.components(html)`.
  Generic on purpose — doesn't know which field names exist, just reads whatever key
  the template names and looks it up on the model. If a `{{key}}` has no matching field
  in `defaults`, it logs a `console.warn` instead of silently rendering an empty string.
- Editable pieces (e.g. `hero`'s `buttonText`) are declared as normal GrapesJS **Traits**
  (`changeProp: 1`). Trait values live as plain model props, so they're included in
  `editor.getComponents().toJSON()` and correctly restored by `setComponents()` — unlike
  freeform RTE-edited children, which live in the `components` collection and get wiped
  every time `renderContent()` reruns. This is what actually fixes the bug: only
  Trait-backed fields survive save/reload; everything else in the template is safe to
  regenerate from the server on every load (and *should* — it's DB data, not user edits).
- All of `hero`/`footer`/`header`/`newsletter` are migrated to this pattern now — none of
  them define their own `init()`, all inherit `themed-block`'s generic one.
  `pricing-cards` is the one exception, and deliberately so — see container/child pattern
  below, it isn't rendering a `{{}}` template at all.

**`watchProps` and inline-edit whitelist are derived from `traits`, not hand-declared
(2026-07-08):** originally each component listed its own `defaults.watchProps` array and
(briefly) its own `defaults.editableSelectors` map — both duplicated information already
present in `traits`. Now `themed-block.init()` computes both from `this.getTraits()`:
- `watchProps` = name of every trait with `changeProp` set.
- the inline-edit whitelist = every trait that *also* has a custom `selector` key (e.g.
  `{ type: "text", name: "headingText", changeProp: 1, selector: ".hero-heading" }`).
  `selector` isn't a GrapesJS-known key — Trait models are plain Backbone models and
  happily carry any extra attribute you give them.
- A trait with `changeProp` but no `selector` (e.g. `theme`, or `pricing-card`'s `image`)
  is watched (re-renders on change, appears in the Traits panel) but **not**
  double-click-editable in canvas — for `image` specifically because an `<img>` has no
  text content for RTE to edit anyway; it's Traits-panel-only.
- One field to declare (`traits`), not four (`defaults` + `watchProps` + `editableSelectors`
  + `traits` kept in sync by hand).

**Inline edit → Trait sync (double-click in canvas actually persists now, 2026-07-08):**
`renderContent()` walks the full (recursive, not just direct-children) subtree of every
rendered component. For each descendant:
- if its classes match a whitelisted `selector` → `editable: true`, and it gets a
  `child.on("rte:disable", ...)` listener that writes `child.getEl().innerText` back into
  the owning Trait via `this.set(prop, ...)`.
- otherwise → `editable: false, removable: false` (locked, whether it's a leaf or a
  wrapper — recursion still walks into a locked wrapper's own children, so nested
  structure no longer needs to avoid extra wrapper `<div>`s).
- `rte:disable` fires **directly on the child component's model**, with no arguments —
  confirmed by reading GrapesJS's own source (`ComponentTextView.toggleEvents`:
  `model.trigger(enable ? rteEvents.enable : rteEvents.disable)`). The public docs example
  (`editor.on('rte:disable', (view, rte) => {...})`) describes a *different*, editor-level
  event that this trigger never reaches — listening on `this.em` doesn't work here, you
  have to listen on the child model directly.
- Matching is done via `child.getClasses().includes(selector.replace(/^\./, ""))`, not
  `child.getEl().matches(selector)` — `getEl()` returns `undefined` until the component's
  view has actually rendered, which it hasn't yet at the point `renderContent()` runs
  synchronously inside `init()`. `getClasses()` reads straight off the model, no render
  wait needed. (`getEl()` *is* safe to call later, inside the `rte:disable` callback —
  by then the user has actually clicked into the rendered view.)
- If a whitelisted `selector` matches nothing after a render, `renderContent()` logs a
  `console.warn` (dead/misspelled selector) instead of failing silently.

**Known gap:** stores still on the plain-string content shape for a component that *also*
declares inline-editable traits (e.g. `beta.json`'s `hero`/`newsletter`, never migrated to
the template shape) will hit the original persistence bug again for that field — the
canvas edit looks like it works, but the next `renderContent()` re-derives from the static
string and discards it, because there's no `{{fieldName}}` placeholder tying the Trait to
the DOM in the first place. Only `acme.json` has been migrated to the template shape for
hero/newsletter/pricing-cards so far.

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
const { modules = [], content, ...clientOpts } = opts;
// modules    → array of { name, config } — register in order
// content    → the store's full content map from GET /api/content/:storeId; plugin.js
//              picks content[name] per component and merges it into that component's
//              defaults per the three content shapes (see persistence-bug section above)
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

`hero` is the reference implementation of the template + Traits + inline-edit pattern.
All four (`hero`/`footer`/`header`/`newsletter`) now follow it — none define their own
`init()`, all rely on `themed-block`'s generic one:

```js
defaults: {
  tagName: "section",
  theme: "light",
  buttonText: "",       // editable field, default comes from server content
  headingText: "",
  content: "",          // template string with {{buttonText}}/{{headingText}}, injected by plugin.js
  script: function () {
    const button = this.querySelector(".hero-button");
    if (button) button.addEventListener("click", () => console.log("button clicked"));
  },
  "script-props": ["theme", "buttonText"], // re-run script when either changes

  traits: [
    { type: "select", name: "theme", changeProp: 1, options: [/* ... */] }, // no selector: not inline-editable
    { type: "text", name: "buttonText", label: "Button text", changeProp: 1, selector: ".hero-button" },
    { type: "text", name: "headingText", label: "Heading text", changeProp: 1, selector: ".hero-heading" },
  ],
},

// no init() — inherited from themed-block
// no watchProps, no editableSelectors — both derived from traits above

updateContent() {
  const theme = this.get("theme");
  this.removeClass(["hero-light", "hero-dark", "hero-image"]);
  this.addClass(`hero-${theme}`);
},
```

Note there's no explicit `editable: false` on the root anymore either — that's already
GrapesJS's own default for every component, so setting it was redundant.

### Container/child components (pricing-cards + pricing-card)

Unlike the themed components above, `pricing-cards` doesn't render a `{{}}` substitution
template — its content shape from the backend is `{ cards: [...] }` (an array of per-card
data), because a single trait can only ever hold *one* value, and there are three cards
each needing independent `title`/`price`/`image`/etc. So it can't reuse the generic
template mechanism at all; it needs to build three distinct, independently-addressable
child *components*.

- `pricing-cards.js` defines its **own** `init()` (does not call/inherit `themed-block`'s):
  reads `this.get("cards")`, and if `this.components()` is empty (fresh load, not a
  restore), does `this.components().add({ type: "pricing-card", ...cardData })` once per
  card. The empty-check is the same persistence-bug guard as before, just "add" instead
  of "replace" — a restored save already has its 3 `pricing-card` children by the time
  `init()` runs, so re-adding would duplicate them.
- `pricing-card.js` is a normal themed-block component (inherits the generic
  `init()`/`renderContent()` same as hero) — it just happens to get instantiated
  programmatically by its container instead of coming from the manifest/Blocks panel
  directly. Its own `content` template is hardcoded in the component file (same markup
  for every card), only the field *values* (`title`, `price`, `desc`, `image`,
  `buttonText`) differ per instance, set at creation time via `.add({ type, ...cardData })`.
  `title` has a `selector` (inline-editable + synced), `image` has a trait but no
  `selector` (Traits-panel-only — an `<img>` has no text for RTE), `price` has no trait
  at all (locked completely, meant to come from a real DB later).
- `draggable: ".pricing-cards"` on `pricing-card` restricts it to only be
  dropped/moved inside the container.

---

## Known GrapesJS gotchas

- Traits need `changeProp: 1` — otherwise the field isn't watched at all (no re-render,
  doesn't count as "changed") and, if it also has a `selector`, isn't inline-editable either.
- `editor.Components.addType()` must be called after `opts` overrides are applied.
- A component that defines its own `init()` (currently only `pricing-cards`) completely
  overrides `themed-block`'s generic one — no automatic `watchProps`/inline-edit derivation,
  no `renderContent()`. Only do this when the content genuinely isn't a `{{}}` template
  (e.g. a container building typed children from an array).
- Dynamic `import()` from `public/` is blocked by Vite in dev — use fetch + Blob URL.
- Child component types must be registered before their parent containers reference them
  by `type` (manifest order matters — see `pricing-card` before `pricing-cards`).
- **`this.components(html)` replaces children, it doesn't append/insert-if-empty.**
  Calling it unconditionally in `init()` wipes anything restored from saved JSON — this
  was the root cause of the original "edits don't persist" bug. Same shape of bug applies
  to `.add()`-based containers too (see `pricing-cards`' empty-check guard).
- **A store's `content[name]` must use the `{ template, ...fields }` shape (not a plain
  string) for any field that's also declared as an inline-editable Trait** — otherwise
  there's no `{{fieldName}}` placeholder in the rendered HTML for the Trait to actually
  drive, and edits get silently discarded on the next render. `acme.json` is migrated for
  hero/newsletter/pricing-cards; `beta.json` is not (see persistence-bug section above).
- **`rte:disable` fires directly on the child component's model, with no arguments** —
  not on `editor`/`em`, despite what GrapesJS's own doc comment for the event implies.
  Listen with `child.on("rte:disable", ...)`, not `this.em.on(...)`.
- **`getEl()` returns `undefined` until the component's view has rendered** — which hasn't
  happened yet at the point `renderContent()` runs synchronously inside `init()`. Match
  inline-editable children by `getClasses()` (reads the model, always available), not by
  `getEl()?.matches(selector)`.
- **`script` runs once at initial render only.** If the component's DOM is regenerated
  on a trait change, the script (and any event listeners it attached) is gone on the
  new node unless `defaults["script-props"]` lists that trait's name.
- Editing files under `public/components/*.js` requires a **hard reload** (not just
  HMR) to see changes — they're fetched via `fetch()` + Blob URL + dynamic `import()`
  on app boot (see Dynamic component loading above), which the browser can cache like
  any other HTTP request.
- **Syncing RTE-edited content back via `innerHTML` (not `innerText`) can silently lock
  double-click editing after one round-trip, if that HTML contains any formatting tag
  (`<b>`, `<u>`, etc).** Root cause: `renderContent()`'s `this.components(html)` is a
  full HTML→component-tree parser, not a DOM `innerHTML` set — any nested tag in the
  synced value becomes its own real child *Component* on the next render (that's why a
  bolded/underlined span ends up with GrapesJS's own `data-gjs-type`/`draggable`/`id`
  attributes). `renderContent()`'s `walk()` then locks that new child
  (`editable: false`) because it has no matching trait `selector` (only a class match is
  checked, and formatting tags typically carry no class). Clicking that locked nested
  node should normally delegate up to the nearest editable text-type ancestor — but
  GrapesJS's own `canActivate()` short-circuits: `!model.get('editable') || ... ||
  (isInnerText = model.isChildOf('text'))` never evaluates the last operand once
  `!editable` is already true, so the delegate-to-parent path never runs and the second
  click does nothing (no selection at all). **Two separate fixes were needed, not one:**
  (1) live editing — tag the `rte:disable`-driven `set()` call with a custom option
  (`{ fromRte: true }`) and skip `renderContent()` for that specific change, since the
  browser's own DOM already reflects the edit correctly — no rebuild needed in the same
  session. (2) **restore-after-reload — `fromRte` alone does not cover this.** `init()`
  used to call `renderContent()` unconditionally, with no `fromRte` guard, and that's
  exactly the path a page reload takes: `editor.setComponents(saved.components)` already
  restores the (possibly `<u>`-containing) child tree *before* `init()` runs, then
  `init()`'s unconditional `renderContent()` re-parsed that same saved HTML through
  `this.components(html)` again — reproducing the identical lock, just triggered by F5
  instead of live typing. Fix: split `renderContent()`'s two responsibilities — building
  the child tree from the template (`this.components(html)`) vs. wiring
  `editable`/`rte:disable` onto whatever children currently exist (`walk()`, now its own
  `wireEditableChildren()` method) — and in `init()`, only call the full
  `renderContent()` when `!this.components().length` (fresh load, no restored children
  yet, mirrors the guard `pricing-cards.js` already used for the same reason); otherwise
  (restore) call `wireEditableChildren()` alone, which re-wires the listeners without
  ever feeding the restored HTML back through the parser.

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
