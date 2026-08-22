import ejs from "ejs";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sanitizeHtml from "sanitize-html";
import { resolveContent } from "./content-resolver.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Reads a page's saved editor state off disk.
 *
 * @param {string} storeID
 * @param {string} pageSlug
 * @returns {Promise<{components: object[], html: string, css: string}>} the full saved editor state
 */
async function getData(storeID, pageSlug) {
  const path = join(
    __dirname,
    "..",
    "data",
    `${storeID}.${pageSlug}.save.json`,
  );
  const raw = await readFile(path, "utf-8");

  const data = JSON.parse(raw);
  return data;
}

/**
 * Reads a store's content config and resolves any dynamic entries.
 *
 * Returns the *resolved* content map (via `resolveContent`), not the raw
 * `data.content` from disk — dynamic types (with a `dataSource`, e.g.
 * `pricing-cards`) get their `items` replaced with live data on every call,
 * everything else passes through unchanged.
 *
 * Exported and used by two consumers that must see identical data:
 * `GET /api/content/:storeId` (editor canvas fetch) and `renderPage()`
 * (production render) — keeping resolution in this one place avoids the two
 * drifting apart.
 *
 * @param {string} storeID
 * @returns {Promise<object>} the resolved content map — keyed by component type
 */
export async function getContent(storeID) {
  const path = join(__dirname, "..", "data", `${storeID}.json`);
  const rawContent = await readFile(path, "utf-8");
  const data = JSON.parse(rawContent);

  return resolveContent(storeID, data.content);
}

/**
 * Reads a store's component manifest.
 *
 * Used both by `buildCssLinks` (to find each used type's `cssUrl`) and by
 * `server.mjs`'s `/styles/:storeId/*` route (allowlist check before serving a
 * CSS file — never trust a path without validating it against config first).
 *
 * @param {string} storeID
 * @returns {Promise<Array<{name: string, url: string, cssUrl?: string}>>} the store's manifest array
 */
export async function getManifest(storeID) {
  const path = join(__dirname, "..", "data", `${storeID}.json`);
  const rawContent = await readFile(path, "utf-8");
  const data = JSON.parse(rawContent);

  return data.manifest;
}

/**
 * Recursively collects every component `type` present in a node's subtree
 * (including its own type and all nested `node.components`).
 *
 * GrapesJS built-in types (`text`, `link`, etc.) are collected too, even though
 * they're not in the manifest — harmless, `buildCssLinks` just finds no match
 * for them later.
 *
 * @param {object} node - one component node (root call from `getAllTypes`, per
 *   root node of the page; recursive calls pass a child node)
 * @param {number} [depth=0] - recursion guard, throws past 20 levels
 * @returns {Set<string>} every type found in this node's subtree
 */
function collectUsedTypes(node, depth = 0) {
  if (depth > 20) {
    throw new Error(`Component tree too deep`);
  }
  const collected = new Set();

  collected.add(node.type);
  if (node.components) {
    node.components.forEach((child) => {
      const collectedChilds = collectUsedTypes(child, depth + 1);
      collectedChilds.forEach((c) => collected.add(c));
    });
  }
  return collected;
}

/**
 * Collects every component type used anywhere on a page (root + nested).
 *
 * Takes the page's root component array directly rather than reading it from
 * disk itself — same reasoning as `buildCssLinks`: re-fetching here would
 * reopen the payload-vs-disk race `renderPage`'s `payload ?? getData(...)`
 * fallback exists to avoid.
 *
 * @param {object[]} nodes - the page's root-level components array
 * @returns {Set<string>} every type used anywhere on the page, used by
 *   `buildCssLinks` to know which manifest entries' `cssUrl` to link
 */
function getAllTypes(nodes) {
  const allTypes = new Set();

  nodes.forEach((c) => {
    const collectedTypes = collectUsedTypes(c);
    collectedTypes.forEach((t) => allTypes.add(t));
  });

  return allTypes;
}

