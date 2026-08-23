export default {
  extend: "themed-block",
  blockInfo: {
    label: "Pricing Cards",
    category: "Sections",
    icon: "fa fa-credit-card",
  },
  commands: {
    "pricing-cards:add-card": {
      run(editor) {
        const selected = editor.getSelected();
        selected.components().add({
          type: "pricing-card",
          title: "New Plan",
          price: "$0/mo",
          desc: "Describe this plan",
          image: "https://picsum.photos/seed/new/280/160",
        });
      },
    },
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Pricing Cards",
      classes: ["pricing-cards", "pricing-grid-3"],
      items: [],
      toolbar: [
        { attributes: { class: "fa fa-arrows" }, command: "tlb-move" },
        { attributes: { class: "fa fa-trash" }, command: "tlb-delete" },
        {
          attributes: { class: "fa fa-plus" },
          command: "pricing-cards:add-card",
        },
      ],
      droppable: ".pricing-card",
    },

    init() {
      const items = this.get("items") || [];
      const existingIds = new Set(
        this.components()
          .map((child) => child.get("id"))
          .filter(Boolean)
      );

      const newItems = items.filter((item) => !existingIds.has(item.id));
      newItems.forEach(item => {
        this.components().add({ type: "pricing-card" , ...item})
      });
    },
  },
};
