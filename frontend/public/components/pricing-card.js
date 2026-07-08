export default {
  extend: "themed-block",
  blockInfo: {
    label: "Pricing Card",
    category: "Sections",
    icon: "fa fa-id-card",
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Pricing Card",
      classes: ["pricing-card"],
      draggable: ".pricing-cards", // only allowed to be dropped/moved inside the pricing-cards container
      removable: true,

      title: "",
      price: "", // no trait below — comes from the DB later, not user-editable
      desc: "",
      image: "",
      buttonText: "Choose Plan",

      content:
        '<img src="{{ image }}" alt="{{ title }}" class="pricing-card-image" /><h3 class="pricing-card-title">{{ title }}</h3><p class="pricing-card-price">{{ price }}</p><p class="pricing-card-desc">{{ desc }}</p><button class="pricing-card-button">{{ buttonText }}</button>',

      traits: [
        {
          type: "text",
          name: "title",
          label: "Title",
          changeProp: 1,
          selector: ".pricing-card-title", // allows double-click inline edit in canvas
        },
        {
          type: "text",
          name: "image",
          label: "Image URL",
          changeProp: 1, // editable via the Traits panel only — an <img> has no
          // text content, so there's nothing for double-click RTE to edit
        },
        // price intentionally has no trait: locked until it's wired to real DB data
      ],
    },
  },
};
