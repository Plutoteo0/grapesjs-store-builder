export default {
  extend: "themed-block",
  // No blockInfo — created only by header

  model: {
    defaults: {
      tagName: "nav",
      name: "Nav Container",
      draggable: false,
      itemCount: "4",

      watchProps: ["itemCount"],

      traits: [
        {
          type: "select",
          name: "itemCount",
          label: "Number of items",
          changeProp: 1,
          options: [
            { value: "2", name: "2 Items" },
            { value: "3", name: "3 Items" },
            { value: "4", name: "4 Items" },
            { value: "5", name: "5 Items" },
          ],
        },
      ],
    },

    updateContent() {
      const count = parseInt(this.get("itemCount"), 10);
      const children = this.components();
      const current = children.length;

      if (current < count) {
        for (let i = current; i < count; i++) {
          children.add({ type: "nav-item" });
        }
      } else if (current > count) {
        children.slice(count).forEach((child) => child.remove());
      }
    },
  },
};
