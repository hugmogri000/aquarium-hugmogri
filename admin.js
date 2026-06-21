(function () {
  const filterForm = document.querySelector("[data-admin-filter]");
  const alertBox = document.querySelector("[data-admin-alert]");
  const list = document.querySelector("[data-admin-list]");

  if (!filterForm || !alertBox || !list) {
    return;
  }

  filterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadOrders();
  });

  list.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-waybill-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    await updateWaybill(form);
  });

  async function loadOrders() {
    setAlert("", true);
    list.innerHTML = "";

    const formData = new FormData(filterForm);
    const token = String(formData.get("token") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const paymentStatus = String(formData.get("paymentStatus") || "").trim();

    if (!token) {
      setAlert("请先填写管理口令。");
      return;
    }

    const params = new URLSearchParams();
    params.set("token", token);
    params.set("limit", "100");
    if (phone) params.set("phone", phone);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);

    try {
      const payload = await fetchJson(`/api/admin-orders?${params.toString()}`);
      renderOrders(Array.isArray(payload.orders) ? payload.orders : [], token);
    } catch (error) {
      setAlert(getErrorMessage(error, "加载订单失败。"));
    }
  }

  function renderOrders(orders, token) {
    if (!orders.length) {
      list.innerHTML = '<article class="lookup-order-card"><p class="lookup-empty">没有查询到订单。</p></article>';
      return;
    }

    list.innerHTML = orders.map((order) => buildOrderCard(order, token)).join("");
  }

  async function updateWaybill(form) {
    const formData = new FormData(form);
    const token = String(formData.get("token") || "").trim();
    const orderId = String(formData.get("orderId") || "").trim();
    const logisticsWaybill = String(formData.get("logisticsWaybill") || "").trim();
    const logisticsStatus = String(formData.get("logisticsStatus") || "").trim();

    if (!token || !orderId) {
      setAlert("缺少管理口令或订单号。");
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
          logisticsStatus,
        }),
      });

      setAlert(`订单 ${orderId} 的物流信息已更新。`, true);
      await loadOrders();
    } catch (error) {
      setAlert(getErrorMessage(error, "更新物流信息失败。"));
    }
  }

  function buildOrderCard(order, token) {
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
            <p>${escapeHtml(order.createdAt || "")}</p>
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
          <input type="hidden" name="token" value="${escapeHtml(token)}">
          <input type="hidden" name="orderId" value="${escapeHtml(order.id)}">
          <label class="customer-field">
            <span>运单号</span>
            <input type="text" name="logisticsWaybill" value="${escapeHtml(order.logistics.waybillNumber || "")}">
          </label>
          <label class="customer-field">
            <span>内部物流状态</span>
            <input type="text" name="logisticsStatus" value="${escapeHtml(order.logistics.status || "")}">
          </label>
          <button class="button small" type="submit">保存物流信息</button>
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

  function formatAddress(customer) {
    return [
      `${customer.state || ""} ${customer.city || ""}`.trim(),
      customer.streetAddress || "",
      customer.unitNumber ? `门牌号 ${customer.unitNumber}` : "",
      customer.postalCode ? `邮编 ${customer.postalCode}` : "",
    ].filter(Boolean).join("，");
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
})();
