export default {
  extend: "themed-block",

  model: {
    defaults: {
      tagName: "div",
      name: "Pricing Card",
      draggable: ".pricing-cards",

      image: "https://picsum.photos/seed/pricingcard/280/160",
      title: "Plan Name",
      price: "$29/mo",
      description: "Short description of what's included.",
      buttonText: "Choose Plan",

      watchProps: ["image", "title", "price", "description", "buttonText"],

      traits: [
        {
          type: "text",
          name: "title",
          label: "Title",
          changeProp: 1,
        },
        {
          type: "text",
          name: "price",
          label: "Price",
          changeProp: 1,
        },
        {
          type: "text",
          name: "description",
          label: "Description",
          changeProp: 1,
        },
        {
          type: "text",
          name: "buttonText",
          label: "Button Text",
          changeProp: 1,
        },
        {
          type: "text",
          name: "image",
          label: "Image URL",
          changeProp: 1,
        },
      ],
    },

    updateContent() {
      const image = this.get("image");
      const title = this.get("title");
      const price = this.get("price");
      const description = this.get("description");
      const buttonText = this.get("buttonText");

      this.components(`
        <img src="${image}" alt="${title}" class="pricing-card-image" />
        <h3 class="pricing-card-title">${title}</h3>
        <p class="pricing-card-price">${price}</p>
        <p class="pricing-card-desc">${description}</p>
        <button class="pricing-card-button">${buttonText}</button>
      `);
    },
  },
};
