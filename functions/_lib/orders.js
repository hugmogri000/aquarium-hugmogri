import { COPY, ORDER_LOOKUP_LIMIT, PAYMENT_CONFIG, getPayableAmountConfig } from "./config.js";

const ORDER_WINDOW_MS = PAYMENT_CONFIG.paymentMatchWindowHours * 60 * 60 * 1000;

export function validateOrderPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Invalid order payload." };
  }

  const bucketColor = String(payload.bucketColor || "");
  const standColor = String(payload.standColor || "");
  const country = String(payload.country || "");

  const customer = {
    customerName: normalizeText(payload.customerName),
    postalCode: normalizeText(payload.postalCode),
    email: normalizeText(payload.email),
    phone: normalizeText(payload.phone),
    state: normalizeText(payload.state),
    city: normalizeText(payload.city),
    streetAddress: normalizeText(payload.streetAddress),
    unitNumber: normalizeText(payload.unitNumber),
  };

  const issues = [];
  if (!COPY.bucketColor[bucketColor]) issues.push("bucket color");
  if (!COPY.standColor[standColor]) issues.push("stand color");
  if (!COPY.country[country]) issues.push("country");

  for (const [key, label] of [
    ["customerName", "name"],
    ["postalCode", "postal code"],
    ["email", "email"],
    ["phone", "phone"],
    ["state", "state / province"],
    ["city", "city"],
    ["streetAddress", "street address"],
    ["unitNumber", "unit number"],
  ]) {
    if (!customer[key]) {
      issues.push(label);
    }
  }

  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    issues.push("valid email");
  }

  if (issues.length) {
    return {
      ok: false,
      message: `Please complete: ${issues.join(", ")}`,
    };
  }

  return {
    ok: true,
    value: {
      bucketColor,
      standColor,
      country,
      customer,
    },
  };
}

