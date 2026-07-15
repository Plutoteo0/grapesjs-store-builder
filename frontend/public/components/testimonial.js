export default {
  extend: "themed-block",

  blockInfo: {
    label: "Testimonial",
    category: "Sections",
    icon: "fa fa-quote-right",
  },

  model: {
    defaults: {
      tagName: "div",
      name: "Testimonial",
      classes: ["testimonial"],
      theme: "light",
      content: "",       
      quote: "",          

      traits: [
        {
          type: "select",
          name: "theme",
          label: "Theme",
          changeProp: 1,
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
          ],
        },
        {
          type: "text",
          name: "quote",
          label: "Quote",
          changeProp: 1,
          selector: ".testimonial-quote",
        },
      ],
      droppable: "false",
    },

    

    updateContent() {
      const theme = this.get("theme");
      this.removeClass(["testimonial-light", "testimonial-dark"]);
      this.addClass(`testimonial-${theme}`);
    },
  },
};