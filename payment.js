(function () {
  const API = {
    createOrder: "/api/create-order",
    lookupOrder: "/api/order-lookup",
    trackOrder: "/api/track-order",
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
    displayRange: {
      usa: "206.0-207.9 USDT",
      australia: "156.0-157.9 USDT",
    },
    receivingAddress: "TAVdxDuCmXGHnvcHsamw68mTUXSkD8Pp7d",
    paymentTip: "Pay the exact amount shown below. Each order is matched by its dedicated amount.",
  };

  const copy = {
    bucketColor: {
      white: "White",
      lightBlue: "Light blue",
    },
    standColor: {
      white: "White",
      black: "Black",
    },
    country: {
      usa: "USA",
      australia: "Australia",
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
  const paymentPriceRange = paymentModal.querySelector("[data-price-range]");
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
    if (["bucketColor", "standColor", "country"].includes(event.target.name)) {
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

  paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createOrderAndShowPayment();
  });

  paymentCopyButtons.forEach((button) => {
    button.addEventListener("click", () => handlePaymentCopy(button.dataset.copyField || ""));
  });

  lookupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await lookupOrders();
  });

  lookupList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-track-order]");
    if (!button) return;
    await handleTrackLogistics(button);
  });

  paidButton.addEventListener("click", closePaymentModal);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
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
    paymentStatus.textContent = "Select options and fill in customer information first.";
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
    Object.values(paymentOptionGroups).forEach((group) => group.classList.remove("is-error"));
    paymentCustomerFields.forEach((field) => {
      field.classList.remove("is-error");
      field.querySelector("input").removeAttribute("aria-invalid");
    });
  }

  function updatePaymentSummary() {
    const selections = getSelections();
    const hasColors = Boolean(selections.bucketColor && selections.standColor);
    const hasCountry = Boolean(selections.country);
    const shipping = hasCountry ? getShippingUsd(selections.country) : null;
    const total = hasCountry ? PAYMENT_CONFIG.productPriceUsd + shipping : null;

    paymentChoice.textContent = hasColors ? buildChoiceText(selections) : "Choose bucket and stand color";
    paymentCountrySummary.textContent = hasCountry ? copy.country[selections.country] : "Choose country";
    paymentProductPrice.textContent = `${PAYMENT_CONFIG.productPriceUsd} USD`;
    paymentShippingPrice.textContent = hasCountry ? `${shipping} USD` : "--";
    paymentTotalPrice.textContent = total === null ? "--" : `${total} USD`;
    paymentPriceRange.textContent = hasCountry ? PAYMENT_CONFIG.displayRange[selections.country] : "--";
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
        headers: { "Content-Type": "application/json; charset=utf-8" },
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
      paymentFormAlert.textContent = getErrorMessage(error, "Failed to create order.");
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
    paymentResultFields.baseAmount.textContent = `${order.payment.baseAmountUsd} USD`;
    paymentResultFields.paymentAmount.textContent = `${order.payment.payableAmountUsdt} ${order.payment.currency}`;
    paymentResultFields.paymentAddress.textContent = order.payment.receivingAddress;
    paymentResultFields.paymentState.textContent = order.paymentStatusText || order.paymentStatus || "Pending";
    paymentResultFields.paymentTxId.textContent = order.paymentTxId || "";
    paymentNote.textContent = `${PAYMENT_CONFIG.paymentTip} Base price is ${order.payment.baseAmountUsd} USD. Your dedicated payment amount is ${order.payment.payableAmountUsdt} ${order.payment.currency}.`;
    paymentStatus.textContent = "Copy the payment amount and wallet address, complete the transfer, then click I have paid.";
  }

  function validatePaymentForm() {
    clearPaymentValidationState();
    const selections = getSelections();
    const issues = [];
    let focusTarget = null;

    if (!selections.bucketColor) {
      issues.push("bucket color");
      paymentOptionGroups.bucketColor.classList.add("is-error");
      focusTarget = focusTarget || paymentModal.querySelector('input[name="bucketColor"]');
    }

    if (!selections.standColor) {
      issues.push("stand color");
      paymentOptionGroups.standColor.classList.add("is-error");
      focusTarget = focusTarget || paymentModal.querySelector('input[name="standColor"]');
    }

    if (!selections.country) {
      issues.push("country");
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
        issues.push(`${label} format`);
        field.classList.add("is-error");
        input.setAttribute("aria-invalid", "true");
        focusTarget = focusTarget || input;
      }
    });

    if (!issues.length) {
      return { valid: true, message: "", focusTarget: null };
    }

    return {
      valid: false,
      message: `Please complete: ${issues.join(", ")}`,
      focusTarget,
    };
  }

  function hasPaymentValidationIssues() {
    return Boolean(paymentModal.querySelector(".option-group.is-error, .customer-field.is-error"));
  }

  async function handlePaymentCopy(type) {
    if (!currentOrder) {
      paymentStatus.textContent = "Generate payment information first.";
      return;
    }

    if (type === "amount") {
      await copyText(currentOrder.payment.payableAmountUsdt, "Payment amount copied.");
      return;
    }

    if (type === "address") {
      await copyText(currentOrder.payment.receivingAddress, "Payment address copied.");
    }
  }

  async function lookupOrders() {
    const phoneInput = lookupForm.querySelector('input[name="lookupPhone"]');
    const phone = String(phoneInput.value || "").trim();

    if (!phone) {
      lookupAlert.hidden = false;
      lookupAlert.textContent = "Phone is required.";
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
      const response = await fetchJson(`${API.lookupOrder}?${query.toString()}`, { method: "GET" });
      renderLookupResults(Array.isArray(response.orders) ? response.orders : []);
    } catch (error) {
      lookupAlert.hidden = false;
      lookupAlert.textContent = getErrorMessage(error, "Failed to load orders.");
    } finally {
      setLookupSubmitState(false);
    }
  }

  function renderLookupResults(orders) {
    lookupResults.hidden = false;
    lookupList.innerHTML = "";

    if (!orders.length) {
      lookupEmpty.hidden = false;
      lookupEmpty.textContent = "No matching orders found.";
      return;
    }

    lookupEmpty.hidden = true;
    orders.forEach((order) => {
      const article = document.createElement("article");
      article.className = "lookup-order-card";
      article.dataset.orderId = order.id;
      article.innerHTML = buildOrderCardHtml(order);
      lookupList.appendChild(article);
    });
  }

  function setPaymentSubmitState(isLoading) {
    paymentSubmitButton.disabled = isLoading;
    paymentSubmitButton.textContent = isLoading ? "Creating..." : "Pay now";
  }

  function setLookupSubmitState(isLoading) {
    lookupSubmitButton.disabled = isLoading;
    lookupSubmitButton.textContent = isLoading ? "Loading..." : "Search order";
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
    return `Bucket ${copy.bucketColor[values.bucketColor]} / Stand ${copy.standColor[values.standColor]}`;
  }

  function formatShippingAddress(customer) {
    return [
      `${customer.state} ${customer.city}`,
      customer.streetAddress,
      `Unit ${customer.unitNumber}`,
      `Postal ${customer.postalCode}`,
    ].join(", ");
  }

  async function copyText(value, successMessage) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopyText(value);
      }
      paymentStatus.textContent = successMessage;
    } catch {
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
      : "No waybill";
    const trackButtonDisabled = !(order.logistics && order.logistics.waybillNumber) ? "disabled" : "";

    return `
      <div class="lookup-order-head">
        <div>
          <h3>${escapeHtml(order.id)}</h3>
          <p>${escapeHtml(formatDateTime(order.createdAt || ""))}</p>
        </div>
        <strong class="lookup-order-state">${escapeHtml(order.paymentStatusText || "Pending")}</strong>
      </div>

      <dl class="payment-detail lookup-order-detail">
        <div><dt>Options</dt><dd>${escapeHtml(order.selectionText)}</dd></div>
        <div><dt>Country</dt><dd>${escapeHtml(order.countryText)}</dd></div>
        <div><dt>Customer</dt><dd>${escapeHtml(order.customer.name)}</dd></div>
        <div><dt>Contact</dt><dd>${escapeHtml(`${order.customer.phone} / ${order.customer.email}`)}</dd></div>
        <div><dt>Address</dt><dd>${escapeHtml(formatShippingAddress(order.customer))}</dd></div>
        <div><dt>Base price</dt><dd>${escapeHtml(`${order.payment.baseAmountUsd} USD`)}</dd></div>
        <div><dt>Payable</dt><dd>${escapeHtml(`${order.payment.payableAmountUsdt} ${order.payment.currency}`)}</dd></div>
        <div><dt>Wallet</dt><dd>${escapeHtml(order.payment.receivingAddress)}</dd></div>
        <div><dt>Tx hash</dt><dd>${escapeHtml(order.paymentTxId || "")}</dd></div>
      </dl>

      <section class="lookup-waybill-panel">
        <div class="lookup-waybill-head">
          <strong>Waybill number</strong>
          <button class="button ghost small" type="button" data-track-order ${trackButtonDisabled}>Track logistics</button>
        </div>
        <p class="lookup-waybill-number">${waybillNumber}</p>
      </section>

      <section class="lookup-tracking">
        <div class="lookup-tracking-head">
          <strong>Logistics tracking</strong>
        </div>
        ${trackingHtml}
      </section>
    `;
  }

  async function handleTrackLogistics(button) {
    const card = button.closest("[data-order-id]");
    if (!card) {
      return;
    }

    const orderId = String(card.dataset.orderId || "").trim();
    if (!orderId) {
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Loading...";

    try {
      const query = new URLSearchParams();
      query.set("orderId", orderId);
      const response = await fetchJson(`${API.trackOrder}?${query.toString()}`, { method: "GET" });
      card.innerHTML = buildOrderCardHtml(response.order);
    } catch (error) {
      lookupAlert.hidden = false;
      lookupAlert.textContent = getErrorMessage(error, "Failed to load logistics tracking.");
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function buildTrackingHtml(tracking) {
    if (!tracking || !tracking.available || !Array.isArray(tracking.checkpoints) || !tracking.checkpoints.length) {
      const message = tracking && tracking.message ? tracking.message : "No tracking yet.";
      return `<p class="lookup-tracking-empty">${escapeHtml(message)}</p>`;
    }

    const items = tracking.checkpoints
      .map((checkpoint) => `
        <li class="lookup-tracking-item">
          <strong>${escapeHtml(checkpoint.time || "")}</strong>
          <span>${escapeHtml(checkpoint.message || "")}</span>
        </li>
      `)
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

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
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
            <h2 id="payment-title">Buy Eco Bucket Aquarium</h2>
            <p>Select options and fill in customer information first.</p>
          </div>
          <button class="modal-close" type="button" data-close-payment aria-label="Close purchase dialog">x</button>
        </div>

        <form class="payment-form" data-payment-form autocomplete="off" novalidate>
          <fieldset class="option-group" data-option-group="bucketColor">
            <legend>Bucket color</legend>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="bucketColor" value="white"><span>White</span></label>
              <label class="option-card"><input type="radio" name="bucketColor" value="lightBlue"><span>Light blue</span></label>
            </div>
          </fieldset>

          <fieldset class="option-group" data-option-group="standColor">
            <legend>Stand color</legend>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="standColor" value="white"><span>White</span></label>
              <label class="option-card"><input type="radio" name="standColor" value="black"><span>Black</span></label>
            </div>
          </fieldset>

          <fieldset class="option-group" data-option-group="country">
            <legend>Country</legend>
            <div class="option-grid">
              <label class="option-card"><input type="radio" name="country" value="usa"><span>USA</span></label>
              <label class="option-card"><input type="radio" name="country" value="australia"><span>Australia</span></label>
            </div>
          </fieldset>

          <section class="customer-section" aria-labelledby="customer-info-title">
            <h3 id="customer-info-title" class="customer-section-title">Customer information</h3>
            <div class="customer-grid">
              <label class="customer-field"><span>Name</span><input type="text" name="customerName" required></label>
              <label class="customer-field"><span>Postal code</span><input type="text" name="postalCode" required></label>
              <label class="customer-field"><span>Email</span><input type="email" name="email" inputmode="email" required></label>
              <label class="customer-field"><span>Phone</span><input type="tel" name="phone" inputmode="tel" required></label>
              <label class="customer-field"><span>State / Province</span><input type="text" name="state" required></label>
              <label class="customer-field"><span>City</span><input type="text" name="city" required></label>
              <label class="customer-field full"><span>Street address</span><input type="text" name="streetAddress" required></label>
              <label class="customer-field full"><span>Unit number</span><input type="text" name="unitNumber" required></label>
            </div>
          </section>

          <div class="order-summary" aria-live="polite">
            <span>Selection: <strong data-order-choice>Choose bucket and stand color</strong></span>
            <span>Country: <strong data-order-country>Choose country</strong></span>
            <span>Product price: <strong data-product-price>58 USD</strong></span>
            <span>Shipping: <strong data-shipping-price>--</strong></span>
            <span>Base total: <strong data-total-price>--</strong></span>
            <span>Payment range: <strong data-price-range>--</strong></span>
          </div>

          <p class="payment-form-alert" data-form-alert hidden></p>
          <button class="button" type="submit">Pay now</button>
        </form>

        <div class="payment-result" data-payment-result hidden>
          <div class="payment-panel">
            <h3>Crypto payment</h3>
            <p class="payment-note" data-payment-note></p>
            <dl class="payment-detail">
              <div><dt>Order ID</dt><dd data-order-id></dd></div>
              <div><dt>Options</dt><dd data-order-options></dd></div>
              <div><dt>Country</dt><dd data-order-country-result></dd></div>
              <div><dt>Customer</dt><dd data-customer-name></dd></div>
              <div><dt>Contact</dt><dd data-customer-contact></dd></div>
              <div><dt>Address</dt><dd data-shipping-address></dd></div>
              <div><dt>Base price</dt><dd data-base-amount></dd></div>
              <div><dt>Payable amount</dt><dd data-payment-amount></dd></div>
              <div><dt>Payment address</dt><dd data-payment-address></dd></div>
              <div><dt>Payment state</dt><dd data-payment-state></dd></div>
              <div><dt>Tx hash</dt><dd data-payment-txid></dd></div>
            </dl>
            <div class="payment-copy-grid">
              <button class="button ghost small" type="button" data-copy-field="amount">Copy amount</button>
              <button class="button ghost small" type="button" data-copy-field="address">Copy payment address</button>
            </div>
            <p class="payment-status" data-payment-status>Select options and fill in customer information first.</p>
            <div class="payment-actions">
              <button class="button" type="button" data-confirm-paid>I have paid</button>
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
            <h2 id="lookup-title">Search order</h2>
            <p>Enter your phone number to view payment and logistics information.</p>
          </div>
          <button class="modal-close" type="button" data-close-lookup aria-label="Close order lookup dialog">x</button>
        </div>

        <form class="payment-form lookup-form" data-lookup-form autocomplete="off" novalidate>
          <div class="customer-grid lookup-grid">
            <label class="customer-field">
              <span>Phone</span>
              <input type="tel" name="lookupPhone" inputmode="tel">
            </label>
          </div>
          <p class="payment-form-alert" data-lookup-alert hidden></p>
          <button class="button" type="submit">Search order</button>
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