export async function createOrder(db, payload, env = {}) {
  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs).toISOString();
  const updatedAt = createdAt;
  const orderId = createOrderId(createdAtMs);
  const baseAmountUsd = calculateBaseAmount(payload.country);
  const allocation = await allocateUniqueAmount(db, payload.country, baseAmountUsd, createdAtMs, env);
  const selectionText = buildSelectionText(payload);
  const countryText = COPY.country[payload.country];
  const shippingText = buildShippingText(payload.customer);
  const lookupEmail = normalizeEmail(payload.customer.email);
  const lookupPhone = normalizePhone(payload.customer.phone);

  const order = {
    id: orderId,
    createdAt,
    createdAtMs,
    updatedAt,
    paymentStatus: "pending",
    paymentTxId: "",
    paymentFromAddress: "",
    paymentConfirmedAt: "",
    paymentConfirmedAtMs: 0,
    baseAmountUsd: toMoney(baseAmountUsd, 2),
    payableAmountUsdt: allocation.payableAmountUsdt,
    amountTailUsdt: allocation.amountTailUsdt,
    currency: PAYMENT_CONFIG.paymentCurrency,
    network: PAYMENT_CONFIG.network,
    receivingAddress: PAYMENT_CONFIG.receivingAddress,
    bucketColor: payload.bucketColor,
    standColor: payload.standColor,
    country: payload.country,
    selectionText,
    countryText,
    shippingText,
    customerName: payload.customer.customerName,
    postalCode: payload.customer.postalCode,
    email: payload.customer.email,
    phone: payload.customer.phone,
    lookupEmail,
    lookupPhone,
    state: payload.customer.state,
    city: payload.customer.city,
    streetAddress: payload.customer.streetAddress,
    unitNumber: payload.customer.unitNumber,
    logisticsWaybill: "",
    logisticsProvider: "yanwen",
    logisticsStatus: "",
    logisticsLastSync: "",
    trackingSnapshotJson: "",
  };

  await db
    .prepare(
      `INSERT INTO orders (
        id, created_at, created_at_ms, updated_at, payment_status, payment_tx_id,
        payment_from_address, payment_confirmed_at, payment_confirmed_at_ms,
        base_amount_usd, payable_amount_usdt, amount_tail_usdt, currency, network,
        receiving_address, bucket_color, stand_color, country, selection_text, country_text,
        shipping_text, customer_name, postal_code, email, phone, lookup_email, lookup_phone,
        state, city, street_address, unit_number, logistics_waybill, logistics_provider,
        logistics_status, logistics_last_sync, tracking_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      order.id,
      order.createdAt,
      order.createdAtMs,
      order.updatedAt,
      order.paymentStatus,
      order.paymentTxId,
      order.paymentFromAddress,
      order.paymentConfirmedAt,
      order.paymentConfirmedAtMs,
      order.baseAmountUsd,
      order.payableAmountUsdt,
      order.amountTailUsdt,
      order.currency,
      order.network,
      order.receivingAddress,
      order.bucketColor,
      order.standColor,
      order.country,
      order.selectionText,
      order.countryText,
      order.shippingText,
      order.customerName,
      order.postalCode,
      order.email,
      order.phone,
      order.lookupEmail,
      order.lookupPhone,
      order.state,
      order.city,
      order.streetAddress,
      order.unitNumber,
      order.logisticsWaybill,
      order.logisticsProvider,
      order.logisticsStatus,
      order.logisticsLastSync,
      order.trackingSnapshotJson,
    )
    .run();

  return order;
}

export async function getOrderById(db, orderId) {
  const row = await db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").bind(orderId).first();
  return row ? mapOrderRow(row) : null;
}

export async function lookupOrders(db, query) {
  const phone = normalizePhone(query.phone || "");
  const legacyPhone = phone ? `+${phone}` : "";
  const limit = clampLimit(query.limit);

  if (!phone) {
    return [];
  }

  const result = await db
    .prepare("SELECT * FROM orders WHERE lookup_phone = ? OR lookup_phone = ? ORDER BY created_at_ms DESC LIMIT ?")
    .bind(phone, legacyPhone, limit)
    .all();

  const rows = Array.isArray(result.results) ? result.results : [];
  return rows.map(mapOrderRow);
}

export async function listOrders(db, query = {}) {
  const limit = clampAdminLimit(query.limit);
  const rawPhone = normalizePhone(query.phone || "");
  const rawPaymentStatus = normalizeText(query.paymentStatus);
  const where = [];
  const binds = [];

  if (rawPhone) {
    where.push("(lookup_phone = ? OR lookup_phone = ?)");
    binds.push(rawPhone, `+${rawPhone}`);
  }

  if (rawPaymentStatus) {
    where.push("payment_status = ?");
    binds.push(rawPaymentStatus);
  }

  const sql = `SELECT * FROM orders${
    where.length ? ` WHERE ${where.join(" AND ")}` : ""
  } ORDER BY created_at_ms DESC LIMIT ?`;
  binds.push(limit);

  const result = await db.prepare(sql).bind(...binds).all();
  const rows = Array.isArray(result.results) ? result.results : [];
  return rows.map(mapOrderRow);
}

export async function updateOrderPayment(db, orderId, payment) {
  const now = new Date().toISOString();
  const confirmedAt = payment.confirmedAt || now;
  const confirmedAtMs = Date.parse(confirmedAt) || Date.now();

  await db
    .prepare(
      `UPDATE orders
       SET updated_at = ?, payment_status = 'paid', payment_tx_id = ?, payment_from_address = ?,
           payment_confirmed_at = ?, payment_confirmed_at_ms = ?
       WHERE id = ?`
    )
    .bind(now, payment.txId || "", payment.from || "", confirmedAt, confirmedAtMs, orderId)
    .run();

  return getOrderById(db, orderId);
}

export async function updateOrderLogistics(db, orderId, payload) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE orders
       SET updated_at = ?, logistics_waybill = ?, logistics_provider = ?, logistics_status = ?,
           logistics_last_sync = ?, tracking_snapshot_json = ?
       WHERE id = ?`
    )
    .bind(
      now,
      payload.logisticsWaybill || "",
      payload.logisticsProvider || "yanwen",
      payload.logisticsStatus || "",
      payload.logisticsLastSync || "",
      payload.trackingSnapshotJson || "",
      orderId,
    )
    .run();

  return getOrderById(db, orderId);
}

export function serializeOrder(order, tracking = null) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    paymentStatus: order.paymentStatus,
    paymentStatusText: getPaymentStatusText(order.paymentStatus),
    paymentTxId: order.paymentTxId,
    paymentConfirmedAt: order.paymentConfirmedAt,
    selectionText: order.selectionText,
    countryText: order.countryText,
    shippingText: order.shippingText,
    customer: {
      name: order.customerName,
      postalCode: order.postalCode,
      email: order.email,
      phone: order.phone,
      state: order.state,
      city: order.city,
      streetAddress: order.streetAddress,
      unitNumber: order.unitNumber,
    },
    payment: {
      network: order.network,
      currency: order.currency,
      baseAmountUsd: order.baseAmountUsd,
      payableAmountUsdt: order.payableAmountUsdt,
      amountTailUsdt: order.amountTailUsdt,
      receivingAddress: order.receivingAddress,
    },
    logistics: {
      waybillNumber: order.logisticsWaybill,
      provider: order.logisticsProvider || "yanwen",
      status: order.logisticsStatus,
      tracking,
    },
  };
}

export function buildSelectionText(values) {
  return `Bucket ${COPY.bucketColor[values.bucketColor]} / Stand ${COPY.standColor[values.standColor]}`;
}

