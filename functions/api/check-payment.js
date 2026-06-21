import { errorJson, json } from "../_lib/http.js";
import { serializeOrder } from "../_lib/orders.js";
import { fetchTrackingInfo } from "../_lib/yw56.js";
import { checkOrderPaymentById } from "../_lib/tron.js";

export async function onRequestGet(context) {
  if (!context.env.DB) {
    return errorJson("Order database is not configured. Bind D1 as DB first.", 500);
  }

  const url = new URL(context.request.url);
  const orderId = String(url.searchParams.get("orderId") || "").trim();
  if (!orderId) {
    return errorJson("Missing orderId.", 400);
  }

  try {
    const payment = await checkOrderPaymentById(context.env, orderId);
    if (!payment.order) {
      return errorJson("Order not found.", 404, {
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
    return errorJson(error instanceof Error ? error.message : "Payment status check failed.", 502, {
      configured: Boolean(context.env.TRON_API_KEY),
      paid: false,
      status: "check_failed",
    });
  }
}

function buildMessage(status) {
  switch (status) {
    case "paid":
      return "Payment confirmed.";
    case "not_configured":
      return "TRON_API_KEY is not configured.";
    case "pending":
      return "No matching payment has been found yet.";
    default:
      return "Payment status checked.";
  }
}
