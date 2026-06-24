const money = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0
});

const trmRate = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const trmDateFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

const TRM_API = "https://www.datos.gov.co/resource/32sa-8pi3.json";
const TRM_SOURCE_URL = "https://www.datos.gov.co/Econom-a-y-Finanzas/Tasa-de-Cambio-Representativa-del-Mercado-TRM/32sa-8pi3";
const TRM_CACHE_KEY = "velvet-trm-cache";
const TRM_FALLBACK = 3900;

const inputs = Array.from(document.querySelectorAll("input, select"));
inputs.forEach((input) => {
  if (input.id === "trm" || input.id === "trmDate") return;
  input.addEventListener("input", calculate);
  if (input.tagName === "SELECT") input.addEventListener("change", calculate);
});

let honorariosCurrency = "cop";
let trmSource = "loading";
let trmFetchToken = 0;

const honorariosInput = document.getElementById("honorarios");
const trmField = document.getElementById("trmField");
const trmInput = document.getElementById("trm");
const trmDateInput = document.getElementById("trmDate");
const trmStatus = document.getElementById("trmStatus");
const trmRefresh = document.getElementById("trmRefresh");
const trmRefreshIcon = document.getElementById("trmRefreshIcon");
const datosMesGrid = document.getElementById("datosMesGrid");
const honorariosLabelText = document.getElementById("honorariosLabelText");
const honorariosPrefix = document.getElementById("honorariosPrefix");
const formulaIngreso = document.getElementById("formulaIngreso");
const currencyButtons = Array.from(document.querySelectorAll(".currency-switch__option"));

trmDateInput.value = todayIsoDate();
trmDateInput.addEventListener("change", () => {
  trmSource = "loading";
  loadOfficialTrm({ force: true });
});

trmRefresh.addEventListener("click", () => loadOfficialTrm({ force: true }));

trmInput.addEventListener("input", () => {
  trmSource = "manual";
  renderTrmStatus();
  calculate();
});

function todayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function parseTrmRow(row) {
  const valor = Number(row?.valor);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("TRM inválida");
  const vigenciaDesde = String(row.vigenciadesde || "").slice(0, 10);
  const vigenciaHasta = String(row.vigenciahasta || vigenciaDesde).slice(0, 10);
  return { valor, vigenciaDesde, vigenciaHasta };
}

function readTrmCache(queryDate) {
  try {
    const cached = JSON.parse(localStorage.getItem(TRM_CACHE_KEY) || "null");
    if (!cached || cached.queryDate !== queryDate) return null;
    if (Date.now() - cached.fetchedAt > 6 * 60 * 60 * 1000) return null;
    return parseTrmRow(cached);
  } catch {
    return null;
  }
}

function writeTrmCache(queryDate, row) {
  try {
    localStorage.setItem(TRM_CACHE_KEY, JSON.stringify({
      ...row,
      valor: String(row.valor),
      vigenciadesde: `${row.vigenciaDesde}T00:00:00.000`,
      vigenciahasta: `${row.vigenciaHasta}T00:00:00.000`,
      queryDate,
      fetchedAt: Date.now()
    }));
  } catch {
    /* ignore quota errors */
  }
}

async function fetchOfficialTrm(queryDate) {
  const url = new URL(TRM_API);
  url.searchParams.set("$select", "valor,vigenciadesde,vigenciahasta");
  url.searchParams.set("$where", `vigenciadesde <= '${queryDate}T23:59:59.000'`);
  url.searchParams.set("$order", "vigenciadesde DESC");
  url.searchParams.set("$limit", "1");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`TRM HTTP ${response.status}`);

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("TRM no encontrada");
  return parseTrmRow(rows[0]);
}

function formatIsoDate(isoDate) {
  return trmDateFormat.format(new Date(`${isoDate}T12:00:00`));
}

function setTrmRefreshLoading(isLoading) {
  if (!trmRefreshIcon) return;
  trmRefreshIcon.classList.toggle("ph-icon--spin", isLoading);
}

function renderTrmStatus(extraMessage) {
  trmStatus.classList.remove("is-loading", "is-official", "is-manual", "is-error");

  if (trmSource === "loading") {
    trmStatus.classList.add("is-loading");
    trmStatus.textContent = extraMessage || "Consultando TRM oficial…";
    setTrmRefreshLoading(true);
    return;
  }

  setTrmRefreshLoading(false);

  if (trmSource === "error") {
    trmStatus.classList.add("is-error");
    trmStatus.textContent = extraMessage || "No se pudo cargar la TRM oficial. Puedes editarla manualmente.";
    return;
  }

  if (trmSource === "manual") {
    trmStatus.classList.add("is-manual");
    trmStatus.textContent = "TRM editada manualmente. Usa «Actualizar» para restaurar la TRM oficial.";
    return;
  }

  const vigenciaDesde = trmInput.dataset.vigenciaDesde;
  const vigenciaHasta = trmInput.dataset.vigenciaHasta;
  const queryDate = trmDateInput.value;
  trmStatus.classList.add("is-official");

  let message = `TRM oficial: ${trmRate.format(value("trm"))} COP/USD`;
  if (vigenciaDesde) {
    message += ` · vigente desde ${formatIsoDate(vigenciaDesde)}`;
    if (vigenciaHasta && vigenciaHasta !== vigenciaDesde) {
      message += ` hasta ${formatIsoDate(vigenciaHasta)}`;
    }
  }
  if (queryDate && queryDate !== todayIsoDate()) {
    message += ` · consultada para abono del ${formatIsoDate(queryDate)}`;
  }
  message += " · Fuente: ";
  trmStatus.innerHTML = `${message}<a href="${TRM_SOURCE_URL}" target="_blank" rel="noopener noreferrer">datos.gov.co</a>`;
}

