# GrapesJS PoC — Custom Component System

Proof-of-concept for a scalable custom-component architecture on top of
GrapesJS, built for a no-code page builder (company store builder).

## Stack

- Vite + React
- `grapesjs` 0.23.2
- `@grapesjs/react` 2.0.0

## Architecture

- **`themed-block.js`** — base component type. All themed components extend
  it via `extend: "themed-block"`. Handles the shared `updateContent()`
  re-render subscription logic through `watchProps`.
- **`watchProps`** — each component explicitly lists which of its own props
  should trigger a re-render. Prevents `change` listeners from firing on
  GrapesJS-internal model changes (selection state, etc.), which previously
  broke double-click-to-edit.
- **`plugin.js`** — single assembly point. Auto-registers every component
  under `src/components/*.js` via `import.meta.glob`, and applies per-client
  overrides generically: `opts[componentName][field] = value` maps directly
  onto that component's `defaults`, no per-component `if` blocks required.
- **`editor-config.js` + `configs/*.json`** — per-client config layer.
  `getStoreConfig(storeId)` returns the JSON config passed into the plugin
  as `pluginsOpts`. One codebase, different defaults per client store.
- **`_template.js`** — boilerplate for adding a new component (see checklist
  below).

## Components

| Component      | Themes             | Notes                                   |
|----------------|---------------------|------------------------------------------|
| Footer         | light / dark / social | SVG social icons                        |
| Header         | light / dark / transparent | nav items, CTA button              |
| Hero           | light / dark / image | background image + alpha overlay color |
| Pricing Cards  | light / dark        | card count (2/3/4) — **flat HTML string, refactor pending** |
| Newsletter     | light / dark        | heading/subheading/email field/button   |

## How to add a new component

1. Copy `src/components/_template.js` to `src/components/your-name.js`
2. Fill in `defaults` (fields + `watchProps` + theme default)
3. Fill in `traits` — one per editable field, always with `changeProp: 1`,
   `name` matching the field in `defaults`
4. Implement `updateContent()` — read fields via `this.get(...)`, rebuild
   classes/styles/inner HTML
5. Add `blockInfo` (label, category, icon) so it shows up in the block panel
6. If the component needs per-client defaults, add a matching key to
   `configs/*.json` — `plugin.js` picks it up automatically, no code change
   needed
7. Add matching CSS to `public/components.css`
8. Test: drag block onto canvas, change every trait, verify double-click
   text editing still works

## Known issues / next steps

- **Pricing Cards is still a flat HTML-string component.** On every
  `cardCount` change, all cards are regenerated from a hardcoded template,
  which means any inline edits inside a card (title, price, etc.) are lost.
  **Planned refactor:** split into `pricing-container` (layout, card count,
  shared theme) + `pricing-card` (independent child component with its own
  traits: title, price, features). Container manages children via
  `this.components().add()` / `.remove()` instead of string regeneration.
- Apply the same container/child split to Header nav items and Footer
  social links once the pricing pattern is validated.
- `storageManager` is now enabled (`local`) so the editor persists across
  reloads — this also lets us inspect the real exported component tree
  (`editor.getComponents().toJSON()`) to design the JSON schema that a
  future storefront renderer would consume.
- Longer term: decide whether the page is stored as GrapesJS HTML/CSS
  export (couples the storefront to GrapesJS forever) or as an abstract
  JSON tree (`{ type, props, styles, children }`) rendered by a separate
  React component registry on the storefront — leaning toward the latter.

## Getting started

```bash
npm install
npm run dev
```
