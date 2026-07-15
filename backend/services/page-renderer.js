import ejs from "ejs";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url))

async function getData(storeID) {
    const path = join(__dirname, "..", "data", `${storeID}.save.json`)
    const raw = await readFile(path, "utf-8")

    const data = JSON.parse(raw)
    return data
}

async function getContent(storeID) {
    const path = join(__dirname, "..", "data", `${storeID}.json`); 
    const rawContent = await readFile(path, "utf-8");
    const data = JSON.parse(rawContent);

    return data.content;
}

const WRAPPERS = {
    header: { tag: "header", classPrefix: "header"},
    footer: { tag: "footer", classPrefix: "footer" },
    hero: { tag: "section", classPrefix: "hero" },
    testimonial: { tag: "div", classPrefix: "testimonial", baseClass: "testimonial" },
    newsletter: { tag: "div", classPrefix: "newsletter", baseClass: "newsletter-inner" },
    "pricing-card": { tag: "div", baseClass: "pricing-card"},
    "pricing-cards": { tag: "div", baseClass: "pricing-cards pricing-grid-3" },
}

function adapter(str) {
    return str.replace(/\{\{\s*(\w+)\s*\}\}/g, "<%- $1 %>")
}

function wrapWithTag(wrapper, node, innerHtml) {
    const classes = node.classes || []
    let theme = ""

    if (wrapper.classPrefix) {
        theme = classes
        .find(c => c.startsWith(`${wrapper.classPrefix}-`) && c !== wrapper.baseClass)
        ?.replace(`${wrapper.classPrefix}-`,"") || "light"
    }

    const classAttr = [
        wrapper.baseClass,
        wrapper.classPrefix ? `${wrapper.classPrefix}-${theme}` : null
    ].filter(Boolean).join(" ")

    return `<${wrapper.tag} class="${classAttr}">${innerHtml}</${wrapper.tag}>`
}

async function renderComponent(node, content) {
    const rawContent = content[node.type]
    const wrapper = WRAPPERS[node.type];

    const isContainer = rawContent && typeof rawContent === "object" && !rawContent.template

    if (isContainer) {
        const childrenHtml = (await Promise.all(
            node.components.map(child => renderComponent(child, content))
        )).join("");
        return wrapWithTag(wrapper, node, childrenHtml)
    }

    let template, data ;
    if (typeof rawContent === "string"){
        template = rawContent;
        data = node;
    } else {
        template = adapter(rawContent.template)
        const { template: rawFieldTemplate, ...defaultsFromContent } = content[node.type]
        data = { ...defaultsFromContent, ...node}   
    }

    const innerHtml = await ejs.render(template, data);
    return wrapWithTag(wrapper, node, innerHtml)
}

async function renderPage(storeID) {
    const content = await getContent(storeID);
    const data = await getData(storeID)

    const html = (await Promise.all(
        data.components.map(node => renderComponent(node, content))
    )).join("\n")

    return html
}

console.log(await renderPage("acme"))