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

Components no longer generate HTML from traits. Instead:

- Each component has `apiUrl` in its `defaults`
- `plugin.js` injects the correct `apiUrl` for the current store before registration
- Component's `init()` fetches `GET /api/content/acme`, takes its slice (`data.hero`),
  and calls `this.components(html)`
- `updateContent()` only handles theme class — never touches content

Why: server knows the client's real data (products, company name, etc.). Component
just renders what it receives. Content changes = update the DB, no code change needed.

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

```js
defaults: {
  tagName: "section",
  theme: "light",
  apiUrl: "http://localhost:3001/api/content/acme", // overridden by plugin.js
  watchProps: ["theme"], // only theme triggers updateContent
  traits: [/* only theme select */],
},

async init() {
  const data = await fetch(this.get("apiUrl")).then(r => r.json());
  if (data.hero) this.components(data.hero); // insert server HTML
  this.updateContent();
  // manually wire watchProps (themed-block's init() is overridden)
  const events = this.get("watchProps").map(p => `change:${p}`).join(" ");
  this.on(events, this.updateContent);
},

updateContent() {
  const theme = this.get("theme");
  this.removeClass(["hero-light", "hero-dark"]);
  this.addClass(`hero-${theme}`);
  // NO this.components() call — content comes from server
},
```

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
  must manually wire `watchProps` listeners and call `updateContent()`.
- Dynamic `import()` from `public/` is blocked by Vite in dev — use fetch + Blob URL.
- Child components must be registered before their parent containers.

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
