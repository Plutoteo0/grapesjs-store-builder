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
      logoText: "",
      ctaText: "",

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
        {
          type: "text",
          name: "logoText",
          label: "Logo text",
          changeProp: 1,
          selector: ".header-logo",
        },
        {
          type: "text",
          name: "ctaText",
          label: "CTA button text",
          changeProp: 1,
          selector: ".header-cta",
        },
      ],
    },

    // no init() — inherited from themed-block

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["header-light", "header-dark", "header-transparent"]);
      this.addClass(`header-${theme}`);
    },
  },
};
