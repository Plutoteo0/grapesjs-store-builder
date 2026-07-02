export default {
  extend: "themed-block",
  // No blockInfo — created only by nav-container

  model: {
    defaults: {
      tagName: "a",
      name: "Nav Item",
      draggable: ".nav-container",

      label: "Link",
      url: "#",

      watchProps: ["label", "url"],

      traits: [
        {
          type: "text",
          name: "label",
          label: "Label",
          changeProp: 1,
        },
        {
          type: "text",
          name: "url",
          label: "URL",
          changeProp: 1,
        },
      ],
    },

    updateContent() {
      const label = this.get("label");
      const url = this.get("url");

      this.addAttributes({ href: url });
      this.components(label);
    },
  },
};
