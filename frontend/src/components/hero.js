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
            { value: "image", name: "With Background Image" },
          ],
        },
      ],
    },

    async init() {
      const url = this.get("apiUrl");
      const data = await fetch(url).then((r) => r.json());
      if (data.hero) this.components(data.hero);
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