async function loadOfficialTrm(options = {}) {
  if (honorariosCurrency === "cop") {
    calculate();
    return;
  }

  const queryDate = trmDateInput.value || todayIsoDate();
  const requestId = ++trmFetchToken;

  trmSource = "loading";
  trmRefresh.disabled = true;
  renderTrmStatus(options.force ? "Actualizando TRM oficial…" : undefined);

  if (!options.force) {
    const cached = readTrmCache(queryDate);
    if (cached) {
      applyOfficialTrm(cached, queryDate);
      return;
    }
  }

  try {
    const row = await fetchOfficialTrm(queryDate);
    if (requestId !== trmFetchToken) return;
    writeTrmCache(queryDate, row);
    applyOfficialTrm(row, queryDate);
  } catch (error) {
    if (requestId !== trmFetchToken) return;
    trmSource = "error";
    if (!trmInput.value || Number(trmInput.value) <= 0) {
      trmInput.value = String(TRM_FALLBACK);
    }
    renderTrmStatus(error.message || "No se pudo cargar la TRM oficial.");
    calculate();
  } finally {
    if (requestId === trmFetchToken) {
      trmRefresh.disabled = honorariosCurrency === "cop";
    }
  }
}

function applyOfficialTrm(row, queryDate) {
  trmSource = "official";
  trmInput.value = String(row.valor);
  trmInput.dataset.vigenciaDesde = row.vigenciaDesde;
  trmInput.dataset.vigenciaHasta = row.vigenciaHasta;
  trmInput.dataset.queryDate = queryDate;
  renderTrmStatus();
  trmRefresh.disabled = honorariosCurrency === "cop";
  calculate();
}

currencyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextCurrency = button.dataset.currency;
    if (nextCurrency === honorariosCurrency) return;

    const honorarios = value("honorarios");
    const trm = value("trm");

    if (nextCurrency === "cop") {
      honorariosInput.value = String(Math.round(honorarios * trm));
      honorariosInput.step = "1000";
    } else {
      honorariosInput.value = trm > 0 ? (honorarios / trm).toFixed(2) : String(honorarios);
      honorariosInput.step = "0.01";
    }

    honorariosCurrency = nextCurrency;
    updateCurrencyUI();
    if (nextCurrency === "usd") loadOfficialTrm();
    calculate();
  });
});

