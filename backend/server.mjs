import express from "express";
import cors from "cors";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { renderPage } from "./services/page-renderer.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

async function getStoreData(storeId) {
  const path = join(__dirname, "data", `${storeId}.json`);
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw);
}

function isValidStoreId(id) {
  const STORE_ID_RE = /^[a-z0-9-]+$/
  return STORE_ID_RE.test(id)
}

// Returns component manifest for this store
app.get("/api/manifest/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)){
    return res.status(400).json({ error: "Invalid storeID"})
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
  if (!isValidStoreId(req.params.storeId)){
    return res.status(400).json({ error: "Invalid storeID"})
  }
  try {
    const data = await getStoreData(req.params.storeId);
    res.json(data.content);
  } catch {
    res.status(404).json({ error: "Store not found" });
  }
});

// Returns previously saved editor state
app.get("/api/load/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)){
    return res.status(400).json({ error: "Invalid storeID"})
  }
  try {
    const path = join(__dirname, "data", `${req.params.storeId}.save.json`);
    const raw = await readFile(path, "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: "No saved state" });
  }
});

// Saves the editor state (component tree + css)
app.post("/api/save/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)){
    return res.status(400).json({ error: "Invalid storeID"})
  }
  try {
    const { components, html, css } = req.body;
    if(!Array.isArray(components) || typeof html !== "string" || typeof css !== "string"){
      return res.status(400).json({ error: "Bad body payload"})
    }
    const path = join(__dirname, "data", `${req.params.storeId}.save.json`);
    await writeFile(path, JSON.stringify({ components, html, css }, null, 2));
    console.log(`Saved state for ${req.params.storeId}`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to save" });
  }
});

app.post("/api/render/:storeId", async (req, res) => {
  if (!isValidStoreId(req.params.storeId)) {
    return res.status(400).json({ error: "Bad storeId" })
  }
  try {
    const { components, css } = req.body;
    if(!Array.isArray(components)){
      return res.status(400).json({ error: "Bad body payload" })
    }
    const html = await renderPage(req.params.storeId, { components, css })
    return res.json({ html })
  } catch (err) {
    res.status(404).json({ error: "Cant render page" })
    console.error(err)
  }
})

app.listen(3001, () => {
  console.log("Store API running on http://localhost:3001");
});
