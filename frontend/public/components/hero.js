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
      buttonText: "",
      headingText: "",
      subheadingText: "",
      content: "",
      script: function() {
        const button = this.querySelector(".hero-button");
        if (button) {
          button.addEventListener('click', () => console.log("button clicked"));
        }
      },
      "script-props": ["theme", "buttonText"],

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
        {
          type: "text",
          name: "buttonText",
          label: "Button text",
          changeProp: 1,
          selector: ".hero-button",
        },
        {
          type: "text",
          name: "headingText",
          label: "Heading text",
          changeProp: 1,
          selector: ".hero-heading"
        },
        {
          type: "text",
          name: "subheadingText",
          label: "Subheading text",
          changeProp: 1,
          selector: ".hero-subheading"
        }
      ],
    },

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["hero-light", "hero-dark", "hero-image"]);
      this.addClass(`hero-${theme}`);
    },
  },
};
