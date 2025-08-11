// ===== App Constants =====
const TERM_LEASE = 36;
const ACQ_FEE = 925;
const DOC_FEE = 387;
const MF_MARKUP = 0.0004;
const PLATE_FEE = 75;

// ===== DOM & Parsing Helpers =====
const $ = (id) => document.getElementById(id);
const parseMoney = (s) => { s = (s || "").trim(); return s ? parseFloat(s.replace(/[^0-9.\-]/g, "")) || 0 : 0; };
const parsePercent = (s) => { s = (s || "").trim(); return s ? parseFloat(s.replace(/[^0-9.\-]/g, "")) || 0 : 0; };
const parseIntOnly = (s) => { s = (s || "").trim(); const n = parseInt(s.replace(/[^0-9]/g, ""), 10); return isNaN(n) ? 0 : n; };
const fmtMoney = (x) => x.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtMoneyCompact = (x) => Math.abs(x - Math.round(x)) < 1e-9 ? `$${Math.round(x).toLocaleString()}` : fmtMoney(x);
const fmtPercentDisp = (x) => Math.abs(x - Math.round(x)) < 1e-9 ? `${Math.round(x)}%` : `${x.toFixed(2)}%`;
const fmtMonths = (n) => n ? `${n} months` : "";

// ===== UI Setup Functions =====

// Helper to clear input on first keypress after focus
function attachClearOnType(el) {
  el.addEventListener("focus", () => {
    el.dataset.justFocused = "1";
    try { el.select(); } catch {}
  });
  el.addEventListener("keydown", (e) => {
    if (el.dataset.justFocused === "1") {
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
        el.value = "";
        el.dataset.justFocused = "0";
      }
    }
  });
  el.addEventListener("blur", () => { el.dataset.justFocused = "0"; });
}

// DRY function to set up formatting for a given field
function setupFieldFormatting(id, parser, formatter, isInt = false) {
    const el = $(id);
    if (!el) return;
    el.setAttribute("inputmode", isInt ? "numeric" : "decimal");
    el.addEventListener("beforeinput", (e) => {
        if (e.data && !/[0-9.\-]/.test(e.data)) { e.preventDefault(); }
        if (isInt && e.data && !/[0-9]/.test(e.data)) { e.preventDefault(); }
    });
    attachClearOnType(el);
    el.addEventListener("blur", () => {
        const v = parser(el.value);
        el.value = v ? formatter(v) : "";
    });
}

function setupFormatters() {
    const moneyFields = ["msrp", "discount", "rebatesLease", "downLease", "rebatesFin", "downFin", "tradeIn"];
    moneyFields.forEach(id => setupFieldFormatting(id, parseMoney, fmtMoneyCompact));
    const percentFields = ["taxPct", "residualPct", "ratePct"];
    percentFields.forEach(id => setupFieldFormatting(id, parsePercent, fmtPercentDisp));
    setupFieldFormatting("termMonths", parseIntOnly, fmtMonths, true);
}

// Updated theme switcher logic for the checkbox toggle
function setupTheme() {
    const toggle = $("themeToggleCheckbox");
    if (!toggle) return;
    const KEY = "kbmw_calc_theme";
    const body = document.body;

    // Set initial state from localStorage or OS preference
    let savedTheme = null;
    try { savedTheme = localStorage.getItem(KEY); } catch (_) {}
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const startDark = savedTheme ? (savedTheme === "dark") : prefersDark;

    if (startDark) {
        body.classList.replace("light", "dark");
        toggle.checked = true;
    }

    // Listen for changes on the toggle
    toggle.addEventListener("change", () => {
        const isDark = toggle.checked;
        body.classList.toggle("dark", isDark);
        body.classList.toggle("light", !isDark);
        try { localStorage.setItem(KEY, isDark ? "dark" : "light"); } catch (_) {}
    });
}

