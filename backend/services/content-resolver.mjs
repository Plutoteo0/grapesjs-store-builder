import { DATA_PROVIDERS } from "./data-providers/index.mjs";

export async function resolveContent(storeId, content) {
  const resolved = {};

  for (const [type, raw] of Object.entries(content)) {
    if (raw && typeof raw === "object" && raw.dataSource) {
      const provider = DATA_PROVIDERS[raw.dataSource];
      if (!provider) {
        console.warn(`No data provider found for ${raw.dataSource}`);
        resolved[type] = raw;
        continue;
      }
      const items = await provider(storeId, raw.params);
      resolved[type] = { ...raw, items };
    } else {
      resolved[type] = raw;
    }
  }
  return resolved;
}
