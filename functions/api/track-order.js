import { errorJson, json } from "../_lib/http.js";
import { getOrderById, serializeOrder, updateOrderLogistics } from "../_lib/orders.js";
import { fetchTrackingInfo } from "../_lib/yw56.js";

export async function onRequestGet(context) {
  if (!context.env.DB) {
    return errorJson("Order database is not configured. Bind D1 as DB first.", 500);
  }

  const url = new URL(context.request.url);
  const orderId = String(url.searchParams.get("orderId") || "").trim();
  if (!orderId) {
    return errorJson("Missing orderId.", 400);
  }

  const order = await getOrderById(context.env.DB, orderId);
  if (!order) {
    return errorJson("Order not found.", 404);
  }

  if (!order.logisticsWaybill) {
    return json({
      success: true,
      order: serializeOrder(order, {
        available: false,
        message: "No waybill yet.",
        trackingStatus: "EMPTY",
        checkpoints: [],
      }),
    });
  }

  const authCode = String(context.env.YW_TRACK_AUTH || "").trim();
  if (!authCode) {
    return json({
      success: true,
      order: serializeOrder(order, {
        available: false,
        message: "Tracking service is not configured yet.",
        trackingStatus: "NOT_CONFIGURED",
        checkpoints: [],
      }),
    });
  }

  try {
    const tracking = await fetchTrackingInfo(order.logisticsWaybill, authCode);
    if (tracking) {
      await updateOrderLogistics(context.env.DB, order.id, {
        logisticsWaybill: order.logisticsWaybill,
        logisticsProvider: order.logisticsProvider || "yanwen",
        logisticsStatus: tracking.latestCheckpoint ? tracking.latestCheckpoint.message : tracking.message,
        logisticsLastSync: new Date().toISOString(),
        trackingSnapshotJson: JSON.stringify(tracking),
      });
    }

    return json({
      success: true,
      order: serializeOrder(order, tracking),
    });
  } catch (error) {
    return json({
      success: true,
      order: serializeOrder(order, {
        available: false,
        message: "Tracking service is temporarily unavailable.",
        trackingStatus: "ERROR",
        checkpoints: [],
      }),
      warning: error instanceof Error ? error.message : "Tracking request failed.",
    });
  }
}
