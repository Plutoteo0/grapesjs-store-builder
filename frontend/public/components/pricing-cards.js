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
      cardCount: "3",

      watchProps: ["cardCount"],

      traits: [
        {
          type: "select",
          name: "cardCount",
          label: "Number of cards",
          changeProp: 1,
          options: [
            { value: "2", name: "2 Cards" },
            { value: "3", name: "3 Cards" },
            { value: "4", name: "4 Cards" },
          ],
        },
      ],
    },

    updateContent() {
      const count = parseInt(this.get("cardCount"), 10);
      const children = this.components();
      const current = children.length;

      this.removeClass(["pricing-grid-2", "pricing-grid-3", "pricing-grid-4"]);
      this.addClass(`pricing-grid-${count}`);

      if (current < count) {
        for (let i = current; i < count; i++) {
          children.add({ type: "pricing-card" });
        }
      } else if (current > count) {
        const toRemove = children.slice(count);
        toRemove.forEach((child) => child.remove());
      }
    },
  },
};
