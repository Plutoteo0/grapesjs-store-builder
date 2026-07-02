export default {
  extend: "themed-block",
  blockInfo: {
    label: "Footer",
    category: "Sections",
    icon: "fa fa-window-minimize",
  },

  model: {
    defaults: {
      tagName: "footer",
      name: "Footer",
      theme: "light",
      apiUrl: "http://localhost:3001/api/content/acme",

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
            { value: "social", name: "With Social Media" },
          ],
        },
      ],
    },

    async init() {
      const url = this.get("apiUrl");
      const data = await fetch(url).then((r) => r.json());
      if (data.footer) this.components(data.footer);
      this.updateContent();

      const watchProps = this.get("watchProps") || [];
      const events = watchProps.map((p) => `change:${p}`).join(" ");
      if (events) this.on(events, this.updateContent);
    },

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["footer-light", "footer-dark", "footer-social"]);
      this.addClass(`footer-${theme}`);
    },
  },
};
