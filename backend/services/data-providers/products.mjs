import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Fetches products for a store. Currently a mock — reads from `MOCK_PRODUCTS`
 * — but has the same async signature a real DB query will have later, so
 * callers (`resolveContent`) don't need to change when this becomes real.
 *
 * @param {string} storeId
 * @param {object} [params] - reserved for future filters (category, price
 *   range, etc.) — not used yet
 * @returns {Promise<object[]>} array of product objects, or `[]` if the store
 *   has no data
 */
export async function getProducts(storeId, params) {
  const raw = await readFile(
    join(__dirname, "..", "..", "data", "products.json"),
    "utf-8",
  );
  const allProducts = JSON.parse(raw);
  return allProducts[storeId] ?? [];
}
