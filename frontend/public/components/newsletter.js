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
      classes: ["newsletter-inner"],
      theme: "light",
      content: "",
      newsHeading: "Welcome",

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
        {
          type: "text",
          name: "newsHeading",
          label: "Heading",
          changeProp: 1,
          selector: ".newsletter-heading"
        },
      ],
    },

    // no init() — inherited from themed-block

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["newsletter-light", "newsletter-dark"]);
      this.addClass(`newsletter-${theme}`);
    },
  },
};
