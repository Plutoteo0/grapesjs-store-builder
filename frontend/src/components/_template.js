// TEMPLATE: copy this file under a new name (e.g. testimonial.js) into
// frontend/public/components/, add a manifest entry pointing to it, and
// fill in the TODOs with your own logic.
//
// Content comes from the server, not from this file: the manifest entry's
// name must have a matching key in the store's `content` object
// (backend/data/<store>.json). Two shapes are supported there:
//   - plain string  -> fully server-driven, nothing here is user-editable
//   - { template, ...fields } -> `template` has {{fieldName}} placeholders,
//     `fields` gives their default values (see hero.js + acme.json for a
//     real example). plugin.js destructures this and injects `content` +
//     the field defaults into this component's `defaults` before it's
//     registered.
//
// You do NOT write your own init() or watchProps/editableSelectors here.
// themed-block (do not touch that file for a new component) already:
//   - derives watchProps from every trait with changeProp: 1
//   - derives which children are inline-editable (double-click in canvas)
//     from every trait that also has a `selector`
//   - renders `content` as a template, substituting {{field}} with
//     this.get(field)
// So the only thing that makes a field "live" is declaring it correctly
// in `traits` below — one place, not four.

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
      // e.g. someField: "", — real value comes from backend content JSON,
      // this is just a fallback before that loads.

      traits: [
        {
          type: "select",
          name: "theme", // ⚠️ must match the field name above in defaults
          label: "Theme",
          changeProp: 1, // ⚠️ required — without it, the field won't update and won't be watched at all
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
            // TODO: add your own theme variants
          ],
          // no `selector` here — theme controls a class on the root, not
          // inline-editable text on a child, so it's watched but not
          // double-click-editable.
        },
        // TODO: add one entry per editable field, e.g.:
        // {
        //   type: "text",
        //   name: "headingText",       // must match a {{headingText}} placeholder in the template
        //   label: "Heading text",
        //   changeProp: 1,             // ⚠️ required — makes it watched (triggers re-render on change)
        //   selector: ".my-heading",   // ⚠️ only add this if double-click inline editing should be
        //                              // allowed on the child with this class — omit it to keep that
        //                              // child locked (edits would otherwise be silently discarded
        //                              // since renderContent() regenerates it from the trait value).
        // },
      ],
    },

    // no init() — inherited from themed-block (renders content template,
    // sets up watchProps + inline-edit sync from traits automatically)

    updateContent() {
      const theme = this.get("theme");
      // TODO: read the rest of your fields via this.get("...") if updateContent
      // needs them (rare — usually only theme-driven classes go here).

      // Only toggle classes here — never touch content. Content is
      // (re)rendered by themed-block's renderContent(), not here.
      this.removeClass(["TODO-light", "TODO-dark"]); // TODO: list all theme classes
      this.addClass(`TODO-${theme}`); // TODO: replace prefix with your component name
    },
  },
};
