import express from "express";
import cors from "cors";
import { readFile, writeFile, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { renderPage, getManifest } from "./services/page-renderer.mjs";
import { readdir } from "fs/promises";
import { getContent } from "./services/page-renderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "frontend", "public");
const app = express();

const ALLOWED_ORIGINS = ["http://localhost:5173"];
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(
  express.json({
    limit: "1mb",
  }),
);

async function getStoreData(storeId) {
  const path = join(__dirname, "data", `${storeId}.json`);
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

function isValidStoreId(id) {
  const STORE_ID_RE = /^[a-z0-9-]+$/;
  return STORE_ID_RE.test(id);
}

function isValidPageSlug(slug) {
  const STORE_ID_RE = /^[a-z0-9-]+$/;
  return STORE_ID_RE.test(slug);
}

// Returns component manifest for this store
app.get("/api/manifest/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Invalid storeID" });
  }
  try {
    const data = await getStoreData(req.params.storeId);
    res.json(data.manifest);
  } catch {
    res.status(404).json({ error: "Store not found" });
  }
});

// Returns content (real data) for each component
app.get("/api/content/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Invalid storeID" });
  }
  try {
    res.json(await getContent(req.params.storeId));
  } catch {
    res.status(404).json({ error: "Store not found" });
  }
});

// Returns previously saved editor state
app.get("/api/load/:storeId/:pageSlug", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Invalid storeID" });
  }
  if (!isValidPageSlug(req.params.pageSlug)) {
    return res.status(400).json({ error: "Invalid PageSlug" });
  }
  try {
    const path = join(
      __dirname,
      "data",
      `${req.params.storeId}.${req.params.pageSlug}.save.json`,
    );
    const raw = await readFile(path, "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: "No saved state" });
  }
});

// Saves the editor state (component tree + css)
app.post("/api/save/:storeId/:pageSlug", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Invalid storeID" });
  }
  if (!isValidPageSlug(req.params.pageSlug)) {
    return res.status(400).json({ error: "Invalid PageSlug" });
  }
  try {
    const { components, html, css } = req.body;
    if (
      !Array.isArray(components) ||
      typeof html !== "string" ||
      typeof css !== "string"
    ) {
      return res.status(400).json({ error: "Bad body payload" });
    }
    const path = join(
      __dirname,
      "data",
      `${req.params.storeId}.${req.params.pageSlug}.save.json`,
    );
    await writeFile(path, JSON.stringify({ components, html, css }, null, 2));
    console.log(`Saved state for ${req.params.storeId}`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save" });
  }
});

app.post("/api/render/:storeId/:pageSlug", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Bad storeId" });
  }
  if (!isValidPageSlug(req.params.pageSlug)) {
    return res.status(400).json({ error: "Invalid PageSlug" });
  }
  try {
    const { components, css } = req.body;
    if (!Array.isArray(components)) {
      return res.status(400).json({ error: "Bad body payload" });
    }
    const html = await renderPage(req.params.storeId, req.params.pageSlug, {
      components,
      css,
    });
    return res.json({ html });
  } catch (err) {
    res.status(404).json({ error: "Cant render page" });
    console.error(err);
  }
});

app.get("/store/:storeId/:pageSlug", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Bad storeId" });
  }
  if (!isValidPageSlug(req.params.pageSlug)) {
    return res.status(400).json({ error: "Invalid PageSlug" });
  }
  const html = await renderPage(req.params.storeId, req.params.pageSlug);
  res.set("Content-Type", "text/html").send(html);
});

app.post("/api/pages/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Bad storeId" });
  }
  const pageSlug = req.body.slug;
  if (typeof pageSlug !== "string" || !isValidPageSlug(pageSlug)) {
    return res.status(400).json({ error: "Invalid PageSlug" });
  }
  const path = join(
    __dirname,
    "data",
    `${req.params.storeId}.${pageSlug}.save.json`,
  );
  try {
    await access(path);
    return res.status(409).json({ error: "Page already exists" });
  } catch {}
  try {
    await writeFile(
      path,
      JSON.stringify({ components: [], html: "", css: "" }),
    );
    return res.status(201).json({ ok: true, slug: pageSlug });
  } catch (err) {
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/api/pages/:storeId", async (req, res) => {
  const storeId = req.params.storeId;
  if (!isValidStoreId(storeId)) {
    return res.status(400).json({ error: "Bad storeId" });
  }
  const FILE_REG = new RegExp(`^${storeId}\.(.+)\.save\.json$`);
  const allFiles = await readdir(join(__dirname, "data"));
  if (allFiles.length === 0) {
    return res.json({ slugs: [] });
  }
  const foundSlugs = allFiles.map((file) => {
    const result = FILE_REG.exec(file);
    return result ? result[1] : null;
  });
  const slugs = foundSlugs.filter((s) => s !== null);
  return res.status(200).json({ slugs: slugs });
});

app.get("/styles/:storeId/*", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).end();
  }
  try {
    const manifest = await getManifest(req.params.storeId);
    const allowed = new Set(manifest.map((m) => m.cssUrl).filter(Boolean));
    if (!allowed.has(req.path)) {
      return res.status(404).end();
    }
    res.sendFile(join(publicDir, req.path));
  } catch (err) {
    res.status(404).json({ error: "Error occurred" });
  }
});

app.get("/components/*", (req, res) => {
  res.sendFile(join(publicDir, req.path));
});

app.get("/components.css", (req, res) => {
  res.sendFile(join(publicDir, "components.css"));
});

app.listen(3001, () => {
  console.log("Store API running on http://localhost:3001");
});
