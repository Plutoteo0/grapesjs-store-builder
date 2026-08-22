import { useState, useEffect } from "react";
import "grapesjs/dist/css/grapes.min.css";
import GjsEditor from "@grapesjs/react";
import grapesjs from "grapesjs";
import myComponentsPlugin from "./plugin";

const STORE_ID =
  new URLSearchParams(window.location.search).get("store") || "acme";
const API_BASE = "http://localhost:3001";
const pageSlug =
  new URLSearchParams(window.location.search).get("pageSlug") || "home";

function buildPayload(editor) {
  return {
    components: editor.getComponents().toJSON(),
    html: editor.getHtml(),
    css: editor.getCss(),
  };
}

export default function App() {
  const [modules, setModules] = useState(null);
  const [cssUrls, setCssUrls] = useState([]);
  const [content, setContent] = useState(null);
  const [pages, setPages] = useState([]);

  useEffect(() => {

  /**
   * Dynamically imports a component module by URL — fetches it as text,
   * wraps it in a Blob, and `import()`s the Blob URL.
   *
   * Needed because Vite blocks `import()` from `public/` directly in dev
   * mode; this workaround isn't needed in production, but works there too.
   *
   * @param {string} url
   * @returns {Promise<{default: object}>} the module's namespace object
   */
    async function importFromUrl(url) {
      const response = await fetch(url);
      const text = await response.text();
      const blob = new Blob([text], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      try {
        return await import(/* @vite-ignore */ blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }

  /**
   * Fetches this store's manifest + resolved content, dynamically imports
   * every component module the manifest lists (in order — child types must
   * come before their containers, see plugin.js), and stores the results in
   * React state for GjsEditor to consume via pluginsOpts.
   *
   * @returns {Promise<void>}
   */
    async function loadComponents() {
      const content = await fetch(`${API_BASE}/api/content/${STORE_ID}`).then(
        (r) => r.json(),
      );
      setContent(content);
      const manifest = await fetch(`${API_BASE}/api/manifest/${STORE_ID}`).then(
        (r) => r.json(),
      );
      const loaded = [];
      for (const { name, url } of manifest) {
        const mod = await importFromUrl(url);
        loaded.push({ name, config: mod.default });
      }
      const cssUrls = manifest.filter((m) => m.cssUrl).map((m) => m.cssUrl);
      setCssUrls(cssUrls);
      setModules(loaded);
    }
    loadComponents();

  /**
   * Fetches the list of existing page slugs for this store (for the
   * page-switcher dropdown).
   *
   * @returns {Promise<void>}
   */
    async function loadPages() {
      const res = await fetch(`${API_BASE}/api/pages/${STORE_ID}`);
      const data = await res.json();
      setPages(data.slugs);
    }
    loadPages();
  }, []);

/**
 * Switches to a different page of the same store by reassigning
 * `window.location.search` — a full page reload, not a React state update.
 *
 * Deliberate: `STORE_ID`/`pageSlug` are module-level consts read once from
 * the query string on load, not React state, so there's no in-place way to
 * "hot-swap" pages inside an already-mounted editor instance without a
 * bigger refactor. A reload is simple and correct, if not instant.
 *
 * @param {string} newSlug - the page slug to switch to
 */
  function handlePageChange(newSlug) {
    const params = new URLSearchParams(window.location.search);
    params.set("pageSlug", newSlug);
    window.location.search = params.toString();
  }

  if (!modules) return <div>Loading components...</div>;

  return (
    <div style={{ position: "relative" }}>
      <GjsEditor
        grapesjs={grapesjs}
        onEditor={async (editor) => {
          window.editor = editor;

          const pages = await fetch(`${API_BASE}/api/pages/${STORE_ID}`)
            .then((r) => (r.ok ? r.json() : { slugs: [] }))
            .catch(() => ({ slugs: [] }));
          
          /**
            * Custom "linkTo" trait type — a <select> of page slugs for this store,
            * whose value is a full `/store/:storeId/:slug` href (not a bare slug).
            * Used on header's nav-link traits (homeHref/aboutHref/etc.) instead of a
            * plain text trait, so a link always points at a real page.
            *
            * `createInput`/`onEvent`/`onUpdate` are the contract GrapesJS requires for
            * any custom trait type — not optional boilerplate:
            * - `createInput` builds the DOM once.
            * - `onEvent` is the UI → model direction (fires on the select's native
            *   `change` event).
            * - `onUpdate` is the model → UI direction (fires on a programmatic
            *   `component.set()`, e.g. during `editor.setComponents()` on page load) —
            *   without it, a restored page would always show the first `<option>`
            *   regardless of the trait's real saved value.
            */
          editor.Traits.addType("linkTo", {
            createInput({ trait }) {
              const select = document.createElement("select");
              select.className = "gjs-field gjs-select";
              pages.slugs.forEach((slug) => {
                const option = document.createElement("option");
                option.value = `/store/${STORE_ID}/${slug}`;
                option.textContent = slug;
                select.appendChild(option);
              });
              return select;
            },
            onEvent({ elInput, component, trait }) {
              component.set(trait.get("name"), elInput.value);
            },
            onUpdate({ elInput, component, trait }) {
              elInput.value = component.get(trait.get("name")) || "";
            },
          });

          const saved = await fetch(
            `${API_BASE}/api/load/${STORE_ID}/${pageSlug}`,
          )
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);

          if (saved?.components) {
            editor.setComponents(saved.components);
            editor.setStyle(saved.css || "");
          }

          let debounceTimer;
          editor.on("update", () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              await fetch(`${API_BASE}/api/save/${STORE_ID}/${pageSlug}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildPayload(editor)),
              });
            }, 3000);
          });

          editor.Commands.add("preview-publish", {

            /**
             * Saves the current editor state and opens a preview of the rendered page
             * in a new tab.
             *
             * `window.open` is called synchronously, before any `await` — must happen
             * as a direct result of the click handler. After an `await`, the browser no
             * longer treats a `window.open()` call as user-activated and silently
             * blocks it as a popup (moving this line after the first `await` reproduces
             * that exact bug).
             *
             * Sends the same `payload` to both `/api/save` and `/api/render` in
             * parallel (not sequentially) — avoids a race where `/render` could read a
             * stale save file if it depended on `/save` having already written to disk.
             *
             * @param {import("grapesjs").Editor} editor
             * @returns {Promise<void>}
             */
            async run(editor) {
              const previewWindow = window.open("about:blank", "_blank");

              const payload = buildPayload(editor);
              const [saveRes, renderRes] = await Promise.all([
                fetch(`${API_BASE}/api/save/${STORE_ID}/${pageSlug}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload),
                }),
                fetch(`${API_BASE}/api/render/${STORE_ID}/${pageSlug}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    components: payload.components,
                    css: payload.css,
                  }),
                }),
              ]);
              if (!saveRes.ok || !renderRes.ok) {
                console.error(
                  "FAILED TO PREVIEW",
                  saveRes.status,
                  renderRes.status,
                );
                previewWindow?.close();
              }
              const { html } = await renderRes.json();

              console.log("previewWindow:", previewWindow);
              console.log("html length:", html?.length);

              if (previewWindow) {
                previewWindow.document.write(html);
                previewWindow.document.close();
              }
            },
          });
          editor.Commands.add("create-page", {
            async run(editor) {
              const slug = window.prompt("Enter name for new page: ");

              if (!slug) return;

              const createPage = await fetch(
                `${API_BASE}/api/pages/${STORE_ID}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    slug: slug,
                  }),
                },
              );
              if (!createPage.ok) {
                window.alert("Incorrect page name");
                return;
              }
              window.alert(
                `Page was created to navigate use ?pageSlug=${slug}`,
              );
            },
          });
          editor.Panels.addButton("options", {
            id: "preview-publish-btn",
            className: "fa fa-rocket",
            command: "preview-publish",
            attributes: { title: "Preview & Publish" },
          });
          editor.Panels.addButton("options", {
            id: "create-page-btn",
            className: "fa fa-file",
            command: "create-page",
            attributes: { title: "Create new page" },
          });
        }}
        options={{
          height: "100vh",
          storageManager: false,
          canvas: {
            styles: ["/components.css", ...cssUrls],
          },
          // Same sectors GrapesJS ships by default, with "font-style" added to
          // Typography (not included out of the box) so italic is settable as a
          // real CSS rule on the selected class, not just per-character via RTE.
          styleManager: {
            sectors: [
              {
                name: "General",
                open: false,
                properties: ["display", "float", "position", "top", "right", "left", "bottom"],
              },
              {
                name: "Flex",
                open: false,
                properties: ["flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "order", "flex-basis", "flex-grow", "flex-shrink", "align-self"],
              },
              {
                name: "Dimension",
                open: false,
                properties: ["width", "height", "max-width", "min-height", "margin", "padding"],
              },
              {
                name: "Typography",
                open: false,
                properties: ["font-family", "font-size", "font-weight", "font-style", "letter-spacing", "color", "line-height", "text-align", "text-shadow"],
              },
              {
                name: "Decorations",
                open: false,
                properties: ["background-color", "border-radius", "border", "box-shadow", "background"],
              },
              {
                name: "Extra",
                open: false,
                properties: ["opacity", "transition", "transform"],
              },
            ],
          },
          plugins: [myComponentsPlugin],
          pluginsOpts: {
            [myComponentsPlugin]: {
              modules,
              content,
            },
          },
        }}
      />
      <select
        className="gjs-field gjs-select"
        value={pageSlug}
        onChange={(e) => handlePageChange(e.target.value)}
        style={{
          position: "absolute",
          top: "10px",
          right: "450px",
          width: "150px",
          zIndex: 10,
          color: "white",
        }}
      >
        {pages.map((slug) => (
          <option key={slug} value={slug}>
            {slug}
          </option>
        ))}
      </select>
    </div>
  );
}