export function buildShippingText(customer) {
  return [
    `${customer.state} ${customer.city}`,
    customer.streetAddress,
    `Unit: ${customer.unitNumber}`,
    `Postal code: ${customer.postalCode}`,
  ].join(", ");
}

export function calculateBaseAmount(country) {
  return PAYMENT_CONFIG.productPriceUsd + (PAYMENT_CONFIG.shippingUsd[country] || 0);
}

function clampLimit(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return ORDER_LOOKUP_LIMIT;
  }
  return Math.max(1, Math.min(20, numeric));
}

function clampAdminLimit(value) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return 100;
  }
  return Math.max(1, Math.min(200, numeric));
}

async function allocateUniqueAmount(db, country, baseAmountUsd, createdAtMs, env) {
  const recentThreshold = new Date(createdAtMs - ORDER_WINDOW_MS).toISOString();
  const range = getPayableAmountConfig(country, env);
  if (!range) {
    throw new Error("Unsupported country for payment allocation.");
  }

  const slots = buildAmountSlots(range);
  const seed = createdAtMs % slots.length;

  for (let offset = 0; offset < slots.length; offset += 1) {
    const payableAmount = slots[(seed + offset) % slots.length];
    const payableAmountUsdt = toMoney(payableAmount, 1);
    const existing = await db
      .prepare(
        `SELECT id FROM orders
         WHERE payable_amount_usdt = ? AND created_at >= ? AND payment_status != 'cancelled'
         LIMIT 1`
      )
      .bind(payableAmountUsdt, recentThreshold)
      .first();

    if (!existing) {
      return {
        payableAmountUsdt,
        amountTailUsdt: toMoney(baseAmountUsd - payableAmount, 2),
      };
    }
  }

  throw new Error("No unique payment slot is currently available. Please try again later.");
}

function buildAmountSlots(range) {
  const slots = [];
  const min = Math.round(range.min * 10);
  const max = Math.round(range.max * 10);
  const step = Math.max(1, Math.round(range.step * 10));

  for (let value = min; value <= max; value += step) {
    slots.push(value / 10);
  }

  return slots;
}

function mapOrderRow(row) {
  return {
    id: String(row.id || ""),
    createdAt: String(row.created_at || ""),
    createdAtMs: Number(row.created_at_ms || 0),
    updatedAt: String(row.updated_at || ""),
    paymentStatus: String(row.payment_status || "pending"),
    paymentTxId: String(row.payment_tx_id || ""),
    paymentFromAddress: String(row.payment_from_address || ""),
    paymentConfirmedAt: String(row.payment_confirmed_at || ""),
    paymentConfirmedAtMs: Number(row.payment_confirmed_at_ms || 0),
    baseAmountUsd: String(row.base_amount_usd || "0.00"),
    payableAmountUsdt: String(row.payable_amount_usdt || "0.0"),
    amountTailUsdt: String(row.amount_tail_usdt || "0.00"),
    currency: String(row.currency || PAYMENT_CONFIG.paymentCurrency),
    network: String(row.network || PAYMENT_CONFIG.network),
    receivingAddress: String(row.receiving_address || PAYMENT_CONFIG.receivingAddress),
    bucketColor: String(row.bucket_color || ""),
    standColor: String(row.stand_color || ""),
    country: String(row.country || ""),
    selectionText: String(row.selection_text || ""),
    countryText: String(row.country_text || ""),
    shippingText: String(row.shipping_text || ""),
    customerName: String(row.customer_name || ""),
    postalCode: String(row.postal_code || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    lookupEmail: String(row.lookup_email || ""),
    lookupPhone: String(row.lookup_phone || ""),
    state: String(row.state || ""),
    city: String(row.city || ""),
    streetAddress: String(row.street_address || ""),
    unitNumber: String(row.unit_number || ""),
    logisticsWaybill: String(row.logistics_waybill || ""),
    logisticsProvider: String(row.logistics_provider || "yanwen"),
    logisticsStatus: String(row.logistics_status || ""),
    logisticsLastSync: String(row.logistics_last_sync || ""),
    trackingSnapshotJson: String(row.tracking_snapshot_json || ""),
  };
}

function getPaymentStatusText(status) {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "not_configured":
      return "TRON API not configured";
    default:
      return "Pending";
  }
}

function createOrderId(createdAtMs) {
  const time = new Date(createdAtMs);
  const stamp = [
    time.getFullYear(),
    String(time.getMonth() + 1).padStart(2, "0"),
    String(time.getDate()).padStart(2, "0"),
    String(time.getHours()).padStart(2, "0"),
    String(time.getMinutes()).padStart(2, "0"),
    String(time.getSeconds()).padStart(2, "0"),
  ].join("");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AQ${stamp}${random}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[^\d]/g, "");
}

function toMoney(value, digits) {
  const numeric = Number(value || 0);
  return numeric.toFixed(digits);
}
