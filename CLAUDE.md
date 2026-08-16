# GrapesJS Component System — Project Context

Internship project at Uducat.com (PromoBullit Stores — B2B SaaS ecommerce
platform for managing multiple branded company stores). This file gives
Claude Code the context of what's been built and what's being planned, so
it doesn't need to be re-explained from scratch.

**Working style:** collaborative, not hierarchical ("как команда"). Explain
the logic behind changes, not just produce working code. Prefer generic,
reusable solutions over one-off hardcoded fixes. **For backend work
specifically, the user writes the code themselves** — Claude explains
approach, reviews diffs, points out bugs, doesn't author implementations
unless explicitly asked to just write something.

**Standing constraints from the internship supervisor, backend
work:** no auth on the backend yet (deliberately deferred); reusable
business logic must live in framework-agnostic `services/` modules that
don't know about `req`/`res` — callable from a plain Node script with zero
HTTP, routes stay a thin layer over services.

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
    services/
      page-renderer.js     # framework-agnostic: reads saved page JSON, renders EJS partials → clean HTML
    views/
      components/
        header.ejs          # milestone 1 (done) — EJS mirror of header.js's content template
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

**Known gap (closed 2026-07-23):** a store still on the plain-string content shape for a
component that *also* declares inline-editable traits would hit the original persistence
bug again for that field — the canvas edit looks like it works, but the next
`renderContent()` re-derives from the static string and discards it, because there's no
`{{fieldName}}` placeholder tying the Trait to the DOM in the first place. Both
`acme.json` and `beta.json` are now migrated to the template shape for
hero/footer/header/newsletter/pricing-cards — no store left on the plain-string shape
for an editable field.

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
POST /api/render/:storeId    → { components } in body → { html } out, via services/page-renderer.js
```

All five routes are guarded by `isValidStoreId(id)` (`/^[a-z0-9-]+$/`, `server.js`) before
any `path.join()` — closes the path-traversal gap noted below. `POST /api/save` and
`POST /api/render` also validate their body shape (`Array.isArray(components)`, etc.)
before touching disk/render, returning 400 on a bad payload instead of writing garbage
or crashing.

**`POST /api/render/:storeId` takes `components` in the request body, it does not read
`*.save.json` off disk** (2026-07-16 decision) — this was a deliberate fix for a race
condition: the editor's autosave is debounced ~1s, so if a future "Preview/Publish"
button fired `/save` and a disk-reading `/render` at the same time, `/render` could read
a stale or not-yet-written save file. Fix: the frontend builds one `components` payload
per click and sends the *same* object to both `/save` and `/render` — neither endpoint
depends on the other having already run. `page-renderer.js`'s `renderPage(storeId, payload)`
reflects this: `payload` is optional, falls back to `getData(storeId)` (disk read) via
`payload ?? await getData(storeId)` only when no payload is passed — used today only by
the manual test call at the bottom of the file, not by the render route. `getContent(storeId)`
(the store's real per-client data/copy) is still always read server-side in both cases —
that's not something the client sends, so there's no race on it.

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
  drive, and edits get silently discarded on the next render. Both `acme.json` and
  `beta.json` are migrated for hero/footer/header/newsletter/pricing-cards (see
  persistence-bug section above).
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
- **`editor.Panels.addButton(id, { el: someDomNode })` does not work for a `<select>`
  in GrapesJS 0.23.2 — confirmed by direct DOM inspection, not assumed.** The button
  model registers fine (`editor.Panels.getButton(...)` returns it, `el` attribute is the
  real select), but the actual rendered DOM only ever gets a single bare `<option>`
  appended to the panel's button container — the `<select>` wrapper itself is discarded
  and never attached to the document. Reproduced in isolation (a fresh two-option test
  select through the same call, independent of any other app code) — this is a library
  quirk/bug in this version, not a bug in our usage. `el` support for a plain `<button>`-
  like DOM node presumably still works (that's the documented use case); just don't rely
  on it for `<select>`. Workaround used instead: a plain React `<select>` rendered as a
  sibling of `<GjsEditor>` (not through `Panels` at all), styled with GrapesJS's own
  `gjs-field`/`gjs-select` CSS classes (already loaded via the bundled
  `grapes.min.css`) so it looks native — see the page-switcher section below.
  **Gotcha inside the gotcha:** the bare `gjs-select` class alone forces `width: 100%`
  (correct in its original context — a small wrapper — wrong on a wide plain container),
  so an explicit inline `width` in `style` is required to override it; inline `style`
  wins over the class since GrapesJS's CSS doesn't use `!important` here. Absolutely-
  positioned custom elements placed as a sibling of `<GjsEditor>` also need an explicit
  `zIndex` (GrapesJS's own panels render at `z-index: 4`) or they render underneath.
- **`renderComponent()` in `page-renderer.mjs` had no guard for a component `type` with
  zero entry in `content[storeId].json` at all** (distinct from the three known content
  shapes) — e.g. a generic GrapesJS built-in type (`text`, `link`, `image`) ending up as
  a *root-level* saved component (the same "stray drag" class of accident documented
  above under acme's hero/header incident, just recurring on a different store/page).
  Previously this crashed with `TypeError: Cannot read properties of undefined (reading
  'template')` inside the `else` branch, caught by `server.mjs`'s blanket `catch` and
  surfaced only as an opaque 404 — no indication of the real cause. Fixed 2026-07-28:
  early-return `""` with a `console.warn` when `content[node.type] === undefined`, same
  spirit as the existing "no wrapper in config" warn-and-fallback a few lines down. This
  does not fix stray nesting itself (that's a canvas-editing mistake, not a code bug) —
  it just stops one bad node from taking down the entire page's render.

---

## Backend production roadmap (agreed order)

1. **DB**: Postgres + JSONB (not MySQL — JSON index flexibility). Tables:
   `stores`, `store_components`, `store_content`, `store_pages`. Open: blob
   vs normalized `store_pages.components_json`; draft/published history
   before first migration?
2. **Backend → DB**, same API contract — only `getStoreData()` internals change.
3. **env files** for backend only (`DATABASE_URL` etc) — frontend untouched,
   API contract stable.
4. **JWT auth**, after DB (needs `users ↔ stores` table). Open: one user =
   one store, or one user manages many (agency)? Determines whether
   `:storeId` moves from URL into the token or stays in URL behind a
   middleware access check.
5. **Admin panel**, last, narrow scope: assigning components to a store +
   locking specific canvas fields (e.g. `price` on `pricing-card`, meant to
   come from a future product catalog). NOT for regular content editing —
   GrapesJS inline-edit already covers that.

**Fixed 2026-07-16** (turned out not worth deferring to DB migration): path traversal
(`storeId` now validated via `isValidStoreId()` before any `path.join()`, all 5 routes)
and missing `req.body` validation on `POST /api/save` / `POST /api/render`
(`Array.isArray(components)` etc., 400 on bad shape). Bare `catch {}` still masks all
error types in the GET routes — left as-is, low risk (read-only, 404 is the right
response either way) but worth tightening if this grows past a PoC.

**Still open, and reclassified as pre-launch not post-DB-migration (2026-07-16):
last-write-wins race on concurrent saves.** Originally filed as "fix at DB migration
time" — re-evaluated because this repo is the actual Uducat.com internship product, not
a diploma throwaway, so "two editors on the same store overwrite each other with zero
error" is a real risk once more than one person can touch a store, not a someday
problem. Needs addressing before a real client launch: either optimistic locking (a
version/timestamp field in `*.save.json`/`store_pages`, reject a save if someone already
wrote a newer one) or serializing writes per `storeId`. Not blocking for the current
render-endpoint work, but should land before this goes in front of an actual client.

### EJS page renderer (in progress — milestone 1 done, revised architecture 2026-07-15)

**Goal:** after a page is saved in the editor, generate clean static HTML
(no `data-gjs-type`/GrapesJS attributes) for what's actually served to
storefront visitors. Separate rendering path from the canvas (browser-side
regex `{{}}` substitution in `themed-block.js`) by design — canvas is for
editing, EJS is for production output, not duplicated logic.

**Revised approach (superseded the original "one hand-written `.ejs` file per
type" plan) — "Idea A":** since `content[name].template` (the `{{fieldName}}`
mustache string already sitting in `acme.json`/`beta.json`) is *the same
markup* the browser-side regex renderer consumes, hand-writing an equivalent
`.ejs` file per type would just be retyping identical HTML twice with a
different placeholder syntax — real duplication for every "template-shape"
type (`header`, `footer`, `hero`, `newsletter`, `testimonial`). Instead,
`page-renderer.js` converts `{{field}}` → `<%- field %>` on the fly and
renders the result as a string (`ejs.render()`), not a file
(`ejs.renderFile()`) — no hand-written `.ejs` partial exists for these five
types, `backend/views/components/` is unused for them. (`pricing-cards` is
still the one exception — see below, it has no `{{}}` template to convert.)

Architecture, as implemented in `backend/services/page-renderer.js`:
- `adapter(str)` — `str.replace(/\{\{\s*(\w+)\s*\}\}/g, "<%- $1 %>")`. Pure
  string→string, no I/O, converts the mustache template to EJS syntax.
- `DEFAULT_WRAPPERS` (renamed from `WRAPPERS`, 2026-07-16 — see per-store wrapper
  section below) — a lookup table, one entry per type, holding what
  `content[name].template` structurally *cannot* carry: the root tag and
  theme-class prefix (`{ tag: "header", classPrefix: "header" }`). Some
  types also need `baseClass` — a class that's always present regardless of
  theme (`newsletter` → `"newsletter-inner"`, `testimonial` →
  `"testimonial"`) — `header`/`footer`/`hero` have none.
- Theme is computed inside the generated EJS scriptlet from the saved
  node's `classes` array — `classes.find(c => c.startsWith(prefix) && c !==
  baseClass)`, stripped of the prefix, falling back to `"light"`. **Must
  exclude `baseClass` from the search** — e.g. `newsletter-inner` itself
  starts with `"newsletter-"`, so without the exclusion `.find()` matches
  the base class instead of the real theme class and computes a garbage
  theme (`"inner"`). Not read from a `theme` field directly — GrapesJS's
  `toJSON()` only serializes trait values that differ from the type's
  `defaults`, so `theme: "light"` (the default) is typically absent from
  `.save.json` even though the resulting class is present.
- `content[name]` can still be either content-shape 1 (plain string, e.g.
  `footer` — nothing editable beyond theme, no `{{}}` at all) or shape 2
  (`{ template, ...fields }`) — `renderComponent()` branches on
  `typeof content[node.type]` once, at the top, and derives both the
  template string *and* the data object from that single branch (not two
  separate, inconsistent checks).
- **Merge-fallback for missing trait fields:** the data passed to
  `ejs.render()` is `{ ...defaultsFromContent, ...node }`, not `node` alone.
  Reason: same as the theme problem above — if a store's saved node never
  had a trait field edited away from its default (e.g. `newsletter`'s
  `newsHeading` left as `"Welcome"`), that key is entirely *absent* from
  `.save.json`, not just `undefined`. EJS resolves template variables via
  `with(locals)` — a genuinely missing key throws `ReferenceError`, unlike
  the browser's `this.get(key) ?? ""` which silently defaults. Merging in
  `content[name]`'s own field values (excluding its `template` key) as a
  base, overridden by whatever the saved node actually has, avoids the
  crash and mirrors what the field's value would've been if never edited.
- Data source is otherwise the saved component tree (`.save.json`'s
  `components` array), not `editor.getHtml()` (carries GrapesJS markup).
- Container/child components (`pricing-cards`/`pricing-card`) still need a
  hand-written `pricing-cards.ejs` (not built yet) — its content-shape is
  `{ cards: [...] }`, no `{{}}` template to run through `adapter()`. Plan:
  `forEach` over the saved node's own `components` array (the actual saved
  `pricing-card` children, each already carrying its own flattened fields
  like `title`/`price`/`image` — same mechanism as any other node, trait or
  not, since `toJSON()` serializes any attribute that differs from
  defaults, not just trait-declared ones) + `include()`, mirroring the
  container's own programmatic child-creation in GrapesJS. `pricing-card`'s
  own template is planned to move from hardcoded `defaults.content` in
  `pricing-card.js` into `content["pricing-card"].template` in
  `acme.json`/`beta.json` (same Idea A treatment as the other five types) —
  **keep the hardcoded template in `pricing-card.js` as a fallback default**,
  not delete it, since a store that forgets to declare `content["pricing-card"]`
  would otherwise silently render empty cards.
- **Per-store markup variance — resolved, 2026-07-15 decision:** the
  original plan deferred this to a hypothetical `content[name].templatePath`
  field (YAGNI, no store needed it). Turns out Idea A already gives this
  "for free," for the *inner* markup: `content[name].template` is read
  per-`storeId` via `getContent(storeId)`, so if `beta.json`'s `header.template`
  differs from `acme.json`'s, the server renders different inner structure
  per store automatically, no extra mechanism needed.
- **Per-store wrapper — the gap above is now closed, 2026-07-16.** `wrapper`
  (`{ tag, classPrefix, baseClass }`) moved from the global `WRAPPERS` table into
  `content[name].wrapper` in each store's own `acme.json`/`beta.json`, exactly the
  move anticipated above (motivated by "what happens at 50 components × 10 clients
  with different markup needs"). `renderComponent()`:
  `const wrapper = rawContent?.wrapper ?? DEFAULT_WRAPPERS[node.type]` — `rawContent`
  can be a plain string (content-shape 1), so `?.` matters here, not just style: a
  string has no `.wrapper`, evaluates to `undefined`, falls through to the default
  cleanly, same code path handles all three content shapes with no extra type check.
  `DEFAULT_WRAPPERS` (the old global table, renamed) is kept as a **fallback only**,
  same pattern as `pricing-card.js`'s hardcoded template fallback — a store that
  forgets to declare `wrapper` doesn't crash or render unstyled, it gets the default
  and a `console.warn(`No wrapper in config for ${node.type}, using DEFAULT_WRAPPERS`)`
  so the gap is visible in logs instead of silently guessed-at.

  **`acme.json` fully migrated (2026-07-16)** — all 7 types now declare their own
  `content[name].wrapper`, no warnings left on render. `footer` needed an extra step
  beyond just adding the key: it was still content-shape 1 (plain string, "fully
  server-driven, nothing editable"), and a shape-1 value can't hold a `wrapper` key at
  all — turning it into `{ wrapper: {...} }` with no `template` would've made
  `isContainer`'s `typeof rawContent === "object" && !rawContent.template` check
  misfire and treat `footer` as a container. Fix: gave `footer` a real (if trivial)
  `template` with one placeholder (`{{ footerText }}`), formally promoting it to shape
  2 — same treatment `header`/`hero`/`newsletter`/`testimonial` already had. Also
  added the matching Trait to `footer.js` (`footerText`, `changeProp: 1, selector:
  ".footer-text"`) so the new field is inline-editable in canvas, not just
  server-driven — required giving the `<span>` its own class (`footer-text`) since
  `themed-block.js`'s `wireEditableChildren()` matches a trait's `selector` against
  `child.getClasses()` (a class *on* the element itself), not a descendant CSS
  selector — same reason `header-logo`/`header-cta` are classes, not tag selectors.
  `beta.json` migrated the same way on 2026-07-23 (see the dedicated section above).
- File extension: `.js` → `.mjs` rename planned across the backend (project
  is already ESM via `"type": "module"`, this is explicit naming) — not
  done yet, still `page-renderer.js`.

`backend/services/page-renderer.js` (framework-agnostic, no `req`/`res`):
- `getData(storeId)` — reads and parses `backend/data/${storeId}.save.json`,
  returns the full saved-state object.
- `getContent(storeId)` — reads and parses `backend/data/${storeId}.json`
  (the manifest+content file, same one `GET /api/content/:storeId` serves),
  returns just `.content`.
- `renderComponent(node, content)` — branches on `content[node.type]`'s
  shape, builds the EJS string (scriptlet + `WRAPPERS`-derived wrapper tag +
  adapted template), merges fallback field values, calls `ejs.render()`
  (string-based, not `renderFile`), returns the HTML string.
- Manual test call at the bottom (`getData("acme")` → `.find(c => c.type
  === X)` → `getContent("acme")` → `renderComponent(node, content)` →
  `console.log`) — run with `node services/page-renderer.js` from `backend/`.
  Verified working for `header`, `footer` (shape 1), `hero`, `testimonial`,
  `newsletter` (shape 2, incl. `baseClass` cases).

Milestone plan:
1. ✅ Five template-shape types (`header`, `footer`, `hero`, `testimonial`,
   `newsletter`) — generic `renderComponent()`, cross-checked against the
   GrapesJS canvas output for each.
2. ✅ `pricing-cards`/`pricing-card` — `pricing-card`'s template moved to
   `content["pricing-card"].template` (hardcoded `defaults.content` in
   `pricing-card.js` kept as fallback for stores that forget to declare it).
   No hand-written `pricing-cards.ejs` needed in the end — container
   handling folded into `renderComponent()` itself as a third branch
   (`isContainer`, detected the same way `plugin.js` detects content-shape
   3: an object without a `template` key), which recurses into the node's
   own saved `components` array and calls `renderComponent()` on each
   child. This means *any* future container-shape type is handled for
   free — no new function needed, only a `WRAPPERS` entry, same as any
   leaf type. Found and fixed along the way: `pricing-cards.js`'s
   `add-card` command was hardcoding `buttonText: "Choose Plan"` on every
   new card, silently overriding the content-driven default — removed, so
   new cards now inherit `buttonText` from `content["pricing-card"]` like
   everything else.
3. ✅ Page assembler — `renderPage(storeId)`: `getData` + `getContent`,
   `Promise.all(data.components.map(node => renderComponent(node, content)))`,
   `.join("")`. Verified against the full `acme` save — all 7 types render
   correctly in one pass, no per-type branching in the assembler itself.
4. ✅ Thin `POST /api/render/:storeId` endpoint (`server.js`) calling
   `renderPage(storeId, { components })` — no business logic in the route
   itself, just `isValidStoreId` + body-shape check + delegate. Takes
   `components` from the request body rather than reading `*.save.json`
   (see race-condition note in Backend API section above).
5. ✅ **CSS in the render output — done 2026-07-16.** `renderPage()` now
   returns a full `<!DOCTYPE html><html><head>...</head><body>...</body></html>`
   document, not a bare body string — resolved the open question in favor of
   "self-contained," consistent with "renders EJS partials → clean HTML."
   Three sources feed the `<head>`, exactly as scoped:
   - `components.css` — unconditional `<link>`, always added regardless of
     what's on the page.
   - `manifest[i].cssUrl` — per-component `<link>`s, but **only for types
     actually present on the page**, not the whole manifest blindly. New
     helper chain in `page-renderer.js`:
     - `collectUsedTypes(node)` — pure, sync, recursive: walks a single
       node's full subtree (mirrors `renderComponent`'s own container
       recursion), returns a `Set` of every `node.type` encountered,
       including GrapesJS built-ins (`text`, `link`, `textnode`, `image`)
       that don't exist in the manifest — harmless, they just find no match
       later and get silently skipped, no special-casing needed.
     - `getAllTypes(components)` — also pure/sync, calls `collectUsedTypes`
       once per root node in the page's `components` array and merges all
       the resulting `Set`s into one. Deliberately takes the array directly,
       not a `storeId` — doing its own `getData(storeId)` internally would
       silently re-read the save file from disk even when `renderPage` was
       given a client `payload`, reintroducing the exact race condition
       milestone 4 fixed, just relocated. Every function that needs the
       page's component tree gets it passed in, never re-fetches it itself.
     - `buildCssLinks(storeId, data)` — the only `async` one of the three
       (does real I/O via `getManifest`). Looks up each used type in the
       manifest, collects `cssUrl` where present (`pricing-card` has none —
       skipped, not an error), maps to `<link rel="stylesheet" href="...">`
       strings, appends the unconditional `components.css` link last.
       Reading the manifest fresh per-request here is fine (unlike the
       component tree) — manifest is server-owned config, never something
       the client sends, so there's no equivalent race to worry about.
   - `data.css` (the actual saved CSS text from `editor.getCss()`) — no URL
     to link to, inlined directly as `<style>${data.css}</style>`.
   - `getManifest(storeId)` — new, mirrors `getContent(storeId)` exactly,
     just returns `.manifest` instead of `.content`.
6. ✅ **Preview/Publish button — done 2026-07-16.** `App.jsx`:
   - `buildPayload(editor)` extracted to module scope (outside the `App`
     component, next to `STORE_ID`/`API_BASE`) — a pure function of
     `editor`, no closure over React state, so both the autosave handler
     and the button's command can call it and always get the same shape
     (`{ components, html, css }`).
   - Autosave debounce increased `1000ms → 3000ms` — safe to relax now that
     render is no longer tied to every keystroke tick (see milestone 4's
     reasoning), purely about not spamming `/save` while typing.
   - `editor.Commands.add("preview-publish", { async run(editor) {...} })`
     + `editor.Panels.addButton("options", { command: "preview-publish", ... })`
     — GrapesJS-native pattern, appears in the same top-right icon row as
     the built-in preview/fullscreen/export-code buttons (the `"options"`
     panel), not a bespoke React button outside the editor. Deliberately
     *not* a per-component `toolbar` command (that's `pricing-cards`'
     `add-card` pattern) — this button is page-global, not tied to a
     selected component.
   - Handler: `const payload = buildPayload(editor)`, then
     `await Promise.all([fetch("/api/save", ...payload), fetch("/api/render", { components: payload.components, css: payload.css })])`
     — **the actual consumer of the race-condition fix from milestone 4**:
     one payload, built once, sent to both endpoints in parallel, neither
     endpoint depends on the other having already run or on disk state
     being fresh. Checks `saveRes.ok`/`renderRes.ok` explicitly afterward
     (`fetch` doesn't reject on 4xx/5xx, only on network failure — `Promise.all`
     alone wouldn't surface a 400/500 as an error). Currently just
     `console.log(html)`s the result — no file-write/download wired up yet,
     that's next.
   - Verified end-to-end in-browser (not just curl): editing in canvas →
     clicking the button → `console.log`'d HTML matches what a manual
     `curl -X POST /api/render` produces from the same saved state, byte
     for byte.

**Found while testing (2026-07-16), not a renderer bug — a data-integrity
gap worth knowing about:** a stray drag during testing nested `header` as
a *child* of `hero` in `acme.save.json` instead of leaving it as its own
root-level entry. GrapesJS's canvas still rendered it fine (canvas renders
the DOM tree as-is, doesn't care about "semantic" nesting). The production
renderer silently dropped it: `renderComponent()` for a template-shape type
(`hero` is shape 2) never looks at `node.components` at all — it builds
HTML purely from `content[type].template` + EJS, by design, since a
template component's children are supposed to come only from `{{}}`
substitution, not arbitrary nested components. So a real component
accidentally saved as a template-type's child is invisible to
`renderPage()` even though it's visible in the canvas — no warning, no
error, just quietly absent from the output. Not something to defend
against in code right now (this was messy test data from an unusually long
single session, not a realistic editing accident) — fixed by hand
(`hero.components.splice` the stray child out, `data.components.unshift`
it back to root level in `acme.save.json`) — but worth remembering if a
real store's render ever comes out missing a section that's clearly
visible in the editor: check whether it's nested somewhere it shouldn't be
before assuming the renderer itself is broken.

**`wrapWithTag(wrapper, node, innerHtml)`** — extracted out of
`renderComponent` once the wrapper-building logic needed to be reused in
two places (normal leaf render and the container branch). Deliberately
plain JS, not an EJS scriptlet embedded in a JS template string — computes
theme from `node.classes` directly (not from `data`, the content-merged
object — `classes` is never part of `content[name]`, it's purely
saved-instance/canvas state, so routing it through the content-fallback
merge would be conceptually wrong even though the two happen to agree
today) and returns `<${tag} class="...">${innerHtml}</${tag}>`. Handles the
themeless case (`pricing-card`/`pricing-cards`, no `classPrefix`) via
`[baseClass, prefixedTheme].filter(Boolean).join(" ")` rather than a
separate code path.

**Multi-tenancy rule for `services/`:** every function takes
`storeId`/store data explicitly as an argument; no module-level state or
cache not keyed by `storeId` — otherwise one client's data could leak into
another's response.

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

---

## Security fixes — 2026-07-22

Found via a full-project security pass (unauthenticated render/save endpoints +
`<%- %>` unescaped EJS output = stored XSS risk on the actual storefront output).
Both fixed and verified by hand (temporary throwaway test scripts, not committed):

- **Field-level XSS (`{{field}}` → EJS injection):** `content[name]` gained an
  optional `richTextFields: [...]` array (same config tier as `wrapper` — lives
  per-store, per-type, next to it in `acme.json`). `adapter(str, richTextFields)`
  in `page-renderer.mjs` now emits `<%- field %>` (unescaped) only for fields in
  that list, `<%= field %>` (EJS-escaped) for everything else — safe default,
  rich HTML only where a component's RTE-editable trait (one with a `selector`)
  actually needs to preserve `<b>`/`<u>` formatting. Fields listed in
  `richTextFields` are additionally run through `sanitizeRichField()`
  (`sanitize-html`, `allowedTags: ["b","i","u","em","strong","br"]`,
  `allowedAttributes: {}`) before `ejs.render()` — closes the gap that escaping
  alone can't (a stored `<script>` in a rich field would otherwise survive
  unescaped). Rule going forward: `richTextFields` for a given type must mirror
  exactly the traits that have a `selector` in that type's `.js` file — `acme.json`
  hero's list is `["headingText", "subheadingText", "buttonText"]`, matching all
  three RTE-selector traits in `hero.js`.
- **Attribute-injection via `node.classes` → `theme`:** `wrapWithTag()` extracted
  `theme` from `node.classes` (attacker-controlled — comes straight off the
  client-submitted `components` tree, since there's still no auth) and spliced it
  directly into `class="..."` with no validation — a crafted class string like
  `hero-" onmouseover="alert(1)` broke out of the attribute. Fixed with a
  `THEME_RE = /^[a-z0-9-]+$/` check; anything that doesn't match falls back to
  `"light"`, same fallback already used for "no theme class found at all."
- Still open, not yet done: CORS is wide open (`cors()` with no origin
  allowlist), `express.json()` has no body-size limit, and
  `collectUsedTypes`/`renderComponent` recurse into `node.components` with no
  depth guard — all three are DoS-shaped, all three matter more once this stops
  being localhost-only. Picking this back up is next session's first item (see
  below).

## Preview/Publish now actually opens a preview — 2026-07-22

`App.jsx`'s `preview-publish` command opens a real popup window instead of only
`console.log`-ing the HTML: `window.open("about:blank", "_blank")` **before** the
`await`s (must happen synchronously in the click handler — after an `await`, the
browser no longer treats a `window.open()` call as a direct result of user
activation and silently popup-blocks it), then `previewWindow.document.write(html)`
+ `.document.close()` once the render response comes back. Verified working via a
throwaway Playwright/headless-Chromium script (no `chromium-cli` available in this
environment) — the earlier `""` (empty string) argument to `window.open` was
triggering a real Chrome/Edge quirk where it opens the browser's internal New Tab
Page (a different origin) instead of `about:blank`, causing a
`SecurityError` on `.document` access; explicit `"about:blank"` fixed it.
**Gotcha found while debugging this, worth remembering:** the failure only ever
reproduced in VSCode's built-in Simple Browser (an Electron webview that sandboxes
`window.open`/cross-window `document` access differently) — a real external browser
(and headless Chromium via Playwright) had no problem with it at all. Any future
`window.open`-based feature in this project should be tested in a real browser,
not VSCode's Simple Browser, before assuming the app code is broken.

**Still just a "preview," not a real publish** — the rendered HTML only ever lands
in a popup tab; nothing persists it server-side, and no route serves it to an
actual storefront visitor. Noted as a real gap, not yet scheduled (see "next up"
list below).

## Multi-page architecture — decision made 2026-07-22, storage/routing built 2026-07-23

Previously one store = one page: `acme.save.json` held a single flat `components`
array for the whole store, and every route (`/api/save/:storeId`,
`/api/load/:storeId`, `/api/render/:storeId`) had no notion of "which page."
Decided this needed solving before it became a bigger migration later (a real
storefront needs home + product + checkout pages at minimum, not one section) —
so the DB schema (`store_pages`, still unmigrated) can be designed page-aware
from the start instead of needing a second migration.

**Deliberately scoped out of this pass, tracked as its own follow-up:** linking
between pages (a Trait on a button/`<a>` that points at another page of the
same store, rendered as `href="/store/:storeId/:pageSlug"`). Everything below
is storage/routing/creation only — no component yet knows another page exists.

**Impact analysis (confirmed correct in practice) — what changed and what didn't:**
- `content[name]` config (`template`, `wrapper`, `richTextFields`) — **no change**,
  as predicted. Scoped per component *type*, not per page, so today's security
  work didn't need revisiting.
- `getContent(storeId)` / `getManifest(storeId)` in `page-renderer.mjs` —
  **no change**, as predicted.
- `getData(storeId)` → `getData(storeId, pageSlug)`, reading
  `${storeId}.${pageSlug}.save.json` instead of `${storeId}.save.json`. Existing
  `acme.save.json` manually renamed to `acme.home.save.json` (`home` established
  as the convention for a store's default/first page).
- `renderPage(storeId, payload)` → **`renderPage(storeId, pageSlug, payload)`**
  — `pageSlug` deliberately placed *before* `payload`, not after. Reasoning: the
  publish route (`GET /store/:storeId/:pageSlug`, below) needs to call this with
  `payload` omitted entirely, relying on `payload ?? (await getData(...))` to
  fall back to a disk read. A bug surfaced here during review: an earlier attempt
  passed `{}` as a placeholder for the omitted middle argument — `{}` is not
  `null`/`undefined`, so `??` never falls through to `getData`, and rendering
  crashes on `data.components` being absent. Putting the truly-optional argument
  *last* means the disk-read call site is just `renderPage(storeId, pageSlug)`,
  no placeholder needed, and the mistake becomes structurally hard to make again.
- Routes gained a second URL segment — `/api/save/:storeId/:pageSlug`,
  `/api/load/:storeId/:pageSlug`, `/api/render/:storeId/:pageSlug` — additive,
  not a contract break. `/api/manifest/:storeId` and `/api/content/:storeId`
  stayed store-only (unchanged), matching the "not page-scoped" call above.
- **New: `GET /store/:storeId/:pageSlug`** — the actual publish-facing route.
  Calls `renderPage(storeId, pageSlug)` (no payload → reads disk) and responds
  with `res.set("Content-Type", "text/html").send(html)`, not JSON — a real
  visitor (or a plain browser tab) hitting this URL gets a normal HTML page,
  no client-side JS involved. No separate draft/published state was introduced
  (deliberate choice, see below) — this route always reflects whatever the
  autosave most recently wrote to disk.
- **New: `POST /api/pages/:storeId`** — creates a new empty page. Takes
  `{ slug }` in the request body (not the URL — the whole point is the page
  doesn't exist yet, so it can't be a route param the way `:pageSlug` is
  elsewhere). Validates `storeId` and `slug` (`typeof slug !== "string"` guards
  against `regex.test(undefined)` coercing to the string `"undefined"` and
  passing validation — a real bug hit during review), checks the target file
  doesn't already exist via `access()` (404/reject = safe to create, resolve =
  409 Conflict), writes `{ components: [], html: "", css: "" }` — genuinely
  empty, no default header/footer scaffolding (deliberate: easier to add than
  to remove, per the user's call).
- **Draft vs. published — decided to keep it simple for now.** No separate
  `*.published.json` file; the publish route reads the same file the editor's
  autosave writes to, live. Means a real visitor could see a change seconds
  after it's typed, with no explicit "go live" gate. Accepted for this stage
  (single editor, no real visitors yet) — and confirmed *not* a costly decision
  to revisit later: adding a separate published-copy file is a one-line change
  to which file the `GET` route reads, not a rework of the render pipeline.
  Rolls into the same "draft/published history" open question already tracked
  under the DB migration roadmap.
- `App.jsx`: `pageSlug` read from `?pageSlug=` in the query string (parallel to
  `STORE_ID`'s `?store=`, defaulting to `"home"`), threaded into all three
  fetch calls that need it (`/api/load`, `/api/save`, `/api/render`).
  `buildPayload()` itself unchanged — `pageSlug` is routing information, not
  part of the saved payload body, same reasoning as `storeId` never being in
  the body either.
- **New "Create Page" button** (`editor.Commands.add("create-page", ...)`,
  paired with an `options`-panel button next to `preview-publish`) —
  `window.prompt` for a slug (no full form yet, matches the existing
  `preview-publish` button's level of polish), `POST /api/pages/:storeId`,
  `alert`s the result either way (error message on failure, or the `?pageSlug=`
  URL to open the new page on success — no in-app page switcher yet, that's a
  separate future UX piece, not blocking here).
- The pending last-write-wins race-condition fix (see Backend production roadmap)
  now naturally reads as "lock per `(storeId, pageSlug)`" instead of "per
  `storeId`" — same mechanism, no rework, as predicted.

**Verified end-to-end (2026-07-23), not just read through:** a throwaway
Playwright script drove the real running app — clicked the Create Page button,
answered the `prompt` dialog, confirmed the `alert` text interpolated the
actual slug (not a literal `${...}`), confirmed `acme.<slug>.save.json`
appeared on disk with the empty shape, then loaded `?pageSlug=<slug>` in a
fresh page load and confirmed the canvas rendered with **zero** component
elements (genuinely empty, not accidentally inheriting `home`'s content) and no
console errors. Test script and generated data file deleted after verification,
not committed.

Net: this was an additive change to the storage/routing layer, not a rewrite of
`plugin.js`/`themed-block.js`/the render pipeline — confirmed both in the
original impact analysis and again in practice once built.

---

## `beta.json` migrated — 2026-07-23

Same mechanical migration `acme.json` got on 2026-07-16, applied to `beta.json`:
all five template-shape types (`hero`, `footer`, `header`, `newsletter`) plus
`pricing-card`/`pricing-cards` now use the `{ template, ...fields, wrapper }` /
`{ wrapper, cards: [...] }` shapes instead of plain strings — the original
persistence bug (canvas edits silently discarded on reload) no longer applies to
beta's `hero`/`newsletter`. Deliberately **no `richTextFields`** for beta (user's
call: no rich-text formatting needed for this store's fields yet) — everything
renders through the safe `<%= %>` (escaped) path by default, which is fine since
none of beta's fields need `<b>`/`<u>` preserved.

Also fixed a real bug found along the way, not just a migration gap: beta's
`manifest` was missing a `pricing-card` entry entirely (only `pricing-cards` was
listed). Since `pricing-cards.js`'s `init()` creates children with
`type: "pricing-card"`, and `plugin.js` only calls `editor.Components.addType()`
for types present in the manifest, that type was never registered for beta —
canvas would've silently fallen back to a generic/default component type for
every card. Added `{ "name": "pricing-card", "url": "/components/pricing-card.js" }`
to the manifest, no `cssUrl` (same as acme — pricing-card has no separate CSS file).

Verified with a throwaway `tmp-beta-test.mjs` calling `renderPage("beta", { components, css: "" })`
with a synthetic saved-state payload covering all 5 types plus an overridden
pricing-card — confirmed edited fields render, and fields left at their default
(never touched in the fake "save") correctly fall back to `content[name]`'s
own values via the existing merge-fallback, exactly like acme. Script deleted
after verification, not committed.

## Page-switcher dropdown + render robustness fix — 2026-07-28

**In-app page switcher, built and verified in a real browser (not just read
through) — item 6 from the previous "Next session" list, done.**

- **`GET /api/pages/:storeId`** (`server.mjs`) — no page list was stored
  anywhere before this; pages only existed as `${storeId}.${pageSlug}.save.json`
  files on disk. Reads `data/`, filters filenames against a per-storeId regex,
  extracts each `pageSlug` capture group, returns `{ slugs: [...] }`. Validates
  `storeId` the same way every other route does, before building the regex
  (not after — regex built from unvalidated input first, then checked, was an
  early draft bug, fixed before landing). Empty result for a store with zero
  saved pages is a valid `{ slugs: [] }`, not a 404 — the store itself
  (`acme.json`) can exist independent of any saved page.
- **`App.jsx`** — tried the "native" route first: registering the switcher as
  a third `editor.Panels.addButton("options", { el: select })`, alongside the
  existing `preview-publish-btn`/`create-page-btn`. Confirmed via direct DOM
  inspection (not just visual guess) that this does not work for a `<select>`
  in GrapesJS 0.23.2 — see the new gotcha entry above for the exact failure
  mode. Fell back to a plain React `<select>` rendered as a sibling of
  `<GjsEditor>` (inside a `position: relative` wrapper div), styled with
  GrapesJS's own `gjs-field`/`gjs-select` classes so it reads as part of the
  editor chrome rather than a bolted-on control. Needed an explicit `width`
  (overriding `gjs-select`'s own `width: 100%`) and `zIndex` (GrapesJS's panels
  render at `z-index: 4`, so anything without an explicit z-index of its own
  renders underneath them) to actually become visible and correctly sized.
  `pages`/`slugs` moved to real `useState` (was briefly a local variable inside
  `onEditor` during the `Panels.addButton` attempt) since the select is now
  plain JSX and needs to re-render on data changes; `handlePageChange` moved
  from inside `onEditor` to component-body scope for the same reason. Selecting
  a page does a full `window.location.search` reassignment (real page reload),
  consistent with how `STORE_ID`/`pageSlug` were already module-level consts
  read once from the query string, not React state — no attempt made to
  hot-swap pages inside an already-mounted editor instance.
- Verified end-to-end in a real browser session: dropdown lists both of
  acme's existing pages, visually matches the native device-selector's
  styling, and selecting `new-slug` actually reloads to `?pageSlug=new-slug`
  with the canvas showing that page's real saved content.

**Found and fixed a real render-pipeline crash along the way, unrelated to the
dropdown itself** — clicking Preview/Publish on `new-slug` returned an opaque
404. Traced by calling `renderPage()` directly (bypassing `server.mjs`'s
blanket `catch`, which was swallowing the real error) — actual cause was a
`TypeError` in `renderComponent()` for a component `type` with no entry at all
in `content["acme"].json` (a stray root-level `text` component, likely the
header logo dragged out of `header` at some earlier point — the same "stray
drag" class of accident already documented for acme's own save file, just
recurring on the `new-slug` test page). Fixed with an early-return guard (see
gotchas section above). **Note for whoever picks up "Links between pages"
next:** the same class of accident recurred a *second* time later in this
session, this time `pricing-cards` ending up nested inside `hero` instead of
as a sibling — harmless post-fix (no crash, `hero`'s template-shape renderer
just silently ignores children it doesn't expect), but it's the second
independent occurrence of "stray nesting during manual canvas testing," not a
one-off. **Discussed, not yet implemented:** the real fix for this class of
bug is `droppable: false` on `themed-block.js`'s own `model.defaults` (shared
by every type that `extend`s it — hero/footer/header/newsletter/pricing-card/
pricing-cards) so GrapesJS's own canvas refuses the drop in the first place,
rather than catching the consequence at render time. `pricing-cards.js`
already does exactly this pattern today (`droppable: ".pricing-card"`,
line 33) — a child type's own `defaults` override wins over an inherited one,
so centralizing `droppable: false` in `themed-block.js` would not conflict
with pricing-cards' existing narrower override. Left as a backlog item, not
blocking.

**Confirmed (by manually testing it, not just reading code) exactly why
per-link `href` edits don't survive to production, and it clarifies next
session's "Links between pages" work:** set a real `<a>` element's `href`
trait in the canvas (GrapesJS's own built-in `href` field, no custom code
involved) to `/store/acme/new-slug`, confirmed it saved correctly into
`acme.home.save.json`'s component tree — then hit the real published route
(`GET /store/acme/home`) and found the link still says `href="#"`. Root cause:
`content.header.template` in `acme.json` hardcodes `href="#"` on all four nav
links directly in the template string, with zero `{{}}` placeholders for
them. Since `header` is a template-shape (shape 2) component, `renderComponent`
only ever emits that fixed template — it never looks at `node.components`
(where the canvas-edited `href` actually lives) at all. So today's manual
edit had zero effect on the real page, and neither would *any* edit to those
links today, regardless of mechanism (typed by hand or eventually via
`linkTo`) — the gap is structural, not specific to the `linkTo` trait we
haven't built yet.

**This actually simplifies the "wire `linkTo` into the render pipeline" step
that was scoped as open/undecided work** — `header` already goes through
`renderComponent`'s existing `{{}}` → EJS substitution machinery
(`adapter()` + `ejs.render()`), which is fully generic (works for any field
name). So once `content.header.template` gets real `{{homeHref}}`-style
placeholders (replacing the hardcoded `href="#"`s) and matching default
field values, and `header.js` gets matching traits (`changeProp: 1`, no
`selector` — an `href` isn't RTE text content, so inline double-click-edit
doesn't apply here, same reasoning as `pricing-card`'s `image` trait being
Traits-panel-only), the existing generic pipeline picks the value up for
free. No new code needed in `page-renderer.mjs` itself — the only genuinely
new code is the custom `linkTo` Trait type
(`editor.Traits.addType("linkTo", { createInput, onEvent, onUpdate })`,
sourced from the already-built `GET /api/pages/:storeId`).

## Links between pages, manifest-driven static routes, and the CSS split — 2026-07-29

**1. `linkTo` Trait — done, verified end-to-end on the real production route.**
Closed out the "Links between pages" item from 2026-07-28's plan.

- `header.js` — four new fields (`homeHref`, `aboutHref`, `servicesHref`,
  `contactHref`; `changeProp: 1`, no `selector` — an `href` isn't RTE text
  content, same reasoning as `pricing-card`'s `image` trait). Template string
  updated to use `{{homeHref}}`-style placeholders instead of hardcoded `#`.
