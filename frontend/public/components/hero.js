export default {
  extend: "themed-block",
  blockInfo: {
    label: "Hero",
    category: "Sections",
    icon: "fa fa-image",
  },
  model: {
    defaults: {
      tagName: "section",
      name: "Hero",
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
            { value: "image", name: "With Background Image" },
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
      this.removeClass(["hero-light", "hero-dark", "hero-image"]);
      this.addClass(`hero-${theme}`);
    },
  },
};