function updateCurrencyUI() {
  const isCop = honorariosCurrency === "cop";
  trmField.hidden = isCop;
  trmInput.disabled = isCop;
  trmDateInput.disabled = isCop;
  if (isCop) {
    trmRefresh.disabled = true;
  } else if (trmSource !== "loading") {
    trmRefresh.disabled = false;
  }
  datosMesGrid.dataset.currency = honorariosCurrency;
  honorariosLabelText.textContent = isCop ? "Honorarios del mes en COP" : "Honorarios del mes en USD";
  if (honorariosPrefix) honorariosPrefix.textContent = isCop ? "$" : "US$";
  formulaIngreso.textContent = isCop ? "Honorarios en COP + otros ingresos" : "USD × TRM + otros ingresos";

  currencyButtons.forEach((btn) => {
    const active = btn.dataset.currency === honorariosCurrency;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function value(id) {
  const el = document.getElementById(id);
  return el.type === "checkbox" ? el.checked : Number(el.value || 0);
}

function clamp(number, min, max) {
  return Math.min(Math.max(number, min), max);
}

function tax383(baseCop, uvt) {
  const baseUvt = baseCop / uvt;
  let impuestoUvt = 0;
  if (baseUvt <= 95) impuestoUvt = 0;
  else if (baseUvt <= 150) impuestoUvt = (baseUvt - 95) * 0.19;
  else if (baseUvt <= 360) impuestoUvt = (baseUvt - 150) * 0.28 + 10;
  else if (baseUvt <= 640) impuestoUvt = (baseUvt - 360) * 0.33 + 69;
  else if (baseUvt <= 945) impuestoUvt = (baseUvt - 640) * 0.35 + 162;
  else if (baseUvt <= 2300) impuestoUvt = (baseUvt - 945) * 0.37 + 268;
  else impuestoUvt = (baseUvt - 2300) * 0.39 + 770;
  return Math.max(0, impuestoUvt * uvt);
}

function row(label, amount) {
  return `<tr><td>${label}</td><td>${money.format(Math.round(amount))}</td></tr>`;
}

function calculate() {
  const honorarios = value("honorarios");
  const trm = value("trm");
  const otrosCop = value("otrosCop");
  const uvt = value("uvt");
  const smmlv = value("smmlv");
  const honorariosCop = honorariosCurrency === "usd" ? honorarios * trm : honorarios;
  const ingreso = Math.max(0, honorariosCop + otrosCop);
  const obligado = ingreso >= smmlv;
  const ibc = obligado ? clamp(ingreso * 0.4, smmlv, smmlv * 25) : 0;

  const salud = ibc * 0.125;
  const pension = ibc * 0.16;
  const arl = ibc * Number(document.getElementById("arlNivel").value);
  const caja = ibc * Number(document.getElementById("cajaRate").value);
  const aportes = salud + pension + arl + caja;

  const ingresoNetoRetencion = Math.max(0, ingreso - salud - pension);
  const dependientes = value("dependientes");
  const prepagada = value("prepagada");
  const vivienda = value("vivienda");
  const voluntarios = value("voluntarios");
  const deducciones = dependientes + prepagada + vivienda + voluntarios;
  const renta25Base = Math.max(0, ingresoNetoRetencion - deducciones);
  const renta25 = value("renta25") ? Math.min(renta25Base * 0.25, (790 * uvt) / 12) : 0;
  const beneficioMax = ingresoNetoRetencion * 0.4;
  const beneficiosAplicados = Math.min(deducciones + renta25, beneficioMax);
  const baseRetencion = Math.max(0, ingresoNetoRetencion - beneficiosAplicados);

  const taxMode = document.getElementById("taxMode").value;
  let impuesto = 0;
  if (taxMode === "art383") impuesto = tax383(baseRetencion, uvt);
  if (taxMode === "flat10") impuesto = ingreso * 0.10;
  if (taxMode === "flat11") impuesto = ingreso * 0.11;
  impuesto = Math.max(0, impuesto - value("retencionReal"));

  const vacaciones = ingreso * 0.0417;
  const prima = ingreso * 0.0833;
  const cesantias = ingreso * 0.0833;
  const interesesCesantias = cesantias * 0.12;
  const reservaExtra = ingreso * (value("reservaExtraPct") / 100);
  const reservasPersonales = vacaciones + prima + cesantias + interesesCesantias + reservaExtra;
  const totalSeparar = aportes + impuesto + reservasPersonales;
  const disponible = ingreso - totalSeparar;

  const formattedAportes = money.format(Math.round(aportes));
  document.getElementById("mIngreso").textContent = money.format(Math.round(ingreso));
  document.getElementById("mAportes").textContent = formattedAportes;
  document.getElementById("mRetencion").textContent = money.format(Math.round(impuesto));
  document.getElementById("mDisponible").textContent = money.format(Math.round(disponible));
  document.querySelectorAll('[data-summary-value="aportes"]').forEach((element) => {
    element.textContent = formattedAportes;
  });

  document.getElementById("tablaAportes").innerHTML =
    row("IBC calculado", ibc) +
    row("Salud 12,5%", salud) +
    row("Pensión 16%", pension) +
    row("ARL", arl) +
    row("Caja voluntaria", caja) +
    row("<strong>Total aportes</strong>", aportes);

  document.getElementById("tablaReservas").innerHTML =
    row("Base retención estimada", baseRetencion) +
    row("Impuesto / retención a separar", impuesto) +
    row("Vacaciones propias 4,17%", vacaciones) +
    row("Prima propia 8,33%", prima) +
    row("Cesantías propias 8,33%", cesantias) +
    row("Intereses cesantías 12% anual", interesesCesantias) +
    row("Emergencia editable", reservaExtra) +
    row("<strong>Total a separar</strong>", totalSeparar);

  const estado = document.getElementById("estado");
  if (!obligado) {
    estado.className = "note warning";
    estado.textContent = "El ingreso está por debajo de 1 SMMLV. Según la guía UGPP, la obligación de aportar se activa con ingresos mensuales iguales o superiores a 1 SMMLV; aun así puedes aportar voluntariamente para mantener cobertura.";
  } else if (disponible < 0) {
    estado.className = "note danger";
    estado.textContent = "Las reservas y aportes superan el ingreso del mes. Revisa honorarios, deducciones, ARL, reserva extra o el método de impuesto.";
  } else {
    estado.className = "note";
    estado.textContent = "Con estos datos, este es el dinero que deberías separar antes de gastar. El disponible es lo que queda para vida personal y operación.";
  }
}

updateCurrencyUI();
loadOfficialTrm();
