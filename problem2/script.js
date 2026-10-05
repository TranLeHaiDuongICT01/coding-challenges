import { SNAP_DATA, tokenNameBySymbol } from "./data.js";
const PRICE_URL = "https://interview.switcheo.com/prices.json";
const TOKEN_ICON_URL = (symbol) =>
  `https://raw.githubusercontent.com/Switcheo/token-icons/main/tokens/${encodeURIComponent(symbol)}.svg`;

(async function () {
  "use strict";
  var TOKENS = SNAP_DATA.tokens;
  var TOKENS_BY_SYMBOL = {};
  TOKENS.forEach(function (t) {
    TOKENS_BY_SYMBOL[t.symbol] = t;
  });
  // ---------- formatting helpers ----------

  async function loadTokenFromUrl(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to fetch token data from ${url}`);
    }
    const result = await response.json();
    if (result && Array.isArray(result)) {
      const newTokensBySymbol = {};
      result
        .sort((a, b) => a.price - b.price)
        .forEach((token) => {
          const tokenInfo = {
            symbol: token.currency,
            name: tokenNameBySymbol[token.currency] || "Coin",
            price: token.price,
            date: token.date,
            icon: TOKEN_ICON_URL(token.currency),
          };
          const previous = newTokensBySymbol[token.currency];
          if (!previous || new Date(token.date) > new Date(previous.date)) {
            newTokensBySymbol[token.currency] = tokenInfo;
          }
        });
      TOKENS = Object.values(newTokensBySymbol);
      TOKENS_BY_SYMBOL = newTokensBySymbol;
    }
  }

  function trimTrailing(str) {
    if (str.indexOf(".") === -1) return str;
    return str.replace(/0+$/, "").replace(/\.$/, "");
  }

  function formatInputAmount(n) {
    if (!isFinite(n)) return "";
    if (n === 0) return "0";
    var decimals = n >= 1 ? 6 : 8;
    return trimTrailing(n.toFixed(decimals));
  }

  function formatDisplayAmount(n) {
    if (!isFinite(n)) return "--";
    var decimals = n >= 1 ? 4 : 6;
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  function formatUsd(n) {
    if (!isFinite(n)) return "--";
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: n < 1 ? 4 : 2,
    });
  }

  function hashSymbol(sym) {
    var h = 0;
    for (var i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) >>> 0;
    return h;
  }

  function demoBalance(token) {
    var h = hashSymbol(token.symbol);
    var usdTarget = 250 + (h % 4750); // between $250 and $5000
    return usdTarget / token.price;
  }

  function sanitizeDecimalInput(raw, prevValue) {
    if (raw === "") return "";
    var cleaned = raw.replace(/[^0-9.]/g, "");
    var firstDot = cleaned.indexOf(".");
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, "");
    }
    if (!/^[0-9]*\.?[0-9]*$/.test(cleaned)) return prevValue;
    return cleaned;
  }

  function convert(amountStr, sourceToken, targetToken) {
    var n = parseFloat(amountStr);
    if (!amountStr || isNaN(n)) return "";
    return formatInputAmount((n * sourceToken.price) / targetToken.price);
  }

  // ---------- theme ----------

  var themeToggleBtn = document.getElementById("theme-toggle");

  function systemPrefersDark() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem("swap-theme");
    } catch (e) {
      return null;
    }
  }

  function isDarkActive() {
    var stored = document.documentElement.getAttribute("data-theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return systemPrefersDark();
  }

  function applyTheme(theme) {
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    var dark = isDarkActive();
    themeToggleBtn.setAttribute("aria-pressed", String(dark));
    themeToggleBtn.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
  }

  themeToggleBtn.addEventListener("click", function () {
    var next = isDarkActive() ? "light" : "dark";
    try {
      localStorage.setItem("swap-theme", next);
    } catch (e) {}
    applyTheme(next);
  });

  applyTheme(getStoredTheme());

  // ---------- state ----------

  var state = {
    fromSymbol: "ETH",
    toSymbol: "USDC",
    fromAmount: "1",
    toAmount: "",
    lastEdited: "from", // 'from' | 'to'
    pickerSide: null, // 'from' | 'to' | null
    status: "idle", // idle | submitting | success
    formInputError: null,
    formOutputError: null,
    rateFlipped: false,
  };
  state.toAmount = convert(
    state.fromAmount,
    TOKENS_BY_SYMBOL[state.fromSymbol],
    TOKENS_BY_SYMBOL[state.toSymbol],
  );

  var submitTimer = null;

  // ---------- element refs ----------

  var el = {
    form: document.getElementById("swap-form"),
    serial: document.getElementById("serial"),
    inputAmount: document.getElementById("input-amount"),
    outputAmount: document.getElementById("output-amount"),
    iconFrom: document.getElementById("icon-from"),
    iconTo: document.getElementById("icon-to"),
    symbolFrom: document.getElementById("symbol-from"),
    symbolTo: document.getElementById("symbol-to"),
    tokenSelectFrom: document.getElementById("token-select-from"),
    tokenSelectTo: document.getElementById("token-select-to"),
    usdFrom: document.getElementById("usd-from"),
    usdTo: document.getElementById("usd-to"),
    balanceFrom: document.getElementById("balance-from"),
    balanceTo: document.getElementById("balance-to"),
    panelFrom: document.getElementById("panel-from"),
    panelInputError: document.getElementById("panel-input-error"),
    panelOutputError: document.getElementById("panel-output-error"),
    maxBtn: document.getElementById("max-btn"),
    flipBtn: document.getElementById("flip-btn"),
    rateLine: document.getElementById("rate-line"),
    rateText: document.getElementById("rate-text"),
    submitBtn: document.getElementById("submit-btn"),
    submitSpinner: document.getElementById("submit-spinner"),
    submitLabel: document.getElementById("submit-label"),
    finePrint: document.getElementById("fine-print"),
    card: document.getElementById("card"),
    successView: document.getElementById("success-view"),
    successLine: document.getElementById("success-line"),
    successSerial: document.getElementById("success-serial"),
    resetBtn: document.getElementById("reset-btn"),
    pickerBackdrop: document.getElementById("picker-backdrop"),
    pickerList: document.getElementById("picker-list"),
    pickerSearchInput: document.getElementById("picker-search-input"),
    pickerClose: document.getElementById("picker-close"),
  };

  // ---------- render ----------

  function fromToken() {
    return TOKENS_BY_SYMBOL[state.fromSymbol];
  }
  function toToken() {
    return TOKENS_BY_SYMBOL[state.toSymbol];
  }

  function renderTokenButton(side) {
    var token = side === "from" ? fromToken() : toToken();
    var img = side === "from" ? el.iconFrom : el.iconTo;
    var symbolEl = side === "from" ? el.symbolFrom : el.symbolTo;
    img.src = token.icon;
    img.alt = token.symbol;
    symbolEl.textContent = token.symbol;
  }

  function renderAmounts(keepSameAmount = true) {
    if (keepSameAmount) {
      if (document.activeElement !== el.inputAmount)
        el.inputAmount.value = state.fromAmount;
      if (document.activeElement !== el.outputAmount)
        el.outputAmount.value = state.toAmount;
    }
    el.inputAmount.readOnly = state.status === "submitting";
    el.outputAmount.readOnly = state.status === "submitting";
  }

  function renderUsdAndBalances() {
    var fUsd = (parseFloat(state.fromAmount) || 0) * fromToken().price;
    var tUsd = (parseFloat(state.toAmount) || 0) * toToken().price;
    el.usdFrom.textContent = "≈ " + formatUsd(fUsd);
    el.usdTo.textContent = "≈ " + formatUsd(tUsd);
    el.balanceFrom.textContent =
      "Demo balance: " +
      formatDisplayAmount(demoBalance(fromToken())) +
      " " +
      fromToken().symbol;
    el.balanceTo.textContent =
      "Demo balance: " +
      formatDisplayAmount(demoBalance(toToken())) +
      " " +
      toToken().symbol;
  }

  function renderError() {
    if (state.formInputError) {
      el.panelInputError.textContent = state.formInputError;
      el.panelInputError.hidden = false;
      el.panelFrom.classList.add("has-error");
    } else {
      el.panelInputError.hidden = true;
      el.panelFrom.classList.remove("has-error");
    }

    if (state.formOutputError) {
      el.panelOutputError.textContent = state.formOutputError;
      el.panelOutputError.hidden = false;
      el.panelFrom.classList.add("has-error");
    } else {
      el.panelOutputError.hidden = true;
      el.panelFrom.classList.remove("has-error");
    }
  }

  function renderRateLine() {
    var rate = fromToken().price / toToken().price;
    var text = state.rateFlipped
      ? "1 " +
        toToken().symbol +
        " ≈ " +
        formatDisplayAmount(1 / rate) +
        " " +
        fromToken().symbol
      : "1 " +
        fromToken().symbol +
        " ≈ " +
        formatDisplayAmount(rate) +
        " " +
        toToken().symbol;
    el.rateText.textContent = text;
  }

  function renderSubmit() {
    var amt = parseFloat(state.fromAmount);
    var canSubmit = state.fromAmount !== "" && !isNaN(amt) && amt > 0;
    el.submitBtn.disabled = !canSubmit || state.status === "submitting";
    el.submitSpinner.hidden = state.status !== "submitting";
    el.submitLabel.textContent =
      state.status === "submitting" ? "Confirming…" : "CONFIRM SWAP";
    el.flipBtn.disabled = state.status === "submitting";
  }

  function renderStatusView() {
    if (state.status === "success") {
      el.form.hidden = true;
      el.successView.hidden = false;
      el.successLine.innerHTML =
        "<strong>" +
        formatDisplayAmount(parseFloat(state.fromAmount) || 0) +
        " " +
        fromToken().symbol +
        "</strong>" +
        '<span class="success-arrow">→</span>' +
        "<strong>" +
        formatDisplayAmount(parseFloat(state.toAmount) || 0) +
        " " +
        toToken().symbol +
        "</strong>";
    } else {
      el.form.hidden = false;
      el.successView.hidden = true;
    }
  }

  function renderAll(keepSameAmount = true) {
    renderTokenButton("from");
    renderTokenButton("to");
    renderAmounts(keepSameAmount);
    renderUsdAndBalances();
    renderError();
    renderRateLine();
    renderSubmit();
    renderStatusView();
  }

  // ---------- actions ----------

  function isValidNumber(num) {
    return /^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(String(num).trim());
  }

  function handleFromInput(raw) {
    var next = sanitizeDecimalInput(raw, state.fromAmount);
    state.fromAmount = next;
    state.lastEdited = "from";
    state.toAmount = convert(next, fromToken(), toToken());
    if (state.formInputError) state.formInputError = null;
    if (state.formOutputError) state.formOutputError = null;
    renderAll();
  }

  function handleToInput(raw) {
    var next = sanitizeDecimalInput(raw, state.toAmount);
    state.toAmount = next;
    state.lastEdited = "to";
    state.fromAmount = convert(next, toToken(), fromToken());
    if (state.formInputError) state.formInputError = null;
    if (state.formOutputError) state.formOutputError = null;
    renderAll();
  }

  function handleFlip() {
    if (state.status === "submitting") return;
    var f = state.fromSymbol,
      t = state.toSymbol;
    var fa = state.fromAmount,
      ta = state.toAmount;
    state.fromSymbol = t;
    state.toSymbol = f;
    state.fromAmount = ta;
    state.toAmount = fa;
    state.lastEdited = state.lastEdited === "from" ? "to" : "from";
    state.formInputError = null;
    state.formOutputError = null;
    renderAll();
  }

  function handleSelectToken(side, token) {
    if (side === "from") {
      if (token.symbol === state.toSymbol) return;
      state.fromSymbol = token.symbol;
      if (state.lastEdited === "from")
        state.toAmount = convert(state.fromAmount, fromToken(), toToken());
      else state.fromAmount = convert(state.toAmount, toToken(), fromToken());
    } else {
      if (token.symbol === state.fromSymbol) return;
      state.toSymbol = token.symbol;
      if (state.lastEdited === "from")
        state.toAmount = convert(state.fromAmount, fromToken(), toToken());
      else state.fromAmount = convert(state.toAmount, toToken(), fromToken());
    }
    closePicker();
    renderAll();
  }

  function triggerShake() {
    el.card.classList.remove("shake");
    // force reflow so the animation can restart if triggered twice in a row
    void el.card.offsetWidth;
    el.card.classList.add("shake");
    setTimeout(function () {
      el.card.classList.remove("shake");
    }, 420);
  }

  function handleSubmit() {
    var inputAmountValue = el.inputAmount.value;
    var outputAmountValue = el.outputAmount.value;
    if (!isValidNumber(inputAmountValue)) {
      state.formInputError = "Enter a valid amount to swap.";
      renderAll(false);
      triggerShake();
      return;
    }

    if (!isValidNumber(outputAmountValue)) {
      state.formOutputError = "Enter a valid amount to swap.";
      renderAll(false);
      triggerShake();
      return;
    }

    if (state.status === "submitting") return;
    var amt = parseFloat(state.fromAmount);
    if (!state.fromAmount || isNaN(amt) || amt <= 0) {
      state.formInputError = "Enter an amount greater than 0 to swap.";
      renderAll();
      triggerShake();
      return;
    }
    if (amt > demoBalance(fromToken())) {
      state.formInputError =
        "Insufficient " + fromToken().symbol + " balance for this swap.";
      renderAll();
      triggerShake();
      return;
    }
    state.formInputError = null;
    state.formOutputError = null;
    state.status = "submitting";
    renderAll();
    submitTimer = setTimeout(function () {
      state.status = "success";
      renderAll();
    }, 1100);
  }

  function handleReset() {
    state.status = "idle";
    state.fromAmount = "1";
    state.lastEdited = "from";
    state.toAmount = convert("1", fromToken(), toToken());
    renderAll();
  }

  // ---------- token picker ----------

  function openPicker(side) {
    state.pickerSide = side;
    el.pickerSearchInput.value = "";
    renderPickerList("");
    el.pickerBackdrop.hidden = false;
    setTimeout(function () {
      el.pickerSearchInput.focus();
    }, 30);
  }

  function closePicker() {
    state.pickerSide = null;
    el.pickerBackdrop.hidden = true;
  }

  function renderPickerList(query) {
    var otherSymbol =
      state.pickerSide === "from" ? state.toSymbol : state.fromSymbol;
    var q = query.trim().toLowerCase();
    var filtered = TOKENS.filter(function (t) {
      if (!q) return true;
      return (
        t.symbol.toLowerCase().indexOf(q) !== -1 ||
        t.name.toLowerCase().indexOf(q) !== -1
      );
    });

    el.pickerList.innerHTML = "";

    if (filtered.length === 0) {
      var empty = document.createElement("li");
      empty.className = "picker-empty";
      empty.textContent = "No token matches \u201c" + query + "\u201d.";
      el.pickerList.appendChild(empty);
      return;
    }

    filtered.forEach(function (t) {
      var disabled = t.symbol === otherSymbol;
      var li = document.createElement("li");

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "picker-row" + (disabled ? " is-disabled" : "");
      btn.disabled = disabled;

      var img = document.createElement("img");
      img.className = "token-icon";
      img.src = t.icon;
      img.alt = "";
      img.width = 30;
      img.height = 30;

      var textWrap = document.createElement("span");
      textWrap.className = "picker-row-text";
      var symbolSpan = document.createElement("span");
      symbolSpan.className = "picker-row-symbol";
      symbolSpan.textContent = t.symbol;
      var nameSpan = document.createElement("span");
      nameSpan.className = "picker-row-name";
      nameSpan.textContent = t.name;
      textWrap.appendChild(symbolSpan);
      textWrap.appendChild(nameSpan);

      var priceSpan = document.createElement("span");
      priceSpan.className = "picker-row-price";
      priceSpan.textContent = formatUsd(t.price);

      btn.appendChild(img);
      btn.appendChild(textWrap);
      btn.appendChild(priceSpan);

      if (disabled) {
        var tag = document.createElement("span");
        tag.className = "picker-row-tag";
        tag.textContent = "In use";
        btn.appendChild(tag);
      } else {
        btn.addEventListener("click", function () {
          handleSelectToken(state.pickerSide, t);
        });
      }

      li.appendChild(btn);
      el.pickerList.appendChild(li);
    });
  }

  // ---------- wire up events ----------

  el.inputAmount.addEventListener("input", function (e) {
    handleFromInput(e.target.value);
  });
  el.outputAmount.addEventListener("input", function (e) {
    handleToInput(e.target.value);
  });
  el.maxBtn.addEventListener("click", function () {
    handleFromInput(formatInputAmount(demoBalance(fromToken())));
  });
  el.flipBtn.addEventListener("click", handleFlip);
  el.rateLine.addEventListener("click", function () {
    state.rateFlipped = !state.rateFlipped;
    renderRateLine();
  });
  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    handleSubmit();
  });
  el.resetBtn.addEventListener("click", handleReset);

  el.tokenSelectFrom.addEventListener("click", function () {
    openPicker("from");
  });
  el.tokenSelectTo.addEventListener("click", function () {
    openPicker("to");
  });
  el.pickerClose.addEventListener("click", closePicker);
  el.pickerBackdrop.addEventListener("mousedown", function (e) {
    if (e.target === el.pickerBackdrop) closePicker();
  });
  el.pickerSearchInput.addEventListener("input", function (e) {
    renderPickerList(e.target.value);
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !el.pickerBackdrop.hidden) closePicker();
  });

  // ---------- init ----------

  await loadTokenFromUrl(PRICE_URL);

  renderAll();
})();
