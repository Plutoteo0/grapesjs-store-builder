// TEMPLATE: copy this file under a new name (e.g. hero.js)
// and fill in the TODOs with your own logic.
// See README.md → "How to add a new component" for the full checklist.

export default {
  extend: "themed-block", // do not change — always the same for themed components
  blockInfo: {
    label: "Pricng Cards",
    category: "Sections",
    icon: "fa fa-credit-card",
  },
  model: {
    defaults: {
      tagName: "div", // TODO: root HTML tag (footer/header/section/...)
      name: "Pricing cards", // shown in the editor (Layer Manager)
      cardCount: "3",
      watchProps: ["cardCount"],

      traits: [
        {
          type: "select",
          name: "cardCount", // ⚠️ must match the field name above in defaults
          label: "Number of cards",
          changeProp: 1, // ⚠️ required — without it, updateContent() won't re-run
          options: [
            { value: "2", name: "2 Cards" },
            { value: "3", name: "3 Cards" },
            { value: "4", name: "4 Cards" },
          ],
        },
        // TODO: add traits for the rest of your fields,
        // always with changeProp: 1, and name matching defaults
      ],
    },

    updateContent() {
      const count = parseInt(this.get("cardCount"), 10);

      this.removeClass(["pricing-grid-2", "pricing-grid-3", "pricing-grid-4"]);
      this.addClass(`pricing-grid-${count}`);

      let cardsHtml = "";
      for (let i = 0; i < count; i++) {
        cardsHtml += `
          <div class="pricing-card">
            <img src="https://picsum.photos/seed/pricingcard1/280/160" alt="Product" class="pricing-card-image" />
            <h3 class="pricing-card-title">Plan Name</h3>
            <p class="pricing-card-price">$29/mo</p>
            <p class="pricing-card-desc">Short description of what's included.</p>
            <button class="pricing-card-button">Choose Plan</button>
          </div>
        `;
      }

      this.components(cardsHtml);
    },
  },
};
