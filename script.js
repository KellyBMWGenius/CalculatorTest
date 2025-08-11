// ===== Constants (Ohio rules, same as before) =====
const TERM_LEASE = 36;
const ACQ_FEE = 925;
const DOC_FEE = 387;
const MF_MARKUP = 0.0004; // silent add-on
const PLATE_FEE = 75;

const moneyRe = /[^0-9.\-]/g;
const percentRe = /[^0-9.\-]/g;
const $ = (id) => document.getElementById(id);

// ===== Parse / format helpers (same as before) =====
const parseMoney = (s)=>{ s=(s||"").trim(); return s? parseFloat(s.replace(moneyRe,""))||0 : 0; };
const parsePercent = (s)=>{ s=(s||"").trim(); return s? parseFloat(s.replace(percentRe,""))||0 : 0; };
const parseIntOnly = (s)=>{ s=(s||"").trim(); const n=parseInt(s.replace(/[^0-9]/g,""),10); return isNaN(n)?0:n; };

const fmtMoney = (x)=> x.toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2});
const fmtMoneyCompact = (x)=> Math.abs(x-Math.round(x))<1e-9 ? `$${Math.round(x).toLocaleString()}` : fmtMoney(x);
const fmtPercentDisp = (x)=> Math.abs(x-Math.round(x))<1e-9 ? `${Math.round(x)}%` : `${x.toFixed(2)}%`;
const fmtMonths = (n)=> n ? `${n} months` : "";

// ===== QoL: numeric keypad + clear-on-type + format-on-blur =====
function setNumericKeyboard(el){
  // Hint mobile keyboards; also block non-numeric characters on input
  el.setAttribute("inputmode", "decimal");
  el.addEventListener("beforeinput", (e)=>{
    if (e.data && !/[0-9.\-]/.test(e.data)) e.preventDefault();
  });
}
function setNumericKeyboardInt(el){
  el.setAttribute("inputmode", "numeric");
  el.addEventListener("beforeinput", (e)=>{
    if (e.data && !/[0-9]/.test(e.data)) e.preventDefault();
  });
}
function attachClearOnType(el){
  el.addEventListener("focus", ()=>{
    el.dataset.justFocused = "1";
    // select existing text so typing replaces it
    // (desktop behavior); on mobile the first key still clears
    try { el.select(); } catch {}
  });
  el.addEventListener("keydown", (e)=>{
    if (el.dataset.justFocused === "1") {
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
        el.value = "";
        el.dataset.justFocused = "0";
      }
    }
  });
  el.addEventListener("blur", ()=>{ el.dataset.justFocused = "0"; });
}

function setupFormatters(){
  // Money fields (auto $ on blur)
  ["msrp","discount","rebatesLease","downLease","rebatesFin","downFin","tradeIn"].forEach(id=>{
    const el = $(id);
    if(!el) return;
    setNumericKeyboard(el);
    attachClearOnType(el);
    el.addEventListener("blur", ()=>{
      const v = parseMoney(el.value);
      el.value = v ? fmtMoneyCompact(v) : "";
    });
  });

  // Percent fields (auto % on blur)
  ["taxPct","residualPct","ratePct"].forEach(id=>{
    const el = $(id);
    if(!el) return;
    setNumericKeyboard(el);
    attachClearOnType(el);
    el.addEventListener("blur", ()=>{
      const v = parsePercent(el.value);
      el.value = v ? fmtPercentDisp(v) : "";
    });
  });

  // Term (months) field (auto “N months” on blur)
  const tm = $("termMonths");
  if (tm){
    setNumericKeyboardInt(tm);
    attachClearOnType(tm);
    tm.addEventListener("blur", ()=>{
      const n = parseIntOnly(tm.value);
      tm.value = fmtMonths(n);
    });
  }
}