// ===== Calculation Logic =====
function calcLease() {
    const errorEl = $("leaseErrorOut"); errorEl.textContent = "";
    const msrp = parseMoney($("msrp").value), discount = parseMoney($("discount").value), taxPct = parsePercent($("taxPct").value) / 100;
    const residualPct = parsePercent($("residualPct").value) / 100, mfInput = parseFloat(($("moneyFactor").value || "").replace(/[^0-9.\-]/g, "")) || 0;
    const rebates = parseMoney($("rebatesLease").value), down = parseMoney($("downLease").value);
    if (msrp <= 0 || residualPct <= 0 || residualPct >= 1) { errorEl.textContent = "Please check MSRP and Residual %."; return; }
    if (mfInput <= 0 || mfInput > 0.02) { errorEl.textContent = "Money Factor looks off (e.g., 0.00188)."; return; }
    const mfUsed = mfInput + MF_MARKUP, sellingPrice = msrp - discount, residualValue = msrp * residualPct;
    const capReduction = rebates + down, adjCapCost = sellingPrice + ACQ_FEE + DOC_FEE - capReduction;
    const monthlyDepreciation = (adjCapCost - residualValue) / TERM_LEASE, monthlyRentCharge = (adjCapCost + residualValue) * mfUsed;
    const preTaxPayment = monthlyDepreciation + monthlyRentCharge, totalLeaseTax = (preTaxPayment * taxPct) * TERM_LEASE;
    const capCostWithTax = adjCapCost + totalLeaseTax;
    const finalDepreciation = (capCostWithTax - residualValue) / TERM_LEASE, finalRentCharge = (capCostWithTax + residualValue) * mfUsed;
    const finalMonthlyPayment = finalDepreciation + finalRentCharge, taxOnDown = down * taxPct, dueAtSigning = finalMonthlyPayment + down + taxOnDown + PLATE_FEE;
    $("leaseResidualOut").textContent = fmtMoney(residualValue); $("leasePaymentOut").textContent = fmtMoney(finalMonthlyPayment); $("leaseDasOut").textContent = fmtMoney(dueAtSigning);
}
function calcFinance() {
    const errorEl = $("finErrorOut"); errorEl.textContent = "";
    const msrp = parseMoney($("msrp").value), discount = parseMoney($("discount").value), taxPct = parsePercent($("taxPct").value) / 100;
    const termMonths = parseIntOnly($("termMonths").value), ratePct = parsePercent($("ratePct").value) / 100;
    const rebates = parseMoney($("rebatesFin").value), down = parseMoney($("downFin").value), tradeIn = parseMoney($("tradeIn").value);
    if (msrp <= 0 || termMonths <= 0) { errorEl.textContent = "Please check MSRP and Term."; return; }
    if (ratePct < 0) { errorEl.textContent = "Rate % cannot be negative."; return; }
    const sellingPrice = msrp - discount + DOC_FEE, taxableBase = (sellingPrice - tradeIn);
    const totalTax = taxableBase > 0 ? taxableBase * taxPct : 0;
    const principal = (sellingPrice - tradeIn - down - rebates) + totalTax;
    if (principal < 0) { errorEl.textContent = "Loan amount is negative. Check inputs."; return; }
    let payment;
    if (ratePct > 0) { const r = ratePct / 12, pow = (1 + r) ** termMonths; payment = principal * (r * pow) / (pow - 1); }
    else { payment = principal / termMonths; }
    const dueAtSigning = (payment || 0) + PLATE_FEE + down;
    $("loanAmountOut").textContent = fmtMoney(principal); $("finPaymentOut").textContent = fmtMoney(payment); $("finDasOut").textContent = fmtMoney(dueAtSigning);
}

// ===== Wire up Event Listeners =====
window.addEventListener("DOMContentLoaded", () => {
    setupFormatters();
    setupTheme();
    $("calcLease").addEventListener("click", calcLease);
    $("calcFin").addEventListener("click", calcFinance);
});
