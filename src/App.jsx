import { useState, useEffect } from "react";
import "grapesjs/dist/css/grapes.min.css";
import GjsEditor from "@grapesjs/react";
import grapesjs from "grapesjs";
import myComponentsPlugin from "./plugin";
import { getStoreConfig } from "./editor-config";

const STORE_ID = "acme"; // will come from auth/routing in production

export default function App() {
  const [modules, setModules] = useState(null);
  const storeConfig = getStoreConfig(STORE_ID);

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
      const manifest = await fetch(`/manifest.${STORE_ID}.json`).then((r) =>
        r.json(),
      );
      const loaded = [];
      for (const { name, url } of manifest) {
        const mod = await importFromUrl(url);
        loaded.push({ name, config: mod.default });
      }
      setModules(loaded);
    }
    loadComponents();
  }, []);

  if (!modules) return <div>Loading components...</div>;

  return (
    <GjsEditor
      grapesjs={grapesjs}
      onEditor={(editor) => {
        window.editor = editor;
      }}
      options={{
        height: "100vh",
        storageManager: false,
        canvas: {
          styles: ["/components.css"],
        },
        plugins: [myComponentsPlugin],
        pluginsOpts: {
          [myComponentsPlugin]: { modules, ...storeConfig },
        },
      }}
    />
  );
}
