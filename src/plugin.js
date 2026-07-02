import themedBlock from "./components/themed-block";

export default function myComponentsPlugin(editor, opts = {}) {
  const { modules = [], ...clientOpts } = opts;

  editor.Components.addType("themed-block", themedBlock);

  for (const { name, config } of modules) {
    const { blockInfo, ...typeConfig } = config;

    const componentOpts = clientOpts[name];
    if (componentOpts) {
      Object.keys(componentOpts).forEach((key) => {
        if (key in typeConfig.model.defaults) {
          typeConfig.model.defaults[key] = componentOpts[key];
        }
      });
    }

    editor.Components.addType(name, typeConfig);

    if (blockInfo) {
      editor.Blocks.add(`${name}-block`, {
        label: blockInfo.label,
        category: blockInfo.category || "Sections",
        attributes: { class: blockInfo.icon || "" },
        content: { type: name },
      });
    }
  }
}
