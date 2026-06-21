import { errorJson, json } from "../_lib/http.js";
import { fetchTrackingInfo } from "../_lib/yw56.js";
import { listOrders, serializeOrder, updateOrderLogistics } from "../_lib/orders.js";
import { refreshOrderPaymentStatus } from "../_lib/tron.js";

function isAuthorized(request, token) {
  const authHeader = String(request.headers.get("Authorization") || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const url = new URL(request.url);
  const queryToken = String(url.searchParams.get("token") || "").trim();
  return bearer === token || queryToken === token;
}

export async function onRequestGet(context) {
  const adminToken = String(context.env.ADMIN_API_TOKEN || "").trim();
  if (!adminToken) {
    return errorJson("ADMIN_API_TOKEN is not configured.", 500);
  }

  if (!isAuthorized(context.request, adminToken)) {
    return errorJson("Unauthorized.", 401);
  }

  if (!context.env.DB) {
    return errorJson("D1 binding DB is not configured.", 500);
  }

  const url = new URL(context.request.url);
  const phone = String(url.searchParams.get("phone") || "");
  const paymentStatus = String(url.searchParams.get("paymentStatus") || "");
  const limit = String(url.searchParams.get("limit") || "100");
  const trackAuth = String(context.env.YW_TRACK_AUTH || "").trim();

  try {
    const orders = await listOrders(context.env.DB, { phone, paymentStatus, limit });
    const enriched = await Promise.all(
      orders.map(async (order) => {
        let currentOrder = order;

        try {
          const paymentCheck = await refreshOrderPaymentStatus(context.env, currentOrder);
          if (paymentCheck.order) {
            currentOrder = paymentCheck.order;
          }
        } catch {
          currentOrder = order;
        }

        let tracking = null;
        if (currentOrder.logisticsWaybill && trackAuth) {
          try {
            tracking = await fetchTrackingInfo(currentOrder.logisticsWaybill, trackAuth);
            if (tracking) {
              currentOrder = await updateOrderLogistics(context.env.DB, currentOrder.id, {
                logisticsWaybill: currentOrder.logisticsWaybill,
                logisticsProvider: currentOrder.logisticsProvider || "yanwen",
                logisticsStatus: tracking.latestCheckpoint ? tracking.latestCheckpoint.message : tracking.message,
                logisticsLastSync: new Date().toISOString(),
                trackingSnapshotJson: JSON.stringify(tracking),
              });
            }
          } catch {
            tracking = null;
          }
        }

        return serializeOrder(currentOrder, tracking);
      }),
    );

    return json({
      success: true,
      orders: enriched,
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Failed to load orders.", 500);
  }
}
