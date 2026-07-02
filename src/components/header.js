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
      navItems: "Home, About, Services, Contact",
      ctaButtonText: "Sign Up",
      watchProps: ["theme", "logoText", "navItems", "ctaButtonText"],

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
          name: "navItems",
          label: "Navigation Items (comma-separated)",
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
      const navItems = this.get("navItems");
      const ctaButtonText = this.get("ctaButtonText");

      this.removeClass(["header-light", "header-dark", "header-transparent"]);
      this.addClass(`header-${theme}`);

      const navItemsHtml = navItems
        .split(",")
        .map((item) => `<a href="#">${item.trim()}</a>`)
        .join("");

      let content = `
        <div class="header-inner">
            <div class="header-logo">${logoText}</div>
            <nav class="header-nav">${navItemsHtml}</nav>
            <button class="header-cta">${ctaButtonText}</button>
        </div>
      `;

      this.components(content);
    },
  },
};