- `acme.json` — matching `{{}}` placeholders + default values (`"#"`) added to
  `content.header.template`, same merge-fallback mechanism every other
  templated field already uses. No changes needed in `page-renderer.mjs`
  itself — `header` already goes through the generic `{{}}` → EJS
  substitution, which picks up any field name automatically.
- `App.jsx` — `editor.Traits.addType("linkTo", { createInput, onEvent, onUpdate })`
  registered in `onEditor`, *before* `editor.setComponents(saved.components)`
  restores the canvas (a custom trait type has to exist before a component
  using it gets restored). `createInput` builds a `<select>` from
  `GET /api/pages/:storeId` (fetched once, same endpoint the page-switcher
  dropdown already uses — two consumers, one route), with `value` set to the
  full `/store/:storeId/:slug` path (not the bare slug) so the trait's value
  is already a usable `href`. `onEvent`/`onUpdate` are the two-way sync halves
  GrapesJS requires for any custom trait type — `onEvent` writes UI → model
  (fires on the select's `change`), `onUpdate` writes model → UI (fires on
  programmatic `.set()`, e.g. during restore) — without `onUpdate` a restored
  page would always show the first `<option>` regardless of the real saved
  value.
- **Two real bugs caught and fixed during review, before shipping:** (1)
  `.then((r) => (r.ok ? r.json : { slugs: [] }).catch(...))` — `r.json`
  wasn't called (missing `()`), and `.catch` was chained onto the ternary's
  *result* instead of the fetch promise, so it could never actually catch a
  network failure. Fixed to `.then((r) => (r.ok ? r.json() : { slugs: [] }))
  .catch(...)`. (2) the four new traits were initially declared
  `type: "text"` (copy-paste from step 1) instead of `type: "linkTo"` —
  caught before the custom dropdown ever got exercised.
