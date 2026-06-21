const TRC20_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const TRON_GRID_API_BASE = "https://api.trongrid.io/v1";
const DECIMALS = 6;
const AMOUNT_TOLERANCE = 0.000001;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const orderId = url.searchParams.get("orderId") || "";
  const address = url.searchParams.get("address") || "";
  const amount = url.searchParams.get("amount") || "";
  const currency = (url.searchParams.get("currency") || "USDT").toUpperCase();
  const createdAt = url.searchParams.get("createdAt") || "";
  const apiKey = context.env.TRON_API_KEY || "";

  if (!apiKey) {
    return json({
      configured: false,
      paid: false,
      status: "not_configured",
      message: "TRON_API_KEY 尚未配置。请在 Cloudflare Pages 的 Variables and Secrets 中新增。",
    });
  }

  if (!address || !amount || currency !== "USDT") {
    return json({
      configured: true,
      paid: false,
      status: "invalid_request",
      message: "支付查询参数不完整。",
    }, 400);
  }

  try {
    const minTimestamp = createdAt ? Date.parse(createdAt) : Number.NaN;
    const transfers = await fetchRecentUsdtTransfers(address, apiKey, Number.isFinite(minTimestamp) ? minTimestamp : null);
    const expectedAmount = Number.parseFloat(amount);
    const match = transfers.find((item) => {
      const value = Number.parseFloat(item.amount);
      return Number.isFinite(value) && Math.abs(value - expectedAmount) <= AMOUNT_TOLERANCE;
    });

    if (!match) {
      return json({
        configured: true,
        paid: false,
        status: "pending",
        orderId,
        message: "暂未查询到匹配金额的 USDT 到账记录。",
      });
    }

    return json({
      configured: true,
      paid: true,
      status: "paid",
      orderId,
      txId: match.transactionId,
      amount: match.amount,
      from: match.from,
      to: match.to,
      confirmedAt: match.blockTimestamp,
      message: "支付已确认。",
    });
  } catch (error) {
    return json({
      configured: true,
      paid: false,
      status: "check_failed",
      message: "TronGrid 查询失败，请稍后重试。",
    }, 502);
  }
}

async function fetchRecentUsdtTransfers(address, apiKey, minTimestamp) {
  const query = new URL(`${TRON_GRID_API_BASE}/accounts/${address}/transactions/trc20`);
  query.searchParams.set("only_to", "true");
  query.searchParams.set("limit", "20");
  query.searchParams.set("contract_address", TRC20_USDT_CONTRACT);
  query.searchParams.set("order_by", "block_timestamp,desc");
  if (minTimestamp) {
    query.searchParams.set("min_timestamp", String(minTimestamp));
  }

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
    transactionId: item.transaction_id || "",
    from: item.from || "",
    to: item.to || "",
    amount: normalizeUsdtAmount(item.value),
    blockTimestamp: item.block_timestamp || 0,
  }));
}

function normalizeUsdtAmount(rawValue) {
  const numeric = Number.parseFloat(String(rawValue || "0"));
  if (!Number.isFinite(numeric)) {
    return "0.000000";
  }

  return (numeric / 10 ** DECIMALS).toFixed(6);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
