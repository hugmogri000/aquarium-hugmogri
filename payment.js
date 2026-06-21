(function () {
  const API = {
    createOrder: "/api/create-order",
    checkPayment: "/api/check-payment",
    lookupOrder: "/api/order-lookup",
  };

  const PAYMENT_CONFIG = {
    productName: "Eco Bucket Aquarium",
    network: "TRON / TRC20-USDT",
    paymentCurrency: "USDT",
    productPriceUsd: 58,
    shippingUsd: {
      usa: 150,
      australia: 100,
    },
    receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
    paymentTip: "请务必按下方精确金额原样支付，系统会用订单号和精确到账金额识别订单。",
  };

  const copy = {
    bucketColor: {
      white: "白色",
      lightBlue: "浅蓝色",
    },
    standColor: {
      white: "白色",
      black: "黑色",
    },
    country: {
      usa: "美国",
      australia: "澳大利亚",
    },
  };

  let currentOrder = null;

  const buyButton = document.querySelector("[data-buy-now]");
  const orderLookupButton = document.querySelector("[data-order-lookup]");
  if (!buyButton) {
    return;
  }

  const paymentModal = createPaymentModal();
  const lookupModal = createLookupModal();
  document.body.appendChild(paymentModal);
  document.body.appendChild(lookupModal);

  const paymentForm = paymentModal.querySelector("[data-payment-form]");
  const paymentResult = paymentModal.querySelector("[data-payment-result]");
  const paymentChoice = paymentModal.querySelector("[data-order-choice]");
  const paymentCountrySummary = paymentModal.querySelector("[data-order-country]");
  const paymentProductPrice = paymentModal.querySelector("[data-product-price]");
  const paymentShippingPrice = paymentModal.querySelector("[data-shipping-price]");
  const paymentTotalPrice = paymentModal.querySelector("[data-total-price]");
  const paymentFormAlert = paymentModal.querySelector("[data-form-alert]");
  const paymentSubmitButton = paymentForm.querySelector('button[type="submit"]');
  const paymentOptionGroups = {
    bucketColor: paymentModal.querySelector('[data-option-group="bucketColor"]'),
    standColor: paymentModal.querySelector('[data-option-group="standColor"]'),
    country: paymentModal.querySelector('[data-option-group="country"]'),
  };
  const paymentCustomerFields = Array.from(paymentModal.querySelectorAll(".customer-field"));
  const paymentResultFields = {
    orderId: paymentModal.querySelector("[data-order-id]"),
    options: paymentModal.querySelector("[data-order-options]"),
    country: paymentModal.querySelector("[data-order-country-result]"),
    customerName: paymentModal.querySelector("[data-customer-name]"),
    customerContact: paymentModal.querySelector("[data-customer-contact]"),
    shippingAddress: paymentModal.querySelector("[data-shipping-address]"),
    baseAmount: paymentModal.querySelector("[data-base-amount]"),
    paymentAmount: paymentModal.querySelector("[data-payment-amount]"),
    paymentAddress: paymentModal.querySelector("[data-payment-address]"),
    paymentState: paymentModal.querySelector("[data-payment-state]"),
    paymentTxId: paymentModal.querySelector("[data-payment-txid]"),
  };
  const paymentStatus = paymentModal.querySelector("[data-payment-status]");
  const paymentNote = paymentModal.querySelector("[data-payment-note]");
  const paidButton = paymentModal.querySelector("[data-confirm-paid]");
  const paymentCopyButtons = Array.from(paymentModal.querySelectorAll("[data-copy-field]"));

  const lookupForm = lookupModal.querySelector("[data-lookup-form]");
  const lookupAlert = lookupModal.querySelector("[data-lookup-alert]");
  const lookupSubmitButton = lookupForm.querySelector('button[type="submit"]');
  const lookupResults = lookupModal.querySelector("[data-lookup-results]");
  const lookupEmpty = lookupModal.querySelector("[data-lookup-empty]");
  const lookupList = lookupModal.querySelector("[data-lookup-list]");

  buyButton.addEventListener("click", openPaymentModal);
  if (orderLookupButton) {
    orderLookupButton.addEventListener("click", openLookupModal);
  }

  paymentModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-payment]")) {
      closePaymentModal();
    }
  });

  lookupModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-lookup]")) {
      closeLookupModal();
    }
  });

  paymentModal.addEventListener("change", (event) => {
    if (event.target.name === "bucketColor" || event.target.name === "standColor" || event.target.name === "country") {
      updatePaymentSummary();
      clearPaymentValidationState();
    }
  });

  paymentCustomerFields.forEach((field) => {
    const input = field.querySelector("input");
    input.addEventListener("input", () => {
      field.classList.remove("is-error");
      input.removeAttribute("aria-invalid");
      if (!hasPaymentValidationIssues()) {
        paymentFormAlert.hidden = true;
        paymentFormAlert.textContent = "";
      }
    });
  });

  paymentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createOrderAndShowPayment();
  });

  paymentCopyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      handlePaymentCopy(button.dataset.copyField || "");
    });
  });

  lookupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    lookupOrders();
  });

  paidButton.addEventListener("click", closePaymentModal);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (!paymentModal.hidden) {
      closePaymentModal();
      return;
    }

    if (!lookupModal.hidden) {
      closeLookupModal();
    }
  });

  function openPaymentModal() {
    resetPaymentFormState();
    paymentModal.hidden = false;
    document.body.classList.add("modal-lock");
    updatePaymentSummary();
    window.setTimeout(() => {
      paymentModal.querySelector('input[name="bucketColor"]').focus();
    }, 0);
  }

  function closePaymentModal() {
    paymentModal.hidden = true;
    document.body.classList.remove("modal-lock");
    resetPaymentFormState();
    buyButton.focus();
  }

  function openLookupModal() {
    resetLookupState();
    lookupModal.hidden = false;
    document.body.classList.add("modal-lock");
    window.setTimeout(() => {
      lookupModal.querySelector('input[name="lookupPhone"]').focus();
    }, 0);
  }

  function closeLookupModal() {
    lookupModal.hidden = true;
    document.body.classList.remove("modal-lock");
    resetLookupState();
    if (orderLookupButton) {
      orderLookupButton.focus();
    }
  }

  function resetPaymentFormState() {
    paymentForm.reset();
    currentOrder = null;
    paymentResult.hidden = true;
    paymentNote.textContent = "";
    paymentStatus.textContent = "请先选择款式并填写客户信息，然后生成专属支付金额。";
    clearPaymentValidationState();
    setPaymentSubmitState(false);
    updatePaymentSummary();
  }

  function resetLookupState() {
    lookupForm.reset();
    lookupAlert.hidden = true;
    lookupAlert.textContent = "";
    lookupResults.hidden = true;
    lookupEmpty.hidden = true;
    lookupList.innerHTML = "";
    setLookupSubmitState(false);
  }

  function clearPaymentValidationState() {
    paymentFormAlert.hidden = true;
    paymentFormAlert.textContent = "";

    Object.values(paymentOptionGroups).forEach((group) => {
      group.classList.remove("is-error");
    });

    paymentCustomerFields.forEach((field) => {
      field.classList.remove("is-error");
      const input = field.querySelector("input");
      input.removeAttribute("aria-invalid");
    });
  }

  function updatePaymentSummary() {
    const selections = getSelections();
    const hasColors = Boolean(selections.bucketColor && selections.standColor);
    const hasCountry = Boolean(selections.country);
    const shipping = hasCountry ? getShippingUsd(selections.country) : null;
    const total = hasColors && hasCountry ? PAYMENT_CONFIG.productPriceUsd + shipping : null;

    paymentChoice.textContent = hasColors
      ? buildChoiceText(selections)
      : "请选择水桶颜色和支架颜色";
    paymentCountrySummary.textContent = hasCountry
      ? copy.country[selections.country]
      : "请选择国家";
    paymentProductPrice.textContent = hasColors
      ? `${PAYMENT_CONFIG.productPriceUsd} 美元`
      : "--";
    paymentShippingPrice.textContent = hasCountry
      ? `${shipping} 美元`
      : "--";
    paymentTotalPrice.textContent = total === null
      ? "--"
      : `${total} USDT`;
  }

  async function createOrderAndShowPayment() {
    const validation = validatePaymentForm();
    if (!validation.valid) {
      paymentResult.hidden = true;
      paymentFormAlert.hidden = false;
      paymentFormAlert.textContent = validation.message;
      validation.focusTarget.focus();
      return;
    }

    setPaymentSubmitState(true);

    try {
      const payload = {
        ...getSelections(),
        ...getCustomerInfo(),
      };
      const response = await fetchJson(API.createOrder, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
      });

      currentOrder = response.order;
      renderPaymentResult(currentOrder);
      paymentFormAlert.hidden = true;
      paymentFormAlert.textContent = "";
      paymentResult.hidden = false;
      paymentResult.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (error) {
      paymentFormAlert.hidden = false;
      paymentFormAlert.textContent = getErrorMessage(error, "创建订单失败，请稍后重试。");
      paymentResult.hidden = true;
    } finally {
      setPaymentSubmitState(false);
    }
  }

  function renderPaymentResult(order) {
    paymentResultFields.orderId.textContent = order.id;
    paymentResultFields.options.textContent = order.selectionText;
    paymentResultFields.country.textContent = order.countryText;
    paymentResultFields.customerName.textContent = order.customer.name;
    paymentResultFields.customerContact.textContent = `${order.customer.phone} / ${order.customer.email}`;
    paymentResultFields.shippingAddress.textContent = formatShippingAddress(order.customer);
    paymentResultFields.baseAmount.textContent = `${order.payment.baseAmountUsd} 美元`;
    paymentResultFields.paymentAmount.textContent = `${order.payment.payableAmountUsdt} ${order.payment.currency}`;
    paymentResultFields.paymentAddress.textContent = order.payment.receivingAddress;
    paymentResultFields.paymentState.textContent = order.paymentStatusText || order.paymentStatus || "待支付确认";
    paymentResultFields.paymentTxId.textContent = order.paymentTxId || "待确认";
    paymentNote.textContent = `${PAYMENT_CONFIG.paymentTip} 产品与运费参考价为 ${order.payment.baseAmountUsd} 美元，当前专属支付金额为 ${order.payment.payableAmountUsdt} ${order.payment.currency}。`;
    paymentStatus.textContent = "请复制金额和付款地址完成转账，付款完成后可通过“查询订单”查看支付状态。";
  }

  function validatePaymentForm() {
    clearPaymentValidationState();

    const selections = getSelections();
    const issues = [];
    let focusTarget = null;

    if (!selections.bucketColor) {
      issues.push("水桶颜色");
      paymentOptionGroups.bucketColor.classList.add("is-error");
      focusTarget = focusTarget || paymentModal.querySelector('input[name="bucketColor"]');
    }

    if (!selections.standColor) {
      issues.push("支架颜色");
      paymentOptionGroups.standColor.classList.add("is-error");
      focusTarget = focusTarget || paymentModal.querySelector('input[name="standColor"]');
    }

    if (!selections.country) {
      issues.push("国家");
      paymentOptionGroups.country.classList.add("is-error");
      focusTarget = focusTarget || paymentModal.querySelector('input[name="country"]');
    }

    paymentCustomerFields.forEach((field) => {
      const input = field.querySelector("input");
      const label = field.querySelector("span").textContent.trim();
      const value = input.value.trim();

      if (!value) {
        issues.push(label);
        field.classList.add("is-error");
        input.setAttribute("aria-invalid", "true");
        focusTarget = focusTarget || input;
        return;
      }

      if (!input.checkValidity()) {
        issues.push(`${label}格式不正确`);
        field.classList.add("is-error");
        input.setAttribute("aria-invalid", "true");
        focusTarget = focusTarget || input;
      }
    });

    if (!issues.length) {
      return {
        valid: true,
        message: "",
        focusTarget: null,
      };
    }

    return {
      valid: false,
      message: `请先填写或选择：${issues.join("、")}`,
      focusTarget,
    };
  }

  function hasPaymentValidationIssues() {
    return Boolean(
      paymentModal.querySelector(".option-group.is-error") ||
      paymentModal.querySelector(".customer-field.is-error")
    );
  }

  async function handlePaymentCopy(type) {
    if (!currentOrder) {
      paymentStatus.textContent = "请先生成支付信息。";
      return;
    }

    if (type === "amount") {
      await copyText(currentOrder.payment.payableAmountUsdt, "支付金额已复制。");
      return;
    }

    if (type === "address") {
      await copyText(currentOrder.payment.receivingAddress, "付款地址已复制。");
    }
  }

  async function lookupOrders() {
    const phoneInput = lookupForm.querySelector('input[name="lookupPhone"]');
    const phone = String(phoneInput.value || "").trim();

    if (!phone) {
      lookupAlert.hidden = false;
      lookupAlert.textContent = "请填写手机号。";
      phoneInput.focus();
      return;
    }

    lookupAlert.hidden = true;
    lookupAlert.textContent = "";
    lookupResults.hidden = true;
    lookupEmpty.hidden = true;
    lookupList.innerHTML = "";
    setLookupSubmitState(true);

    try {
      const query = new URLSearchParams();
      query.set("phone", phone);

      const response = await fetchJson(`${API.lookupOrder}?${query.toString()}`, {
        method: "GET",
      });
      renderLookupResults(Array.isArray(response.orders) ? response.orders : []);
    } catch (error) {
      lookupAlert.hidden = false;
      lookupAlert.textContent = getErrorMessage(error, "查询订单失败，请稍后重试。");
    } finally {
      setLookupSubmitState(false);
    }
  }

  function renderLookupResults(orders) {
    lookupResults.hidden = false;
    lookupList.innerHTML = "";

    if (!orders.length) {
      lookupEmpty.hidden = false;
      lookupEmpty.textContent = "未查询到匹配的订单。";
      return;
    }

    lookupEmpty.hidden = true;
    orders.forEach((order) => {
      const article = document.createElement("article");
      article.className = "lookup-order-card";
      article.innerHTML = buildOrderCardHtml(order);
      lookupList.appendChild(article);
    });
  }

  function setPaymentSubmitState(isLoading) {
    paymentSubmitButton.disabled = isLoading;
    paymentSubmitButton.textContent = isLoading ? "生成支付信息中..." : "立即支付";
  }

  function setLookupSubmitState(isLoading) {
    lookupSubmitButton.disabled = isLoading;
    lookupSubmitButton.textContent = isLoading ? "查询中..." : "立即查询";
  }

  function getSelections() {
    const formData = new FormData(paymentForm);
    return {
      bucketColor: String(formData.get("bucketColor") || ""),
      standColor: String(formData.get("standColor") || ""),
      country: String(formData.get("country") || ""),
    };
  }

  function getCustomerInfo() {
    const formData = new FormData(paymentForm);
    return {
      customerName: String(formData.get("customerName") || "").trim(),
      postalCode: String(formData.get("postalCode") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      state: String(formData.get("state") || "").trim(),
      city: String(formData.get("city") || "").trim(),
      streetAddress: String(formData.get("streetAddress") || "").trim(),
      unitNumber: String(formData.get("unitNumber") || "").trim(),
    };
  }

  function getShippingUsd(country) {
    return PAYMENT_CONFIG.shippingUsd[country] || 0;
  }

  function buildChoiceText(values) {
    return `水桶${copy.bucketColor[values.bucketColor]} / 支架${copy.standColor[values.standColor]}`;
  }

  function formatShippingAddress(customer) {
    return [
      `${customer.state} ${customer.city}`,
      customer.streetAddress,
      `门牌号: ${customer.unitNumber}`,
      `邮编: ${customer.postalCode}`,
    ].join("，");
  }

  async function copyText(value, successMessage) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopyText(value);
      }
      paymentStatus.textContent = successMessage;
    } catch (error) {
      fallbackCopyText(value);
      paymentStatus.textContent = successMessage;
    }
  }

  function fallbackCopyText(value) {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
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

  function getErrorMessage(error, fallbackMessage) {
    if (error && error.payload && error.payload.message) {
      return String(error.payload.message);
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallbackMessage;
  }

  function buildOrderCardHtml(order) {
    const trackingHtml = buildTrackingHtml(order.logistics && order.logistics.tracking);
    const waybillNumber = order.logistics && order.logistics.waybillNumber
      ? escapeHtml(order.logistics.waybillNumber)
      : "未录入";

    return `
      <div class="lookup-order-head">
        <div>
          <h3>${escapeHtml(order.id)}</h3>
          <p>${escapeHtml(order.createdAt || "")}</p>
        </div>
        <strong class="lookup-order-state">${escapeHtml(order.paymentStatusText || "待支付")}</strong>
      </div>

      <dl class="payment-detail lookup-order-detail">
        <div>
          <dt>款式</dt>
          <dd>${escapeHtml(order.selectionText)}</dd>
        </div>
        <div>
          <dt>国家</dt>
          <dd>${escapeHtml(order.countryText)}</dd>
        </div>
        <div>
          <dt>客户</dt>
          <dd>${escapeHtml(order.customer.name)}</dd>
        </div>
        <div>
          <dt>联系方式</dt>
          <dd>${escapeHtml(`${order.customer.phone} / ${order.customer.email}`)}</dd>
        </div>
        <div>
          <dt>收货地址</dt>
          <dd>${escapeHtml(formatShippingAddress(order.customer))}</dd>
        </div>
        <div>
          <dt>产品与运费</dt>
          <dd>${escapeHtml(`${order.payment.baseAmountUsd} 美元`)}</dd>
        </div>
        <div>
          <dt>支付金额</dt>
          <dd>${escapeHtml(`${order.payment.payableAmountUsdt} ${order.payment.currency}`)}</dd>
        </div>
        <div>
          <dt>付款地址</dt>
          <dd>${escapeHtml(order.payment.receivingAddress)}</dd>
        </div>
        <div>
          <dt>交易哈希</dt>
          <dd>${escapeHtml(order.paymentTxId || "待确认")}</dd>
        </div>
      </dl>

      <section class="lookup-tracking">
        <div class="lookup-tracking-head">
          <strong>物流信息</strong>
          <span>物流单号：${waybillNumber}</span>
        </div>
        ${trackingHtml}
      </section>
    `;
  }

  function buildTrackingHtml(tracking) {
    if (!tracking || !tracking.available || !Array.isArray(tracking.checkpoints) || !tracking.checkpoints.length) {
      return `<p class="lookup-tracking-empty">暂无物流轨迹</p>`;
    }

    const items = tracking.checkpoints
      .map((checkpoint) => {
        const line = checkpoint.location
          ? `${checkpoint.message} | ${checkpoint.location}`
          : checkpoint.message;
        return `
          <li class="lookup-tracking-item">
            <strong>${escapeHtml(checkpoint.time)}</strong>
            <span>${escapeHtml(line)}</span>
          </li>
        `;
      })
      .join("");

    return `<ol class="lookup-tracking-list">${items}</ol>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createPaymentModal() {
    const modal = document.createElement("div");
    modal.className = "payment-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <button class="payment-backdrop" type="button" data-close-payment aria-label="Close purchase dialog"></button>
      <div class="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <div class="payment-dialog-header">
          <div>
            <h2 id="payment-title">购买 Eco Bucket Aquarium</h2>
            <p>先选择款式并填写客户信息</p>
          </div>
          <button class="modal-close" type="button" data-close-payment aria-label="Close purchase dialog">×</button>
        </div>

        <form class="payment-form" data-payment-form autocomplete="off" novalidate>
          <fieldset class="option-group" data-option-group="bucketColor">
            <legend>水桶颜色</legend>
            <div class="option-grid">
              <label class="option-card">
                <input type="radio" name="bucketColor" value="white">
                <span>白色</span>
              </label>
              <label class="option-card">
                <input type="radio" name="bucketColor" value="lightBlue">
                <span>浅蓝色</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="option-group" data-option-group="standColor">
            <legend>支架颜色</legend>
            <div class="option-grid">
              <label class="option-card">
                <input type="radio" name="standColor" value="white">
                <span>白色</span>
              </label>
              <label class="option-card">
                <input type="radio" name="standColor" value="black">
                <span>黑色</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="option-group" data-option-group="country">
            <legend>国家</legend>
            <div class="option-grid">
              <label class="option-card">
                <input type="radio" name="country" value="usa">
                <span>美国</span>
              </label>
              <label class="option-card">
                <input type="radio" name="country" value="australia">
                <span>澳大利亚</span>
              </label>
            </div>
          </fieldset>

          <section class="customer-section" aria-labelledby="customer-info-title">
            <h3 id="customer-info-title" class="customer-section-title">用户信息</h3>
            <div class="customer-grid">
              <label class="customer-field">
                <span>名字</span>
                <input type="text" name="customerName" autocomplete="off" required>
              </label>
              <label class="customer-field">
                <span>邮编</span>
                <input type="text" name="postalCode" autocomplete="off" required>
              </label>
              <label class="customer-field">
                <span>邮箱</span>
                <input type="email" name="email" autocomplete="off" inputmode="email" required>
              </label>
              <label class="customer-field">
                <span>电话</span>
                <input type="tel" name="phone" autocomplete="off" inputmode="tel" required>
              </label>
              <label class="customer-field">
                <span>省 / 州</span>
                <input type="text" name="state" autocomplete="off" required>
              </label>
              <label class="customer-field">
                <span>城市</span>
                <input type="text" name="city" autocomplete="off" required>
              </label>
              <label class="customer-field full">
                <span>具体地址</span>
                <input type="text" name="streetAddress" autocomplete="off" required>
              </label>
              <label class="customer-field full">
                <span>门牌号</span>
                <input type="text" name="unitNumber" autocomplete="off" required>
              </label>
            </div>
          </section>

          <div class="order-summary" aria-live="polite">
            <span>当前选择：<strong data-order-choice>请选择水桶颜色和支架颜色</strong></span>
            <span>国家：<strong data-order-country>请选择国家</strong></span>
            <span>产品价格：<strong data-product-price>--</strong></span>
            <span>运费：<strong data-shipping-price>--</strong></span>
            <span>支付价格：<strong data-total-price>--</strong></span>
          </div>

          <p class="payment-form-alert" data-form-alert hidden></p>
          <button class="button" type="submit">立即支付</button>
        </form>

        <div class="payment-result" data-payment-result hidden>
          <div class="payment-panel">
            <h3>虚拟货币支付</h3>
            <p class="payment-note" data-payment-note></p>

            <dl class="payment-detail">
              <div>
                <dt>订单号</dt>
                <dd data-order-id></dd>
              </div>
              <div>
                <dt>款式</dt>
                <dd data-order-options></dd>
              </div>
              <div>
                <dt>国家</dt>
                <dd data-order-country-result></dd>
              </div>
              <div>
                <dt>客户</dt>
                <dd data-customer-name></dd>
              </div>
              <div>
                <dt>联系方式</dt>
                <dd data-customer-contact></dd>
              </div>
              <div>
                <dt>收货地址</dt>
                <dd data-shipping-address></dd>
              </div>
              <div>
                <dt>产品与运费</dt>
                <dd data-base-amount></dd>
              </div>
              <div>
                <dt>支付金额</dt>
                <dd data-payment-amount></dd>
              </div>
              <div>
                <dt>付款地址</dt>
                <dd data-payment-address></dd>
              </div>
              <div>
                <dt>支付状态</dt>
                <dd data-payment-state></dd>
              </div>
              <div>
                <dt>交易哈希</dt>
                <dd data-payment-txid></dd>
              </div>
            </dl>

            <div class="payment-copy-grid">
              <button class="button ghost small" type="button" data-copy-field="amount">复制金额</button>
              <button class="button ghost small" type="button" data-copy-field="address">复制付款地址</button>
            </div>

            <p class="payment-status" data-payment-status>请先选择款式并填写客户信息，然后生成专属支付金额。</p>

            <div class="payment-actions">
              <button class="button" type="button" data-confirm-paid>我已支付</button>
            </div>
          </div>
        </div>
      </div>
    `;
    return modal;
  }

  function createLookupModal() {
    const modal = document.createElement("div");
    modal.className = "payment-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <button class="payment-backdrop" type="button" data-close-lookup aria-label="Close order lookup dialog"></button>
      <div class="payment-dialog payment-dialog-wide" role="dialog" aria-modal="true" aria-labelledby="lookup-title">
        <div class="payment-dialog-header">
          <div>
            <h2 id="lookup-title">查询订单</h2>
            <p>填写手机号，查询订单信息和物流信息</p>
          </div>
          <button class="modal-close" type="button" data-close-lookup aria-label="Close order lookup dialog">×</button>
        </div>

        <form class="payment-form lookup-form" data-lookup-form autocomplete="off" novalidate>
          <div class="customer-grid lookup-grid">
            <label class="customer-field">
              <span>手机号</span>
              <input type="tel" name="lookupPhone" autocomplete="off" inputmode="tel">
            </label>
          </div>

          <p class="payment-form-alert" data-lookup-alert hidden></p>
          <button class="button" type="submit">立即查询</button>
        </form>

        <div class="payment-result lookup-results" data-lookup-results hidden>
          <p class="lookup-empty" data-lookup-empty hidden></p>
          <div class="lookup-list" data-lookup-list></div>
        </div>
      </div>
    `;
    return modal;
  }
})();
