import { errorJson, json, readJson } from "../_lib/http.js";
import { createOrder, serializeOrder, validateOrderPayload } from "../_lib/orders.js";

export async function onRequestPost(context) {
  if (!context.env.DB) {
    return errorJson("订单数据库尚未绑定。请先在 Cloudflare Pages 绑定 D1 数据库。", 500);
  }

  const body = await readJson(context.request);
  const validation = validateOrderPayload(body);
  if (!validation.ok) {
    return errorJson(validation.message, 400);
  }

  try {
    const order = await createOrder(context.env.DB, validation.value);
    return json({
      success: true,
      order: serializeOrder(order),
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "创建订单失败。", 500);
  }
}
