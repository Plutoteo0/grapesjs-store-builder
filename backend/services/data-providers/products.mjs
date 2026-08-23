const MOCK_PRODUCTS = {
  acme: [
    {
      id: 1,
      title: "Starter",
      price: "$19/mo",
      desc: "Perfect for individuals just getting started.",
      image: "https://picsum.photos/seed/starter/280/160",
      buttonText: "Choose Plan",
    },
    {
      id: 2,
      title: "Pro",
      price: "$49/mo",
      desc: "For growing teams that need more power.",
      image: "https://picsum.photos/seed/pro/280/160",
      buttonText: "Choose Plan",
    },
    {
      id: 3,
      title: "Enterprise",
      price: "$99/mo",
      desc: "Advanced features for large organizations.",
      image: "https://picsum.photos/seed/enterprise/280/160",
      buttonText: "Choose Plan",
    },
    {
      id: 4,
      title: "Ultimate",
      price: "$199/mo",
      desc: "Everything, unlimited, with priority support.",
      image: "https://picsum.photos/seed/ultimate/280/160",
      buttonText: "Choose Plan",
    },
    {
      id: 5,
      title: "Unlimited",
      price: "$500/mo",
      desc: "Everything, unlimited, with priority support.",
      image: "https://picsum.photos/seed/ultimate/280/160",
      buttonText: "Choose Plan",
    },
    {
      id: 6,
      title: "Beast pack",
      price: "$1000/mo",
      desc: "Everything, unlimited, with priority support.",
      image: "https://picsum.photos/seed/ultimate/280/160",
      buttonText: "Choose Plan",
    },
  ],
};

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
  return MOCK_PRODUCTS[storeId] ?? [];
}
