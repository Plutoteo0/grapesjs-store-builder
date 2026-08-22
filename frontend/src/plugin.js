import themedBlock from "./components/themed-block";

/**
 * GrapesJS plugin entry point — registers every pre-loaded component module
 * and merges each one's server-driven content into its `defaults`, before
 * `editor.Components.addType()` runs (mutating `defaults` after `addType()`
 * would have no effect — see the "Known GrapesJS gotchas" note in the
 * project's CLAUDE.md).
 *
 * Registers "themed-block" first (the base type every component `extend`s)
 * before looping over `modules` — child types must be registered before
 * their containers reference them by `type`, which manifest order already
 * guarantees for `modules` itself.
 *
 * @param {import("grapesjs").Editor} editor - the GrapesJS instance, passed
 *   by GrapesJS itself when the plugin runs
 * @param {object} opts
 * @param {Array<{name: string, config: object}>} [opts.modules] - pre-loaded
 *   component modules, in manifest order (see App.jsx's dynamic import via Blob URL)
 * @param {object} [opts.content] - the store's resolved content map from
 *   `GET /api/content/:storeId`; `content[name]` merges into that module's
 *   `defaults` per the three content shapes (plain string / `{template, ...fields}` / raw object)
 * @param {Object<string, object>} [opts.clientOpts] - everything else in `opts`,
 *   keyed by component name — per-component default overrides (currently
 *   unused by any real config, but supported)
 */
export default function myComponentsPlugin(editor, opts = {}) {
  const { modules = [], content, ...clientOpts } = opts;

  editor.Components.addType("themed-block", themedBlock);

  for (const { name, config } of modules) {
    const { blockInfo, commands, ...typeConfig } = config;

    if (typeof content?.[name] === "string") {
      typeConfig.model.defaults.content = content[name];
    } else if (content?.[name]?.template) {
      const { template, ...fields } = content[name]
      Object.assign(typeConfig.model.defaults, fields);
      typeConfig.model.defaults.content = template
    } else if (content?.[name]) {
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

    if (commands) {
      Object.entries(commands).forEach(([commandId, commandDef]) => {
        editor.Commands.add(commandId, commandDef)
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
