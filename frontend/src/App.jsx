import { useState, useEffect } from "react";
import "grapesjs/dist/css/grapes.min.css";
import GjsEditor from "@grapesjs/react";
import grapesjs from "grapesjs";
import myComponentsPlugin from "./plugin";

const STORE_ID =
  new URLSearchParams(window.location.search).get("store") || "acme";
const API_BASE = "http://localhost:3001";

export default function App() {
  const [modules, setModules] = useState(null);
  const [cssUrls, setCssUrls] = useState([]);
  const [content, setContent] = useState(null);

  useEffect(() => {
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
  }, []);

  if (!modules) return <div>Loading components...</div>;

  return (
    <GjsEditor
      grapesjs={grapesjs}
      onEditor={async (editor) => {
        window.editor = editor;

        // Restore saved state if exists
        const saved = await fetch(`${API_BASE}/api/load/${STORE_ID}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (saved?.components) {
          editor.setComponents(saved.components);
          editor.setStyle(saved.css || "");
        }

        // Save on every change
        let debounceTimer;
        editor.on("update", () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            await fetch(`${API_BASE}/api/save/${STORE_ID}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                components: editor.getComponents().toJSON(),
                html: editor.getHtml(),
                css: editor.getCss(),
              }),
            });
          }, 1000);
        });
      }}
      options={{
        height: "100vh",
        storageManager: false,
        canvas: {
          styles: ["/components.css", ...cssUrls],
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
  );
}
