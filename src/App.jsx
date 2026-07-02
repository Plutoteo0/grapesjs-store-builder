import "grapesjs/dist/css/grapes.min.css";
import GjsEditor from "@grapesjs/react";
import grapesjs from "grapesjs";
import myComponentsPlugin from "./plugin";
import { getStoreConfig } from "./editor-config";

export default function App() {
  const storeConfig = getStoreConfig("acme");

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
          [myComponentsPlugin]: storeConfig,
        },
      }}
    />
  );
}
