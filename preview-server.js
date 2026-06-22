const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4190);
const ADMIN_TOKEN = "preview-admin-token";
const PAYMENT_MODE = String(process.env.PAYMENT_MODE || "test").trim().toLowerCase() === "production" ? "production" : "test";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

const orders = new Map();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (url.pathname === "/api/create-order" && req.method === "POST") {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const order = createPreviewOrder(payload);
    orders.set(order.id, order);
    return sendJson(res, 200, { success: true, order });
  }

  if (url.pathname === "/api/check-payment" && req.method === "GET") {
    const orderId = String(url.searchParams.get("orderId") || "").trim();
    const preview = String(url.searchParams.get("preview") || "").toLowerCase();
    const order = orders.get(orderId);

    if (!order) {
      return sendJson(res, 404, {
        success: false,
        configured: true,
        paid: false,
        status: "not_found",
        message: "Preview order not found.",
      });
    }

    if (preview === "paid" || url.searchParams.get("payment") === "paid") {
      order.paymentStatus = "paid";
      order.paymentStatusText = "Paid";
      order.paymentTxId = "preview-transaction";
      order.paymentConfirmedAt = new Date().toISOString();
    }

    return sendJson(res, 200, {
      success: true,
      configured: true,
      paid: order.paymentStatus === "paid",
      status: order.paymentStatus === "paid" ? "paid" : "pending",
      txId: order.paymentTxId || "",
      order: orderToResponse(order),
      message: order.paymentStatus === "paid"
        ? "Preview payment marked as paid."
        : "Preview payment is still pending.",
    });
  }

  if (url.pathname === "/api/track-order" && req.method === "GET") {
    const orderId = String(url.searchParams.get("orderId") || "").trim();
    const order = orders.get(orderId);

    if (!order) {
      return sendJson(res, 404, {
        success: false,
        message: "Preview order not found.",
      });
    }

    if (!order.logistics.waybillNumber) {
      order.logistics.tracking = {
        available: false,
        message: "No waybill yet.",
        trackingStatus: "EMPTY",
        checkpoints: [],
      };
      return sendJson(res, 200, {
        success: true,
        order: orderToResponse(order),
      });
    }

    const fakeWaybill = String(order.logistics.waybillNumber || "").trim().toUpperCase();
    if (fakeWaybill.startsWith("FAKE") || fakeWaybill.startsWith("TEST") || fakeWaybill.startsWith("YWTEST")) {
      order.logistics.tracking = {
        available: false,
        message: "Waybill number not found.",
        trackingStatus: "NOTFOUND",
        checkpoints: [],
      };
    } else {
      order.logistics.tracking = {
        available: true,
        message: "",
        trackingStatus: "IN_TRANSIT",
        checkpoints: [
          {
            time: new Date().toISOString(),
            message: "Preview tracking checkpoint",
          },
        ],
      };
    }

    return sendJson(res, 200, {
      success: true,
      order: orderToResponse(order),
    });
  }

  if (url.pathname === "/api/order-lookup" && req.method === "GET") {
    const phone = normalizePhone(url.searchParams.get("phone") || "");
    const matched = Array.from(orders.values())
      .filter((order) => phone && normalizePhone(order.customer.phone) === phone)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(orderToResponse);

    return sendJson(res, 200, {
      success: true,
      orders: matched,
    });
  }

  if (url.pathname === "/api/admin-orders" && req.method === "GET") {
    const token = String(url.searchParams.get("token") || "").trim();
    if (token !== ADMIN_TOKEN) {
      return sendJson(res, 401, { success: false, message: "Unauthorized." });
    }

    const phone = normalizePhone(url.searchParams.get("phone") || "");
    const paymentStatus = String(url.searchParams.get("paymentStatus") || "").trim();
    const matched = Array.from(orders.values())
      .filter((order) => {
        const phoneOk = !phone || normalizePhone(order.customer.phone) === phone;
        const paymentOk = !paymentStatus || order.paymentStatus === paymentStatus;
        return phoneOk && paymentOk;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(orderToResponse);

    return sendJson(res, 200, { success: true, orders: matched });
  }

  if (url.pathname === "/api/admin-update-order" && req.method === "POST") {
    const auth = String(req.headers.authorization || "");
    if (auth !== `Bearer ${ADMIN_TOKEN}`) {
      return sendJson(res, 401, { success: false, message: "Unauthorized." });
    }

    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const orderId = String(payload.orderId || "").trim();
    const order = orders.get(orderId);
    if (!order) {
      return sendJson(res, 404, { success: false, message: "Order not found." });
    }

    order.logistics.waybillNumber = String(payload.logisticsWaybill || "").trim();
    order.logistics.provider = "yanwen";
    order.logistics.status = String(payload.logisticsStatus || "").trim();
    order.logistics.tracking = null;

    return sendJson(res, 200, {
      success: true,
      orderId,
      logisticsWaybill: order.logistics.waybillNumber,
      logisticsProvider: order.logistics.provider,
    });
  }

  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(root, `.${requested}`);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Preview server: http://127.0.0.1:${port}/`);
  console.log(`Preview admin token: ${ADMIN_TOKEN}`);
  console.log(`Preview payment mode: ${PAYMENT_MODE}`);
});

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function createPreviewOrder(payload) {
  const createdAt = new Date().toISOString();
  const orderId = createOrderId();
  const country = payload.country === "australia" ? "australia" : "usa";
  const baseAmountUsd = 58 + (country === "australia" ? 100 : 150);
  const range = getPreviewRange(country);
  const payableAmountUsdt = normalizeAmount(range.min + Math.floor(Math.random() * 20) / 10, 1);
  const amountTailUsdt = normalizeAmount(baseAmountUsd - Number(payableAmountUsdt), 2);
  const selectionText = `Bucket ${payload.bucketColor || ""} / Stand ${payload.standColor || ""}`;
  const countryText = country === "australia" ? "Australia" : "USA";
  const customer = {
    name: String(payload.customerName || ""),
    postalCode: String(payload.postalCode || ""),
    email: String(payload.email || ""),
    phone: String(payload.phone || ""),
    state: String(payload.state || ""),
    city: String(payload.city || ""),
    streetAddress: String(payload.streetAddress || ""),
    unitNumber: String(payload.unitNumber || ""),
  };

  return {
    id: orderId,
    createdAt,
    paymentStatus: "pending",
    paymentStatusText: "Pending",
    paymentTxId: "",
    paymentConfirmedAt: "",
    selectionText,
    countryText,
    customer,
    shippingText: `${customer.state} ${customer.city}, ${customer.streetAddress}, Unit ${customer.unitNumber}, Postal ${customer.postalCode}`,
    payment: {
      network: "TRON / TRC20-USDT",
      currency: "USDT",
      baseAmountUsd: normalizeAmount(baseAmountUsd, 2),
      payableAmountUsdt,
      amountTailUsdt,
      receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
    },
    logistics: {
      waybillNumber: "",
      provider: "yanwen",
      status: "",
      tracking: null,
    },
  };
}

