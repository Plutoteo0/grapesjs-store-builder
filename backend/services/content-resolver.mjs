import { DATA_PROVIDERS } from "./data-providers/index.mjs";

/**
 * Resolves dynamic content entries by fetching live data before any rendering
 * happens — not a render step itself, but a preparation step that feeds
 * `renderComponent`'s existing `isDynamicContainer` branch.
 *
 * For each entry in `content`, if it declares a `dataSource` (e.g.
 * `pricing-cards` → `"products"`), looks up the matching provider in
 * `DATA_PROVIDERS`, calls it, and attaches the result as `items` on a new
 * object — the original `content` argument is never mutated, so any other
 * code still holding a reference to it is unaffected. An unknown
 * `dataSource` logs a warning and leaves that entry unchanged, rather than
 * throwing.
 *
 * @param {string} storeId - passed straight through to the matched provider
 * @param {object} content - raw content map (`data.content` from a store's config file)
 * @returns {Promise<object>} a new content map — same shape as `content`, but
 *   entries with a valid `dataSource` gain a live `items` array
 */
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
