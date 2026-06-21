(function () {
  const PAYMENT_CONFIG = {
    productName: "Eco Bucket Aquarium",
    merchantName: "Hugmogri",
    network: "TRON / TRC20-USDT",
    currency: "USDT",
    baseAmount: "50.000",
    receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
    paymentLink: "",
    qrImageUrl: "",
    qrServiceUrl: "https://api.qrserver.com/v1/create-qr-code/",
    statusApiUrl: "/api/check-payment",
    statusPollMs: 5000,
    paymentTip: "请使用 TRC20-USDT 向下方地址转账，并保持支付金额与订单金额完全一致。",
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

  const PREVIEW_STATUS = new URLSearchParams(window.location.search).get("payment");
  const IS_FILE_PREVIEW = window.location.protocol === "file:";

  let currentOrder = null;
  let pollTimer = null;

  const buyButton = document.querySelector("[data-buy-now]");
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
          <p>选择款式后生成订单与付款信息。</p>
        </div>
        <button class="modal-close" type="button" data-close-payment aria-label="Close purchase dialog">×</button>
      </div>

      <form class="payment-form" data-payment-form>
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

        <div class="order-summary" aria-live="polite">
          <span>当前选择：<strong data-order-choice>水桶白色 / 支架白色</strong></span>
          <span>支付网络：<strong>${escapeHtml(PAYMENT_CONFIG.network)}</strong></span>
          <span>基础价格：<strong>${escapeHtml(PAYMENT_CONFIG.baseAmount)} ${escapeHtml(PAYMENT_CONFIG.currency)}</strong></span>
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
            <button class="button ghost small" type="button" data-copy-field="summary">复制订单信息</button>
          </div>

          <div class="payment-qr-wrap">
            <div class="payment-qr" data-payment-qr>正在生成二维码...</div>
            <p class="payment-qr-caption">可扫码查看付款信息，也可复制地址与金额手动转账。</p>
          </div>

          <a class="payment-link" data-payment-link href="#" target="_blank" rel="noreferrer" hidden></a>
          <p class="payment-preview-hint" data-preview-hint hidden></p>
          <p class="payment-status" data-payment-status>请完成转账。付款后系统会自动查询支付状态。</p>

          <div class="payment-actions">
            <button class="button" type="button" data-check-payment>我已支付，立即查询</button>
            <button class="button ghost" type="button" data-close-payment>关闭</button>
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
  const paymentAmount = modal.querySelector("[data-payment-amount]");
  const paymentAddress = modal.querySelector("[data-payment-address]");
  const paymentQr = modal.querySelector("[data-payment-qr]");
  const paymentLink = modal.querySelector("[data-payment-link]");
  const paymentStatus = modal.querySelector("[data-payment-status]");
  const paymentNote = modal.querySelector("[data-payment-note]");
  const previewHint = modal.querySelector("[data-preview-hint]");
  const checkPaymentButton = modal.querySelector("[data-check-payment]");

  buyButton.addEventListener("click", openModal);

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

  checkPaymentButton.addEventListener("click", () => {
    checkPaymentStatus({ manual: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });

  function openModal() {
    modal.hidden = false;
    document.body.classList.add("modal-lock");
    updateChoice();
    window.setTimeout(() => {
      modal.querySelector("input[name='bucketColor']:checked").focus();
    }, 0);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-lock");
    stopPolling();
    buyButton.focus();
  }

  function updateChoice() {
    choice.textContent = buildChoiceText(getSelections());
  }

  function startPayment() {
    const selections = getSelections();
    currentOrder = {
      id: createOrderId(),
      productName: PAYMENT_CONFIG.productName,
      bucketColor: selections.bucketColor,
      standColor: selections.standColor,
      selectionText: buildChoiceText(selections),
      createdAt: new Date().toISOString(),
    };
    currentOrder.invoiceAmount = createInvoiceAmount(currentOrder.id, PAYMENT_CONFIG.baseAmount);
    currentOrder.referenceText = createReferenceText(currentOrder);
    currentOrder.addressUrl = PAYMENT_CONFIG.paymentLink || buildAddressUrl(PAYMENT_CONFIG.receivingAddress);

    orderId.textContent = currentOrder.id;
    orderOptions.textContent = currentOrder.selectionText;
    paymentAmount.textContent = `${currentOrder.invoiceAmount} ${PAYMENT_CONFIG.currency}`;
    paymentAddress.textContent = PAYMENT_CONFIG.receivingAddress;
    paymentNote.textContent = PAYMENT_CONFIG.paymentTip;
    paymentStatus.textContent = "请完成转账。付款后系统会自动查询支付状态。";
    previewHint.hidden = true;

    renderPaymentTarget();
    result.hidden = false;
    result.scrollIntoView({ block: "nearest", behavior: "smooth" });
    startPolling();
  }

  function renderPaymentTarget() {
    paymentQr.innerHTML = "";
    paymentLink.hidden = true;

    const image = document.createElement("img");
    image.alt = "虚拟货币支付二维码";
    image.loading = "lazy";
    image.decoding = "async";
    image.src = PAYMENT_CONFIG.qrImageUrl || buildGeneratedQrUrl(currentOrder.referenceText);
    image.addEventListener("error", () => {
      paymentQr.textContent = "二维码加载失败，请复制地址和金额后手动转账。";
    });
    paymentQr.appendChild(image);

    if (currentOrder.addressUrl) {
      paymentLink.href = currentOrder.addressUrl;
      paymentLink.textContent = PAYMENT_CONFIG.paymentLink ? "打开支付链接" : "查看收款地址";
      paymentLink.hidden = false;
    }
  }

  function startPolling() {
    stopPolling();

    if (IS_FILE_PREVIEW) {
      paymentStatus.textContent = "当前是 file:// 本地文件预览，支付状态查询不会运行。请使用本地预览地址 http://127.0.0.1:4190/ 或线上域名测试。";
      previewHint.hidden = false;
      previewHint.textContent = "本地文件模式下没有 /api/check-payment。";
      return;
    }

    if (!PAYMENT_CONFIG.statusApiUrl) {
      paymentStatus.textContent = "支付状态查询接口尚未配置。配置 Cloudflare Pages Function 后即可自动查询。";
      return;
    }

    checkPaymentStatus({ manual: false });
    pollTimer = window.setInterval(() => {
      checkPaymentStatus({ manual: false });
    }, PAYMENT_CONFIG.statusPollMs);
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function checkPaymentStatus({ manual }) {
    if (!currentOrder) {
      return;
    }

    if (IS_FILE_PREVIEW) {
      paymentStatus.textContent = "请切换到 http://127.0.0.1:4190/ 或线上域名，才能测试支付状态查询。";
      return;
    }

    if (!PAYMENT_CONFIG.statusApiUrl) {
      paymentStatus.textContent = "支付状态查询接口尚未配置。请先完成 Cloudflare Pages Function 配置。";
      return;
    }

    checkPaymentButton.disabled = true;
    if (manual) {
      paymentStatus.textContent = "正在查询支付状态...";
    }

    try {
      const url = new URL(PAYMENT_CONFIG.statusApiUrl, window.location.href);
      url.searchParams.set("orderId", currentOrder.id);
      url.searchParams.set("bucketColor", currentOrder.bucketColor);
      url.searchParams.set("standColor", currentOrder.standColor);
      url.searchParams.set("address", PAYMENT_CONFIG.receivingAddress);
      url.searchParams.set("amount", currentOrder.invoiceAmount);
      url.searchParams.set("currency", PAYMENT_CONFIG.currency);
      url.searchParams.set("createdAt", currentOrder.createdAt);
      if (PREVIEW_STATUS) {
        url.searchParams.set("preview", PREVIEW_STATUS);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }

      const data = await response.json();
      if (data.configured === false) {
        paymentStatus.textContent = data.message || "支付状态查询接口尚未配置。";
        return;
      }

      const isPaid = data.paid === true || data.status === "paid" || data.status === "success";
      if (isPaid) {
        stopPolling();
        paymentStatus.textContent = data.message || "支付已确认，我们会尽快处理订单。";
      } else {
        paymentStatus.textContent = data.message || "暂未查询到到账记录，请稍后再试。";
      }
    } catch (error) {
      paymentStatus.textContent = "支付状态查询失败，请稍后重试。";
    } finally {
      checkPaymentButton.disabled = false;
    }
  }

  function handleCopy(type) {
    if (!currentOrder) {
      paymentStatus.textContent = "请先生成订单，再复制付款信息。";
      return;
    }

    if (type === "amount") {
      copyText(currentOrder.invoiceAmount, "支付金额已复制。");
      return;
    }

    if (type === "address") {
      copyText(PAYMENT_CONFIG.receivingAddress, "收款地址已复制。");
      return;
    }

    if (type === "summary") {
      copyText(currentOrder.referenceText, "订单支付信息已复制。");
    }
  }

  function getSelections() {
    const formData = new FormData(form);
    return {
      bucketColor: formData.get("bucketColor") || "white",
      standColor: formData.get("standColor") || "white",
    };
  }

  function buildChoiceText(values) {
    return `水桶${copy.bucketColor[values.bucketColor]} / 支架${copy.standColor[values.standColor]}`;
  }

  function createReferenceText(order) {
    return [
      `${PAYMENT_CONFIG.merchantName} ${PAYMENT_CONFIG.productName}`,
      `订单号: ${order.id}`,
      `款式: ${order.selectionText}`,
      `网络: ${PAYMENT_CONFIG.network}`,
      `金额: ${order.invoiceAmount} ${PAYMENT_CONFIG.currency}`,
      `地址: ${PAYMENT_CONFIG.receivingAddress}`,
    ].join("\n");
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

  function createInvoiceAmount(orderId, baseAmount) {
    const normalizedBase = Number.parseFloat(baseAmount);
    if (!Number.isFinite(normalizedBase)) {
      return baseAmount;
    }

    let hash = 0;
    for (let index = 0; index < orderId.length; index += 1) {
      hash = (hash * 31 + orderId.charCodeAt(index)) % 899;
    }

    const offset = (hash + 1) / 1000;
    return (normalizedBase + offset).toFixed(3);
  }

  function buildGeneratedQrUrl(text) {
    const query = new URLSearchParams({
      size: "240x240",
      format: "png",
      margin: "12",
      data: text,
    });
    return `${PAYMENT_CONFIG.qrServiceUrl}?${query.toString()}`;
  }

  function buildAddressUrl(address) {
    return `https://tronscan.org/#/address/${encodeURIComponent(address)}`;
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
