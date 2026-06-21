import { errorJson, json, readJson } from "../_lib/http.js";
import { createOrder, serializeOrder, validateOrderPayload } from "../_lib/orders.js";

export async function onRequestPost(context) {
  if (!context.env.DB) {
    return errorJson("Order database is not configured. Bind D1 as DB first.", 500);
  }

  const body = await readJson(context.request);
  const validation = validateOrderPayload(body);
  if (!validation.ok) {
    return errorJson(validation.message, 400);
  }

  try {
    const order = await createOrder(context.env.DB, validation.value, context.env);
    return json({
      success: true,
      order: serializeOrder(order),
    });
  } catch (error) {
    return errorJson(error instanceof Error ? error.message : "Failed to create order.", 500);
  }
}
