export default {
  extend: "themed-block",
  blockInfo: {
    label: "Newsletter",
    category: "Sections",
    icon: "fa fa-envelope",
  },

  model: {
    defaults: {
      tagName: "div",
      name: "Newsletter",
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
      this.removeClass(["newsletter-light", "newsletter-dark"]);
      this.addClass(`newsletter-${theme}`);
    },
  },
};
