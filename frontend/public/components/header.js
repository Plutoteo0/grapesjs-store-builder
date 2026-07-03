export default {
  extend: "themed-block",
  blockInfo: {
    label: "Header",
    category: "Sections",
    icon: "fa fa-window-maximize",
  },

  model: {
    defaults: {
      tagName: "header",
      name: "Header",
      theme: "light",
      content: "",

      watchProps: ["theme"],

      traits: [
        {
          type: "select",
          name: "theme",
          label: "Theme",
          changeProp: 1,
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
            { value: "transparent", name: "Transparent" },
          ],
        },
      ],
    },

    async init() {
      const html = this.get("content");
      if (html) this.components(html);
      this.updateContent();

      const watchProps = this.get("watchProps") || [];
      const events = watchProps.map((p) => `change:${p}`).join(" ");
      if (events) this.on(events, this.updateContent);
    },

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["header-light", "header-dark", "header-transparent"]);
      this.addClass(`header-${theme}`);
    },
  },
};
