# Store Rendering — EJS Generator + database.json

## Why this change

Today, `page-renderer.mjs` builds the final HTML by recursively calling
`renderComponent()` for every node in the component tree, on every single
page request. Each leaf component runs its own `ejs.render(template, data)`
call, and the results are glued together with plain JS string concatenation
(`wrapWithTag`). This works, but it means:

- The full page structure is recomputed from scratch on every request, even
  though the structure (which components exist, in what order, with what
  wrapper/theme) rarely changes — only actual data (like product prices)
  changes often.
- HTML assembly is split between two mechanisms (EJS for leaf templates,
  plain JS template literals for wrappers) instead of one consistent approach.

**Goal:** separate the two things that change at very different frequencies,
and generate a single `.ejs` file per page that represents structure, while
data is read fresh on every request — without a file watcher.

## The two things that change at different speeds

| | Changes when | Where it lives |
|---|---|---|
| **Structure** (which components, wrapper/theme, nesting) | Only when a user edits the store in the GrapesJS editor and hits Save | Generated into a `.ejs` file |
| **Data** (product prices, descriptions, any dataSource-driven content) | Any time, independently of the editor (new product added via admin panel / SQL) | Stored in `database.json`, read fresh on every page request |

## Pipeline, step by step

### 1. Editor Save → EJS Generator runs

When a user saves changes in the GrapesJS editor (or an admin explicitly
triggers "Publish"), a new module — **`ejs-generator.mjs`** — runs:

1. Reads the current store structure (`data.components`, same as today's
   saved JSON) and the content config (templates, wrappers, dataSource/childType).
2. Walks the component tree (same traversal logic that `renderComponent`
   already has) and, for each node, writes out the equivalent EJS markup —
   using real EJS tags (`<%= %>`, `<%- %>`, `<% %>` for loops) instead of
   the current `{{key}}` placeholder + regex `adapter()` step.
3. For **dynamic containers** (like `pricing-cards`), instead of hardcoding
   items into the file, it writes an EJS loop that reads from the database
   at render time — see the example below.
4. Writes the result to `data/{storeID}.{pageSlug}.ejs`.

This step happens **once per Save**, not per page view — the expensive part
(walking the tree, resolving templates) only happens when structure actually
changes.

### 2. Data providers → database.json

A separate, independent process keeps `database.json` up to date with actual
data (not structure):

```js
// data-providers/products.mjs
export async function products(storeId, params) {
  const source = await getStoreDataSourceConfig(storeId, "products");
  if (source.type === "sql") {
    return queryProductsFromDb(storeId, params);
  }
  return readJsonProducts(storeId); // default: json file
}
```

The **same provider abstraction already in use** (`DATA_PROVIDERS[dataSource]`)
is kept — no changes needed to `resolveContent`'s calling convention. The
only change is *where* the resolved data ends up: written to
`data/{storeID}.database.json` instead of being returned in-memory for a
single request.

This file is updated independently of the editor — via an admin panel that
writes directly to it (or to the SQL table the provider reads from), on
whatever cadence makes sense for that store (immediately on admin action,
or a scheduled refresh — to be decided per data source).

### 3. Page request → EJS renders, reading database.json fresh

On every actual page request, the already-generated `.ejs` file is rendered.
It reads `database.json` **fresh, from disk, at render time** — no watcher,
no cache invalidation logic needed:

```js
const html = await ejs.renderFile(`data/${storeID}.${pageSlug}.ejs`, {
  storeID,
});
```

Because the `.ejs` file itself contains the `readFileSync`/`readFile` call
for `database.json` inline (see example below), every request automatically
sees the latest data — the file is just read again, no stale cache.

## What the generated .ejs file looks like (illustrative example)

For a page with a `hero` and a `pricing-cards` (dynamic container) component:

```ejs
<%
const fs = require('fs');
const database = JSON.parse(fs.readFileSync(`data/${storeID}.database.json`, 'utf-8'));
%>
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/components.css">
  <link rel="stylesheet" href="/styles/acme/hero.1.0.0.css">
  <link rel="stylesheet" href="/styles/acme/pricing-cards.1.0.0.css">
  <style><%- database.css %></style>
</head>
<body>

  <section class="hero-light">
    <div class="hero-inner">
      <h1 class="hero-heading"><%= database.content.hero.headingText %></h1>
      <p class="hero-subheading"><%= database.content.hero.subheadingText %></p>
      <a href="#" class="hero-button"><%= database.content.hero.buttonText %></a>
    </div>
  </section>

  <div class="pricing-cards pricing-grid-3">
    <% database.content['pricing-cards'].items.forEach(item => { %>
      <div class="pricing-card">
        <img src="<%= item.image %>" alt="<%= item.title %>" class="pricing-card-image" />
        <h3 class="pricing-card-title"><%= item.title %></h3>
        <p class="pricing-card-price"><%= item.price %></p>
        <p class="pricing-card-desc"><%= item.desc %></p>
        <button class="pricing-card-button"><%= item.buttonText %></button>
      </div>
    <% }) %>
  </div>

</body>
</html>
```

Key things to notice:
- **Structure is baked in** — the `hero` section markup, the `pricing-cards`
  wrapper div, the exact classes — all generated once by the generator,
  based on the store's structure at the time of the last Save.
- **Data is read live** — the `database.json` read happens inside the `.ejs`
  file itself, at the very top, so every render (every page request) gets
  the current file contents — new products added via the admin panel show
  up immediately, without regenerating the `.ejs` file.
- **No `{{key}}` + regex adapter step** — templates use native EJS syntax
  directly, since the generator writes real EJS tags, removing the fragile
  placeholder-conversion step that existed before.

## Summary of the full flow

```
Editor Save
    │
    ▼
ejs-generator.mjs  ──────────►  data/{storeID}.{pageSlug}.ejs   (structure, rarely regenerated)
                                        │
                                        │  (reads at render time)
                                        ▼
Admin panel / SQL  ──────────►  data/{storeID}.database.json    (data, updated independently, often)
    │
    ▼
Page request  ──────────►  ejs.renderFile(...)  ──────────►  final HTML sent to browser
```

## Open questions to confirm before implementation

- Cadence for `database.json` updates when the source is SQL — write-through
  on every admin action, or a periodic refresh job?
- Exact trigger for the generator — automatic on every Save, or a manual
  "Publish" button (safer, avoids regenerating on every keystroke/autosave)?
- Per-store or per-data-source config for json vs sql — confirmed: one
  provider per data type, source resolved internally via store config (not
  separate provider files per source type).