- **Verified by hand, not just in the editor:** picked `home` for `HomeHref`
  in the canvas, hit Preview/Publish, then read `GET /store/acme/home`
  directly — confirmed `href="/store/acme/home"` in the real served HTML,
  not `#`. This closes the exact gap the 2026-07-28 finding described (canvas
  edits to `href` having zero effect on production).
- **Known gap, not yet handled:** no empty/`#` option in the `<select>` — a
  component whose saved `href` value doesn't match any current page slug
  (e.g. that page got renamed) renders as an unselected dropdown, and
  `onUpdate` silently leaves it on the first `<option>` with no warning.
  Same category as the existing "dead selector → `console.warn`" pattern
  elsewhere in the codebase; not done here yet.
- **Not yet migrated:** `beta.json`'s `header.template` still hardcodes `#`
  — same treatment (placeholders + defaults) needed there before `linkTo`
  does anything for that store. `hero`'s button (`buttonText`/its `href`) was
  in scope per the original plan but not done this session either — `linkTo`
  itself is reusable as-is (registered once, globally, at the `editor` level,
  not tied to `header`), only the per-component trait + template wiring is
  outstanding.

**2. Manifest-driven static routes for CSS/JS — done.** Found by accident,
not by design: opening the real production route directly on the backend
(`http://localhost:3001/store/acme/home`, port 3001, not the Vite dev server
on 5173) returned every CSS file as `503` — `server.mjs` had **no static file
serving at all**, not even a blanket `express.static`. This is a distinct,
already-existing gap, not "waiting on the CDN migration" — confirmed by
testing, and worth remembering as its own thing next time CSS/JS 404s or
503s in an unfamiliar way.