/**
 * Builds the `<link>` tags for a page's `<head>` — one per component type
 * actually used on the page, plus the shared base stylesheet.
 *
 * Takes `data` (the page's saved components tree) as an argument rather than
 * reading it from disk itself — same reasoning as `getAllTypes`: re-fetching it
 * here would reopen the payload-vs-disk race that `renderPage`'s `payload ??
 * getData(...)` fallback exists to avoid.
 *
 * `/components.css` is placed first (`unshift`, not `push`) deliberately — it
 * carries the base/default styles, and per-component stylesheets need to load
 * after it to be able to override them at equal CSS specificity.
 *
 * @param {string} storeID - identifies which store's manifest to read (for each
 *   used type's `cssUrl`)
 * @param {{components: object[]}} data - the page's saved state; only
 *   `data.components` is read
 * @returns {Promise<string[]>} `<link rel="stylesheet" href="...">` strings, in
 *   load order — consumed by `renderPage` to build the page's `<head>`.
 */
async function buildCssLinks(storeID, data) {
  const cssUrls = new Array();

  const manifest = await getManifest(storeID);
  const types = getAllTypes(data.components);

  types.forEach((t) => {
    const foundUrl = manifest.find((m) => m.name === t);
    if (foundUrl?.cssUrl) {
      cssUrls.push(foundUrl.cssUrl);
    }
  });

  const linkUrls = cssUrls.map((cssUrl) => {
    return `<link rel="stylesheet" href="${cssUrl}">`;
  });
  linkUrls.unshift(`<link rel="stylesheet" href="/components.css">`);
  return linkUrls;
}

const DEFAULT_WRAPPERS = {
  header: { tag: "header", classPrefix: "header" },
  footer: { tag: "footer", classPrefix: "footer" },
  hero: { tag: "section", classPrefix: "hero" },
  testimonial: {
    tag: "div",
    classPrefix: "testimonial",
    baseClass: "testimonial",
  },
  newsletter: {
    tag: "div",
    classPrefix: "newsletter",
    baseClass: "newsletter-inner",
  },
  "pricing-card": { tag: "div", baseClass: "pricing-card" },
  "pricing-cards": { tag: "div", baseClass: "pricing-cards pricing-grid-3" },
};

/**
 * Converts a `{{field}}` mustache template into an EJS-ready string, so it can be
 * fed to `ejs.render()`.
 *
 * Escaped (`<%= %>`) output is the safe default for every field — prevents stored
 * XSS from unauthenticated saves. Unescaped (`<%- %>`) is opt-in, only for fields
 * listed in `richTextFields`.
 *
 * `richTextFields` must be kept in manual sync with that component type's
 * frontend traits — specifically, it should list exactly the trait names that
 * have a `selector` in the type's `.js` file (the ones actually RTE-editable via
 * double-click in canvas, see `themed-block.js`'s `wireEditableChildren()`). A
 * field that's RTE-editable but missing here won't crash, but any `<b>`/`<u>`
 * formatting a user adds will render as escaped literal tags on the real
 * published page instead of real HTML — there's no code link enforcing this,
 * only convention.
 *
 * @param {string} str - template string with `{{field}}` placeholders (content[type].template)
 * @param {string[]} [richTextFields] - field names allowed to carry raw HTML
 * @returns {string} EJS-ready template string
 */
function adapter(str, richTextFields = []) {
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return richTextFields.includes(key) ? `<%- ${key} %>` : `<%= ${key} %>`;
  });
}

/** 
 * Sanitezes a rte field value, allowing only a limited set of HTML tags and no attributes (Used against XSS attacks).
 * @param {string} value - RTE field value to sanitize.
 * @returns {string} Sanitized HTML string
 */
function sanitizeRichField(value) {
  return sanitizeHtml(value, {
    allowedTags: ["b", "i", "u", "em", "strong", "br"],
    allowedAttributes: {},
  });
}

