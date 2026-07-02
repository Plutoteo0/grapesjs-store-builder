import acmeConfig from "./configs/acme.json";
import betaConfig from "./configs/beta.json";

const configs = {
  acme: acmeConfig,
  beta: betaConfig,
};

export function getStoreConfig(storeId) {
  return configs[storeId] || configs.acme;
}