Considered a blanket `express.static(publicDir)` first (simplest, works
immediately since `frontend/public/`'s on-disk layout already mirrors every
manifest `url`/`cssUrl` verbatim) — rejected in favor of a manifest-validated
route, consistent with the rest of the codebase's "never trust a path,
validate against config" habit (`isValidStoreId` before every disk read).
Landed as two route groups, not one, because they have genuinely different
contracts:

- **`GET /styles/:storeId/*`** — the only path shape that actually carries a
  `storeId` segment. Validates `isValidStoreId`, then reads
  `getManifest(storeId)` (now `export`ed from `page-renderer.mjs` — it was
  module-private before, only used internally by `buildCssLinks`), builds a
  `Set` of that store's `cssUrl` values, and only serves the file if
  `req.path` is in that set — a 404 for a legit-shaped but undeclared path
  (`/styles/acme/doesnotexist.css`) confirms the whitelist is real, not
  decorative.
- **`GET /components/*` + `GET /components.css`** — no `storeId` in these
  paths at all (both are shared across every store today), so no manifest
  lookup makes sense for them; served unconditionally as a flat fallback.
  Deliberately kept even though `components.css` itself is about to become
  functionally redundant (see next section) — "becomes a dead code path in
  prod, harmless" was an explicit, accepted tradeoff rather than something
  to clean up now.
