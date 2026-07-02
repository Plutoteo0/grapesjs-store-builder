// TEMPLATE: copy this file under a new name (e.g. testimonial.js)
// and fill in the TODOs with your own logic.
// See README.md → "How to add a new component" for the full checklist.

export default {
  extend: "themed-block", // do not change — always the same for themed components

  blockInfo: {
    label: "TODO Block Label", // shown in the Blocks panel
    category: "Sections",
    icon: "fa fa-square", // TODO: pick a Font Awesome icon class
  },

  model: {
    defaults: {
      tagName: "div", // TODO: root HTML tag (footer/header/section/...)
      name: "TODO Component Name", // shown in the editor (Layer Manager)

      theme: "light", // TODO: default theme value
      // TODO: add the rest of your fields with default values,
      // e.g. someField: "default value",

      // ⚠️ REQUIRED: list every field that should trigger a re-render
      // when changed. Anything not listed here won't call updateContent().
      watchProps: ["theme"], // TODO: add your other field names here too

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
        // TODO: add traits for the rest of your fields,
        // always with changeProp: 1, and name matching defaults + watchProps
      ],
    },

    updateContent() {
      const theme = this.get("theme");
      // TODO: read the rest of your fields via this.get("...")

      this.removeClass(["TODO-light", "TODO-dark"]); // TODO: list all theme classes
      this.addClass(`TODO-${theme}`); // TODO: replace prefix with your component name

      let content = "";
      if (theme === "dark") {
        content = `<div>TODO: HTML for dark theme</div>`;
      } else {
        content = `<div>TODO: HTML for light theme (default)</div>`;
      }

      this.components(content);
    },
  },
};
