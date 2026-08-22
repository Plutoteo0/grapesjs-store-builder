export default {
  extend: "themed-block",
  blockInfo: {
    label: "Layout Component",
    category: "Sections",
    icon: "fa fa-image",
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Layout Component",
      droppable: true,
      size: "2",

      traits: [
        {
            type: "select",
            name: "size",
            label: "Size",
            changeProp: 1,
            options: [
                { value: "2", label: "2x2 grid"},
                { value: "3", label: "3x3 grid"},
                { value: "4", label: "4x4 grid"},
            ]
        },],
    },
    updateContent() {
        const size = this.get("size");
        this.removeClass(["row-cols-2", "row-cols-3", "row-cols-4"]);
        this.addClass(`row-cols-${size}`);
    },
    }   
};