- **Bug caught in review, fixed independently mid-session:** the first draft
  of the `/styles` route was `app.get("/styles/:storeId", ...)` — no `/*`
  wildcard — which only matches `/styles/acme` and silently never matches
  the real nested requests (`/styles/acme/header.1.0.0.css`). Flagged, then
  fixed to `/styles/:storeId/*` before the next verification pass.

**3. `components.css` — tested empirically, then fully superseded by
per-component files (kept only as an inert fallback).** Before touching
anything, ran an actual experiment instead of reasoning about it in the
abstract: renamed `components.css` away and reloaded the editor — confirmed
it is genuinely load-bearing today (layout, theme backgrounds, and button
styling all broke), not dead weight. Then, as a scoped proof of concept,
moved just `header`'s base CSS into `styles/acme/header.1.0.0.css`, disabled
`components.css` again, and confirmed `header` alone kept rendering
correctly while the rest of the page (not yet migrated) broke as expected —
validating that the per-component-file approach works before committing to
doing it for everything.

Given that proof, migrated all remaining types the same way — for **both**
`acme` and `beta` — moving each type's base layout/theme rules (previously
one shared section per type inside `components.css`) into that type's own
existing per-store file (`styles/<store>/<name>.<version>.css`), on top of
whatever store-specific override already lived there (e.g. acme's
`.footer-inner { background-color: #0d3894 }`). Covered: `footer`, `header`,
`hero`, `newsletter`, `pricing-cards` for both stores, plus `testimonial` for
`acme` only (`beta`'s manifest has no `testimonial` entry — correctly
skipped, not an oversight). `components.css` itself is unchanged and stays
in place — the user's explicit call was to keep serving it as a harmless
fallback rather than delete it now, since a store that hasn't migrated yet
(or a future component type that forgets its own base CSS) still has
something to fall back to.

