// TEMPLATE: copy this file under a new name (e.g. testimonial.js)
// and fill in the TODOs with your own logic.
// See README.md → "How to add a new component" for the full checklist.

export default {
  extend: "themed-block", // do not change — always the same for themed components

  blockInfo: {
    label: "Newsletter", // shown in the Blocks panel
    category: "Sections",
    icon: "fa fa-square", // TODO: pick a Font Awesome icon class
  },

  model: {
    defaults: {
      tagName: "div", // TODO: root HTML tag (footer/header/section/...)
      name: "Newsletter", // shown in the editor (Layer Manager)

      theme: "light",
      heading: "Subscribe to our Newsletter",
      subheading: "Get the latest updates and offers.",
      buttonText: "Subscribe",
      placeholderText: "Enter your email",

      // ⚠️ REQUIRED: list every field that should trigger a re-render
      // when changed. Anything not listed here won't call updateContent().
      watchProps: [
        "theme",
        "heading",
        "subheading",
        "buttonText",
        "placeholderText",
      ], // TODO: add your other field names here too

      traits: [
        {
          type: "select",
          name: "theme", // ⚠️ must match the field name above in defaults
          label: "Theme",
          changeProp: 1, // ⚠️ required — without it, the field won't update at all
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
            // TODO: add your own theme variants
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
          name: "placeholderText",
          label: "Placeholder Text",
          changeProp: 1,
        },
      ],
    },

    updateContent() {
      const theme = this.get("theme");
      const heading = this.get("heading");
      const subheading = this.get("subheading");
      const buttonText = this.get("buttonText");
      const placeholderText = this.get("placeholderText");

      this.removeClass(["newsletter-light", "newsletter-dark"]);
      this.addClass(`newsletter-${theme}`);

      let content = `
        <div class="newsletter-inner">
            <h2 class="newsletter-heading">${heading}</h2>
            <p class="newsletter-subheading">${subheading}</p>
            <div class="newsletter-form">
                <input type="email" class="newsletter-input" placeholder="${placeholderText}" />
                <button class="newsletter-button">${buttonText}</button>
            </div>
        </div>`;

      this.components(content);
    },
  },
};
