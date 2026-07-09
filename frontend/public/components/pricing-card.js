export default {
  extend: "themed-block",
  blockInfo: {
    label: "Pricing Card",
    category: "Sections",
    icon: "fa fa-id-card",
  },
  commands: {
    "pricing-card:delete-confirm": {
      run(editor) {
        const selected = editor.getSelected();
        if (window.confirm("Delete this card?")) {
          selected.remove();
        }
      }
    }
  },
  model: {
    defaults: {
      tagName: "div",
      name: "Pricing Card",
      classes: ["pricing-card"],
      draggable: ".pricing-cards", 
      removable: true,
      toolbar: [
        { attributes: { class: "fa fa-arrows" }, command: "tlb-move" },
        { attributes: { class: "fa fa-clone" }, command: "tlb-clone" },
        { attributes: { class: "fa fa-trash" }, command: "pricing-card:delete-confirm" },
      ],

      title: "",
      price: "",
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
          selector: ".pricing-card-title",
        },
        {
          type: "text",
          name: "image",
          label: "Image URL",
          changeProp: 1,
          selector: ".pricing-card-image", // enables Asset Manager on double-click (see themed-block wireEditableChildren)
        },
        {
          type: "text",
          name: "desc",
          label: "Description",
          changeProp: 1,
          selector: ".pricing-card-desc"
        }
      ],
    },
  },
};
