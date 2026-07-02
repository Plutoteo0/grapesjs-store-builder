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

- Vite + React
- `grapesjs` 0.23.2 + `@grapesjs/react` 2.0.0
- Node.js/Express backend planned (not yet built) for per-client manifest API

---

## Current architecture (as of this file)

### Component system
- **`src/components/themed-block.js`** — base type. All themed components
  `extend: "themed-block"`. Handles the shared re-render subscription via
  `watchProps` (explicit list of own props that should trigger
  `updateContent()`).
- **Why `watchProps` exists:** early version used `this.on('change', ...)`
  without filtering — this fired on *any* model change, including
  GrapesJS-internal fields (selection state), which broke double-click
  text editing. `watchProps` scopes the listener to only the fields the
  component actually declares.
- **`src/plugin.js`** — single assembly point. Auto-registers every
  component under `src/components/*.js` via `import.meta.glob({ eager: true })`
  (compile-time, not dynamic — see "Planned: dynamic component loading"
  below for why this is changing).
- **Per-client override (current, generic):**
  ```js
  const componentOpts = opts[fileName];
  if (componentOpts) {
    Object.keys(componentOpts).forEach((key) => {
      if (key in typeConfig.model.defaults) {
        typeConfig.model.defaults[key] = componentOpts[key];
      }
    });
  }
  ```
  This replaced an old hardcoded `if (fileName === "footer") {...}` block
  that only worked for one component and two fields. Now any component can
  have per-client defaults just by adding a matching section to the config
  JSON — no `plugin.js` changes needed.
- **`src/editor-config.js` + `src/configs/*.json`** — per-client config
  layer. `getStoreConfig(storeId)` returns JSON passed as `pluginsOpts`.
  Config format is now **namespaced by component name**:
  ```json
  { "footer": { "theme": "dark", "companyName": "Acme Corp" } }
  ```
  (Not the old flat `{ "defaultTheme": ..., "defaultCompanyName": ... }`.)

### Components (5, all themed-block based)
- Footer — light/dark/social themes
- Header — light/dark/transparent
- Hero — light/dark/image (background image + alpha overlay color)
- Pricing Cards — **flat HTML-string implementation, refactor pending**
  (see below)
- Newsletter — light/dark

### Known GrapesJS gotchas (learned the hard way)
- Traits need `changeProp: 1` to write to the model property instead of
  the HTML attribute — otherwise `updateContent()` never sees the new value.
- `editor.Components.addType()` must be called *after* `opts` overrides are
  applied to `defaults`, not before — GrapesJS mutates the defaults object
  on registration.
- `storageManager` was `false` initially (nothing persisted). Now set to
  `{ type: "local", autosave: true }` so the component tree survives
  reloads and can be inspected via `editor.getComponents().toJSON()`.

---

## In progress: Pricing Cards container/child split

**Problem:** `pricing-cards.js` currently regenerates all cards from a
hardcoded HTML template string on every `cardCount` change. This means any
inline edits to a specific card (title, price, description) are destroyed
the moment `cardCount` changes, because the whole block gets rebuilt from
scratch with placeholder text.

**Plan:** split into two component types:
- **`pricing-container`** — layout/count/shared theme. Manages children
  programmatically via `this.components().add({ type: "pricing-card" })`
  and `.remove()` instead of string regeneration.
- **`pricing-card`** — independent child component, own `defaults`
  (title, price, description, buttonText, image) and own `traits`.
  `draggable: ".pricing-container"` so it can't be dropped standalone.
  No `blockInfo` — not draggable from the blocks panel directly, only
  created by the container.

Status: **not yet implemented** — a draft of `pricing-card.js` was sketched
but not committed. Next actual step in this thread of work.

Same container/child pattern is planned afterward for:
- Header nav items → `nav-container` + `nav-item`
- Footer social links → `social-container` + `social-link`

---

## Planned: dynamic per-client component loading (not yet started)

**Business need:** each client should be able to get a bugfix or a new
custom component without a full app rebuild/redeploy affecting every other
client.

**Why the current setup can't do this:** `import.meta.glob` resolves at
Vite **build time** — every component file is baked into the bundle. There's
no way to add/update a component for one client without rebuilding and
redeploying the whole app for everyone.

**Target architecture:**
1. **Component build pipeline** — each component built as its own
   standalone ES module (not bundled into the main App.jsx build).
2. **CDN/storage** — versioned, immutable paths, e.g.
   `/components/hero/1.2.0/hero.js`, `/components/hero/1.2.1/hero.js`.
   Immutable versioned URLs → can be cached indefinitely, no invalidation
   needed. Rollback = point the manifest at an older version.
3. **Backend: per-client manifest** — DB table roughly
   `store_components(store_id, component_name, version, url)`. Updating
   one client's `hero` version doesn't touch any other client's manifest.
4. **`App.jsx`** — becomes async: fetch the manifest + store config before
   rendering `<GjsEditor>`.
5. **`plugin.js`** — biggest change. Replace `import.meta.glob` with a loop
   over the manifest that does `await import(url)` per component, then
   `editor.Components.addType(name, module.default)`. The generic
   `opts[fileName]` override logic does **not** need to change — it doesn't
   care whether the component came from a local file or a remote URL.

**Security note:** dynamically `import()`-ing remote JS is safe here only
because the source is our own CI/CD pipeline (we build and publish every
component ourselves) — not arbitrary third-party or user-supplied code.

**Suggested first step (proof of concept):** rewrite `plugin.js` to load
from a hardcoded array of URLs via `await import(url)`, without a real
backend/CDN yet — validates the dynamic-loading mechanic in GrapesJS before
building the full pipeline (build system, CDN, manifest API).

Status: **architecture only, nothing implemented yet.**

---

## Broader project context (for reference, not urgent)

- This PoC is one building block of a larger long-term idea: a
  Shopify/Webflow-style multi-tenant store builder, built solo. Full scope
  includes multi-tenancy, product catalog, checkout, admin panel, storefront
  rendering — none of that exists yet. The GrapesJS work here is the
  page-builder module of that eventual system.
- Open architectural question not yet resolved: whether the page tree is
  stored as GrapesJS's own HTML/CSS export, or as an abstract JSON tree
  (`{ type, props, styles, children }`) rendered by a separate component
  registry on the storefront (decouples storefront rendering from GrapesJS).
  Leaning toward the abstract JSON tree.

---

## File map

```
src/
  App.jsx              # GjsEditor setup, storageManager, pluginsOpts
  main.jsx
  editor-config.js      # getStoreConfig(storeId)
  plugin.js              # component auto-registration + per-client override
  components/
    themed-block.js      # base type
    _template.js          # boilerplate for new components
    footer.js
    header.js
    hero.js
    newsletter.js
    pricing-cards.js      # flat implementation — refactor pending
  configs/
    acme.json
    beta.json
public/
  components.css
```
