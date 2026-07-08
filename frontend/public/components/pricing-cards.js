export default {
  extend: "themed-block",
  blockInfo: {
    label: "Pricing Cards",
    category: "Sections",
    icon: "fa fa-credit-card",
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Pricing Cards",
      classes: ["pricing-cards", "pricing-grid-3"],
      cards: [], // array of { title, price, desc, image, buttonText } from backend content
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
