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
      content: "",
      footerText: "",

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
        {
          type: "text",
          name: "footerText",
          label: "Footer text",
          changeProp: 1,
          selector: ".footer-text",
        },
      ],
    },

    // no init() — inherited from themed-block

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["footer-light", "footer-dark", "footer-social"]);
      this.addClass(`footer-${theme}`);
    },
  },
};
