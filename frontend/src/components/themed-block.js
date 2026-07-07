export default {
  model: {
    init() {
      const watchProps = this.get("watchProps") || [];
      const events = watchProps.map((prop) => `change:${prop}`).join(" ");

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
      const html = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => this.get(key) ?? "");
      this.components(html)
    }
  },
};
