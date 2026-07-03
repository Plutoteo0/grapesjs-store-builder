// TEMPLATE: copy this file under a new name (e.g. testimonial.js) into
// frontend/public/components/, add a manifest entry pointing to it, and
// fill in the TODOs with your own logic.
//
// Content comes from the server, not from this file: the manifest entry's
// name must have a matching key in the store's `content` object
// (backend/data/<store>.json), which App.jsx fetches once and plugin.js
// injects into defaults.content. This component only renders what it's
// given — it never builds its own HTML.

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
      content: "", // filled in by plugin.js from the store's content API — do not set manually
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

    async init() {
      const html = this.get("content");
      if (html) this.components(html); // insert server-provided HTML once
      this.updateContent();

      const watchProps = this.get("watchProps") || [];
      const events = watchProps.map((p) => `change:${p}`).join(" ");
      if (events) this.on(events, this.updateContent);
    },

    updateContent() {
      const theme = this.get("theme");
      // TODO: read the rest of your fields via this.get("...")

      // Only toggle classes here — never touch content. Content is
      // inserted once in init() and lives on as normal child components.
      this.removeClass(["TODO-light", "TODO-dark"]); // TODO: list all theme classes
      this.addClass(`TODO-${theme}`); // TODO: replace prefix with your component name
    },
  },
};
