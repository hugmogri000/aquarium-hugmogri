import { PAYMENT_CONFIG } from "./config.js";
import { getOrderById, updateOrderPayment } from "./orders.js";

const TRC20_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_GRID_API_BASE = "https://api.trongrid.io/v1";
const DECIMALS = 6;

export async function refreshOrderPaymentStatus(env, order) {
  if (!order) {
    return { order: null, status: "not_found", paid: false };
  }

  if (order.paymentStatus === "paid") {
    return { order, status: "paid", paid: true };
  }

  const apiKey = String(env.TRON_API_KEY || "");
  if (!apiKey) {
    return {
      order: { ...order, paymentStatus: "not_configured" },
      status: "not_configured",
      paid: false,
      configured: false,
    };
  }

  const minTimestamp = Math.max(0, order.createdAtMs - 60_000);
  const transfers = await fetchRecentUsdtTransfers(order.receivingAddress || PAYMENT_CONFIG.receivingAddress, apiKey, minTimestamp);
  const expectedAmount = normalizeDisplayUsdtAmount(order.payableAmountUsdt);
  const match = transfers.find((item) => item.amount === expectedAmount);

  if (!match) {
    return {
      order,
      status: "pending",
      paid: false,
      configured: true,
    };
  }

  const updatedOrder = env.DB
    ? await updateOrderPayment(env.DB, order.id, {
        txId: match.transactionId,
        from: match.from,
        confirmedAt: timestampToIso(match.blockTimestamp),
      })
    : {
        ...order,
        paymentStatus: "paid",
        paymentTxId: match.transactionId,
        paymentFromAddress: match.from,
        paymentConfirmedAt: timestampToIso(match.blockTimestamp),
      };

  return {
    order: updatedOrder,
    status: "paid",
    paid: true,
    configured: true,
    txId: match.transactionId,
  };
}

export async function checkOrderPaymentById(env, orderId) {
  if (!env.DB) {
    return { order: null, status: "db_not_configured", paid: false };
  }
  const order = await getOrderById(env.DB, orderId);
  return refreshOrderPaymentStatus(env, order);
}

async function fetchRecentUsdtTransfers(address, apiKey, minTimestamp) {
  const query = new URL(`${TRON_GRID_API_BASE}/accounts/${address}/transactions/trc20`);
  query.searchParams.set("only_to", "true");
  query.searchParams.set("limit", "30");
  query.searchParams.set("contract_address", TRC20_USDT_CONTRACT);
  query.searchParams.set("order_by", "block_timestamp,desc");
  query.searchParams.set("min_timestamp", String(minTimestamp));

  const response = await fetch(query.toString(), {
    headers: {
      Accept: "application/json",
      "TRON-PRO-API-KEY": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`TronGrid status ${response.status}`);
  }

  const payload = await response.json();
  const rows = Array.isArray(payload.data) ? payload.data : [];

  return rows.map((item) => ({
    transactionId: String(item.transaction_id || ""),
    from: String(item.from || ""),
    to: String(item.to || ""),
    amount: normalizeUsdtAmount(item.value),
    blockTimestamp: Number(item.block_timestamp || 0),
  }));
}

function normalizeUsdtAmount(rawValue) {
  const numeric = Number.parseFloat(String(rawValue || "0"));
  if (!Number.isFinite(numeric)) {
    return "0.000000";
  }
  return (numeric / 10 ** DECIMALS).toFixed(6);
}

function normalizeDisplayUsdtAmount(rawValue) {
  const numeric = Number.parseFloat(String(rawValue || "0"));
  if (!Number.isFinite(numeric)) {
    return "0.000000";
  }
  return numeric.toFixed(6);
}

function timestampToIso(timestamp) {
  const numeric = Number(timestamp || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  return new Date(numeric).toISOString();
}
