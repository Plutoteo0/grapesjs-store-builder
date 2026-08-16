const MOCK_PRODUCTS = {
  acme: [
    {
      title: "Starter",
      price: "$19/mo",
      desc: "Perfect for individuals just getting started.",
      image: "https://picsum.photos/seed/starter/280/160",
      buttonText: "Choose Plan",
    },
    {
      title: "Pro",
      price: "$49/mo",
      desc: "For growing teams that need more power.",
      image: "https://picsum.photos/seed/pro/280/160",
      buttonText: "Choose Plan",
    },
    {
      title: "Enterprise",
      price: "$99/mo",
      desc: "Advanced features for large organizations.",
      image: "https://picsum.photos/seed/enterprise/280/160",
      buttonText: "Choose Plan",
    },
    {
      title: "Ultimate",
      price: "$199/mo",
      desc: "Everything, unlimited, with priority support.",
      image: "https://picsum.photos/seed/ultimate/280/160",
      buttonText: "Choose Plan",
    },
  ],
};

export async function getProducts(storeId, params) {
  return MOCK_PRODUCTS[storeId] ?? [];
}
