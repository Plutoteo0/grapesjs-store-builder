import themedBlock from "./components/themed-block";

export default function myComponentsPlugin(editor, opts = {}) {
  const { modules = [], content, ...clientOpts } = opts;

  editor.Components.addType("themed-block", themedBlock);

  for (const { name, config } of modules) {
    const { blockInfo, ...typeConfig } = config;

    if (typeof content?.[name] === "string") {
      typeConfig.model.defaults.content = content[name];
    } else if (content?.[name]?.template) {
      const { template, ...fields } = content[name]
      Object.assign(typeConfig.model.defaults, fields);
      typeConfig.model.defaults.content = template
    } else if (content?.[name]) {
      // no `template` key: structured data for a container that builds its
      // own children (e.g. { cards: [...] }), not a {{}} substitution template
      Object.assign(typeConfig.model.defaults, content[name]);
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