const THEME_RE = /^[a-z0-9-]+$/;

/**
 * Wraps rendered inner HTML in its component's root tag, computing the theme
 * class from the node's canvas-assigned classes.
 *
 * @param {{tag: string, classPrefix?: string, baseClass?: string}} wrapper - root element
 *   config for this component type (already resolved by the caller — content[type].wrapper
 *   or DEFAULT_WRAPPERS fallback; this function does no fallback itself)
 * @param {object} node - the saved component node; only node.classes is read
 *   (client-submitted, no auth yet — validated against THEME_RE before being
 *   spliced into the class attribute, to prevent attribute-injection via a crafted class string)
 * @param {string} innerHtml - already-rendered inner content to wrap
 * @returns {string} `<tag class="...">innerHtml</tag>`
 */
function wrapWithTag(wrapper, node, innerHtml) {
  const classes = node.classes || [];
  let theme = "";

  if (wrapper.classPrefix) {
    const rawTheme =
      classes
        .find(
          (c) =>
            c.startsWith(`${wrapper.classPrefix}-`) && c !== wrapper.baseClass,
        )
        ?.replace(`${wrapper.classPrefix}-`, "") || "light";
    theme = THEME_RE.test(rawTheme) ? rawTheme : "light";
  }

  const classAttr = [
    wrapper.baseClass,
    wrapper.classPrefix ? `${wrapper.classPrefix}-${theme}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `<${wrapper.tag} class="${classAttr}">${innerHtml}</${wrapper.tag}>`;
}

/**
 * Renders one saved component node to an HTML string.
 *
 * Branches on the shape of `content[node.type]`:
 * - `{ dataSource, childType, items }` → dynamic container: rebuilds children
 *   from live `items` on every call, ignores `node.components` entirely
 *   (production must never render a stale saved snapshot).
 * - object with no `template` key → static container (e.g. beta's pricing-cards):
 *   renders the real saved `node.components` children.
 * - string or `{ template, ...fields }` → leaf: runs through `adapter()` + `ejs.render()`.
 *
 * @param {object} node - one node from the saved components tree (root call
 *   from renderPage per data.components entry; recursive calls pass a child node)
 * @param {object} content - the store's resolved content map (from getContent/resolveContent)
 * @param {number} [depth=0] - recursion guard, throws past 20 levels
 * @returns {Promise<string>} rendered HTML for this node, wrapped in its root tag
 */
async function renderComponent(node, content, depth = 0) {
  if (depth > 20) {
    throw new Error(`Component tree too deep`);
  }
  const rawContent = content[node.type];
  if (rawContent === undefined) {
    console.warn("Problems!");
    return "";
  }
  const wrapper = rawContent?.wrapper ?? DEFAULT_WRAPPERS[node.type];
  if (!rawContent?.wrapper) {
    console.warn(
      `No wrapper in config for ${node.type} using DEFAULT_WRAPPERS`,
    );
  }

// isDynamicContainer branch
// True when rawContent is an object with a dataSource key (e.g. pricing-cards
// after resolveContent attached real items — see content-resolver.mjs).
// Builds synthetic child nodes from rawContent.items (the live data) + childType
// (e.g. "pricing-card"), NOT from node.components (the saved snapshot) — this is
// deliberate: production render always uses fresh data, never a stale saved copy
// Each synthetic child renders recursively through renderComponent
// itself — a dynamic pricing-card child goes through the exact same template/EJS
// path as any other node, no special-casing needed there.
// Result wrapped via wrapWithTag same as every other branch.
  const isDynamicContainer =
    rawContent && typeof rawContent === "object" && rawContent.dataSource;

  if (isDynamicContainer) {
    const childNodes = (rawContent.items ?? []).map((item) => ({
      type: rawContent.childType,
      ...item,
    }));
    const childrenHtml = (
      await Promise.all(
        childNodes.map((child) => renderComponent(child, content, depth + 1)),
      )
    ).join("");
    return wrapWithTag(wrapper, node, childrenHtml);
  }

// isContainer branch
// True when rawContent is an object without a template key and without dataSource
// (e.g. static pricing-cards on beta.json — cards: [...] baked in by hand, not
// dynamic). Unlike isDynamicContainer above, this DOES read node.components — the
// actual saved child nodes (e.g. pricing-card instances the editor baked in via
// its own init(), see pricing-cards.js) — because there's no live data source to
// rebuild from; the saved snapshot IS the data.
// Renders each saved child recursively, joins, wraps same as every other branch.
  const isContainer =
    rawContent && typeof rawContent === "object" && !rawContent.template;

  if (isContainer) {
    const childrenHtml = (
      await Promise.all(
        (node.components ?? []).map((child) =>
          renderComponent(child, content, depth + 1),
        ),
      )
    ).join("");
    return wrapWithTag(wrapper, node, childrenHtml);
  }
  
// template render block (final branch — plain string content vs { template, ... })
// If rawContent is a plain string (content-shape 1, e.g. footer's fixed markup) —
// no {{}} placeholders, template = rawContent as-is, data = node directly.
// Otherwise (shape 2, { template, ...fields }) — template runs through adapter()
// (mustache → EJS), and data merges content[type]'s own default field values with
// node's actual saved values ({ ...defaultsFromContent, ...node }): GrapesJS's
// toJSON() only serializes trait fields that differ from their default, so an
// untouched field is missing from node entirely — EJS's `with(locals)` would throw
// ReferenceError on a genuinely missing key. This merge fills that gap: edited
// fields win (from node), untouched ones fall back to the store's own default.
// richTextFields listed on rawContent get sanitized (sanitizeRichField) before
// rendering — required since adapter() emitted them as unescaped <%- %>.
// Renders via ejs.render(template, data), wraps result same as every branch.
  let template, data;
  if (typeof rawContent === "string") {
    template = rawContent;
    data = node;
  } else {
    template = adapter(rawContent.template, rawContent.richTextFields ?? []);
    const { template: rawFieldTemplate, ...defaultsFromContent } =
      content[node.type];
    data = { ...defaultsFromContent, ...node };
    (rawContent.richTextFields ?? []).forEach((field) => {
      if (typeof data[field] === "string") {
        data[field] = sanitizeRichField(data[field]);
      }
    });
  }

  const innerHtml = await ejs.render(template, data);
  return wrapWithTag(wrapper, node, innerHtml);
}

/**
 * Renders a full page to an HTML string.
 * 
 * @param {string} storeID - identifies which store config to read (data/<storeID>.json) and which saved page to load (data/<storeID>.<pageSlug>.save.json)
 * @param {string} pageSlug - the slug of the page to render
 * @param {{components: object[], html: string, css: string}} [payload] - optional live editor state
 *   (from the Preview/Publish button) — used as-is instead of reading disk, avoiding a stale-read
 *   race against the debounced autosave. Must be omitted entirely (undefined), not `{}` — `payload ?? getData(...)`
 *   only falls through to the disk read when payload is genuinely undefined.
 * @returns {Promise<string>} - the full HTML string of the rendered page, including skeleton DOCTYPE and css links
 */
export async function renderPage(storeID, pageSlug, payload) {
  const content = await getContent(storeID);
  const data = payload ?? (await getData(storeID, pageSlug));
  const links = (await buildCssLinks(storeID, data)).join("\n");
  const styleTag = `<style>${data.css}</style>`;

  const html = (
    await Promise.all(
      data.components.map((node) => renderComponent(node, content)),
    )
  ).join("\n");

  const htmlDoctype = `
    <!DOCTYPE html>
    <html>
    <head>
    ${links}
    ${styleTag}
    </head>
    <body>
    ${html}
    </body>
    </html>`;

  return htmlDoctype;
}