**Found and fixed a real cascade-order bug this exposed — only visible on
the actual production route, not in the editor.** Once per-component files
carried genuine color differences (not just duplicate-but-identical rules),
load order started to matter: `buildCssLinks()` in `page-renderer.mjs` was
appending `/components.css`'s `<link>` **last** (`linkUrls.push(...)`), so on
the real `GET /store/:storeId/:pageSlug` route it loaded *after* every
per-component stylesheet — and at equal specificity, last-loaded wins. Result:
`components.css`'s base `.newsletter-light { background: #f5f5f5 }` was
silently overriding the newly-added `styles/acme/newsletter.1.0.0.css`'s
`.newsletter-inner { background-color: #0d3894 }` override, visible only as
a wrong (grey instead of blue) background on the real published page — the
editor itself never showed this, because `App.jsx`'s own `styles` array
already lists `/components.css` **first** (`styles: ["/components.css",
...cssUrls]`), so the editor and the production renderer had silently
different load orders the whole time. Fixed with `linkUrls.unshift(...)`
instead of `.push(...)`, matching the editor's own order; reloaded
`GET /store/acme/home` and `GET /store/acme/new-slug` directly and confirmed
colors/borders/layout now match the editor exactly.

**Worth remembering as a pattern, not just a one-off fix:** this is the
second time in two sessions that the editor's rendering path and the
production (`page-renderer.mjs`) rendering path have silently disagreed —
first the header-nesting render crash (2026-07-28), now this cascade-order
mismatch. Both were only caught by deliberately testing the real
`GET /store/:storeId/:pageSlug` route by hand, not by reading the code or
trusting that "it works in the editor." Any future change that touches how
either path assembles CSS/HTML should get the same treatment: verify against
the actual production route, not just the canvas.

