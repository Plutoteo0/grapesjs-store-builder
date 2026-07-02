export default {
  extend: "themed-block",
  blockInfo: {
    label: "Footer",
    category: "Sections",
    icon: "fa fa-window-minimize",
  },

  model: {
    defaults: {
      tagName: "footer",
      name: "Footer",
      theme: "light",
      companyName: "My Company",
      watchProps: ["theme", "companyName"],

      traits: [
        {
          type: "select",
          name: "theme",
          label: "Theme",
          changeProp: 1,
          options: [
            { value: "light", name: "Light" },
            { value: "dark", name: "Dark" },
            { value: "social", name: "With Social Media" },
          ],
        },
        {
          type: "text",
          name: "companyName",
          label: "Company Name",
          changeProp: 1,
        },
      ],
    },

    updateContent() {
      const theme = this.get("theme");
      const companyName = this.get("companyName");

      this.removeClass(["footer-light", "footer-dark", "footer-social"]);
      this.addClass(`footer-${theme}`);

      let content = "";

      if (theme === "dark") {
        content = `<div class="footer-inner"><span>© ${companyName}</span></div>`;
      } else if (theme === "social") {
        content = `
          <div class="footer-inner">
            <span>© ${companyName}</span>
            <div class="footer-icons">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
                </svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2c2.7 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.47a4.9 4.9 0 0 1 1.77 1.15 4.9 4.9 0 0 1 1.15 1.77c.25.64.42 1.37.47 2.43.05 1.06.06 1.42.06 4.12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.77 4.9 4.9 0 0 1-1.77 1.15c-.64.25-1.37.42-2.43.47-1.06.05-1.42.06-4.12.06s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.37-.47-2.43C2.01 15.06 2 14.7 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.47-2.43a4.9 4.9 0 0 1 1.15-1.77A4.9 4.9 0 0 1 5.45 2.53c.64-.25 1.37-.42 2.43-.47C8.94 2.01 9.3 2 12 2zm0 1.8c-2.66 0-2.99.01-4.04.06-.87.04-1.34.18-1.65.3a2.9 2.9 0 0 0-1.08.7 2.9 2.9 0 0 0-.7 1.08c-.12.31-.26.78-.3 1.65C4.18 8.84 4.17 9.17 4.17 12s.01 3.16.06 4.21c.04.87.18 1.34.3 1.65.15.4.34.72.7 1.08.36.36.68.55 1.08.7.31.12.78.26 1.65.3 1.05.05 1.38.06 4.04.06s2.99-.01 4.04-.06c.87-.04 1.34-.18 1.65-.3.4-.15.72-.34 1.08-.7.36-.36.55-.68.7-1.08.12-.31.26-.78.3-1.65.05-1.05.06-1.38.06-4.21s-.01-3.16-.06-4.21c-.04-.87-.18-1.34-.3-1.65a2.9 2.9 0 0 0-.7-1.08 2.9 2.9 0 0 0-1.08-.7c-.31-.12-.78-.26-1.65-.3C14.99 3.81 14.66 3.8 12 3.8zm0 3.05a5.15 5.15 0 1 1 0 10.3 5.15 5.15 0 0 1 0-10.3zm0 1.8a3.35 3.35 0 1 0 0 6.7 3.35 3.35 0 0 0 0-6.7zm5.35-1.99a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z"/>
                </svg>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/>
                </svg>
          </div>
        `;
      } else {
        content = `<div class="footer-inner"><span>© ${companyName}</span></div>`;
      }

      this.components(content);
    },
  },
};
