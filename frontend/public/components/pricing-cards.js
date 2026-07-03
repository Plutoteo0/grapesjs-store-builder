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
      content: "",
    },

    async init() {
      const html = this.get("content");
      if (html) this.components(html);
    },
  },
};
