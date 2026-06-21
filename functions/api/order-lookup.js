import { fetchTrackingInfo } from "../_lib/yw56.js";
import { errorJson, json } from "../_lib/http.js";
import { lookupOrders, serializeOrder, updateOrderLogistics } from "../_lib/orders.js";
import { refreshOrderPaymentStatus } from "../_lib/tron.js";

export async function onRequestGet(context) {
  if (!context.env.DB) {
    return errorJson("订单数据库尚未绑定。请先在 Cloudflare Pages 绑定 D1 数据库。", 500);
  }

  const url = new URL(context.request.url);
  const email = url.searchParams.get("email") || "";
  const phone = url.searchParams.get("phone") || "";

  if (!email && !phone) {
    return errorJson("请至少填写邮箱或手机号。", 400);
  }

  try {
    const orders = await lookupOrders(context.env.DB, { email, phone });
    const authCode = String(context.env.YW_TRACK_AUTH || "");
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
        if (currentOrder.logisticsWaybill) {
          try {
            tracking = await fetchTrackingInfo(currentOrder.logisticsWaybill, authCode);
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
            tracking = readCachedTracking(currentOrder.trackingSnapshotJson);
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
    return errorJson(error instanceof Error ? error.message : "查询订单失败。", 500);
  }
}

function readCachedTracking(rawValue) {
  if (!rawValue) {
    return null;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}
