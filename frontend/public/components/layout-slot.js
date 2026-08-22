export default {
  extend: "themed-block",
  model: {
    defaults: {
      tagName: "div",
      name: "Layout Slot",
      classes: ["layout-slot"],
      droppable: true,
      removable: false,
    },
    init () {}
  },
};