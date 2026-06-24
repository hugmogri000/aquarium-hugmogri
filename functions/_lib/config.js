export const PAYMENT_CONFIG = {
  productName: "Eco Bucket Aquarium",
  network: "TRON / TRC20-USDT",
  paymentCurrency: "USDT",
  productPriceUsd: 68,
  paymentMatchWindowHours: 48,
  shippingUsd: {
    usa: 150,
    australia: 100,
  },
  uniquePayableUsdt: {
    production: {
      usa: { min: 216.0, max: 217.9, step: 0.1 },
      australia: { min: 166.0, max: 167.9, step: 0.1 },
    },
    test: {
      usa: { min: 1.0, max: 2.9, step: 0.1 },
      australia: { min: 3.0, max: 4.9, step: 0.1 },
    },
  },
  receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
};

export const COPY = {
  bucketColor: {
    white: "White",
    lightBlue: "Light Blue",
  },
  standColor: {
    white: "White",
    black: "Black",
  },
  country: {
    usa: "United States",
    australia: "Australia",
  },
};

export const ORDER_LOOKUP_LIMIT = 10;
export const YANWEN_TRACKING_API = "http://api.track.yw56.com.cn/api/tracking";

export function getPaymentMode(env = {}) {
  const raw = String(env.PAYMENT_MODE || "").trim().toLowerCase();
  return raw === "test" ? "test" : "production";
}

export function getPayableAmountConfig(country, env = {}) {
  const mode = getPaymentMode(env);
  return PAYMENT_CONFIG.uniquePayableUsdt[mode][country] || null;
}
