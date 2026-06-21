(function () {
  const PAYMENT_CONFIG = {
    productName: "Eco Bucket Aquarium",
    network: "TRON / TRC20-USDT",
    currency: "USDT",
    amount: "请填写金额",
    receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
    paymentLink: "",
    qrImageUrl: "",
    statusApiUrl: "/api/check-payment",
    statusPollMs: 5000,
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
          <p>选择颜色后继续支付。</p>
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
        </div>

        <button class="button" type="submit">立即支付</button>
      </form>

      <div class="payment-result" data-payment-result hidden>
        <div class="payment-panel">
          <h3>虚拟货币支付</h3>
          <dl class="payment-detail">
            <div>
              <dt>订单号</dt>
              <dd data-order-id></dd>
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
          <div class="payment-qr" data-payment-qr>等待配置二维码</div>
          <a class="payment-link" data-payment-link href="#" target="_blank" rel="noreferrer" hidden>打开支付链接</a>
          <p class="payment-status" data-payment-status>请完成转账。付款后系统会自动查询支付状态。</p>
          <div class="payment-actions">
            <button class="button" type="button" data-check-payment>我已支付，立即查询</button>
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
  const paymentAmount = modal.querySelector("[data-payment-amount]");
  const paymentAddress = modal.querySelector("[data-payment-address]");
  const paymentQr = modal.querySelector("[data-payment-qr]");
  const paymentLink = modal.querySelector("[data-payment-link]");
  const paymentStatus = modal.querySelector("[data-payment-status]");
  const checkPaymentButton = modal.querySelector("[data-check-payment]");

  buyButton.addEventListener("click", openModal);

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-payment]")) {
      closeModal();
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
    const values = getSelections();
    choice.textContent = `水桶${copy.bucketColor[values.bucketColor]} / 支架${copy.standColor[values.standColor]}`;
  }

  function startPayment() {
    const selections = getSelections();
    currentOrder = {
      id: createOrderId(),
      productName: PAYMENT_CONFIG.productName,
      bucketColor: selections.bucketColor,
      standColor: selections.standColor,
      createdAt: new Date().toISOString(),
    };

    orderId.textContent = currentOrder.id;
    paymentAmount.textContent = `${PAYMENT_CONFIG.amount} ${PAYMENT_CONFIG.currency}`;
    paymentAddress.textContent = PAYMENT_CONFIG.receivingAddress;
    paymentStatus.textContent = "请完成转账。付款后系统会自动查询支付状态。";
    renderPaymentTarget();

    result.hidden = false;
    result.scrollIntoView({ block: "nearest", behavior: "smooth" });
    startPolling();
  }

  function renderPaymentTarget() {
    paymentQr.innerHTML = "";
    paymentLink.hidden = true;

    if (PAYMENT_CONFIG.qrImageUrl) {
      const image = document.createElement("img");
      image.src = PAYMENT_CONFIG.qrImageUrl;
      image.alt = "虚拟货币支付二维码";
      image.loading = "lazy";
      paymentQr.appendChild(image);
    } else {
      paymentQr.textContent = "等待配置二维码";
    }

    if (PAYMENT_CONFIG.paymentLink) {
      paymentLink.href = PAYMENT_CONFIG.paymentLink;
      paymentLink.hidden = false;
    }
  }

  function startPolling() {
    stopPolling();
    if (!PAYMENT_CONFIG.statusApiUrl) {
      paymentStatus.textContent = "支付状态查询接口尚未配置。配置 Cloudflare Worker 或波场 API 后即可自动查询。";
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

    if (!PAYMENT_CONFIG.statusApiUrl) {
      paymentStatus.textContent = "支付状态查询接口尚未配置。请先填入波场查询 API 或 Cloudflare Worker 地址。";
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
      url.searchParams.set("amount", PAYMENT_CONFIG.amount);
      url.searchParams.set("currency", PAYMENT_CONFIG.currency);

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
        paymentStatus.textContent = "支付已确认，我们会尽快处理订单。";
      } else {
        paymentStatus.textContent = data.message || "暂未查询到到账记录，请稍后再试。";
      }
    } catch (error) {
      paymentStatus.textContent = "支付状态查询失败，请稍后重试。";
    } finally {
      checkPaymentButton.disabled = false;
    }
  }

  function getSelections() {
    const formData = new FormData(form);
    return {
      bucketColor: formData.get("bucketColor") || "white",
      standColor: formData.get("standColor") || "white",
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
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `AQ${stamp}${random}`;
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
