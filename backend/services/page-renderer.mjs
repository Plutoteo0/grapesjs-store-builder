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

async function getManifest(storeID) {
    const path = join(__dirname, "..", "data", `${storeID}.json`); 
    const rawContent = await readFile(path, "utf-8");
    const data = JSON.parse(rawContent);

    return data.manifest 
}

function collectUsedTypes(node) {
    const collected = new Set()

    collected.add(node.type)
    if (node.components){
        node.components.forEach(child => {
            const collectedChilds = collectUsedTypes(child);
            collectedChilds.forEach(c => collected.add(c))
        });
    }
    return collected
}

function getAllTypes(nodes) {
    const allTypes = new Set();

    nodes.forEach((c) => {
        const collectedTypes = collectUsedTypes(c);
        collectedTypes.forEach(t => allTypes.add(t));
    })

    return allTypes
}

async function buildCssLinks(storeID, data) {
    const cssUrls = new Array()

    const manifest = await getManifest(storeID);
    const types = getAllTypes(data.components);

    types.forEach((t) => {
        const foundUrl = manifest.find(m => m.name === t)
        if (foundUrl?.cssUrl){
            cssUrls.push(foundUrl.cssUrl)
        }
    })

    const linkUrls = cssUrls.map((cssUrl) => {
        return `<link rel="stylesheet" href="${cssUrl}">`
    })
    linkUrls.push(`<link rel="stylesheet" href="/components.css">`)
    return linkUrls
}

const DEFAULT_WRAPPERS = {
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
    const wrapper = rawContent?.wrapper ?? DEFAULT_WRAPPERS[node.type];
    if (!rawContent?.wrapper){
        console.warn(`No wrapper in config for ${node.type} using DEFAULT_WRAPPERS`)
    }

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

export async function renderPage(storeID, payload) {
    const content = await getContent(storeID);
    const data = payload ?? await getData(storeID)
    const links = (await buildCssLinks(storeID, data)).join("\n")
    const styleTag = `<style>${data.css}</style>`

    const html = (await Promise.all(
        data.components.map(node => renderComponent(node, content))
    )).join("\n")

    const htmlDoctype = `
    <!DOCTYPE html>
    <html>
    <head>
    ${links}
    ${styleTag}
    </head>
    <body>
    ${html}
    </body>
    </html>`

    return htmlDoctype
}