## Dynamic data providers (products/prices) — in progress, started 2026-08-04

**Goal (from the internship supervisor):** components like `pricing-cards`
should be able to render real data (products, prices) instead of the
statically-authored `content[name]` from `acme.json`/`beta.json` — and the
mechanism needs to generalize to any future dynamic component (filters,
etc.), not just cards, and work correctly per-store.

**Key architectural decision (confirmed with the user before writing code):
production render always resolves live data, never the saved snapshot.**
`pricing-cards` already had a container pattern — `pricing-cards.js`'s
`init()` bakes `pricing-card` children into `*.save.json` once, on first
open (`!this.components().length` guard), and the existing `isContainer`
branch in `page-renderer.mjs` renders those saved children on every
request. That's correct for editable marketing copy, but wrong for prices —
a saved snapshot from weeks ago would silently go stale. So the new
"dynamic container" path deliberately **ignores `node.components`
entirely** and rebuilds children fresh from the data provider on every
render call. The canvas-editor side (`pricing-cards.js`'s one-time bake)
is untouched for now — known limitation, see below.

**New files:**
- `backend/services/data-providers/products.mjs` — `getProducts(storeId, params)`,
  currently a mock (`MOCK_PRODUCTS` keyed by `storeId`), same async signature
  a real DB query will have later. Framework-agnostic per the standing
  `services/` rule — `storeId` explicit, no module-level cache.
- `backend/services/data-providers/index.mjs` — `DATA_PROVIDERS` registry,
  `{ products: getProducts }`. A future provider (e.g. `categories`) is a
  new file + one line here — nothing else changes.
- `backend/services/content-resolver.mjs` — `resolveContent(storeId, content)`.
  Walks every `content[type]` entry; if it has a `dataSource` key, looks up
  the matching function in `dataProviders`, calls `provider(storeId, raw.params)`,
  and attaches the result as `items` (deliberately not `cards` — the
  resolver doesn't know about specific component field names). Unknown
  `dataSource` → `console.warn` + leave the entry as-is, same
  warn-and-fallback pattern as `wrapper`/`richTextFields` elsewhere.

**Changes to `backend/services/page-renderer.mjs`:**
- `getContent(storeId)` now `export`ed (was module-private) and returns
  `resolveContent(storeID, data.content)` instead of raw `data.content` —
  so both the canvas (`GET /api/content/:storeId`, once `server.mjs` is
  updated) and the production renderer see identical, already-resolved
  content, not two independent code paths that could drift.
- `renderComponent()` gained a new `isDynamicContainer` branch, checked
  **before** the existing `isContainer` branch: if `rawContent.dataSource`
  is set, build synthetic child nodes (`{ type: rawContent.childType, ...item }`)
  from `rawContent.items` and render each recursively through the same
  `renderComponent()` — a dynamic `pricing-card` child still renders via its
  own `content["pricing-card"].template` + EJS exactly like any other child,
  no changes needed to `pricing-card.js` itself. `node.components` (the
  saved snapshot) is never consulted for this branch, which is the whole
  point — see the live-vs-snapshot decision above.

**Scope for this pass (deliberate, confirmed with the user):** only `acme.json`'s
`pricing-cards` migrates to `dataSource: "products"` — `beta.json` stays on
the static `cards` array until the mechanism is proven working end-to-end on
one store.

**Status at end of 2026-08-04 session:** all three new files written, but
carried three real bugs into the next session (caught in review 2026-08-05,
none had been exercised end-to-end yet):
- `content-resolver.mjs` imported `{ dataProviders }` (named import) while
  `data-providers/index.mjs` exported `DATA_PROVIDERS` — a genuine name
  mismatch, `SyntaxError` at module load, would have failed before any
  request even reached the resolver.
- `resolveContent()` built its `resolved` object in the loop but had no
  `return resolved` at the end — every call site would have silently
  received `undefined` instead of the resolved content map.
- Inside the function body, the lookup itself was also still typed as
  `dataProviders[raw.dataSource]` (lowercase) even after the import got
  renamed — `ReferenceError` on the first real `dataSource` lookup.

All three fixed 2026-08-05 (user's own fix, reviewed): import + lookup both
now `DATA_PROVIDERS`, `return resolved;` added.

**Completed and verified end-to-end, 2026-08-05:**
1. `server.mjs` — `getContent` imported from `page-renderer.mjs`, route body
   changed to `res.json(await getContent(req.params.storeId))`; the now-dead
   `const data = await getStoreData(...)` in that route was removed too
   (it was doing an unused extra disk read on every request).
2. `acme.json` — `content["pricing-cards"]` replaced with
   `{ wrapper: {...}, dataSource: "products", childType: "pricing-card" }`.
   Caught one more bug here during review: the key was first written as
   `"childtype"` (lowercase t) — `renderComponent()`'s `isDynamicContainer`
   branch reads `rawContent.childType` (camelCase), so the mismatch would
   have produced synthetic child nodes with `type: undefined` and broken
   the render. Fixed to `"childType"`.
3. Verified by hand, not just read: `GET /api/content/acme` → `pricing-cards`
   now carries a real `items` array (resolved mock products), not the old
   static `cards`. `acme.home.save.json` currently has no `pricing-cards`
   root node (`header`/`newsletter`/`hero` only), so `GET /store/acme/home`
   itself doesn't exercise the new branch yet — confirmed separately via a
   throwaway script (`renderPage("acme", "home", { components: [{ type:
   "header" }, { type: "pricing-cards" }], css: "" })`, deleted after use)
   that the `isDynamicContainer` branch itself renders 3 real `pricing-card`
   blocks correctly. Then edited `MOCK_PRODUCTS` in `products.mjs`
   (`"Starter"` → `"Starter-TEST"`), re-ran the same script with **no editor
   involved at all**, confirmed the new title appeared immediately — proves
   the data is genuinely live, not baked from a snapshot. Reverted the mock
   back to `"Starter"` afterward, confirmed clean via `git status`.

**Still open, not done this session:** actually adding a `pricing-cards`
block to `acme`'s `home` page in the canvas, so the live `GET
/store/acme/home` route exercises the dynamic path for real (today it's
only proven via the throwaway script above, not the actual saved page). Also
still the known limitation from 2026-08-04: canvas editor bakes
`pricing-card` children into `*.save.json` once on first open, so an
already-created page's canvas won't show live price changes — only
`GET /store/:storeId/:pageSlug` does, which is what this feature is for.

## Next session — pick up here (as of 2026-08-05, end of day)

1. **Add a `pricing-cards` block to `acme`'s `home` page in the actual
   canvas** (open `?store=acme&pageSlug=home`, drag it in, save) — closes
   the "only proven via throwaway script" gap above and gives a real page to
   test the dynamic-container branch against on the live route.
2. Once that's on a real saved page, re-run the "edit `MOCK_PRODUCTS`,
   re-request `/store/acme/home` without touching the editor" check against
   the *actual* route (not the throwaway script) to close out the
   end-to-end verification for real.
3. Decide whether to migrate `beta.json`'s `pricing-cards` to `dataSource`
   too (deferred twice now — originally scoped to prove it on one store
   first, still not revisited).

## Canvas/dynamic-data sync fix + layout-component idea — 2026-08-10

**Bug found and fixed: `pricing-cards.js` was still reading the pre-dynamic
content shape, so cards silently stopped rendering in the canvas.** When
`acme.json`'s `content["pricing-cards"]` moved to `{ dataSource, childType,
items }` (see "Dynamic data providers" above), `pricing-cards.js`'s `init()`
was never updated to match — it still read `this.get("cards")`, a key that
no longer exists in the resolved content at all (renamed to `items`). Result:
`init()` found an empty array and added zero children, so the canvas showed
nothing, while `GET /store/acme/home` (which goes through
`renderComponent`'s `isDynamicContainer` branch directly, never touches
`pricing-cards.js`) rendered correctly — confirmed by curling the route
directly and comparing against the empty canvas. **Fixed** (user's own
change, reviewed): `defaults.cards` → `defaults.items`, `init()` now reads
`this.get("items")`. Guard logic (`!this.components().length`, bake children
once) unchanged — still the same known limitation as before: canvas bakes
children on first open and won't show a later mock/DB change until the
`pricing-cards` block is removed and re-dragged (or a fresh page created);
only the production route re-resolves live on every request.

Verified with a throwaway 4th mock product (`"Ultimate"`, `products.mjs`) —
`GET /api/content/acme` and `GET /store/acme/home` picked it up immediately
with zero backend restart (resolver reads the mock fresh per-request); the
already-open canvas correctly did *not* show it, consistent with the
bake-once limitation above, not a new bug.

**Layout-component idea discussed, not built — for a future session.**
Currently every root-level component in `data.components` renders as a
plain vertical sibling in `<body>` — there's no wrapping element with any
`flex`/`grid`, so two components can't sit side-by-side (e.g. `hero` on the
left, a future `filter` component pinned top-right) without one. Considered
and rejected pulling in `grapesjs-blocks-basic`/`grapesjs-preset-webpage`
(the official Row/Column blocks) — rejected specifically because that
plugin compiles into the frontend bundle directly, breaking the
per-component CDN/manifest update model every other component type already
gets ("fix `hero.js` → bump version → client hits F5 → gets the fix, no
frontend redeploy"). Decided instead: build a plain `row`/layout component
the same way as every other manifest-driven type — a `droppable` container
with no `content[name]` template (pure layout, no server-driven content),
CSS grid/flex in its own per-store CSS file, and a `columns` trait
(`type: "select"`, same pattern as `hero`'s `theme` trait) driving a
`row-cols-N` class via `updateContent()`. Not started — flagged as a
backlog item below. If this grows past a single `columns` trait (gutter,
alignment, per-breakpoint columns, etc.) worth reconsidering as a shared
"layout config" pattern reused across multiple container types, but not
proven need for that yet — YAGNI until a second such component exists.

**Older backlog, still open, unchanged from 2026-07-29:**

1. **Finish the `linkTo` rollout** — `beta.json`'s `header.template` still
   hardcodes `#` (needs the same placeholder + default treatment `acme.json`
   already got), and `hero`'s button was in scope per the original plan but
   not wired up this session. Also worth adding a "no match" fallback option
   in the `linkTo` `<select>` (see the known-gap note above) before this sees
   more traits added on top of it.
2. **Make Preview actually Publish** — still open, same shape as before:
   swap the popup's `document.write`-ed copy for just opening the real
   `GET /store/:storeId/:pageSlug` URL directly. Small follow-up, not a new
   subsystem — this route already exists and is already verified working.
3. **Race condition on concurrent saves (last-write-wins)** — still open,
   pre-launch blocker; "lock per `(storeId, pageSlug)`" per the multi-page
   work from 2026-07-23.
4. ~~**`droppable: false` on `themed-block.js`'s shared `model.defaults`**~~
   — **done and verified 2026-08-10.** `themed-block.js` now has
   `model.defaults = { droppable: false }`; every `extend: "themed-block"`
   type inherits it. `pricing-cards.js` keeps working — its own
   `droppable: ".pricing-card"` in its own `defaults` still wins over the
   inherited value (child's own key overrides parent's, confirmed behavior,
   see the `addType`/`extend` note elsewhere in this file). Blocks the
   recurring "stray nesting" accident at the source now (GrapesJS's own
   canvas refuses the drop) instead of the render pipeline coping with it
   after the fact. Confirmed in a real browser (not just read through) —
   dragging a component onto `hero`/`header` in the canvas is refused, cards
   still drop into `pricing-cards` fine.
5. **Clean up test-data debris in `acme.save.json`/`acme.new-slug.save.json`**
   — low priority, cosmetic.
6. Backend production roadmap items (DB migration, JWT auth, admin panel)
   remain unstarted, in the order already agreed there.
7. **Build a `row`/layout component** (see 2026-08-10 section above) — plain
   manifest-driven `droppable` container, `columns` trait, no
   `content[name]` template needed. Not started.
