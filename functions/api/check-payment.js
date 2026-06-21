export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const orderId = url.searchParams.get("orderId") || "";
  const address = url.searchParams.get("address") || "";
  const amount = url.searchParams.get("amount") || "";
  const currency = url.searchParams.get("currency") || "USDT";

  const tronApiUrl = context.env.TRON_PAYMENT_API_URL || "";
  const apiKey = context.env.TRON_PAYMENT_API_KEY || "";

  if (!tronApiUrl) {
    return json({
      configured: false,
      paid: false,
      status: "not_configured",
      message: "支付状态查询接口尚未配置。请在 Cloudflare Pages 环境变量中配置 TRON_PAYMENT_API_URL。",
    });
  }

  try {
    const tronUrl = new URL(tronApiUrl);
    tronUrl.searchParams.set("orderId", orderId);
    tronUrl.searchParams.set("address", address);
    tronUrl.searchParams.set("amount", amount);
    tronUrl.searchParams.set("currency", currency);

    const response = await fetch(tronUrl.toString(), {
      headers: apiKey
        ? {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          }
        : {
            Accept: "application/json",
          },
    });

    if (!response.ok) {
      return json({
        paid: false,
        status: "api_error",
        message: "支付查询接口暂时不可用，请稍后重试。",
      }, 502);
    }

    const data = await response.json();
    return json(normalizePaymentResponse(data));
  } catch (error) {
    return json({
      paid: false,
      status: "check_failed",
      message: "支付状态查询失败，请稍后重试。",
    }, 500);
  }
}

function normalizePaymentResponse(data) {
  const paid = data.paid === true || data.status === "paid" || data.status === "success";

  return {
    paid,
    status: paid ? "paid" : data.status || "pending",
    txId: data.txId || data.transactionId || data.hash || "",
    message: paid ? "支付已确认。" : data.message || "暂未查询到到账记录，请稍后再试。",
  };
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
