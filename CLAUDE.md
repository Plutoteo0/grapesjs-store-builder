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
  `beta.json` not touched — still needs the same per-type migration.
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

## Next session — pick up here (as of 2026-07-16)

The full editor→render pipeline works end-to-end and is verified in-browser
(see milestones 1-6 above, all ✅) — clicking Preview/Publish in the `acme`
editor now produces a complete, self-contained, styled HTML document. What's
left, roughly in the order it'll probably get tackled:

1. **`beta.json` still not migrated** — plain-string content shapes for
   `hero`/`newsletter` (original persistence bug still live for it) and no
   per-store `wrapper` keys at all (everything falls to `DEFAULT_WRAPPERS`
   with warnings). Same mechanical migration `acme.json` already got.
2. **Do something with the render result besides `console.log`.** The
   button's handler has the full HTML in hand and currently just logs it —
   next natural step is writing it to an actual file (or triggering a
   browser download) so "Publish" produces something a non-technical person
   can open without DevTools.
3. **Race condition on concurrent saves (last-write-wins)** — reclassified
   pre-launch, not post-DB-migration (see Backend production roadmap
   section) — still open. Optimistic locking (version/timestamp check) or
   serialize-per-storeId, whichever gets picked.
4. **CSS `<link>` paths are still relative** (`/components.css`,
   `/styles/acme/*.css`) — only resolve correctly when the rendered HTML is
   served from the same origin that hosts those static files (today, the
   Vite dev server). Fine for local testing, not fine for an actual
   standalone storefront — ties into the CDN-migration plan already
   documented under "Production architecture."
5. **Clean up test-data debris in `acme.save.json`** — several duplicate
   "New Plan / $0/mo / SERVER TEST" pricing cards accumulated from repeated
   `add-card` testing this session; harmless for demoing the pipeline but
   worth tidying before showing anyone the actual store content.
6. Backend production roadmap items (DB migration, JWT auth, admin panel)
   remain unstarted, in the order already agreed there — the render
   pipeline work didn't change that plan, just made milestone "render" ready
   for whenever DB migration happens (see the DB-migration-ease discussion
   in that section — swapping `getData`/`getContent`/`getManifest`'s
   internals is the only thing that changes).
