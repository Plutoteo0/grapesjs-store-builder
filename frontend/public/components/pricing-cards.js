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
          buttonText: "Choose Plan",
        });
      },
    },
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Pricing Cards",
      classes: ["pricing-cards", "pricing-grid-3"],
      cards: [], 
      toolbar: [
        { attributes: { class: "fa fa-arrows" }, command: "tlb-move" },
        { attributes: { class: "fa fa-trash" }, command: "tlb-delete" },
        { attributes: { class: "fa fa-plus" }, command: "pricing-cards:add-card"},
      ]
    },

    
    init() {
      const cards = this.get("cards") || [];

      if (!this.components().length) {
        cards.forEach((card) => {
          this.components().add({ type: "pricing-card", ...card });
        });
      }
    },
  },
};
