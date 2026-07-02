import themedBlock from "./components/themed-block";

const modules = import.meta.glob("./components/*.js", { eager: true });

export default function myComponentsPlugin(editor, opts = {}) {
  editor.Components.addType("themed-block", themedBlock);

  for (const path in modules) {
    const fileName = path.split("/").pop().replace(".js", "");

    if (fileName === "themed-block" || fileName === "_template") continue;

    const componentConfig = modules[path].default;

    const { blockInfo, ...typeConfig } = componentConfig;

    // Generic per-client override: opts[componentName] = { field: value, ... }
    // Replaces the old hardcoded `if (fileName === "footer")` block —
    // now works for any component without touching plugin.js again.
    const componentOpts = opts[fileName];
    if (componentOpts) {
      Object.keys(componentOpts).forEach((key) => {
        if (key in typeConfig.model.defaults) {
          typeConfig.model.defaults[key] = componentOpts[key];
        }
      });
    }

    editor.Components.addType(fileName, typeConfig);

    if (blockInfo) {
      editor.Blocks.add(`${fileName}-block`, {
        label: blockInfo.label,
        category: blockInfo.category || "Sections",
        attributes: { class: blockInfo.icon || "" },
        content: { type: fileName },
      });
    }
  }
}
