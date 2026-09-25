import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getData,
  getContent,
  DEFAULT_WRAPPERS,
  wrapWithTag,
  adapter,
  buildCssLinks,
} from "./page-renderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function collectUsedData(node, content, out) {
  const rawContent = content[node.type];
  if (!rawContent || typeof rawContent !== "object") return;

  if (rawContent.dataSource) {
    out[node.type] = { ...rawContent, items: undefined };
  } else if (rawContent.template) {
    out[node.componentID] = { ...rawContent, ...node };
  }

  (node.components ?? []).forEach((child) =>
    collectUsedData(child, content, out),
  );
}

async function generatorComponentsEjs(node, content, depth = 0) {
  const rawContent = content[node.type];
  if (content[node.type] === undefined) {
    console.warn("Content is undefined");
    return "";
  }
  const wrapper = rawContent?.wrapper ?? DEFAULT_WRAPPERS[node.type];

  const isDynamicContainer =
    rawContent && typeof rawContent === "object" && rawContent.dataSource;
  const isContainer =
    rawContent && typeof rawContent === "object" && !rawContent.template;

  if (isDynamicContainer) {
    const childType = rawContent.childType;
    const childContent = content[childType];
    const childWrapper = childContent?.wrapper ?? DEFAULT_WRAPPERS[childType];

    const childTemplate = adapter(
      childContent.template,
      childContent.richTextFields ?? [],
      "item",
    );
    const childHtml = wrapWithTag(childWrapper, { classes: [] }, childTemplate);

    const loopEjs = `<% (pageData.content['${node.type}'].items || []).forEach(function(item) { %>${childHtml}<% }); %>`;

    return wrapWithTag(wrapper, node, loopEjs);
  }

  if (isContainer) {
    if (depth > 20) {
      throw new Error("Too deep three");
    }
    const childrenHtml = (
      await Promise.all(
        (node.components ?? []).map((child) => {
          return generatorComponentsEjs(child, content, depth + 1);
        }),
      )
    ).join("\n");
    return wrapWithTag(wrapper, node, childrenHtml);
  }

  const leaf =
    typeof rawContent === "string"
      ? rawContent
      : adapter(
          rawContent.template,
          rawContent.richTextFields ?? [],
          `pageData.content['${node.componentID}']`,
        );
  return wrapWithTag(wrapper, node, leaf);
}

export async function generateEjs(storeID, pageSlug) {
  const content = await getContent(storeID);
  const data = await getData(storeID, pageSlug);

  const usedContent = {};
  data.components.forEach((child) =>
    collectUsedData(child, content, usedContent),
  );

  const dataPath = join(
    __dirname,
    "..",
    "data",
    `${storeID}.${pageSlug}.page-data.json`,
  );
  await writeFile(dataPath, JSON.stringify({ content: usedContent }, null, 2));

  const links = (await buildCssLinks(storeID, data)).join("\n");

  const bodyEjs = (
    await Promise.all(
      data.components.map((n) => generatorComponentsEjs(n, content)),
    )
  ).join("\n");

  const fileContent = `<!DOCTYPE html>
    <html>
    <head>
    ${links}
    <style>${data.css}</style>
    </head>
    <body>
    ${bodyEjs}
    </body>
    </html>`;

  await writeFile(
    join(__dirname, "..", "data", `${storeID}.${pageSlug}.ejs`),
    fileContent,
  );
}
