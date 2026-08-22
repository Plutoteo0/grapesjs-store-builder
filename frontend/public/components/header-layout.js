export default {
  extend: "themed-block",
  blockInfo: {
    label: "Header Layout",
    category: "Sections",
    icon: "fa fa-columns",
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Header Layout",
      classes: ["header-layout"],
    },

    init() {
        if (!this.components().length) {
            this.components().add([
                { type: "layout-slot" },
                { type: "layout-slot" },
            ]);
        }
    },
  },
};