import { errorJson, json, readJson } from "../_lib/http.js";
import { getOrderById, updateOrderLogistics } from "../_lib/orders.js";

export async function onRequestPost(context) {
  const adminToken = String(context.env.ADMIN_API_TOKEN || "").trim();
  if (!adminToken) {
    return errorJson("ADMIN_API_TOKEN 未配置。", 500);
  }

  const authHeader = String(context.request.headers.get("Authorization") || "");
  if (authHeader !== `Bearer ${adminToken}`) {
    return errorJson("未授权。", 401);
  }

  if (!context.env.DB) {
    return errorJson("订单数据库未绑定。", 500);
  }

  const body = await readJson(context.request);
  if (!body || typeof body !== "object") {
    return errorJson("请求体格式不正确。", 400);
  }

  const orderId = String(body.orderId || "").trim();
  if (!orderId) {
    return errorJson("缺少 orderId。", 400);
  }

  const order = await getOrderById(context.env.DB, orderId);
  if (!order) {
    return errorJson("订单不存在。", 404);
  }

  const updated = await updateOrderLogistics(context.env.DB, orderId, {
    logisticsWaybill: String(body.logisticsWaybill || "").trim(),
    logisticsProvider: String(body.logisticsProvider || "yanwen").trim() || "yanwen",
    logisticsStatus: String(body.logisticsStatus || "").trim(),
    logisticsLastSync: "",
    trackingSnapshotJson: "",
  });

  return json({
    success: true,
    orderId: updated.id,
    logisticsWaybill: updated.logisticsWaybill,
    logisticsProvider: updated.logisticsProvider,
  });
}
