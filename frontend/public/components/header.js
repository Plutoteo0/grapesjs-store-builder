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

    // no init() — inherited from themed-block

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["header-light", "header-dark", "header-transparent"]);
      this.addClass(`header-${theme}`);
    },
  },
};
