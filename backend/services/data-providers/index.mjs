import { getProducts } from "./products.mjs";

/**
 * Registry mapping a `dataSource` key (used in `content[type].dataSource`,
 * e.g. `"products"`) to the function that fetches live data for it.
 *
 * Looked up by `content-resolver.mjs`'s `resolveContent()`. To add a new
 * dynamic data type: write a new provider file + add one entry here —
 * nothing else needs to change.
 *
 * @type {Record<string, (storeId: string, params?: object) => Promise<object[]>>}
 */
export const DATA_PROVIDERS = {
  products: getProducts,
};
