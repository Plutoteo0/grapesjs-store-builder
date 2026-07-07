import themedBlock from "./components/themed-block";

export default function myComponentsPlugin(editor, opts = {}) {
  const { modules = [], content, ...clientOpts } = opts;

  editor.Components.addType("themed-block", themedBlock);

  for (const { name, config } of modules) {
    const { blockInfo, ...typeConfig } = config;

    if (typeof content?.[name] === "string") {
      typeConfig.model.defaults.content = content[name];
    } else if (content?.[name]){
      const { template, ...fields } = content[name]
      Object.assign(typeConfig.model.defaults, fields);
      typeConfig.model.defaults.content = template
    }

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
