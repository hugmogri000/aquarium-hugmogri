import { errorJson, json } from "../_lib/http.js";
import { serializeOrder } from "../_lib/orders.js";
import { fetchTrackingInfo } from "../_lib/yw56.js";
import { checkOrderPaymentById } from "../_lib/tron.js";

export async function onRequestGet(context) {
  if (!context.env.DB) {
    return errorJson("订单数据库尚未绑定。请先在 Cloudflare Pages 绑定 D1 数据库。", 500);
  }

  const url = new URL(context.request.url);
  const orderId = String(url.searchParams.get("orderId") || "").trim();
  if (!orderId) {
    return errorJson("缺少 orderId。", 400);
  }

  try {
    const payment = await checkOrderPaymentById(context.env, orderId);
    if (!payment.order) {
      return errorJson("订单不存在。", 404, {
        configured: Boolean(context.env.TRON_API_KEY),
        paid: false,
        status: "not_found",
      });
    }

    let tracking = null;
    const authCode = String(context.env.YW_TRACK_AUTH || "");
    if (payment.order.logisticsWaybill && authCode) {
      try {
        tracking = await fetchTrackingInfo(payment.order.logisticsWaybill, authCode);
      } catch {
        tracking = null;
      }
    }

    return json({
      success: true,
      configured: Boolean(context.env.TRON_API_KEY),
      paid: payment.paid,
      status: payment.status,
      txId: payment.txId || payment.order.paymentTxId,
      order: serializeOrder(payment.order, tracking),
      message: buildMessage(payment.status),
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "支付查询失败。", 502, {
      configured: Boolean(context.env.TRON_API_KEY),
      paid: false,
      status: "check_failed",
    });
  }
}

function buildMessage(status) {
  switch (status) {
    case "paid":
      return "支付已确认。";
    case "not_configured":
      return "TRON_API_KEY 尚未配置。";
    case "pending":
      return "暂未查询到该订单对应的到账记录。";
    default:
      return "支付状态查询完成。";
  }
}
