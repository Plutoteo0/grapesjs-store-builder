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
      content: "",
      editable: false,
      script: function() {
        const button = this.querySelector(".hero-button");
        if (button) {
          button.addEventListener('click', () => console.log("button clicked"));
        }
      },
      "script-props": ["theme", "buttonText"],

      watchProps: ["theme", "buttonText"],

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
