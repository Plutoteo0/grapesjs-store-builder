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
          ],
        },
      ],
    },

    async init() {
      const url = this.get("apiUrl");
      const data = await fetch(url).then((r) => r.json());
      if (data.newsletter) this.components(data.newsletter);
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
