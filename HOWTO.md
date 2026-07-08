# How to add a new component

This is a step-by-step guide for adding a new component to the GrapesJS store
builder. It assumes no prior context — if you're the one writing components
(not the editor internals), this is written for you.

For the reasoning behind *why* the system works this way, see `CLAUDE.md`.
This file is just the practical "what do I type" checklist.

---

## Step 0 — decide what kind of component you're building

Almost every component is a **themed component**: one block on the page,
some fields on it are editable, done. Go to [Step 1](#step-1-add-a-manifest-entry).

You only need the more advanced **container/child pattern** ([Step 5](#step-5-the-exception-container-components-with-repeated-children))
if your component is a *list of repeated things* — like three pricing cards,
a product grid, an FAQ accordion — where each item needs its own independent
set of field values. A single component's fields can only ever hold one
value each, so "3 cards, each with their own title" doesn't fit a normal
themed component.

If you're not sure, you're building a themed component. Keep reading.

---

## Step 1 — add a manifest entry

Every component needs an entry in the store's manifest, in
`backend/data/<storeId>.json` (e.g. `acme.json`):

```json
{
  "manifest": [
    {
      "name": "testimonial",
      "url": "/components/testimonial.js",
      "cssUrl": "/styles/acme/testimonial.1.0.0.css"
    }
  ]
}
```

- `name` — must be unique, and must match the key you use in `content` below.
- `url` — where the component file lives, under `frontend/public/components/`.
- `cssUrl` — optional, per-client CSS override (not required to get started).

**Order matters**: if your component is a container that creates children of
another type (Step 5), the child type's manifest entry must come *before*
the container's.

---

## Step 2 — decide the content shape

This is the most important decision, and the one most likely to bite you if
you get it wrong. In the same `backend/data/<storeId>.json`, under
`"content"`, add an entry keyed by the same `name` you used in the manifest.
There are two shapes for a normal themed component:

### 2a — plain string (nothing is editable)

```json
"content": {
  "testimonial": "<p class=\"testimonial-quote\">Great product!</p><span class=\"testimonial-author\">- Jane</span>"
}
```

Use this only if **nothing** in the component needs to be edited by the user
beyond a theme toggle. It's rendered exactly as-is.

### 2b — template + fields (some text is editable)

```json
"content": {
  "testimonial": {
    "template": "<p class=\"testimonial-quote\">{{ quote }}</p><span class=\"testimonial-author\">- {{ author }}</span>",
    "quote": "Great product!",
    "author": "Jane"
  }
}
```

Use this whenever at least one field should be editable (via the Traits
panel and/or double-click in canvas). `template` contains `{{fieldName}}`
placeholders; every other key (`quote`, `author`) is that field's default
value coming from the server/DB.

**Rule of thumb:** if you're about to declare a trait for a field, that
field's name must also appear as `{{fieldName}}` somewhere in `template`,
and `template` must be present (not a plain string) — otherwise the trait
has nothing to substitute into, and edits get silently discarded on the
next re-render. This exact mistake happened with `newsletter` — a
`{{ newsHeading }}` placeholder was written into a plain string instead of
a `{ template, ...fields }` object, and the field looked wired up but wasn't.

---

## Step 3 — write the component file

Create `frontend/public/components/testimonial.js`. **Copy
`frontend/src/components/_template.js`** as your starting point — it has
the TODOs already laid out. The result should look like this:

```js
export default {
  extend: "themed-block", // always this, for a themed component

  blockInfo: {
    label: "Testimonial",
    category: "Sections",
    icon: "fa fa-quote-right",
  },

  model: {
    defaults: {
      tagName: "div",
      name: "Testimonial",
      theme: "light",
      content: "", // filled in from backend content by plugin.js — leave empty here
      quote: "",   // fallback only; real value comes from the server
      author: "",

      traits: [
        {
          type: "select",
          name: "theme",
          label: "Theme",
          changeProp: 1,
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
          ],
          // no `selector` — this drives a CSS class, not inline text, so it's
          // watched but not double-click-editable
        },
        {
          type: "text",
          name: "quote",
          label: "Quote",
          changeProp: 1,
          selector: ".testimonial-quote", // makes it double-click editable in canvas
        },
        {
          type: "text",
          name: "author",
          label: "Author",
          changeProp: 1,
          selector: ".testimonial-author",
        },
      ],
    },

    // no init() — inherited from themed-block, see Step 4

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["testimonial-light", "testimonial-dark"]);
      this.addClass(`testimonial-${theme}`);
    },
  },
};
```

That's the whole file. No `init()`, no manual list of watched fields, no
separate list of editable selectors — see Step 4 for why.

---

## Step 4 — the rule for every field, one place only

For each field (`quote`, `author`, `theme`, ...) there are up to **four**
things it might need, and they all come from **one** `traits` entry:

| You want the field to... | What to add |
|---|---|
| have a default value | a key in `defaults` (e.g. `quote: ""`) — always needed |
| appear in the `{{ }}` template | `{{fieldName}}` in `template` (backend content, Step 2b) — always needed if it renders text |
| re-render when changed, show up in the Traits panel | `changeProp: 1` on its trait entry |
| be double-click-editable directly in canvas (and have that edit persist) | **also** add `selector: ".css-class-of-the-rendered-element"` to that same trait entry |

You do **not** need to write `watchProps` or an `editableSelectors` map
anywhere — `themed-block.js`'s generic `init()` computes both automatically
by reading `traits`:
- every trait with `changeProp` becomes a watched prop (re-renders on change)
- every trait that *also* has `selector` becomes inline-editable

So: **one trait entry is the single source of truth** for a field. Nothing
else to keep in sync by hand.

**When to skip `selector`:** if the field isn't rendered as plain text a
user could double-click into — e.g. an image URL (`<img src="{{image}}">`
has no text content for the built-in rich-text editor to attach to). Give
it a trait with `changeProp: 1` so it's editable via the Traits panel, but
leave `selector` off.

**When to skip the trait entirely:** if the field should never be
user-editable at all (e.g. a price that will come from a real database
later) — just put it in `template`/`defaults` with no matching trait. It
renders, but there's no UI to change it.

**When you don't need `init()` at all:** basically always, for a themed
component. `themed-block` already provides a generic one that:
1. renders `content` as a template, substituting `{{field}}` with `this.get(field)`
2. figures out watched props + inline-edit whitelist from `traits` (Step 4 above)
3. recursively locks every non-whitelisted child (`editable:false, removable:false`)
   so accidental edits elsewhere in the markup don't look like they work when
   they don't

You only need your own `init()` if your content isn't a `{{}}` template at
all — see Step 5.

---

## Step 5 — the exception: container components with repeated children

Skip this unless your component needs to render a **list of independent
items**, each with its own separate set of field values (e.g. `pricing-cards`
building three `pricing-card` children). A single trait can only ever hold
one value — it can't represent "the title of card #2" — so this needs two
component files instead of one.

### 5a — the child component

Write it exactly like Step 3 (a normal themed component, own `content`
template, own traits). The only difference: it usually gets a
`draggable: "<selector-of-the-container>"` default, so it can only be
placed inside its container:

```js
// pricing-card.js (see the real file for the full version)
defaults: {
  tagName: "div",
  classes: ["pricing-card"],
  draggable: ".pricing-cards",
  title: "",
  price: "", // no trait for this below — locked, comes from a DB later
  content: '<h3 class="pricing-card-title">{{ title }}</h3><p class="pricing-card-price">{{ price }}</p>',
  traits: [
    { type: "text", name: "title", changeProp: 1, selector: ".pricing-card-title" },
    // price: intentionally no trait — locked
  ],
},
```

### 5b — the container component

This one **does** need its own `init()` — it doesn't inherit
`themed-block`'s generic one, because its content isn't a `{{}}` template,
it's structured data:

```json
"content": {
  "pricing-cards": {
    "cards": [
      { "title": "Starter", "price": "$19/mo" },
      { "title": "Pro", "price": "$49/mo" }
    ]
  }
}
```

```js
// pricing-cards.js
export default {
  extend: "themed-block",
  blockInfo: { label: "Pricing Cards", category: "Sections", icon: "fa fa-credit-card" },
  model: {
    defaults: {
      tagName: "div",
      classes: ["pricing-cards"],
      cards: [], // array of per-card data, populated from backend content
    },
    init() {
      const cards = this.get("cards") || [];
      // guard: only build children on a fresh load — if state was restored
      // from a save, children already exist and re-adding would duplicate them
      if (!this.components().length) {
        cards.forEach((card) => {
          this.components().add({ type: "pricing-card", ...card });
        });
      }
    },
  },
};
```

The manifest must register the child type (`pricing-card`) **before** the
container (`pricing-cards`) — see Step 1.

---

## Step 6 — test it

1. Hard reload the browser (not just HMR — files under `public/components/`
   are fetched at runtime and can be cached like any other request).
2. Check the browser console for warnings — `themed-block.js` logs a
   `console.warn` if a `{{field}}` in your template has no matching default,
   or if a trait's `selector` matched nothing after rendering. Both usually
   mean a typo or a mismatch between `template`/`defaults`/`traits`.
3. Open the Traits panel for your new component — every field with
   `changeProp: 1` should show up there.
4. For fields with `selector`: double-click the element in canvas, edit the
   text, click away, and confirm the Traits panel value updated.
5. Reload the page and confirm the edit is still there.
