function sanitizeRteHtml(html) {
  return html
    .replace(/\s(data-gjs-[\w-]+|draggable|data-selectme)="[^"]*"/g, "")
    .replace(/\sclass="([^"]*)"/g, (match, classList) => {
      const kept = classList.split(/\s+/).filter((c) => c && !c.startsWith("gjs-"));
      return kept.length ? ` class="${kept.join(" ")}"` : "";
    });
}

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
        this.on(events, (m, v, opts) => {
          this.updateContent();
          if (!opts?.fromRte) this.renderContent()
        });
      }

      this.updateContent();

      if (!this.components().length) {
        // fresh load — no restored children yet, build from template
        this.renderContent();
      } else {
        // restore — children already exist from setComponents(), don't
        // reparse them through this.components(html) (would turn any
        // formatting tag saved inside a trait's HTML into a new locked
        // child), just (re)wire editable/rte:disable on what's there
        this.wireEditableChildren();
      }
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

      this.wireEditableChildren();
    },

    wireEditableChildren() {
      const componentLabel = this.get("name") || this.cid;
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

            if (child.get("type") === "image") {
              child.off("change:src");
              child.on("change:src", () => {
                this.set(prop, child.get("src") ?? "", { fromRte: true });
              });
            } else {
              child.off("rte:disable");
              child.on("rte:disable", () => {
                this.set(prop, sanitizeRteHtml(child.getEl()?.innerHTML ?? ""), {fromRte: true})
              });
            }
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