function getPreviewRange(country) {
  if (PAYMENT_MODE === "production") {
    return country === "australia"
      ? { min: 156.0, max: 157.9 }
      : { min: 206.0, max: 207.9 };
  }

  return country === "australia"
    ? { min: 3.0, max: 4.9 }
    : { min: 1.0, max: 2.9 };
}

function orderToResponse(order) {
  return {
    id: order.id,
    createdAt: order.createdAt,
    paymentStatus: order.paymentStatus,
    paymentStatusText: order.paymentStatusText,
    paymentTxId: order.paymentTxId,
    paymentConfirmedAt: order.paymentConfirmedAt || "",
    selectionText: order.selectionText,
    countryText: order.countryText,
    shippingText: order.shippingText,
    customer: order.customer,
    payment: order.payment,
    logistics: {
      waybillNumber: order.logistics.waybillNumber,
      provider: order.logistics.provider,
      status: order.logistics.status,
      tracking: order.logistics.tracking,
    },
  };
}

function createOrderId() {
  const time = new Date();
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

function normalizePhone(value) {
  const raw = String(value || "").trim();
  return raw.replace(/[^\d]/g, "");
}

function normalizeAmount(value, digits = 6) {
  const numeric = Number.parseFloat(String(value || "0"));
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : (0).toFixed(digits);
}
