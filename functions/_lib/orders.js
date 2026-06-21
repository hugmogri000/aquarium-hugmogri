import { COPY, ORDER_LOOKUP_LIMIT, PAYMENT_CONFIG } from "./config.js";

const AMOUNT_MICRO_SCALE = 1_000_000;
const MAX_TAIL_MICRO = 9_999;
const MIN_TAIL_MICRO = 100;
const ORDER_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function validateOrderPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "订单信息格式不正确。" };
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
  if (!COPY.bucketColor[bucketColor]) {
    issues.push("水桶颜色");
  }
  if (!COPY.standColor[standColor]) {
    issues.push("支架颜色");
  }
  if (!COPY.country[country]) {
    issues.push("国家");
  }

  for (const [key, label] of [
    ["customerName", "名字"],
    ["postalCode", "邮编"],
    ["email", "邮箱"],
    ["phone", "电话"],
    ["state", "省 / 州"],
    ["city", "城市"],
    ["streetAddress", "具体地址"],
    ["unitNumber", "门牌号"],
  ]) {
    if (!customer[key]) {
      issues.push(label);
    }
  }

  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    issues.push("邮箱格式不正确");
  }

  if (!issues.length) {
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

  return {
    ok: false,
    message: `请先填写或选择：${issues.join("、")}`,
  };
}

export async function createOrder(db, payload) {
  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs).toISOString();
  const updatedAt = createdAt;
  const orderId = createOrderId(createdAtMs);
  const baseAmountUsd = calculateBaseAmount(payload.country);
  const allocation = await allocateUniqueAmount(db, baseAmountUsd, createdAtMs);
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

  const statement = db
    .prepare("SELECT * FROM orders WHERE lookup_phone = ? OR lookup_phone = ? ORDER BY created_at_ms DESC LIMIT ?")
    .bind(phone, legacyPhone, limit);

  const result = await statement.all();
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
  return `水桶${COPY.bucketColor[values.bucketColor]} / 支架${COPY.standColor[values.standColor]}`;
}

export function buildShippingText(customer) {
  return [
    `${customer.state} ${customer.city}`,
    customer.streetAddress,
    `门牌号: ${customer.unitNumber}`,
    `邮编: ${customer.postalCode}`,
  ].join("，");
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

async function allocateUniqueAmount(db, baseAmountUsd, createdAtMs) {
  const baseMicro = Math.round(baseAmountUsd * AMOUNT_MICRO_SCALE);
  const recentThreshold = new Date(createdAtMs - ORDER_WINDOW_MS).toISOString();
  const seed = createdAtMs % MAX_TAIL_MICRO;

  for (let offset = 0; offset <= MAX_TAIL_MICRO; offset += 1) {
    const tailMicro = MIN_TAIL_MICRO + ((seed + offset) % (MAX_TAIL_MICRO - MIN_TAIL_MICRO + 1));
    const payableAmountUsdt = toMoney((baseMicro + tailMicro) / AMOUNT_MICRO_SCALE, 6);
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
        amountTailUsdt: toMoney(tailMicro / AMOUNT_MICRO_SCALE, 6),
      };
    }
  }

  throw new Error("无法分配唯一支付金额，请稍后再试。");
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
    payableAmountUsdt: String(row.payable_amount_usdt || "0.000000"),
    amountTailUsdt: String(row.amount_tail_usdt || "0.000000"),
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
      return "已支付";
    case "pending":
      return "待支付";
    case "not_configured":
      return "支付检测未配置";
    default:
      return "待支付";
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
  const raw = normalizeText(value);
  return raw.replace(/[^\d]/g, "");
}

function toMoney(value, digits) {
  const numeric = Number(value || 0);
  return numeric.toFixed(digits);
}
