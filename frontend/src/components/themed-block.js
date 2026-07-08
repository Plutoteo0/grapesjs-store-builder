export default {
  model: {
    init() {
      const traits = this.getTraits().filter((t) => t.get("changeProp"));
      const watchProps = traits.map((t) => t.getName());
      const events = watchProps.map((prop) => `change:${prop}`).join(" ");

      this._editableMap = Object.fromEntries(
        traits.filter((t) => t.get("selector")).map((t) => [t.get("selector"), t.getName()])
      );

      if (events) {
        this.on(events, this.updateContent);
        this.on(events, this.renderContent);
      }

      this.updateContent();
      this.renderContent();
    },

    updateContent() {
      console.log("updateContent called", new Date().toISOString());
    },

    renderContent() {
      const template = this.get("content")
      if (!template) return;

      const componentLabel = this.get("name") || this.cid;

      [...template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].forEach(([, key]) => {
        if (this.get(key) === undefined) {
          console.warn(`[themed-block] "${componentLabel}": template references {{${key}}} but no such field is defined in defaults`);
        }
      });

      const html = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => this.get(key) ?? "");
      this.components(html);

      const editableMap = this._editableMap || {}
      const matchedSelectors = new Set();

      const walk = (children) => {
        children.forEach((child) => {
          const entry = Object.entries(editableMap).find(([selector]) =>
            child.getClasses().includes(selector.replace(/^\./, ""))
          );

          child.set({
            editable: !!entry,
            removable: false,
          });

          if (entry) {
            const [selector, prop] = entry;
            matchedSelectors.add(selector);
            child.off("rte:disable");
            child.on("rte:disable", () => {
              this.set(prop, child.getEl()?.innerText ?? "")
            });
          }

          // recurse regardless of match — a locked wrapper (e.g. a form div)
          // can still contain its own editable/lockable descendants
          walk(child.components());
        });
      };

      walk(this.components());

      Object.keys(editableMap).forEach((selector) => {
        if (!matchedSelectors.has(selector)) {
          console.warn(`[themed-block] "${componentLabel}": selector "${selector}" matched no rendered element`);
        }
      });
    }
  },
};
