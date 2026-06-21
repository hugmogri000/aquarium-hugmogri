(function () {
  const PAYMENT_CONFIG = {
    productName: "Eco Bucket Aquarium",
    merchantName: "Hugmogri",
    network: "TRON / TRC20-USDT",
    currency: "USDT",
    baseAmount: "208",
    receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
    paymentTip: "请复制金额与地址后完成转账，并保留订单号，后续可用于查询订单。",
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
  };

  let currentOrder = null;

  const buyButton = document.querySelector("[data-buy-now]");
  const orderLookupButton = document.querySelector("[data-order-lookup]");
  if (!buyButton) {
    return;
  }

  const modal = document.createElement("div");
  modal.className = "payment-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <button class="payment-backdrop" type="button" data-close-payment aria-label="Close purchase dialog"></button>
    <div class="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
      <div class="payment-dialog-header">
        <div>
          <h2 id="payment-title">购买 Eco Bucket Aquarium</h2>
          <p>先选择款式并填写客户信息，再生成支付信息。</p>
        </div>
        <button class="modal-close" type="button" data-close-payment aria-label="Close purchase dialog">×</button>
      </div>

      <form class="payment-form" data-payment-form novalidate>
        <fieldset class="option-group">
          <legend>水桶颜色</legend>
          <div class="option-grid">
            <label class="option-card">
              <input type="radio" name="bucketColor" value="white" checked>
              <span>白色</span>
            </label>
            <label class="option-card">
              <input type="radio" name="bucketColor" value="lightBlue">
              <span>浅蓝色</span>
            </label>
          </div>
        </fieldset>

        <fieldset class="option-group">
          <legend>支架颜色</legend>
          <div class="option-grid">
            <label class="option-card">
              <input type="radio" name="standColor" value="white" checked>
              <span>白色</span>
            </label>
            <label class="option-card">
              <input type="radio" name="standColor" value="black">
              <span>黑色</span>
            </label>
          </div>
        </fieldset>

        <section class="customer-section" aria-labelledby="customer-info-title">
          <h3 id="customer-info-title" class="customer-section-title">用户信息</h3>
          <div class="customer-grid">
            <label class="customer-field">
              <span>名字</span>
              <input type="text" name="customerName" autocomplete="name" required>
            </label>
            <label class="customer-field">
              <span>邮编</span>
              <input type="text" name="postalCode" autocomplete="postal-code" required>
            </label>
            <label class="customer-field">
              <span>邮箱</span>
              <input type="email" name="email" autocomplete="email" inputmode="email" required>
            </label>
            <label class="customer-field">
              <span>电话</span>
              <input type="tel" name="phone" autocomplete="tel" inputmode="tel" required>
            </label>
            <label class="customer-field">
              <span>省 / 州</span>
              <input type="text" name="state" autocomplete="address-level1" required>
            </label>
            <label class="customer-field">
              <span>城市</span>
              <input type="text" name="city" autocomplete="address-level2" required>
            </label>
            <label class="customer-field full">
              <span>具体地址</span>
              <input type="text" name="streetAddress" autocomplete="street-address" required>
            </label>
            <label class="customer-field full">
              <span>门牌号</span>
              <input type="text" name="unitNumber" autocomplete="address-line2" required>
            </label>
          </div>
        </section>

        <div class="order-summary" aria-live="polite">
          <span>当前选择：<strong data-order-choice>水桶白色 / 支架白色</strong></span>
          <span>支付网络：<strong>${escapeHtml(PAYMENT_CONFIG.network)}</strong></span>
          <span>支付价格：<strong>${escapeHtml(PAYMENT_CONFIG.baseAmount)} ${escapeHtml(PAYMENT_CONFIG.currency)}</strong></span>
        </div>

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
              <dt>支付金额</dt>
              <dd data-payment-amount></dd>
            </div>
            <div>
              <dt>收款地址</dt>
              <dd data-payment-address></dd>
            </div>
          </dl>

          <div class="payment-copy-grid">
            <button class="button ghost small" type="button" data-copy-field="amount">复制金额</button>
            <button class="button ghost small" type="button" data-copy-field="address">复制地址</button>
          </div>

          <p class="payment-status" data-payment-status>请复制金额和地址完成转账。付款完成后点击“我已支付”关闭窗口。</p>

          <div class="payment-actions">
            <button class="button" type="button" data-confirm-paid>我已支付</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const form = modal.querySelector("[data-payment-form]");
  const result = modal.querySelector("[data-payment-result]");
  const choice = modal.querySelector("[data-order-choice]");
  const orderId = modal.querySelector("[data-order-id]");
  const orderOptions = modal.querySelector("[data-order-options]");
  const customerName = modal.querySelector("[data-customer-name]");
  const customerContact = modal.querySelector("[data-customer-contact]");
  const shippingAddress = modal.querySelector("[data-shipping-address]");
  const paymentAmount = modal.querySelector("[data-payment-amount]");
  const paymentAddress = modal.querySelector("[data-payment-address]");
  const paymentStatus = modal.querySelector("[data-payment-status]");
  const paymentNote = modal.querySelector("[data-payment-note]");
  const paidButton = modal.querySelector("[data-confirm-paid]");

  buyButton.addEventListener("click", openModal);

  if (orderLookupButton) {
    orderLookupButton.addEventListener("click", () => {
      window.alert("查询订单功能下一步接入。");
    });
  }

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-payment]")) {
      closeModal();
      return;
    }

    const copyButton = event.target.closest("[data-copy-field]");
    if (copyButton) {
      handleCopy(copyButton.dataset.copyField || "");
    }
  });

  modal.addEventListener("change", (event) => {
    if (event.target.name === "bucketColor" || event.target.name === "standColor") {
      updateChoice();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    startPayment();
  });

  paidButton.addEventListener("click", () => {
    closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });

  function openModal() {
    modal.hidden = false;
    document.body.classList.add("modal-lock");
    resetGeneratedPayment();
    updateChoice();
    window.setTimeout(() => {
      modal.querySelector("input[name='bucketColor']:checked").focus();
    }, 0);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-lock");
    resetGeneratedPayment();
    buyButton.focus();
  }

  function resetGeneratedPayment() {
    currentOrder = null;
    result.hidden = true;
    paymentNote.textContent = "";
    paymentStatus.textContent = "请复制金额和地址完成转账。付款完成后点击“我已支付”关闭窗口。";
  }

  function updateChoice() {
    choice.textContent = buildChoiceText(getSelections());
  }

  function startPayment() {
    if (!form.reportValidity()) {
      return;
    }

    const selections = getSelections();
    const customer = getCustomerInfo();

    currentOrder = {
      id: createOrderId(),
      productName: PAYMENT_CONFIG.productName,
      bucketColor: selections.bucketColor,
      standColor: selections.standColor,
      selectionText: buildChoiceText(selections),
      invoiceAmount: PAYMENT_CONFIG.baseAmount,
      customer,
      shippingText: buildShippingText(customer),
    };

    orderId.textContent = currentOrder.id;
    orderOptions.textContent = currentOrder.selectionText;
    customerName.textContent = currentOrder.customer.customerName;
    customerContact.textContent = `${currentOrder.customer.phone} / ${currentOrder.customer.email}`;
    shippingAddress.textContent = currentOrder.shippingText;
    paymentAmount.textContent = `${currentOrder.invoiceAmount} ${PAYMENT_CONFIG.currency}`;
    paymentAddress.textContent = PAYMENT_CONFIG.receivingAddress;
    paymentNote.textContent = PAYMENT_CONFIG.paymentTip;
    paymentStatus.textContent = "请复制金额和地址完成转账。付款完成后点击“我已支付”关闭窗口。";

    result.hidden = false;
    result.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function handleCopy(type) {
    if (!currentOrder) {
      paymentStatus.textContent = "请先填写信息并生成支付内容。";
      return;
    }

    if (type === "amount") {
      copyText(currentOrder.invoiceAmount, "支付金额已复制。");
      return;
    }

    if (type === "address") {
      copyText(PAYMENT_CONFIG.receivingAddress, "收款地址已复制。");
    }
  }

  function getSelections() {
    const formData = new FormData(form);
    return {
      bucketColor: formData.get("bucketColor") || "white",
      standColor: formData.get("standColor") || "white",
    };
  }

  function getCustomerInfo() {
    const formData = new FormData(form);
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

  function buildChoiceText(values) {
    return `水桶${copy.bucketColor[values.bucketColor]} / 支架${copy.standColor[values.standColor]}`;
  }

  function buildShippingText(customer) {
    return [
      `${customer.state} ${customer.city}`,
      customer.streetAddress,
      `门牌号: ${customer.unitNumber}`,
      `邮编: ${customer.postalCode}`,
    ].join("，");
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
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `AQ${stamp}${random}`;
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

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
