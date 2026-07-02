export default {
  model: {
    init() {
      const watchProps = this.get("watchProps") || [];
      const events = watchProps.map((prop) => `change:${prop}`).join(" ");

      if (events) {
        this.on(events, this.updateContent);
      }

      this.updateContent();
    },

    updateContent() {
      console.log("updateContent called", new Date().toISOString());
    },
  },
};
