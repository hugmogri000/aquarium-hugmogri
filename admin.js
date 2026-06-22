(function () {
  const STORAGE_KEY = "aquarium_admin_token";

  const list = document.querySelector("[data-admin-list]");
  const alertBox = document.querySelector("[data-admin-alert]");
  const paymentStatusSelect = document.querySelector("[data-admin-payment-status]");
  const refreshButton = document.querySelector("[data-admin-refresh]");
  const resetTokenButton = document.querySelector("[data-admin-reset-token]");
  const tokenModal = document.querySelector("[data-admin-token-modal]");
  const tokenForm = document.querySelector("[data-admin-token-form]");
  const tokenAlert = document.querySelector("[data-admin-token-alert]");

  if (!list || !alertBox || !paymentStatusSelect || !refreshButton || !resetTokenButton || !tokenModal || !tokenForm || !tokenAlert) {
    return;
  }

  if (window.location.protocol === "file:") {
    setAlert("请通过 http://127.0.0.1:4190/admin.html 或已部署的线上后台打开本页，不要直接使用 file:// 打开。");
    refreshButton.disabled = true;
    paymentStatusSelect.disabled = true;
    return;
  }

  refreshButton.addEventListener("click", async () => {
    await ensureTokenAndLoad();
  });

  resetTokenButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    openTokenModal();
  });

  paymentStatusSelect.addEventListener("change", async () => {
    await ensureTokenAndLoad();
  });

  list.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-waybill-form]");
    if (!form) return;
    event.preventDefault();
    await updateWaybill(form);
  });

  tokenForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(tokenForm);
    const token = String(formData.get("token") || "").trim();
    if (!token) {
      setTokenAlert("请填写管理口令。");
      return;
    }

    localStorage.setItem(STORAGE_KEY, token);
    closeTokenModal();
    await loadOrders();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !tokenModal.hidden) {
      event.preventDefault();
    }
  });

  ensureTokenAndLoad();

  async function ensureTokenAndLoad() {
    const token = getStoredToken();
    if (!token) {
      openTokenModal();
      return;
    }

    await loadOrders();
  }

  async function loadOrders() {
    setAlert("", true);
    list.innerHTML = "";

    const token = getStoredToken();
    if (!token) {
      openTokenModal();
      return;
    }

    const params = new URLSearchParams();
    params.set("token", token);
    params.set("limit", "100");

    const paymentStatus = String(paymentStatusSelect.value || "").trim();
    if (paymentStatus) {
      params.set("paymentStatus", paymentStatus);
    }

    try {
      const payload = await fetchJson(`/api/admin-orders?${params.toString()}`);
      renderOrders(Array.isArray(payload.orders) ? payload.orders : []);
    } catch (error) {
      const message = getErrorMessage(error, "加载订单失败。");
      if (message === "Unauthorized." || message === "未授权。") {
        localStorage.removeItem(STORAGE_KEY);
        openTokenModal("管理口令无效，请重新输入。");
        return;
      }
      if (message === "Failed to fetch") {
        setAlert("后台接口不可用。请打开 http://127.0.0.1:4190/admin.html 或已部署的线上站点。");
        return;
      }
      setAlert(message);
    }
  }

  function renderOrders(orders) {
    if (!orders.length) {
      list.innerHTML = '<article class="lookup-order-card"><p class="lookup-empty">当前没有订单。</p></article>';
      return;
    }

    const groups = groupOrdersByDate(orders);
    list.innerHTML = groups.map((group) => buildDateGroup(group)).join("");
  }

  async function updateWaybill(form) {
    const formData = new FormData(form);
    const token = getStoredToken();
    const orderId = String(formData.get("orderId") || "").trim();
    const logisticsWaybill = String(formData.get("logisticsWaybill") || "").trim();

    if (!token || !orderId) {
      openTokenModal("请先设置有效的管理口令。");
      return;
    }

    try {
      await fetchJson("/api/admin-update-order", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          orderId,
          logisticsWaybill,
          logisticsProvider: "yanwen",
        }),
      });

      setAlert(`订单 ${orderId} 的燕文运单号已保存。`, true);
      await loadOrders();
    } catch (error) {
      const message = getErrorMessage(error, "更新运单号失败。");
      if (message === "Unauthorized." || message === "未授权。") {
        localStorage.removeItem(STORAGE_KEY);
        openTokenModal("管理口令无效，请重新输入。");
        return;
      }
      if (message === "Failed to fetch") {
        setAlert("后台接口不可用。请打开 http://127.0.0.1:4190/admin.html 或已部署的线上站点。");
        return;
      }
      setAlert(message);
    }
  }

  function buildDateGroup(group) {
    return `
      <section class="admin-date-group">
        <div class="admin-date-head">
          <h2>${escapeHtml(group.label)}</h2>
          <span>${group.orders.length} 单</span>
        </div>
        <div class="admin-date-list">
          ${group.orders.map((order) => buildOrderCard(order)).join("")}
        </div>
      </section>
    `;
  }

  function buildOrderCard(order) {
    const tracking = order.logistics && order.logistics.tracking;
    const checkpoints = tracking && Array.isArray(tracking.checkpoints) ? tracking.checkpoints : [];
    const trackingHtml = checkpoints.length
      ? `<ol class="lookup-tracking-list">${checkpoints.map((checkpoint) => `
          <li class="lookup-tracking-item">
            <strong>${escapeHtml(checkpoint.time || "")}</strong>
            <span>${escapeHtml(checkpoint.message || "")}</span>
          </li>
        `).join("")}</ol>`
      : '<p class="lookup-tracking-empty">暂无物流轨迹。</p>';

    return `
      <article class="lookup-order-card admin-order-card">
        <div class="lookup-order-head">
          <div>
            <h3>${escapeHtml(order.id)}</h3>
            <p>${escapeHtml(formatDateTime(order.createdAt || ""))}</p>
          </div>
          <strong class="lookup-order-state">${escapeHtml(order.paymentStatusText || order.paymentStatus || "")}</strong>
        </div>
        <dl class="payment-detail lookup-order-detail">
          <div><dt>客户姓名</dt><dd>${escapeHtml(order.customer.name)}</dd></div>
          <div><dt>手机号</dt><dd>${escapeHtml(order.customer.phone)}</dd></div>
          <div><dt>邮箱</dt><dd>${escapeHtml(order.customer.email)}</dd></div>
          <div><dt>款式</dt><dd>${escapeHtml(order.selectionText)}</dd></div>
          <div><dt>国家</dt><dd>${escapeHtml(order.countryText)}</dd></div>
          <div><dt>产品与运费</dt><dd>${escapeHtml(`${order.payment.baseAmountUsd} USD`)}</dd></div>
          <div><dt>应付金额</dt><dd>${escapeHtml(`${order.payment.payableAmountUsdt} ${order.payment.currency}`)}</dd></div>
          <div><dt>收款地址</dt><dd>${escapeHtml(order.payment.receivingAddress)}</dd></div>
          <div><dt>交易哈希</dt><dd>${escapeHtml(order.paymentTxId || "")}</dd></div>
          <div><dt>收货地址</dt><dd>${escapeHtml(formatAddress(order.customer))}</dd></div>
        </dl>

        <form class="admin-waybill-form" data-waybill-form>
          <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
          <label class="customer-field">
            <span>燕文运单号</span>
            <input type="text" name="logisticsWaybill" value="${escapeHtml(order.logistics.waybillNumber || "")}">
          </label>
          <button class="button small" type="submit">保存运单号</button>
        </form>

        <section class="lookup-tracking">
          <div class="lookup-tracking-head">
            <strong>物流轨迹</strong>
            <span>${escapeHtml(order.logistics.waybillNumber || "暂无运单号")}</span>
          </div>
          ${trackingHtml}
        </section>
      </article>
    `;
  }

  function groupOrdersByDate(orders) {
    const map = new Map();
    for (const order of orders) {
      const label = formatDateOnly(order.createdAt || "");
      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label).push(order);
    }

    return Array.from(map.entries()).map(([label, groupedOrders]) => ({
      label,
      orders: groupedOrders,
    }));
  }

  function formatDateOnly(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "未知日期";
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function formatAddress(customer) {
    return [
      `${customer.state || ""} ${customer.city || ""}`.trim(),
      customer.streetAddress || "",
      customer.unitNumber ? `门牌号 ${customer.unitNumber}` : "",
      customer.postalCode ? `邮编 ${customer.postalCode}` : "",
    ].filter(Boolean).join("，");
  }

  function openTokenModal(message = "") {
    tokenModal.hidden = false;
    document.body.classList.add("modal-lock");
    tokenForm.reset();
    setTokenAlert(message);
  }

  function closeTokenModal() {
    tokenModal.hidden = true;
    document.body.classList.remove("modal-lock");
    setTokenAlert("");
  }

  function getStoredToken() {
    return String(localStorage.getItem(STORAGE_KEY) || "").trim();
  }

  function setAlert(message, success) {
    if (!message) {
      alertBox.hidden = true;
      alertBox.textContent = "";
      alertBox.classList.remove("is-success");
      return;
    }
    alertBox.hidden = false;
    alertBox.textContent = message;
    alertBox.classList.toggle("is-success", Boolean(success));
  }

  function setTokenAlert(message) {
    if (!message) {
      tokenAlert.hidden = true;
      tokenAlert.textContent = "";
      return;
    }
    tokenAlert.hidden = false;
    tokenAlert.textContent = message;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      const error = new Error(payload.message || `Request failed: ${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function getErrorMessage(error, fallback) {
    if (error && error.payload && error.payload.message) {
      return String(error.payload.message);
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }
})();
