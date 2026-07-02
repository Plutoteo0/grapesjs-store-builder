// TEMPLATE: copy this file under a new name (e.g. hero.js)
// and fill in the TODOs with your own logic.
// See README.md → "How to add a new component" for the full checklist.

export default {
  extend: "themed-block", // do not change — always the same for themed components
  blockInfo: {
    label: "Hero",
    category: "Sections",
    icon: "fa fa-image",
  },
  model: {
    defaults: {
      tagName: "section", // TODO: root HTML tag (footer/header/section/...)
      name: "Hero", // shown in the editor (Layer Manager)
      theme: "light", // TODO: default theme value
      // TODO: add the rest of your fields with default values,
      // e.g. someField: "default value",

      heading: "Welcome to Our Website",
      subheading: "Short Description",
      buttonText: "Get Started",
      backgroundImage: "",
      overlayColor: "rgba(0, 0, 0, 0.4)",
      watchProps: [
        "theme",
        "heading",
        "subheading",
        "buttonText",
        "backgroundImage",
        "overlayColor",
      ],

      traits: [
        {
          type: "select",
          name: "theme", // ⚠️ must match the field name above in defaults
          label: "Theme",
          changeProp: 1, // ⚠️ required — without it, updateContent() won't re-run
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
            { value: "image", name: "With Background Image" },
          ],
        },
        {
          type: "text",
          name: "heading",
          label: "Heading",
          changeProp: 1,
        },
        {
          type: "text",
          name: "subheading",
          label: "Subheading",
          changeProp: 1,
        },
        {
          type: "text",
          name: "buttonText",
          label: "Button Text",
          changeProp: 1,
        },
        {
          type: "text",
          name: "backgroundImage",
          label: "Background Image URL",
          changeProp: 1,
        },
        {
          type: "color",
          name: "overlayColor",
          label: "Overlay Color",
          changeProp: 1,
        },
      ],
    },

    updateContent() {
      const theme = this.get("theme");
      // TODO: read the rest of your fields via this.get("...")
      const heading = this.get("heading");
      const subheading = this.get("subheading");
      const buttonText = this.get("buttonText");
      const backgroundImage = this.get("backgroundImage");
      const overlayColor = this.get("overlayColor");

      this.removeClass(["hero-light", "hero-dark", "hero-image"]); // TODO: list all theme classes
      this.addClass(`hero-${theme}`); // TODO: replace prefix with your component name

      if (theme === "image" && backgroundImage) {
        this.addStyle({ "background-image": `url(${backgroundImage})` });
      } else {
        this.addStyle({ "background-image": "none" });
      }

      let content = `
        <div class="hero-inner" style = "${theme === "image" ? `background: ${overlayColor};` : ""}">
          <h1 class="hero-heading">${heading}</h1>
          <p class="hero-subheading">${subheading}</p>
          <button class="hero-button">${buttonText}</button>
        </div>
      `;

      this.components(content);
    },
  },
};
