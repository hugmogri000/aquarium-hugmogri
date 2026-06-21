const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4190);

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

  if (url.pathname === "/api/check-payment") {
    const orderId = String(url.searchParams.get("orderId") || "").trim();
    const preview = (url.searchParams.get("preview") || "").toLowerCase();
    const order = orders.get(orderId);

    if (!order) {
      return sendJson(res, 404, {
        success: false,
        configured: true,
        paid: false,
        status: "not_found",
        message: "预览模式：订单不存在。",
      });
    }

    if (preview === "paid" || url.searchParams.get("payment") === "paid") {
      order.paymentStatus = "paid";
      order.paymentStatusText = "已支付";
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
        ? "预览模式：支付已确认。"
        : "预览模式：暂未查询到该订单对应的到账记录。",
    });
  }

  if (url.pathname === "/api/order-lookup") {
    const email = String(url.searchParams.get("email") || "").trim().toLowerCase();
    const phone = normalizePhone(url.searchParams.get("phone") || "");

    const matched = Array.from(orders.values())
      .filter((order) => {
        return (email && order.customer.email.toLowerCase() === email) || (phone && normalizePhone(order.customer.phone) === phone);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(orderToResponse);

    return sendJson(res, 200, {
      success: true,
      orders: matched,
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
  const baseAmountUsd = 58 + (payload.country === "australia" ? 100 : 150);
  const payableAmountUsdt = normalizeAmount(baseAmountUsd + 0.003217);
  const selectionText = `水桶${payload.bucketColor === "lightBlue" ? "浅蓝色" : "白色"} / 支架${payload.standColor === "black" ? "黑色" : "白色"}`;
  const countryText = payload.country === "australia" ? "澳大利亚" : "美国";
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
    paymentStatusText: "待支付确认",
    paymentTxId: "",
    paymentConfirmedAt: "",
    selectionText,
    countryText,
    customer,
    shippingText: `${customer.state} ${customer.city}，${customer.streetAddress}，门牌号: ${customer.unitNumber}，邮编: ${customer.postalCode}`,
    payment: {
      network: "TRON / TRC20-USDT",
      currency: "USDT",
      baseAmountUsd: normalizeBaseAmount(baseAmountUsd),
      payableAmountUsdt,
      amountTailUsdt: "0.003217",
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
  const plus = raw.startsWith("+") ? "+" : "";
  return `${plus}${raw.replace(/[^\d]/g, "")}`;
}

function normalizeAmount(value) {
  const numeric = Number.parseFloat(String(value || "0"));
  return Number.isFinite(numeric) ? numeric.toFixed(6) : "0.000000";
}

function normalizeBaseAmount(value) {
  const numeric = Number.parseFloat(String(value || "0"));
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}