// ===== Theme toggle (unchanged) =====
function setupTheme(){
  const btn = document.getElementById("themeToggle");
  if (!btn) return; // safety

  const KEY = "kbmw_theme";
  const body = document.body;

  // Read saved theme or fall back to OS preference
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (_) {}
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const startDark = saved ? (saved === "dark") : prefersDark;

  // Apply initial state
  body.classList.toggle("dark", startDark);
  btn.textContent = startDark ? "Light" : "Dark";

  // Toggle + persist
  btn.addEventListener("click", () => {
    const nowDark = !body.classList.contains("dark");
    body.classList.toggle("dark", nowDark);
    btn.textContent = nowDark ? "Light" : "Dark";
    try { localStorage.setItem(KEY, nowDark ? "dark" : "light"); } catch (_) {}
  });
}

// ===== Lease math (same logic as before) =====
function calcLease(){
  const msrp = parseMoney($("msrp").value);
  const discount = parseMoney($("discount").value);
  const taxPct = parsePercent($("taxPct").value)/100;

  const residualPct = parsePercent($("residualPct").value)/100;
  const mfInput = parseFloat( ($("moneyFactor").value||"").replace(percentRe,"") ) || 0;
  const rebates = parseMoney($("rebatesLease").value);
  const down = parseMoney($("downLease").value);

  if(msrp<=0 || residualPct<=0 || residualPct>=1){ alert("Please check MSRP and Residual %."); return; }
  if(mfInput<0 || mfInput>0.02){ alert("Money Factor looks off (e.g., 0.00188)."); return; }

  const mfUsed = mfInput + MF_MARKUP;
  const sellingPrice = msrp - discount;

  const capReduction = rebates + down;
  const C17 = sellingPrice + ACQ_FEE + DOC_FEE - capReduction;
  const C18 = msrp * residualPct;
  const C19 = (C17 + C18) * mfUsed;
  const C20 = (C17 - C18) / TERM_LEASE;
  const C21 = C19 + C20; // pre-tax

  const C23 = C21 * taxPct;
  const C24 = C23 * TERM_LEASE;
  const C26 = C17 + C24;

  const E19 = (C26 + C18) * mfUsed;
  const E20 = (C26 - C18) / TERM_LEASE;
  const E21 = E19 + E20; // monthly with tax

  const taxOnDown = down * taxPct;
  const das = E21 + down + taxOnDown + PLATE_FEE;

  $("leaseResidualOut").textContent = fmtMoney(C18);
  $("leasePaymentOut").textContent = fmtMoney(E21);
  $("leaseDasOut").textContent = fmtMoney(das);
}

// ===== Finance math (same logic as before) =====
function calcFinance(){
  const msrp = parseMoney($("msrp").value);
  const discount = parseMoney($("discount").value);
  const taxPct = parsePercent($("taxPct").value)/100;

  const termMonths = parseIntOnly($("termMonths").value);
  const ratePct = parsePercent($("ratePct").value)/100;
  const rebates = parseMoney($("rebatesFin").value);
  const down = parseMoney($("downFin").value);
  const tradeIn = parseMoney($("tradeIn").value);

  if(msrp<=0 || termMonths<=0){ alert("Please check MSRP and Term."); return; }
  if(ratePct<0){ alert("Rate % cannot be negative."); return; }

  const sellingPrice = msrp - discount + DOC_FEE;
  const taxableBase = (sellingPrice - tradeIn) + down + rebates;
  const totalTax = taxableBase * taxPct;

  const principal = (sellingPrice - tradeIn - down - rebates) + totalTax;
  if(principal < 0){ alert("Computed loan amount is negative. Reduce cash/trade/rebates."); return; }

  let payment;
  if(ratePct > 0){
    const r = ratePct/12;
    const pow = Math.pow(1+r, termMonths);
    payment = principal * (r * pow) / (pow - 1);
  }else{
    payment = principal / termMonths;
  }

  const das = payment + PLATE_FEE + down;

  $("loanAmountOut").textContent = fmtMoney(principal);
  $("finPaymentOut").textContent  = fmtMoney(payment);
  $("finDasOut").textContent      = fmtMoney(das);
}

// ===== Wire up (same IDs as your original HTML) =====
window.addEventListener("DOMContentLoaded", ()=>{
  setupFormatters();
  setupTheme();
  const bl = $("calcLease"), bf = $("calcFin");
  if (bl) bl.addEventListener("click", calcLease);
  if (bf) bf.addEventListener("click", calcFinance);
});
