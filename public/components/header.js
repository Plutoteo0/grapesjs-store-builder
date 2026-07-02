export default {
  extend: "themed-block",
  blockInfo: {
    label: "Header",
    category: "Sections",
    icon: "fa fa-window-maximize",
  },

  model: {
    defaults: {
      tagName: "header",
      name: "Header",
      theme: "light",
      logoText: "My Company",
      logoUrl: "",
      ctaButtonText: "Sign Up",

      watchProps: ["theme", "logoText", "logoUrl", "ctaButtonText"],

      traits: [
        {
          type: "select",
          name: "theme",
          label: "Theme",
          changeProp: 1,
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
            { value: "transparent", name: "Transparent" },
          ],
        },
        {
          type: "text",
          name: "logoText",
          label: "Logo Text",
          changeProp: 1,
        },
        {
          type: "text",
          name: "logoUrl",
          label: "Logo Image URL (overrides text)",
          changeProp: 1,
        },
        {
          type: "text",
          name: "ctaButtonText",
          label: "Button Text",
          changeProp: 1,
        },
      ],
    },

    updateContent() {
      const theme = this.get("theme");
      const logoText = this.get("logoText");
      const logoUrl = this.get("logoUrl");
      const ctaButtonText = this.get("ctaButtonText");

      this.removeClass(["header-light", "header-dark", "header-transparent"]);
      this.addClass(`header-${theme}`);

      const logoContent = logoUrl
        ? `<img src="${logoUrl}" alt="${logoText}" class="header-logo-img" />`
        : logoText;

      const children = this.components();

      if (children.length === 0) {
        children.add([
          { tagName: "div", classes: ["header-logo"], components: logoContent },
          { type: "nav-container" },
          {
            tagName: "button",
            classes: ["header-cta"],
            components: ctaButtonText,
          },
        ]);
      } else {
        children.at(0).components(logoContent);
        children.at(2).components(ctaButtonText);
      }
    },
  },
};
