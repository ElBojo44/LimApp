// ===== HELPERS =====

function resetSelectToDefault(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    const hasEmpty = [...sel.options].some(o => o.value === "");
    if (hasEmpty) {
        sel.value = "";
    } else {
        sel.selectedIndex = 0;
    }

    sel.dispatchEvent(new Event("change"));
}

async function deleteItem(tipo, id) {
  if (!id) return;

  const ok = confirm("¿Seguro que quieres borrar este registro? Esta acción no se puede deshacer.");
  if (!ok) return;

  // 1) BORRAR (si esto falla, sí mostramos error)
  try {
    const res = await apiPost({ type: tipo, action: "delete", id });
    if (!res?.ok) {
      alert("❌ No se pudo borrar. " + (res?.error || ""));
      return;
    }
  } catch (err) {
    console.error("DELETE failed:", err);
    alert("❌ No se pudo borrar el registro.");
    return;
  }

  // 2) UI/Cache refresh (si esto falla, NO decimos que no borró)
  try {
    // invalida cache del GET del storage.js
    try { invalidateGetCache(tipo); } catch (e) {}

    // invalida cache nivel app.js
    try { if (CACHE) { CACHE[tipo] = null; CACHE.loadedAt = 0; } } catch (e) {}

    // re-render según tipo
    if (tipo === "ventas") await renderVentas({ force: true });
    if (tipo === "gastos") await renderGastos({ force: true });
    if (tipo === "produccion") await renderProduccion({ force: true });
    if (tipo === "manoobra") await renderManoObraSimple();
    if (tipo === "aplicaciones") await renderAplicaciones();

    scheduleDashboard({ force: true });
  } catch (err) {
    console.warn("Delete OK, refresh UI failed:", err);
    // No alert aquí — porque ya borró.
  }
}



  // ===============================
// "Ver más" (paginación local)
// ===============================
const LIST_LIMITS = {
  ventas: 10,
  gastos: 10,
  produccion: 10,
  manoobra: 10,
  aplicaciones: 10,
};

function resetLimit(tipo, n = 10) {
  if (LIST_LIMITS[tipo] == null) return;
  LIST_LIMITS[tipo] = n;
}

function ensureLoadMoreBtn(listEl, tipo, renderFn, step = 10) {
  if (!listEl) return;

  const btnId = `${tipo}LoadMoreBtn`;
  let btn = document.getElementById(btnId);

  if (!btn) {
    btn = document.createElement("button");
    btn.id = btnId;
    btn.type = "button";
    btn.className = "btnSecondary";
    btn.style.marginTop = "10px";
    btn.style.width = "100%";
    btn.style.padding = "10px";
    btn.style.borderRadius = "12px";
    btn.style.cursor = "pointer";

    listEl.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", async () => {
      LIST_LIMITS[tipo] = (LIST_LIMITS[tipo] || 10) + step;
      await renderFn();
      btn.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return btn;
}

function updateLoadMoreBtn(btn, shown, total, step = 10) {
  if (!btn) return;

  // si ya se mostró todo, oculta el botón
  if (total <= shown) {
    btn.style.display = "none";
    return;
  }

  btn.style.display = "block";
  const remaining = total - shown;
  const next = Math.min(step, remaining);

  btn.textContent = `Ver ${next} más (mostrando ${shown} de ${total})`;
}




function ensureCancelBtn(formId, onCancel) {
  const form = document.getElementById(formId);
  if (!form) return;

  let btn = form.querySelector(".btnCancelEdit");
  if (btn) return;

  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btnCancelEdit";
  btn.textContent = "Cancelar edición";
  btn.style.marginLeft = "10px";
  btn.style.display = "none";

  btn.addEventListener("click", onCancel);
  form.appendChild(btn);
}


function moneyRD(v) { const n = Number(v || 0); return 'RD$' + n.toFixed(2); }
function toMoneyNumber(x) {
  if (x === null || x === undefined) return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;

  const s = String(x).trim();
  if (!s) return 0;

  // quita RD$, $, comas, espacios, etc.
  const cleaned = s.replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}



function formatFechaES(iso) {
  if (!iso) return "";
  const s = String(iso);
  const dOnly = s.includes("T") ? s.slice(0, 10) : s;

  const [y, m, d] = dOnly.split("-").map(Number);
  if (!y || !m || !d) return dOnly;

  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${meses[m - 1]} ${y}`;
}

function formatMesES(yyyyMm) {
  if (!yyyyMm) return "";
  const [y, m] = String(yyyyMm).split("-").map(Number);
  if (!y || !m) return yyyyMm;

  const meses = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  return `${meses[m - 1]} ${y}`;
}


function preserveSelectValue(selectId, fn) {
  const sel = document.getElementById(selectId);
  const prev = sel ? sel.value : "";
  fn(); // aquí refrescas el select (fillSelect o lo que sea)
  const sel2 = document.getElementById(selectId);
  if (sel2 && prev && [...sel2.options].some(o => o.value === prev)) {
    sel2.value = prev;
  } else if (sel2) {
    sel2.selectedIndex = 0;
  }
  if (sel2) sel2.dispatchEvent(new Event("change"));
}

function monthKeyFromAnyDate(v) {
  if (!v) return "";
  // Si ya viene como "YYYY-MM-DD" o "YYYY-MM"
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7); // YYYY-MM
    // si viene "MM/DD/YYYY" o "M/D/YYYY"
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}`;
    return "";
  }
  // Si es Date real
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}`;
  }
  // Por si viene número timestamp
  if (typeof v === "number") {
    const d = new Date(v);
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}


function lastNMonthsKeys(n = 12, from = new Date()) {
  const out = [];
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function normCatName(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildMonthlyPro(ventas = [], gastos = [], produccion = [], aplicaciones = [], n = 12) {
  const months = {};

  // base months list (last N)
  lastNMonthsKeys(n).forEach(k => months[k] = {
    mes: k,
    ventas: 0,
    gastos: 0,
    neto: 0,
    libras: 0,
    prodLb: 0,
    prodCajas: 0,
    manoobra: 0,
    apps: 0
  });

  // Ventas
  (ventas || []).forEach(v => {
    const mk = monthKeyFromAnyDate(v.fecha);
    if (!months[mk]) return;
    months[mk].ventas += Number(v.total) || 0;
    months[mk].libras += Number(v.libras) || 0;
  });

  // Gastos (NO apps aquí; solo mano de obra)
  (gastos || []).forEach(g => {
    const mk = monthKeyFromAnyDate(g.fecha);
    if (!months[mk]) return;

    const monto = Number(g.monto) || 0;
    months[mk].gastos += monto;

    const cat = normCatName(g.categoriaNombre || g.categoria);
    if (cat === "mano de obra" || cat === "manoobra") months[mk].manoobra += monto;

    // ❌ OJO: NO sumar aplicaciones desde gastos
    // if (cat === "aplicaciones" || cat === "aplicacion") months[mk].apps += monto;
  });

  // Producción
  (produccion || []).forEach(p => {
    const mk = monthKeyFromAnyDate(p.fecha);
    if (!months[mk]) return;
    months[mk].prodLb += Number(p.libras) || 0;
    months[mk].prodCajas += Number(p.cajas) || 0;
  });

  // ✅ Aplicaciones (desde tabla aplicaciones)
  (aplicaciones || []).forEach(a => {
    const mk = monthKeyFromAnyDate(a.fecha);
    if (!months[mk]) return;
    months[mk].apps += Number(a.costo) || 0;
  });

  const arr = Object.values(months).sort((a, b) => (a.mes < b.mes ? 1 : -1));
  arr.forEach(r => {
    r.neto = r.ventas - r.gastos;
    r.costoLb = r.libras ? (r.gastos / r.libras) : 0;
    r.margenLb = r.libras ? (r.neto / r.libras) : 0;
    r.moLb = r.libras ? (r.manoobra / r.libras) : 0;
    r.appsLb = r.libras ? (r.apps / r.libras) : 0;
  });

  return arr;
}


// ===============================
// CACHE (nivel 1 - memoria)
// ===============================
// ===============================
// CACHE (nivel 1 - memoria) + TTL
// ===============================
const CACHE = {
  ventas: null,
  gastos: null,
  produccion: null,
  manoobra: null,
  aplicaciones: null,
  loadedAt: 0,
};

const CACHE_TTL_MS = 60_000; // 60s (ajústalo)

function cacheIsFresh() {
  return CACHE.loadedAt && (Date.now() - CACHE.loadedAt) < CACHE_TTL_MS;
}

async function warmCache(opts = {}) {
  const force = !!opts.force;

  // si está fresco, no vuelvas a pegar al backend
  if (!force && cacheIsFresh() && CACHE.ventas && CACHE.gastos && CACHE.produccion && CACHE.aplicaciones) {
    return CACHE;
  }

  const [v, g, p, a] = await Promise.all([
    getVentas({ force }),
    getGastos({ force }),
    getProduccion({ force }),
    getAplicaciones ? getAplicaciones({ force }) : Promise.resolve([]),
  ]);

  CACHE.ventas = v || [];
  CACHE.gastos = g || [];
  CACHE.produccion = p || [];
  CACHE.aplicaciones = a || [];
  CACHE.loadedAt = Date.now();

  return CACHE;
}


// refresca SOLO un tipo (y deja lo demás intacto)
async function refreshCache(type, opts = {}) {
  const force = !!opts.force;
  if (type === "ventas") CACHE.ventas = await getVentas({ force });
  if (type === "gastos") CACHE.gastos = await getGastos({ force });
  if (type === "produccion") CACHE.produccion = await getProduccion({ force });
  if (type === "aplicaciones") CACHE.aplicaciones = await (getAplicaciones ? getAplicaciones({ force }) : []);
  CACHE.loadedAt = Date.now();
}


  
// ===============================
// 🍋 App Limones - app.js (LIMPIO)
// Tabs + Ventas + Gastos + Dashboard + Catálogos + Producción
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initApp().catch(err => console.error("initApp:", err));
});

// ---------- TABS ----------
function initTabs() {
  document.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabBtn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".view").forEach(v => v.classList.remove("activeView"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.view)?.classList.add("activeView");
    });
  });
}

// ---------- GLOBALS ----------
function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

let ZONAS = [], LABORES = [], EMPLEADOS = [];
let GASTO_CATS = [];
let EDIT = { tipo: null, id: null }; // tipo: 'venta' | 'gasto' | 'prod' | 'mo'


// ===== Clientes (catálogo local) =====
let CLIENTES = [];
const KEY_CLIENTES = "LIM_CLIENTES";

function readArr(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}
function writeArr(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr || []));
}

function loadClientes() {
  CLIENTES = readArr(KEY_CLIENTES);
  CLIENTES.sort((a,b) => (a.nombre||"").localeCompare(b.nombre||""));
}

function saveCliente(nombre, tel="") {
  const c = {
    id: "cli_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7),
    nombre: nombre.trim(),
    tel: tel.trim(),
    createdAt: Date.now()
  };
  const arr = readArr(KEY_CLIENTES);
  arr.push(c);
  writeArr(KEY_CLIENTES, arr);
  loadClientes();
  return c;
}

function fillClienteSelect() {
  const sel = document.getElementById("ventaCliente");
  if (!sel) return;

  const prev = sel.value || "";

  sel.innerHTML =
    `<option value="">Selecciona…</option>
     <option value="__NEW__">➕ Nuevo…</option>` +
    (CLIENTES || [])
      .slice()
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
      .map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nombre || "")}</option>`)
      .join("");

  // Preservar selección anterior si todavía existe
  if (prev && [...sel.options].some(o => o.value === prev)) {
    sel.value = prev;
  } else {
    sel.value = "";
  }
}



// ---------- INIT ----------
async function initApp() {
  // Hooks (solo listeners, nada de network aquí)
  hookVentas();
  hookGastos();
  hookCatalogForms();
  hookManoObraSimple();
  hookAplicaciones();

  // Catálogos locales (clientes)
  loadClientes();
  fillClienteSelect();
  hookClientesVentas();

  initDashboard();

  // ✅ Carga inicial en paralelo para que “abra” más rápido
  await loadCatalogos();
  hookProduccion();

  await Promise.all([
    renderVentas(),
    renderGastos(),
    renderProduccion(),
    renderManoObraSimple(),
    renderAplicaciones(),
  ]);

  // Dashboard usa cache interno (storage.js) para no “machacar” el backend
  await renderDashboard();
}



// ===============================
// PRODUCCIÓN (estilo AppSheet, sin AppSheet plataforma)
// - Zona: dropdown con "➕ Nuevo…"
// - Empleados: filas dinámicas con "➕ Nuevo…"
// - Guarda en storage.js (addProduccion / addEmpleado / addZona)
// ===============================

function setProdDefaultDate() {
  const el = document.getElementById("prodFecha");
  if (!el) return;
  if (el.value) return;
  el.value = todayISO();
}

function exitEditProduccion() {
  EDIT = { tipo: null, id: null };

  const sb = document.querySelector("#prodForm button[type='submit']");
  if (sb) sb.textContent = "Guardar producción";

  const cb = document.querySelector("#prodForm .btnCancelEdit");
  if (cb) cb.style.display = "none";

  document.getElementById("prodForm")?.reset();
  setProdDefaultDate();
}

let PROD_HOOKED = false;
let _prodEmpSelectPendiente = null;


function hookProduccion() {
  if (PROD_HOOKED) return;
  PROD_HOOKED = true;
  
  setProdDefaultDate();

  // 1 fila por defecto
  const wrap = document.getElementById("prodEmps");
  if (wrap && wrap.children.length === 0) addProdEmpRow();

  // + Agregar empleado
  document.getElementById("prodAddEmp")?.addEventListener("click", addProdEmpRow);

  // Zona: mostrar mini form si elige "➕ Nuevo…"
  const zonaSel = document.getElementById("prodZona");
  zonaSel?.addEventListener("change", () => {
    const box = document.getElementById("prodNewZonaBox");
    if (!box) return;
    box.style.display = (zonaSel.value === "__NEW__") ? "block" : "none";
    if (zonaSel.value === "__NEW__") document.getElementById("prodNewZonaNombre")?.focus();
  });

  // Guardar nueva zona
  document.getElementById("prodSaveNewZona")?.addEventListener("click", async () => {
    const nombreEl = document.getElementById("prodNewZonaNombre");
    const descEl = document.getElementById("prodNewZonaDesc");
    const nombre = (nombreEl?.value || "").trim();
    const desc = (descEl?.value || "").trim();
    if (!nombre) return alert("Pon el nombre de la zona.");

    await addZona({
      id: makeId(),
      nombre,
      descripcion: desc,
      activo: "1",
      createdAt: Date.now()
    });

    await loadCatalogos();

    const nueva = (ZONAS || []).find(z => String(z.nombre || "").trim().toLowerCase() === nombre.toLowerCase());
    if (nueva) document.getElementById("prodZona").value = nueva.id;

    document.getElementById("prodNewZonaBox").style.display = "none";
    if (nombreEl) nombreEl.value = "";
    if (descEl) descEl.value = "";
  });

  // Empleados: si elige "➕ Nuevo…" en cualquier fila, abrir mini form
  document.getElementById("prodEmps")?.addEventListener("change", (e) => {
    const sel = e.target;
    if (!(sel instanceof HTMLSelectElement)) return;
    if (!sel.classList.contains("prodEmpleadoSel")) return;

    if (sel.value === "__NEW__") {
      _prodEmpSelectPendiente = sel;
      const box = document.getElementById("prodNewEmpBox");
      if (box) box.style.display = "block";
      document.getElementById("prodNewEmpNombre")?.focus();
    }
  });

  // Guardar nuevo empleado (local, como Mano de Obra)
  document.getElementById("prodSaveNewEmp")?.addEventListener("click", async () => {
    const nombreEl = document.getElementById("prodNewEmpNombre");
    const telEl = document.getElementById("prodNewEmpTel");

    const nombre = (nombreEl?.value || "").trim();
    const tel = (telEl?.value || "").trim();
    if (!nombre) return alert("Pon el nombre del empleado.");
    const zonaPrev = document.getElementById("prodZona")?.value || "";


    await addEmpleado({
      id: makeId(),
      nombre,
      apodo: "",
      telefono: tel,
      zonaId: "",
      activo: "1",
      createdAt: Date.now()
    });

      await loadCatalogos();

      const selZona = document.getElementById("prodZona");
      if (
          selZona &&
          zonaPrev &&
          [...selZona.options].some(o => o.value === zonaPrev)
      ) {
          selZona.value = zonaPrev;
      }

    // refresca todos los selects de empleados en Producción
    document.querySelectorAll("#prodEmps .prodEmpleadoSel").forEach((s) => {
      const prev = s.value;
      fillEmpleadoSelectEl(s);
      if (prev && prev !== "__NEW__") s.value = prev;
    });

    // selecciona el nuevo empleado en el select pendiente
    const nuevo = (EMPLEADOS || []).find(e =>
      String(e.nombre || "").trim().toLowerCase() === nombre.toLowerCase()
    );
    if (nuevo && _prodEmpSelectPendiente) _prodEmpSelectPendiente.value = nuevo.id;
    _prodEmpSelectPendiente = null;

    document.getElementById("prodNewEmpBox").style.display = "none";
    if (nombreEl) nombreEl.value = "";
    if (telEl) telEl.value = "";
  });

  // Submit producción (local)
  const prodFormEl = document.getElementById("prodForm");
  prodFormEl?.addEventListener("submit", saveProduccion);

  ensureCancelBtn("prodForm", () => {
    exitEditProduccion();
  });

}

  

function fillEmpleadoSelectEl(sel) {
  if (!sel) return;
  sel.innerHTML =
    `<option value="">Selecciona…</option>
     <option value="__NEW__">➕ Nuevo…</option>` +
    (EMPLEADOS || [])
      .filter(e => String(e.activo ?? "1") !== "0")
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
      .map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nombre || "")}</option>`)
      .join("");
}

function addProdEmpRow(preselectId = "") {
  const wrap = document.getElementById("prodEmps");
  const tpl = document.getElementById("prodEmpTpl");
  if (!wrap || !tpl) return;

  const node = tpl.content.cloneNode(true);
  const row = node.querySelector(".empRow");
  const sel = node.querySelector(".prodEmpleadoSel");
  const rm = node.querySelector(".empRemove");

  fillEmpleadoSelectEl(sel);
  if (preselectId && [...sel.options].some(o => o.value === preselectId)) sel.value = preselectId;

  rm?.addEventListener("click", () => row?.remove());
  wrap.appendChild(node);
}


// ===============================
// GASTOS (estilo AppSheet, local)
// ===============================

function setGastoDefaultDate() {
  const el = document.getElementById("gastoFecha");
  if (!el) return;
  if (!el.value) el.value = todayISO();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function compressImageFile(file, opts = {}) {
  // Comprime fotos (ideal para móviles) antes de guardarlas como dataURL.
  // Fallback: si algo falla, devolvemos el dataURL original.
  if (!file) return "";
  const type = String(file.type || "").toLowerCase();
  if (!type.startsWith("image/")) return await fileToDataURL(file);

  const maxSize = Number(opts.maxSize || 1600);      // px
  const quality1 = Number(opts.quality || 0.75);     // 0..1
  const mimeType = String(opts.mimeType || "image/jpeg");

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });

    let w0 = img.naturalWidth || img.width;
    let h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("invalid image dims");

    const scale = Math.min(1, maxSize / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no canvas ctx");

    // Fondo blanco (por si viene con transparencia)
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const toData = (q) => canvas.toDataURL(mimeType, q);

    let dataUrl = toData(quality1);

    // Si todavía queda demasiado grande (~> 1.5MB), bajamos un poco calidad.
    const approxBytes = Math.round((dataUrl.length - (dataUrl.indexOf(",") + 1)) * 0.75);
    if (approxBytes > 1_500_000) {
      dataUrl = toData(0.65);
    }

    URL.revokeObjectURL(img.src);
    return dataUrl;
  } catch (err) {
    console.warn("compressImageFile fallback:", err);
    try { return await fileToDataURL(file); } catch { return ""; }
  }
}


let GASTOS_HOOKED = false;

function hookGastos() {
  if (GASTOS_HOOKED) return;
  GASTOS_HOOKED = true;
  
  setGastoDefaultDate();
  


  function ensureCancelBtnGasto() {
    const form = document.getElementById("gastoForm");
    if (!form) return;

    let btn = form.querySelector(".btnCancelEdit");
    if (btn) return;

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btnCancelEdit";
    btn.textContent = "Cancelar edición";
    btn.style.marginLeft = "10px";
    btn.style.display = "none";

    btn.addEventListener("click", () => {
      EDIT = { tipo: null, id: null };

      const submitBtn = document.querySelector("#gastoForm button[type='submit']");
      if (submitBtn) submitBtn.textContent = "Guardar gasto";

      btn.style.display = "none";
      form.reset();
      setGastoDefaultDate();

      document.getElementById("gastoNewCatBox") && (document.getElementById("gastoNewCatBox").style.display = "none");
      document.getElementById("gastoNewEmpBox") && (document.getElementById("gastoNewEmpBox").style.display = "none");
    });

    form.appendChild(btn);
  }

  ensureCancelBtnGasto();



  // Categoría: mostrar mini form si elige "➕ Nuevo…"
  const catSel = document.getElementById("gastoCategoria");
  catSel?.addEventListener("change", () => {
    const box = document.getElementById("gastoNewCatBox");
    if (!box) return;
    box.style.display = (catSel.value === "__NEW__") ? "block" : "none";
    if (catSel.value === "__NEW__") document.getElementById("gastoNewCatNombre")?.focus();
  });

  // Guardar nueva categoría
  document.getElementById("gastoSaveNewCat")?.addEventListener("click", async () => {
    const nombreEl = document.getElementById("gastoNewCatNombre");
    const nombre = (nombreEl?.value || "").trim();
    if (!nombre) return alert("Pon el nombre de la categoría.");

    await addGastoCategoria({
      id: makeId(),
      nombre,
      activo: "1",
      createdAt: Date.now()
    });

    


    await loadCatalogos(); // recarga y rellena selects

    const nueva = (GASTO_CATS || []).find(c => String(c.nombre || "").trim().toLowerCase() === nombre.toLowerCase());
    if (nueva) document.getElementById("gastoCategoria").value = nueva.id;

    document.getElementById("gastoNewCatBox").style.display = "none";
    if (nombreEl) nombreEl.value = "";
  });


  
  

  
  // Empleado: si elige "➕ Nuevo…", abrir mini form
  const empSel = document.getElementById("gastoEmpleado");
  empSel?.addEventListener("change", () => {
    const box = document.getElementById("gastoNewEmpBox");
    if (!box) return;
    box.style.display = (empSel.value === "__NEW__") ? "block" : "none";
    if (empSel.value === "__NEW__") document.getElementById("gastoNewEmpNombre")?.focus();
  });

  // Guardar nuevo empleado (reusa addEmpleado)
  document.getElementById("gastoSaveNewEmp")?.addEventListener("click", async () => {
    const nombreEl = document.getElementById("gastoNewEmpNombre");
    const telEl = document.getElementById("gastoNewEmpTel");

    const nombre = (nombreEl?.value || "").trim();
    const tel = (telEl?.value || "").trim();
    if (!nombre) return alert("Pon el nombre del empleado.");

    await addEmpleado({
      id: makeId(),
      nombre,
      apodo: "",
      telefono: tel,
      zonaId: "",
      activo: "1",
      createdAt: Date.now()
    });

    await loadCatalogos(); // refresca EMPLEADOS + rellena gastoEmpleado

    // seleccionar nuevo empleado
    const nuevo = (EMPLEADOS || []).find(e => String(e.nombre || "").trim().toLowerCase() === nombre.toLowerCase());
    if (nuevo) document.getElementById("gastoEmpleado").value = nuevo.id;

    document.getElementById("gastoNewEmpBox").style.display = "none";
    if (nombreEl) nombreEl.value = "";
    if (telEl) telEl.value = "";
  });

  // Submit gasto
  document.getElementById("gastoForm")?.addEventListener("submit", saveGasto);
  
}

async function saveGasto(e) {
  e.preventDefault();

  const fecha = normalizeISODate(document.getElementById("gastoFecha")?.value);

  const catEl = document.getElementById("gastoCategoria");
  const categoriaId = catEl?.value || "";
  const categoriaNombre = catEl?.selectedOptions?.[0]?.textContent || "";

  const monto = Number(document.getElementById("gastoMonto")?.value || 0);
  const metodoPago = document.getElementById("gastoMetodo")?.value || "";
  const proveedor = (document.getElementById("gastoProveedor")?.value || "").trim();

  const empEl = document.getElementById("gastoEmpleado");
  const empleadoId = empEl?.value || "";
  const empleadoNombre = empEl?.selectedOptions?.[0]?.textContent || "";

  const nota = (document.getElementById("gastoNota")?.value || "").trim();

  // recibo nuevo (si lo suben). Si no suben nada, no vamos a borrar el viejo.
  const file = document.getElementById("gastoRecibo")?.files?.[0] || null;
  const reciboFotoNew = file ? await compressImageFile(file) : "";

  if (!fecha) return alert("Fecha inválida.");
  if (!categoriaId) return alert("Categoría requerida: selecciona una.");
  if (categoriaId === "__NEW__") return alert("Categoría requerida: termina de crearla.");
  if (!(monto > 0)) return alert("Monto debe ser > 0.");
  if (!metodoPago) return alert("Selecciona método de pago.");

  const patch = {
    fecha,
    categoriaId,
    categoriaNombre,
    monto: round2(monto),
    metodoPago,
    proveedor,
    empleadoId: (empleadoId && empleadoId !== "__NEW__") ? empleadoId : "",
    empleadoNombre: (empleadoId && empleadoId !== "__NEW__") ? empleadoNombre : "",
    nota
  };

  // ✅ solo incluir reciboFoto si subieron uno nuevo
  if (reciboFotoNew) patch.reciboFoto = reciboFotoNew;

  // ✅ EDIT vs ADD
  if (EDIT?.tipo === "gasto" && EDIT?.id) {
    await updateGasto(EDIT.id, patch);

    // salir de modo edición
    EDIT = { tipo: null, id: null };

    const submitBtn = document.querySelector("#gastoForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar gasto";

    const cancelBtn = document.querySelector("#gastoForm .btnCancelEdit");
    if (cancelBtn) cancelBtn.style.display = "none";

    alert("✅ Gasto actualizado");
  } else {
    await addGasto({
      id: makeId(),
      ...patch,
      reciboFoto: reciboFotoNew, // en ADD sí puede ir vacío
      createdAt: Date.now()
    });

    alert("✅ Gasto guardado");
  }

  // 🔄 refrescar caches para que el gasto aparezca inmediatamente
  // 🔥 Actualiza CACHE local (sin re-fetch)
await warmCache(); // asegura que CACHE exista

if (EDIT?.tipo === null) {
  // fue ADD (ya saliste de EDIT arriba)
  // si quieres, puedes empujar el nuevo registro aquí (si lo tienes)
} 
// En update/add, lo más simple: refresca SOLO gastos una vez cada tanto:
await refreshCache("gastos"); // 1 solo fetch, no 3

document.getElementById("gastoForm")?.reset();
setGastoDefaultDate();

await renderGastos();     // render desde cache
scheduleDashboard();      // dashboard debounced

}



function beginEditGasto(g) {
  EDIT = { tipo: "gasto", id: g.id };

  // fecha (igual lógica que Ventas)
  const gf = document.getElementById("gastoFecha");
  if (gf) {
    const s = String(g.fecha || "");
    gf.value = s.includes("T") ? s.slice(0, 10) : (s.includes(" ") ? s.split(" ")[0] : s);
  }

  document.getElementById("gastoMonto").value = g.monto ?? "";
  document.getElementById("gastoProveedor").value = (g.proveedor || "").trim();
  document.getElementById("gastoNota").value = (g.nota || "").trim();

  const cat = document.getElementById("gastoCategoria");
  if (cat) cat.value = g.categoriaId || "";

  const met = document.getElementById("gastoMetodo");
  if (met) met.value = g.metodoPago || "";

  const emp = document.getElementById("gastoEmpleado");
  if (emp) emp.value = g.empleadoId || "";

  // UI (igual que Ventas)
  const submitBtn = document.querySelector("#gastoForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";

  const cancelBtn = document.querySelector("#gastoForm .btnCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  // te lleva al form
  document.getElementById("gastoForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}




async function renderGastos(opts = {}) {
  const list = document.getElementById("gastosList");
  if (!list) return;

  await warmCache(opts);
  const items = (CACHE.gastos || []);

  list.innerHTML = "";
  const limit = LIST_LIMITS.gastos || 10;
  items.slice(0, limit).forEach(g => {
    const li = document.createElement("li");

    // ✅ usa el mismo estilo “card” que Ventas / Producción
    li.className = "ventaItem manoItem";

    const montoTxt = moneyRD(g.monto || 0);
    const fechaTxt = formatFechaES(g.fecha || g.createdAt);    
    const catTxt = (g.categoriaNombre || g.categoria || "Sin categoría").trim();
    const metodoTxt = (g.metodoPago || "").trim();
    const provTxt = (g.proveedor || "").trim();
    const empTxt = (g.empleadoNombre || "").trim();

    

    // Línea 2 abajo: empleado opcional (como “Alberto — Tarea 5 • 8h” si lo tienes en nota)
    

    const catLower = String(catTxt || "").trim().toLowerCase();
    const isMO = (catLower === "mano de obra" || catLower === "manoobra");

    const linea2 = [catTxt, metodoTxt].filter(Boolean).join(" • ");

    const linea3Parts = [];
    if (provTxt) linea3Parts.push(provTxt);
    if (empTxt) linea3Parts.push(`👷 ${empTxt}`);
    const linea3 = linea3Parts.join(" • ");

    li.innerHTML = `
      <div class="itemTop">
        <strong>💰 ${escapeHtml(montoTxt)}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
        <button type="button" class="btnDanger btnDelete" style="margin-left:10px;">Borrar</button>
      </div>

      <div class="muted">${escapeHtml(linea2)}</div>

      ${linea3 ? `<div class="muted">${escapeHtml(linea3)}</div>` : ""}

      ${(!isMO && g.nota) ? `<div class="ventaNota">${escapeHtml(g.nota)}</div>` : ""}
    `;
      

    const delBtn = li.querySelector(".btnDelete");
    delBtn?.addEventListener("click", async (ev) => {
  ev.stopPropagation();
  await deleteItem("gastos", g.id);
});


    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditGasto(g));
    list.appendChild(li);
  });

    const btn = ensureLoadMoreBtn(list, "gastos", () => renderGastos(opts), 10);
    updateLoadMoreBtn(btn, Math.min(limit, items.length), items.length, 10);


}




// ---------- DASHBOARD MONTH FIX ----------
function initDashboard() {
  const m = document.getElementById("dashMes");
  if (!m) return;

  const now = new Date();
  const isoMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  if (!m.value) m.value = isoMonth;
  m.addEventListener("change", () => renderDashboard());
}

// ---------- CATÁLOGOS ----------
async function loadCatalogos() {
  ZONAS = await getZonas();
  LABORES = await getLabores();
  EMPLEADOS = await getEmpleados();
  GASTO_CATS = await getGastoCategorias();

// Categoría de gastos (con + Nuevo…)
fillSelect("gastoCategoria", GASTO_CATS, true, true);





// Empleado en gastos (opcional, con + Nuevo…)
fillSelect("gastoEmpleado", EMPLEADOS, true, true);

  fillSelect("prodZona", ZONAS, true, true); // 👈 allowNew = true
  fillSelect("appZona", ZONAS, true, true);
  fillSelect("moEmpleado", EMPLEADOS, true, true);
  fillSelect("moZona", ZONAS, false);
  fillSelect("moTarea", LABORES, true, true);
  
}

function fillSelect(id, arr, allowEmpty, allowNew = false) {
  const sel = document.getElementById(id);
  if (!sel) return;

  // base
  sel.innerHTML = `<option value="">Selecciona…</option>`;

  // + Nuevo…
  if (allowNew) {
    sel.innerHTML += `<option value="__NEW__">➕ Nuevo…</option>`;
  }

  // opciones
  (arr || []).forEach((x) => {
    if (String(x.activo ?? "1") === "0") return;

    const opt = document.createElement("option");
    opt.value = x.id;

    // soporte para diferentes nombres de campo
    opt.textContent =
      x.nombre ?? x.categoria ?? x.label ?? x.titulo ?? x.name ?? "";

    sel.appendChild(opt);
  });

  // si allowEmpty es false y hay opciones reales, selecciona la primera real
  if (!allowEmpty) {
    const firstReal = [...sel.options].find(o => o.value && o.value !== "__NEW__");
    if (firstReal) sel.value = firstReal.value;
  }
}



// ---------- MINI FORMS CATÁLOGOS ----------
function hookCatalogForms() {
  document.getElementById("zonaAddForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = document.getElementById("zonaNombre").value.trim();
    if (!nombre) return alert("Nombre de zona requerido");
    await addZona({
      id: makeId(),
      nombre,
      descripcion: document.getElementById("zonaDesc").value.trim(),
      activo: "1",
      createdAt: Date.now()
    });
    e.target.reset();
    await loadCatalogos();
  });

  document.getElementById("laborAddForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = document.getElementById("laborNombre").value.trim();
    if (!nombre) return alert("Nombre de labor requerido");
    await addLabor({
      id: makeId(),
      nombre,
      categoria: document.getElementById("laborCategoria").value.trim(),
      activo: "1",
      createdAt: Date.now()
    });
    e.target.reset();
    await loadCatalogos();
  });

  document.getElementById("empAddForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const nombre = document.getElementById("empNombre").value.trim();
    if (!nombre) return alert("Nombre de empleado requerido");
    await addEmpleado({
      id: makeId(),
      nombre,
      apodo: "",
      telefono: document.getElementById("empTel").value.trim(),
      zonaId: "",
      activo: "1",
      createdAt: Date.now()
    });
    e.target.reset();
    await loadCatalogos();
  });
}

// ---------- PRODUCCIÓN ----------

async function saveProduccion(e) {
  e.preventDefault();

  const fecha = normalizeISODate(document.getElementById("prodFecha")?.value);
  const zonaEl = document.getElementById("prodZona");
  const zonaId = zonaEl?.value || "";
  const zonaNombre = zonaEl?.selectedOptions?.[0]?.textContent || "";

  const libras = Number(document.getElementById("prodLibras")?.value || 0);
  const cajas = Number(document.getElementById("prodCajas")?.value || 0);
  const nota = (document.getElementById("prodNota")?.value || "").trim();

  const pickedIds = [...document.querySelectorAll("#prodEmps .prodEmpleadoSel")]
    .map(s => s.value)
    .filter(v => v && v !== "__NEW__");
  const uniqueIds = [...new Set(pickedIds)];

  const pickedNames = [...document.querySelectorAll("#prodEmps .prodEmpleadoSel")]
    .map(s => s.selectedOptions?.[0]?.textContent || "")
    .filter(Boolean);
  const uniqueNames = [...new Set(pickedNames)];

  if (!fecha) return alert("Fecha inválida.");
  if (!zonaId || zonaId === "__NEW__") return alert("Selecciona una zona.");
  if (!(libras > 0)) return alert("Libras debe ser > 0.");
  if (uniqueIds.length === 0) return alert("Agrega por lo menos un empleado.");

  const data = {
    id: makeId(),
    fecha,
    zonaId,
    zonaNombre,
    libras: round2(libras),
    cajas: cajas ? Math.round(cajas) : 0,
    responsableId: uniqueIds.join(","),
    responsableNombre: uniqueNames.join(", "),
    nota,
    createdAt: Date.now()
  };

  if (typeof addProduccion !== "function") {
    console.warn("addProduccion no existe en storage.js");
    alert("Falta addProduccion() en storage.js. Dime y lo agregamos.");
    return;
  }

// ✅ EDIT vs ADD
if (EDIT?.tipo === "prod" && EDIT?.id) {
  if (typeof updateProduccion === "function") {
    await updateProduccion(EDIT.id, { ...data, id: EDIT.id });
  } else {
    alert("Falta updateProduccion() en storage.js. Dime y lo agregamos.");
    return;
  }

  exitEditProduccion();
  alert("✅ Producción actualizada");
} else {
  await addProduccion(data);
  alert("✅ Producción guardada");
}

// refrescar UI
await refreshCache("produccion");
await renderProduccion();
scheduleDashboard();
}


function beginEditProduccion(p) {
  EDIT = { tipo: "prod", id: p.id };

  // fecha (igual que Ventas)
  const f = document.getElementById("prodFecha");
  if (f) {
    const s = String(p.fecha || "");
    f.value = s.includes("T") ? s.slice(0, 10) : (s.includes(" ") ? s.split(" ")[0] : s);
  }

  // zona
  const zonaEl = document.getElementById("prodZona");
  if (zonaEl) zonaEl.value = p.zonaId || "";

  // libras / cajas / nota
  const lbEl = document.getElementById("prodLibras");
  if (lbEl) lbEl.value = p.libras ?? "";

  const cxEl = document.getElementById("prodCajas");
  if (cxEl) cxEl.value = p.cajas ?? "";

  const notaEl = document.getElementById("prodNota");
  if (notaEl) notaEl.value = (p.nota || "").trim();

  // empleados (reconstruye filas)
  const cont = document.getElementById("prodEmps");
  if (cont) {
    cont.innerHTML = "";

    const ids = String(p.responsableId || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (!ids.length) ids.push("");

    ids.forEach(id => {
      addProdEmpRow(id); // tu función existente
    });
  }

  // UI (igual que Ventas)
  const submitBtn = document.querySelector("#prodForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";

  const cancelBtn = document.querySelector("#prodForm .btnCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  // scroll al form
  document.getElementById("prodForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}



async function renderProduccion() {
  const ul = document.getElementById("prodList");
  if (!ul) return;

  ul.innerHTML = "<li>Cargando…</li>";

  await warmCache();
  const arr = (CACHE.produccion || []);
  if (!arr.length) {
    ul.innerHTML = "<li>No hay producción.</li>";
    return;
  }

  ul.innerHTML = "";
  const limit = LIST_LIMITS.produccion || 10;
  arr.slice(0, limit).forEach(p => {
    const li = document.createElement("li");
    li.className = "ventaItem";

    const fechaTxt = formatFechaES(p.fecha || p.createdAt);
    const zonaTxt = (p.zonaNombre || "").trim();
    const respTxt = (p.responsableNombre || "").trim();
    const librasTxt = `${Number(p.libras || 0).toFixed(2)} lb`;
    const cajasTxt = Number(p.cajas || 0) ? ` • ${Number(p.cajas || 0)} cajas` : "";

    li.innerHTML = `
      <div class="itemTop">
        <strong>${escapeHtml(librasTxt)}${escapeHtml(cajasTxt)}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
        <button type="button" class="btnDanger btnDelete" style="margin-left:10px;">Borrar</button>
      </div>

      <div class="muted">${escapeHtml(zonaTxt || "Zona")}</div>
      ${respTxt ? `<div class="muted">👷 ${escapeHtml(respTxt)}</div>` : ""}
      ${p.nota ? `<div class="muted">${escapeHtml(p.nota)}</div>` : ""}
    `;
    const delBtn = li.querySelector(".btnDelete");
    delBtn?.addEventListener("click", async (ev) => {
  ev.stopPropagation();
  await deleteItem("produccion", p.id);
});


    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditProduccion(p));


    // (Edición de producción la arreglamos después)
    ul.appendChild(li);
  });

  const btn = ensureLoadMoreBtn(ul, "produccion", renderProduccion, 10);
  updateLoadMoreBtn(btn, Math.min(limit, arr.length), arr.length, 10);

}

let MO_HOOKED = false;

function exitEditManoObra() {
  EDIT = { tipo: null, id: null };

  const sb = document.querySelector("#moForm button[type='submit']");
  if (sb) sb.textContent = "Guardar mano de obra";

  const cb = document.querySelector("#moForm .btnCancelEdit");
  if (cb) cb.style.display = "none";

  const form = document.getElementById("moForm");
  form?.reset();

  const f = document.getElementById("moFecha");
  if (f) f.value = todayISO();
}


function hookManoObraSimple() {
  if (MO_HOOKED) return;
  MO_HOOKED = true;

  const form = document.getElementById("moForm");
  if (!form) return;

 ensureCancelBtn("moForm", () => {
  exitEditManoObra();
});

  const f = document.getElementById("moFecha");
  if (f && !f.value) f.value = todayISO();

  const empSel = document.getElementById("moEmpleado");
  const taskSel = document.getElementById("moTarea");

  // Mostrar mini forms cuando eligen "Nuevo…"
  empSel?.addEventListener("change", () => {
    const box = document.getElementById("moNewEmpBox");
    if (!box) return;
    box.style.display = (empSel.value === "__NEW__") ? "block" : "none";
  });

  taskSel?.addEventListener("change", () => {
    const box = document.getElementById("moNewTaskBox");
    if (!box) return;
    box.style.display = (taskSel.value === "__NEW__") ? "block" : "none";
  });

  // Guardar nuevo empleado
  document.getElementById("moSaveNewEmp")?.addEventListener("click", async () => {
    const nombre = document.getElementById("moNewEmpNombre").value.trim();
    const tel = document.getElementById("moNewEmpTel").value.trim();
      if (!nombre) return alert("Pon el nombre del empleado.");
    const empPrev = document.getElementById("moEmpleado")?.value || "";
    const tareaPrev = document.getElementById("moTarea")?.value || ""; // opciona

    await addEmpleado({
      id: makeId(),
      nombre,
      apodo: "",
      telefono: tel,
      zonaId: "",
      activo: "1",
      createdAt: Date.now()
    });

    // recarga catálogos y selecciona el nuevo
    await loadCatalogos();

    const selEmp = document.getElementById("moEmpleado");
    if (selEmp && empPrev && [...selEmp.options].some(o => o.value === empPrev)) {
        selEmp.value = empPrev;
    }

    const selTarea = document.getElementById("moTarea");
    if (selTarea && tareaPrev && [...selTarea.options].some(o => o.value === tareaPrev)) {
        selTarea.value = tareaPrev;
    }

    const nuevo = EMPLEADOS.find(e => e.nombre === nombre);
    if (nuevo && empSel) empSel.value = nuevo.id;

    document.getElementById("moNewEmpBox").style.display = "none";
    document.getElementById("moNewEmpNombre").value = "";
    document.getElementById("moNewEmpTel").value = "";
  });

  // Guardar nueva tarea (Labores)
  // Guardar nueva tarea (Labores)
document.getElementById("moSaveNewTask")?.addEventListener("click", async () => {
  const nombre = document.getElementById("moNewTaskNombre").value.trim();
  if (!nombre) return alert("Pon el nombre de la tarea.");

  // ✅ guarda selecciones actuales ANTES del refresh
  const empPrev = document.getElementById("moEmpleado")?.value || "";
  const tareaPrev = document.getElementById("moTarea")?.value || "";

  await addLabor({
    id: makeId(),
    nombre,
    categoria: "ManoObra",
    activo: "1",
    createdAt: Date.now()
  });

  await loadCatalogos(); // esto reconstruye los selects

  // ✅ restaura empleado
  const selEmp = document.getElementById("moEmpleado");
  if (selEmp && empPrev && [...selEmp.options].some(o => o.value === empPrev)) {
    selEmp.value = empPrev;
    selEmp.dispatchEvent(new Event("change"));
  }

  // ✅ si quieres: restaura tarea previa (si existía)
  const selTarea = document.getElementById("moTarea");
  if (selTarea && tareaPrev && [...selTarea.options].some(o => o.value === tareaPrev)) {
    selTarea.value = tareaPrev;
  }

  // ✅ selecciona la nueva tarea creada
  const nueva = (LABORES || []).find(t => String(t.nombre || "") === nombre);
  if (nueva && selTarea) selTarea.value = nueva.id;

  document.getElementById("moNewTaskBox").style.display = "none";
  document.getElementById("moNewTaskNombre").value = "";
});


  
  // Cambiar etiqueta "Horas" -> "Días" (nosotros pagamos por día)
  const moHorasEl = document.getElementById("moHoras");
  const moHorasLabel = moHorasEl?.closest("label");
  if (moHorasLabel) {
    // Reemplaza el texto visible del label (sin tocar el input)
    const txtNode = Array.from(moHorasLabel.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
    if (txtNode) txtNode.textContent = "Días de trabajo";
  }

  // Total (días x pago por día) - si existe el input #moTotal, lo mantiene actualizado
  const moTotalEl = document.getElementById("moTotal");
  const recalcMOTotal = () => {
    const dias = Number(document.getElementById("moHoras")?.value || 0);
    const pagoDia = Number(document.getElementById("moPagoDia")?.value || 0);
    const total = round2((isFinite(dias) ? dias : 0) * (isFinite(pagoDia) ? pagoDia : 0));
    if (moTotalEl) moTotalEl.value = moneyRD(total);
  };

  document.getElementById("moHoras")?.addEventListener("input", recalcMOTotal);
  document.getElementById("moPagoDia")?.addEventListener("input", recalcMOTotal);
  recalcMOTotal();


  // Submit mano de obra simple (pagamos por día)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fecha = normalizeISODate(document.getElementById("moFecha")?.value || "");
    const empleadoId = document.getElementById("moEmpleado")?.value || "";
    const tareaId = document.getElementById("moTarea")?.value || "";
    const dias = Number(document.getElementById("moHoras")?.value || 0); // reutilizamos el input moHoras como "días"
    const pagoDia = Number(document.getElementById("moPagoDia")?.value || 0);
    const nota = (document.getElementById("moNota")?.value || "").trim();

    if (!fecha) return alert("Fecha inválida. Usa el calendario.");
    if (!empleadoId || empleadoId === "__NEW__") return alert("Selecciona un empleado.");
    if (!tareaId || tareaId === "__NEW__") return alert("Selecciona una tarea.");
    if (!isFinite(dias) || dias <= 0) return alert("Días de trabajo debe ser > 0.");
    if (!isFinite(pagoDia) || pagoDia < 0) return alert("Pago por día debe ser >= 0.");

    const emp = (EMPLEADOS || []).find(x => x.id === empleadoId) || {};
    const task = (LABORES || []).find(x => x.id === tareaId) || {};

    const totalMO = round2(dias * pagoDia);

    const payload = {
      fecha,
      empleadoId: emp.id || "",
      empleadoNombre: emp.nombre || "",
      tareaId: task.id || "",
      tareaNombre: task.nombre || "",
      horas: round2(dias),        // mantenemos el nombre "horas" en storage, pero ahora representa "días"
      pagoDia: round2(pagoDia),
      total: totalMO,             // campo extra (no rompe si la hoja lo ignora)
      nota,
    };

    if (EDIT?.tipo === "mo" && EDIT?.id) {
  await updateManoObra(EDIT.id, payload);
  exitEditManoObra();
  alert("✅ Mano de obra actualizada");
} else {
  await addManoObra({
    id: makeId(),
    ...payload,
    createdAt: Date.now(),
  });

  let gastoOk = true;
  try {
    await addGasto({
      id: makeId(),
      fecha,
      monto: totalMO,
      categoriaId: "",
      categoriaNombre: "Mano de obra",
      categoria: "Mano de obra",
      metodoPago: "EFECTIVO",
      proveedor: "",
      empleadoId: emp.id || "",
      empleadoNombre: emp.nombre || "",
      nota: `${empNombre} — ${tareaNombre} • ${round2(dias)}d x ${moneyRD(pagoDia)} = ${moneyRD(totalMO)}${nota ? " • " + nota : ""}`,
      createdAt: Date.now()
    });
  } catch (err) {
    gastoOk = false;
    console.error("No se pudo crear gasto automático:", err);
  }

  if (!gastoOk) alert("⚠️ Mano de obra se guardó, pero el gasto automático falló.");
  alert("✅ Mano de obra guardada");
}

// ✅ refrescar SIEMPRE (nuevo y editar)
await renderManoObraSimple();
await renderGastos();
scheduleDashboard?.();

form.reset();
const mf = document.getElementById("moFecha");
if (mf) mf.value = todayISO();

});

}


async function renderManoObraSimple() {
  const ul = document.getElementById("moList");
  if (!ul) return;

  ul.innerHTML = "<li>Cargando…</li>";

  const arr = (await getManoObra()) || [];
  if (!arr.length) {
    ul.innerHTML = "<li>No hay mano de obra.</li>";
    return;
  }

  ul.innerHTML = "";
  const limit = LIST_LIMITS.manoobra || 10;
  arr.slice(0, limit).forEach(m => {
    const li = document.createElement("li");
    li.className = "ventaItem";

  li.innerHTML = `
  <div class="itemTop">
    <strong>👷 ${escapeHtml(m.empleadoNombre || "")} — ${escapeHtml(fmtDate(m.fecha))}</strong>
    <button type="button" class="btnDanger btnDelete" style="margin-left:10px;">Borrar</button>
  </div>

  <div class="muted">
    💰 ${moneyRD(toMoneyNumber(m.total ?? (Number(m.horas||0)*Number(m.pagoDia||0))))}
  </div>

  <div class="muted">
    ${escapeHtml(m.tareaNombre || "")} • ${Number(m.horas || 0).toFixed(2)} d
  </div>

  ${m.nota ? `<div class="ventaNota">${escapeHtml(m.nota)}</div>` : ""}
`;



    const delBtn = li.querySelector(".btnDelete");
    delBtn?.addEventListener("click", async (ev) => {
  ev.stopPropagation();
  await deleteItem("manoobra", m.id);
});


    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditManoObra(m));

    ul.appendChild(li);
  });

  const btn = ensureLoadMoreBtn(ul, "manoobra", renderManoObraSimple, 10);
  updateLoadMoreBtn(btn, Math.min(limit, arr.length), arr.length, 10);

}



function beginEditManoObra(m) {
  EDIT = { tipo: "mo", id: m.id };

  // fecha (igual que Ventas)
  const f = document.getElementById("moFecha");
  if (f) {
    const s = String(m.fecha || "");
    f.value = s.includes("T") ? s.slice(0, 10) : (s.includes(" ") ? s.split(" ")[0] : s);
  }

  // empleado / tarea
  const emp = document.getElementById("moEmpleado");
  if (emp) emp.value = m.empleadoId || "";

  const tarea = document.getElementById("moTarea");
  if (tarea) tarea.value = m.tareaId || "";

  // horas / pago / nota
  const horas = document.getElementById("moHoras");
  if (horas) horas.value = m.horas ?? "";

  const pago = document.getElementById("moPagoDia");
  if (pago) pago.value = m.pagoDia ?? "";

  // total (si existe campo)
  const moTotalEl = document.getElementById("moTotal");
  if (moTotalEl) {
    const dias = Number(m.horas || 0);
    const pagoDia = Number(m.pagoDia || 0);
    moTotalEl.value = moneyRD(round2(dias * pagoDia));
  }

  const nota = document.getElementById("moNota");
  if (nota) nota.value = (m.nota || "").trim();

  // UI (igual que Ventas)
  const submitBtn = document.querySelector("#moForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";

  const cancelBtn = document.querySelector("#moForm .btnCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  // scroll al form
  document.getElementById("moForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}




// ---------- VENTAS ----------
function hookVentas() {
  const form = document.getElementById("ventaForm");
  if (!form) return;

  const elFecha = document.getElementById("ventaFecha");
  const elCliente = document.getElementById("ventaCliente");
  const elTipo = document.getElementById("ventaTipo");
  const elRowLbs = document.getElementById("ventaRowLbs");
  const elRowUn  = document.getElementById("ventaRowUn");
  const elUnidades = document.getElementById("ventaUnidades");
  const elPrecioUn = document.getElementById("ventaPrecioUnidad");
  const elLibras = document.getElementById("ventaLibras");
  const elPrecio = document.getElementById("ventaPrecio");
  const elTotal = document.getElementById("ventaTotal");
  const elMetodo = document.getElementById("ventaMetodo");
  const elEstado = document.getElementById("ventaEstado");
  const elCobrado = document.getElementById("ventaCobrado");
  const elBalance = document.getElementById("ventaBalance");
  const elNota = document.getElementById("ventaNota");
  const elFoto = document.getElementById("ventaFoto");
  const elPreview = document.getElementById("ventaFotoPreview");

  if (elFecha && !elFecha.value) elFecha.value = todayISO();

  // Toggle UI + Recalcula total/balance en vivo
  const applyTipoUI = () => {
    const tipo = String(elTipo?.value || "LB");
    const isUN = (tipo === "UN");
    if (elRowLbs) elRowLbs.style.display = isUN ? "none" : "";
    if (elRowUn)  elRowUn.style.display  = isUN ? "" : "none";
  };

  const recalc = () => {
    const tipo = String(elTipo?.value || "LB");
    const isUN = (tipo === "UN");

    const qty = Number((isUN ? elUnidades?.value : elLibras?.value) || 0);
    const price = Number((isUN ? elPrecioUn?.value : elPrecio?.value) || 0);

    const total = (isFinite(qty) ? qty : 0) * (isFinite(price) ? price : 0);

    // Si cobrado está vacío, lo tratamos como 0 para cálculo visual
    const cobrado = Number(elCobrado?.value || 0);
    const balance = total - (isFinite(cobrado) ? cobrado : 0);

    if (elTotal) elTotal.value = moneyRD(total);
    if (elBalance) elBalance.value = moneyRD(balance);
  };

  [elLibras, elPrecio, elUnidades, elPrecioUn, elCobrado].forEach(el => el?.addEventListener("input", recalc));
  elTipo?.addEventListener("change", () => { applyTipoUI(); recalc(); });
  elEstado?.addEventListener("change", () => {
    // si marcan Pagado y no han puesto cobrado, autocompleta con total
    if (!elCobrado) return recalc();
    const estado = String(elEstado.value || "");
    const tipoVenta = String(elTipo?.value || "LB");

    const libras = Number(elLibras?.value || 0);
    const precio = Number(elPrecio?.value || 0);
    const unidades = Number(elUnidades?.value || 0);
    const precioUnidad = Number(elPrecioUn?.value || 0);

    const qty = (tipoVenta === "UN") ? unidades : libras;
    const price = (tipoVenta === "UN") ? precioUnidad : precio;
    const total = round2((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0));

    if (estado === "Pagado" && (elCobrado.value === "" || Number(elCobrado.value) === 0)) {
      elCobrado.value = String(round2(total));
    }
    if (estado === "Pendiente" && elCobrado.value === "") {
      elCobrado.value = "0";
    }
    recalc();
  });

  elFoto?.addEventListener("change", async () => {
    try {
      const file = elFoto.files?.[0] || null;
      const dataUrl = await fileToDataURL(file);
      if (elPreview) {
        if (dataUrl) {
          elPreview.src = dataUrl;
          elPreview.style.display = "block";
        } else {
          elPreview.src = "";
          elPreview.style.display = "none";
        }
      }
    } catch (e) {
      console.warn("Foto no se pudo leer:", e);
    }
  });

  // inicial
  applyTipoUI();
  recalc();

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const fecha = normalizeISODate(elFecha?.value || "");    
    const clienteId = (elCliente?.value || "").trim();

     if (!clienteId || clienteId === "__NEW__") {
       return alert("Selecciona un cliente o crea uno nuevo.");
    }

    const clienteNombre =
      CLIENTES?.find(c => c.id === clienteId)?.nombre ||
      "";


    const tipoVenta = String(elTipo?.value || "LB");

    const libras = Number(elLibras?.value || 0);
    const precio = Number(elPrecio?.value || 0);
    const unidades = Number(elUnidades?.value || 0);
    const precioUnidad = Number(elPrecioUn?.value || 0);

    const qty = (tipoVenta === "UN") ? unidades : libras;
    const price = (tipoVenta === "UN") ? precioUnidad : precio;
    const metodo = String(elMetodo?.value || "");
    const estado = String(elEstado?.value || "");
    const nota = (elNota?.value || "").trim();

    if (!fecha) return alert("Fecha requerida");
    if (!clienteNombre) return alert("Cliente requerido");
    if (!isFinite(qty) || qty <= 0) return alert((tipoVenta === "UN") ? "Unidades debe ser > 0" : "Libras debe ser > 0");
    if (!isFinite(price) || price < 0) return alert((tipoVenta === "UN") ? "Precio por unidad debe ser >= 0" : "Precio por libra debe ser >= 0");
    if (!metodo) return alert("Selecciona método de cobro");
    if (!estado) return alert("Selecciona estado de cobro");

    const total = round2(qty * price);

    // cobrado: si vacío -> 0, si Pagado y vacío -> total
    let cobrado = Number(elCobrado?.value || 0);
    if (!isFinite(cobrado) || cobrado < 0) cobrado = 0;
    if (estado === "Pagado" && cobrado === 0) cobrado = total;

    const balance = round2(total - cobrado);

    // foto
    const file = elFoto?.files?.[0] || null;
    const foto = file ? await compressImageFile(file) : "";

    const payload = {
  fecha,
  clienteId,
  cliente: clienteNombre,
  tipoVenta,
  unidades: round2(unidades),
  precioUnidad: round2(precioUnidad),
  libras: round2(libras),
  precio: round2(precio),
  total,
  metodoCobro: metodo,
  estadoCobro: estado,
  montoCobrado: round2(cobrado),
  balance,
  nota,
  foto,
  createdAt: Date.now()
};

if (EDIT?.tipo === "venta" && EDIT?.id) {
  // EDITAR
  if (typeof updateVenta !== "function") {
    alert("Falta updateVenta() en storage.js.");
    return;
  }
  await updateVenta(EDIT.id, { ...payload, id: EDIT.id });

  EDIT = { tipo: null, id: null };
  alert("✅ Venta actualizada");
} else {
  // NUEVA
  await addVenta({ id: makeId(), ...payload });
  alert("✅ Venta guardada");
}


    form.reset();
    if (elFecha) elFecha.value = todayISO();
    if (elMetodo) elMetodo.value = "";
    if (elEstado) elEstado.value = "";
    if (elTotal) elTotal.value = "";
    if (elBalance) elBalance.value = "";
    if (elPreview) { elPreview.src = ""; elPreview.style.display = "none"; }

    await renderVentas();
    // Dashboard ahora está en Mensual; lo renderizamos solo si esa vista está activa
    if (document.getElementById("viewMensual")?.classList.contains("activeView")) {
      if (typeof renderDashboard === "function") await renderDashboard();
    }
    document.getElementById("ventaNewClienteBox")?.style && (document.getElementById("ventaNewClienteBox").style.display = "none");
  });

  

  ensureCancelBtn("ventaForm", () => {
    EDIT = { tipo: null, id: null };
    document.querySelector("#ventaForm button[type='submit']").textContent = "Guardar venta";
    document.querySelector("#ventaForm .btnCancelEdit").style.display = "none";
    document.getElementById("ventaForm").reset();
    // opcional: limpiar preview
    const img = document.getElementById("ventaFotoPreview");
    if (img) { img.src = ""; img.style.display = "none"; }
  });


}

function hookClientesVentas() {
  const sel = document.getElementById("ventaCliente");
  const box = document.getElementById("ventaNewClienteBox");
  const inpNom = document.getElementById("ventaNewClienteNombre");
  const inpTel = document.getElementById("ventaNewClienteTel");
  const btnSave = document.getElementById("ventaSaveNewCliente");
  if (box) box.style.display = "none";


  if (!sel || !box || !inpNom || !btnSave) return;

  sel.addEventListener("change", () => {
    if (sel.value === "__NEW__") {
      box.style.display = "block";
      inpNom.value = "";
      inpTel.value = "";
      inpNom.focus();
    } else {
      // ✅ si elige un cliente normal, cierra el box
      box.style.display = "none";
      inpNom.value = "";
      inpTel.value = "";
    }
  });


  btnSave.addEventListener("click", () => {
    const nombre = inpNom.value.trim();
    const tel = inpTel.value.trim();

    if (!nombre) return alert("Pon el nombre del cliente.");

    const nuevo = saveCliente(nombre, tel);

    // refresca dropdown y selecciona el nuevo
    fillClienteSelect();
    sel.value = nuevo.id;

    // ✅ limpiar y cerrar mini-form
    inpNom.value = "";
    inpTel.value = "";
    box.style.display = "none";
  });
  document.getElementById("ventaLibras")?.focus();


}


  // ---- Clientes: + Nuevo ----



async function renderVentas(opts = {}) {
  const list = document.getElementById("ventasList");
  if (!list) return;

  list.innerHTML = "<li>Cargando…</li>";

  // usa cache
  await warmCache(opts);
  const arr = (CACHE.ventas || []);

  if (!arr.length) {
    list.innerHTML = "<li>No hay ventas.</li>";
    return;
  }

  list.innerHTML = "";
  const frag = document.createDocumentFragment();
  const limit = LIST_LIMITS.ventas || 10;
  arr.slice(0, limit).forEach(v => {
    const li = document.createElement("li");
    li.className = "ventaItem";

    const fechaTxt = formatFechaES(v.fecha);
    const clienteTxt = (v.cliente || v.clienteNombre || "").trim();
    const totalNum = toMoneyNumber(v.total);
    const totalTxt = moneyRD(totalNum);

    const tipoVenta = String(v.tipoVenta || "LB");
    const unidades = Number(v.unidades ?? 0);
    const libras = Number(v.libras ?? 0);
    const qtyNum = (tipoVenta === "UN") ? unidades : libras;
    const qtyTxt = (tipoVenta === "UN")
      ? `🍋‍🟩 ${round2(qtyNum)} unid`
      : `🍋‍🟩 ${round2(qtyNum)} lb`;

    const estadoTxt = (v.estadoCobro || v.estado || "").trim();
    const cobradoNum = toMoneyNumber(v.montoCobrado ?? 0);
    const balanceNum = (v.balance !== null && v.balance !== undefined && String(v.balance).trim() !== "")
      ? toMoneyNumber(v.balance)
      : (totalNum - cobradoNum);

    li.innerHTML = `
      <div class="itemTop">
        <strong>${escapeHtml(totalTxt)}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
        <button type="button" class="btnDanger btnDelete" style="margin-left:10px;">Borrar</button>
      </div>

      <div class="muted">${escapeHtml(clienteTxt || "Cliente")}</div>
      <div class="muted limonVerde">${escapeHtml(qtyTxt)}</div>

      <div class="muted">
        ${escapeHtml(estadoTxt)}
        &nbsp;|&nbsp; Balance: ${escapeHtml(moneyRD(balanceNum))}
      </div>

      ${v.foto ? `<img src="${escapeHtml(v.foto)}" alt="foto" style="max-width:180px; border-radius:10px; margin-top:8px; display:block;">` : ""}
    `;

    li.querySelector(".btnDelete")?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      deleteItem("ventas", v.id);
    });

    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditVenta(v));

    frag.appendChild(li);
  });

  list.appendChild(frag);

  const btn = ensureLoadMoreBtn(list, "ventas", renderVentas, 10);
  updateLoadMoreBtn(btn, Math.min(limit, arr.length), arr.length, 10);

}


function beginEditVenta(v) {
  EDIT = { tipo: "venta", id: v.id };

  // llena campos
  const fechaEl = document.getElementById("ventaFecha");
  const librasEl = document.getElementById("ventaLibras");
  const precioEl = document.getElementById("ventaPrecio");
  const totalEl  = document.getElementById("ventaTotal");
  const estadoEl = document.getElementById("ventaEstado");
  const cobEl    = document.getElementById("ventaCobrado");
    const metodoEl = document.getElementById("ventaMetodo");
    if (metodoEl) {
      const metodo = String(
        v.metodoCobro || v.metodoPago || v.metodo || ""
      ).trim();
      if (metodo) metodoEl.value = metodo;
    }
  const balEl    = document.getElementById("ventaBalance");
  const notaEl   = document.getElementById("ventaNota");
  const clienteSel = document.getElementById("ventaCliente");
    if (clienteSel) {
      const clienteId = String(v.clienteId || "").trim();
      if (clienteId) clienteSel.value = clienteId;

      // fallback por nombre (por si el select usa IDs distintos)
      if (!clienteSel.value) {
        const clienteNombre = String(v.clienteNombre || v.clienteTxt || "").trim();
        if (clienteNombre) {
          const opt = Array.from(clienteSel.options)
            .find(o => (o.textContent || "").trim() === clienteNombre);
          if (opt) clienteSel.value = opt.value;
        }
      }
    }
  const tipoEl = document.getElementById("ventaTipo");
  const rowLbs = document.getElementById("ventaRowLbs");
  const rowUn  = document.getElementById("ventaRowUn");
  const unEl   = document.getElementById("ventaUnidades");
  const puEl   = document.getElementById("ventaPrecioUnidad");

  if (fechaEl) fechaEl.value = String(v.fecha || "").includes("T") ? String(v.fecha).slice(0,10) : (v.fecha || "");
  const tipoVenta = String(v.tipoVenta || "LB");
  if (tipoEl) tipoEl.value = (tipoVenta === "UN") ? "UN" : "LB";
  const isUN = (tipoVenta === "UN");
  if (rowLbs) rowLbs.style.display = isUN ? "none" : "";
  if (rowUn)  rowUn.style.display  = isUN ? "" : "none";

  if (unEl) unEl.value = v.unidades ?? (isUN ? (v.libras ?? "") : "");
  if (puEl) puEl.value = v.precioUnidad ?? (isUN ? (v.precio ?? "") : "");
  if (librasEl) librasEl.value = v.libras ?? "";
  if (precioEl) precioEl.value = v.precio ?? "";
  if (totalEl)  totalEl.value  = v.total ?? "";

  if (estadoEl) estadoEl.value = v.estadoCobro || v.estado || "";
  if (cobEl)    cobEl.value = v.montoCobrado ?? v.cobrado ?? v.pagado ?? "";
  if (balEl)    balEl.value = (v.balance !== undefined && v.balance !== null && String(v.balance).trim() !== "")
    ? toMoneyNumber(v.balance).toFixed(2)
    : "";

  if (notaEl) notaEl.value = v.nota || "";

  // foto preview (no podemos setear el input file, pero sí mostrar la imagen existente)
  const prevImg = document.getElementById("ventaFotoPreview");
  if (prevImg) {
    if (v.foto) { prevImg.src = v.foto; prevImg.style.display = "block"; }
    else { prevImg.src = ""; prevImg.style.display = "none"; }
  }

  // cliente: si guardas clienteNombre, intenta matchear con el select
  if (clienteSel) {
    const nombre = (v.cliente || v.clienteNombre || "").trim();
    // si estás guardando cliente como texto en la hoja, puedes setear directo:
    // clienteSel.value = ...
    // si es catálogo por id, aquí necesitaríamos mapear nombre->id
  }

  // UI
  const submitBtn = document.querySelector("#ventaForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";

  const cancelBtn = document.querySelector("#ventaForm .btnCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  // te lleva al form
  document.getElementById("ventaForm")?.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
  const clienteSel = document.getElementById("ventaCliente");
  if (clienteSel) {
    const clienteId = String(v.clienteId || v.cliente || "").trim();
    if (clienteId) clienteSel.value = clienteId;
  }

  const metodoEl = document.getElementById("ventaMetodo");
  if (metodoEl) {
    const metodo = String(
      v.metodoCobro || v.metodoPago || v.metodo || ""
    ).trim();
    if (metodo) metodoEl.value = metodo;
  }
  });

}

function setAppDefaultDate() {
  const el = document.getElementById("appFecha");
  if (!el) return;
  if (!el.value) el.value = todayISO();
}

let APP_HOOKED = false;

function exitEditAplicacion() {
  EDIT = { tipo: null, id: null };

  const sb = document.querySelector("#appForm button[type='submit']");
  if (sb) sb.textContent = "Guardar aplicación";

  const cb = document.querySelector("#appForm .btnCancelEdit");
  if (cb) cb.style.display = "none";

  const form = document.getElementById("appForm");
  form?.reset();

  const f = document.getElementById("appFecha");
  if (f) f.value = todayISO();
}


function hookAplicaciones() {
  if (APP_HOOKED) return;
  APP_HOOKED = true;

  const form = document.getElementById("appForm");
  if (!form) return;

  // fecha default
  const f = document.getElementById("appFecha");
  if (f && !f.value) f.value = todayISO();

  // Cancelar edición (botón)
  ensureCancelBtn("appForm", () => exitEditAplicacion());

  // Zona: mostrar mini form si elige "➕ Nuevo…"
const zonaSel = document.getElementById("appZona");
zonaSel?.addEventListener("change", () => {
  const box = document.getElementById("appNewZonaBox");
  if (!box) return;

  box.style.display = (zonaSel.value === "__NEW__") ? "block" : "none";
  if (zonaSel.value === "__NEW__") document.getElementById("appNewZonaNombre")?.focus();
});

// Guardar nueva zona
document.getElementById("appSaveNewZona")?.addEventListener("click", async () => {
  const nombreEl = document.getElementById("appNewZonaNombre");
  const descEl = document.getElementById("appNewZonaDesc");

  const nombre = (nombreEl?.value || "").trim();
  const desc = (descEl?.value || "").trim();
  if (!nombre) return alert("Pon el nombre de la zona.");

  await addZona({
    id: makeId(),
    nombre,
    descripcion: desc,
    activo: "1",
    createdAt: Date.now()
  });

  await loadCatalogos(); // refresca ZONAS + rellena selects

  // selecciona la nueva zona en appZona
  const nueva = (ZONAS || []).find(z => String(z.nombre || "").trim().toLowerCase() === nombre.toLowerCase());
  if (nueva) document.getElementById("appZona").value = nueva.id;

  // cerrar mini-form y limpiar
  const box = document.getElementById("appNewZonaBox");
  if (box) box.style.display = "none";
  if (nombreEl) nombreEl.value = "";
  if (descEl) descEl.value = "";
});

  // submit
  form.addEventListener("submit", saveAplicacion);
}

async function saveAplicacion(e) {
  e.preventDefault();

  const fecha = normalizeISODate(document.getElementById("appFecha")?.value || "");
  const zonaEl = document.getElementById("appZona");
  const zonaId = zonaEl?.value || "";
  const zonaNombre = zonaEl?.selectedOptions?.[0]?.textContent || "";

  const producto = (document.getElementById("appProducto")?.value || "").trim();
  const tipo = document.getElementById("appTipo")?.value || "";
  const dosis = (document.getElementById("appDosis")?.value || "").trim();
  const costo = Number(document.getElementById("appCosto")?.value || 0);
  const nota = (document.getElementById("appNota")?.value || "").trim();

  if (!fecha) return alert("Fecha inválida.");
  if (!producto) return alert("Pon el producto.");
  if (!tipo) return alert("Selecciona el tipo.");
  if (!isFinite(costo) || costo < 0) return alert("Costo debe ser >= 0.");

  const payload = {
    fecha,
    zonaId: (zonaId && zonaId !== "__NEW__") ? zonaId : "",
    zonaNombre: (zonaId && zonaId !== "__NEW__") ? zonaNombre : "",
    producto,
    tipo,
    dosis,
    costo: round2(costo),
    nota,
  };

  if (EDIT?.tipo === "app" && EDIT?.id) {
    await updateAplicacion(EDIT.id, payload);
    exitEditAplicacion();
    alert("✅ Aplicación actualizada");
  } else {
    await addAplicacion({
      id: makeId(),
      ...payload,
      createdAt: Date.now(),
    });
    alert("✅ Aplicación guardada");
  }

  await refreshCache("aplicaciones", { force: true });
  await renderDashboard({ force: true });

  // reset como Producción
  document.getElementById("appForm")?.reset();
  setAppDefaultDate();

  await renderAplicaciones();

  // Dashboard SOLO si estás en Mensual (igual que Ventas)
  if (document.getElementById("viewMensual")?.classList.contains("activeView")) {
    await renderDashboard();
  }
}



function beginEditAplicacion(a) {
  EDIT = { tipo: "app", id: a.id };

  const f = document.getElementById("appFecha");
  if (f) {
    const s = String(a.fecha || "");
    f.value = s.includes("T") ? s.slice(0, 10) : (s.includes(" ") ? s.split(" ")[0] : s);
  }

  const zonaEl = document.getElementById("appZona");
  if (zonaEl) zonaEl.value = a.zonaId || "";

  const producto = document.getElementById("appProducto");
  if (producto) producto.value = a.producto || "";

  const tipo = document.getElementById("appTipo");
  if (tipo) tipo.value = a.tipo || "";

  const dosis = document.getElementById("appDosis");
  if (dosis) dosis.value = a.dosis || "";

  const costo = document.getElementById("appCosto");
  if (costo) costo.value = a.costo ?? 0;

  const nota = document.getElementById("appNota");
  if (nota) nota.value = a.nota || "";

  const sb = document.querySelector("#appForm button[type='submit']");
  if (sb) sb.textContent = "Guardar cambios";

  const cb = document.querySelector("#appForm .btnCancelEdit");
  if (cb) cb.style.display = "inline-block";

  document.getElementById("appForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}


async function renderAplicaciones() {
  const ul = document.getElementById("appsList");
  if (!ul) return;

  ul.innerHTML = "<li>Cargando…</li>";

  const arr = (await getAplicaciones()) || [];
  if (!arr.length) {
    ul.innerHTML = "<li>No hay aplicaciones.</li>";
    return;
  }

  ul.innerHTML = "";
  const limit = LIST_LIMITS.aplicaciones || 10;

  arr.slice(0, limit).forEach(a => {
    const li = document.createElement("li");
    li.className = "ventaItem";

    const fechaTxt = a.fecha ? formatFechaES(a.fecha) : fmtDate(a.createdAt);
    const zonaTxt = String(a.zonaNombre ?? "").trim();
    const productoTxt = String(a.producto ?? "").trim();
    const tipoTxt = String(a.tipo ?? "").trim();
    const dosisTxt = String(a.dosis ?? "").trim();
    const costoTxt = moneyRD(toMoneyNumber(a.costo ?? 0));


    li.innerHTML = `
      <div class="itemTop">
        <strong>${escapeHtml(productoTxt)}${tipoTxt ? " — " + escapeHtml(tipoTxt) : ""}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
        <button type="button" class="btnDanger btnDelete" style="margin-left:10px;">Borrar</button>
      </div>

      <div class="muted">${escapeHtml(zonaTxt || "Zona")}</div>
      ${dosisTxt ? `<div class="muted">🧪 ${escapeHtml(dosisTxt)}</div>` : ""}
      <div class="muted">💰 ${escapeHtml(costoTxt)}</div>
      ${a.nota ? `<div class="muted">${escapeHtml(a.nota)}</div>` : ""}
    `;

    li.querySelector(".btnDelete")?.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      await deleteItem("aplicaciones", a.id);
    });

    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditAplicacion(a));

    ul.appendChild(li);
  });

  const btn = ensureLoadMoreBtn(ul, "aplicaciones", renderAplicaciones, 10);
  updateLoadMoreBtn(btn, Math.min(limit, arr.length), arr.length, 10);
}




// ---------- DASHBOARD (incluye categorías + mensual) ----------
async function renderDashboard(opts = {}) {
  const mes = document.getElementById("dashMes")?.value;
  if (!mes) return;

  await warmCache(opts);
  const ventas = CACHE.ventas;
  const gastos = CACHE.gastos;
  const produccion = CACHE.produccion;
  const apps = CACHE.aplicaciones || [];

  let tv = 0, tl = 0, tg = 0, cv = 0, cg = 0;
  let tMO = 0;
  let tApps = 0; // ESTE será de apps (tabla aplicaciones)


  // Ventas
  ventas.forEach(v => {
    if (monthKeyFromAnyDate(v.fecha) === mes) {
      tv += Number(v.total) || 0;
      tl += Number(v.libras) || 0;
      cv++;
    }
  });

    // Aplicaciones (desde la tabla aplicaciones)
  apps.forEach(a => {
    if (monthKeyFromAnyDate(a.fecha) === mes) {
      tApps += Number(a.costo) || 0;
    }
  });


  // Gastos
  gastos.forEach(g => {
    if (monthKeyFromAnyDate(g.fecha) === mes) {
      tg += Number(g.monto) || 0;
      cg++;
    }
  });

  // Producción
  let tProdLb = 0, tProdCajas = 0, cProd = 0;
  (produccion || []).forEach(p => {
    if (monthKeyFromAnyDate(p.fecha) === mes) {
      tProdLb += Number(p.libras) || 0;
      // tu app usa "cajas" (no "sacos")
      tProdCajas += Number(p.cajas) || 0;
      cProd++;
    }
  });

  // Mano de obra
  

  // UI existente
  setText("dashVentas", `$${tv.toFixed(2)}`);
  setText("dashLibras", tl.toFixed(2));
  setText("dashPrecio", tl ? `$${(tv / tl).toFixed(2)}` : "$0.00");
  setText("dashCount", String(cv));
  setText("dashGastos", `-$${tg.toFixed(2)}`);
  setText("dashCountGastos", String(cg));

  const neto = tv - tg;
  setText("dashNeto", `$${neto.toFixed(2)}`);
  const netoEl = document.getElementById("dashNeto");
  if (netoEl) netoEl.style.color = neto >= 0 ? "#3ddc84" : "#ff5c5c";

  const costoLb = tl ? (tg / tl) : 0;
  const margenLb = tl ? (neto / tl) : 0;
  setText("dashCostoLb", `$${costoLb.toFixed(2)}`);
  setText("dashMargenLb", `$${margenLb.toFixed(2)}`);

  // ✅ NUEVOS KPIs (Mensual PRO)
  setText("dashProdLbs", tProdLb.toFixed(2));
  setText("dashProdCajas", String(tProdCajas));

  

  // Gastos por categoría (igual que ya tienes)
  const catMap = {};


gastos.forEach(g => {
  if (monthKeyFromAnyDate(g.fecha) !== mes) return;

  const catRaw = (g.categoriaNombre || g.categoria || "Sin categoría");
  const cat = String(catRaw).trim() || "Sin categoría";
  const monto = Number(g.monto) || 0;

  catMap[cat] = (catMap[cat] || 0) + monto;

  // ✅ capturar estas 2 categorías desde gastos
  const k = cat.toLowerCase();
  if (k === "mano de obra" || k === "manoobra") tMO += monto;
  if (k === "aplicaciones" || k === "aplicacion" || k === "aplicaciones ") tApps += monto;
});


renderGastosPorCategoria(catMap);

// ✅ ahora los cards se llenan desde gastos (fuente única)
setText("dashManoObra", `-$${tMO.toFixed(2)}`);
setText("dashAplicaciones", `-$${tApps.toFixed(2)}`);

const moLb = tl ? (tMO / tl) : 0;
const appLb = tl ? (tApps / tl) : 0;
setText("dashMoLb", `$${moLb.toFixed(2)}`);
setText("dashAppLb", `$${appLb.toFixed(2)}`);


  // Mensual table (por ahora igual)
  await renderMensualTable(ventas, gastos, produccion, CACHE.aplicaciones || []);


  // (Opcional) más adelante: renderMensualTablePro(ventas,gastos,produccion,manoObra,apps)
}


function renderGastosPorCategoria(catMap) {
  const tbody = document.getElementById("dashGastosCategorias");
  if (!tbody) return;

  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    tbody.innerHTML = `<tr><td colspan="2">No hay gastos en este mes.</td></tr>`;
    return;
  }

  tbody.innerHTML = entries.map(([cat, total]) => `
    <tr>
      <td>${escapeHtml(cat)}</td>
      <td style="text-align:right;">-$${Number(total).toFixed(2)}</td>
    </tr>
  `).join("");
}

 
async function renderMensualTable(ventas, gastos, produccion, aplicaciones) {
  const tbody = document.getElementById("mensualBody");
  if (!tbody) return;

  const rows = buildMonthlyPro(ventas || [], gastos || [], produccion || [], aplicaciones || [], 12);

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(formatMesES(r.mes))}</td>
      <td style="text-align:right;">$${r.ventas.toFixed(2)}</td>
      <td style="text-align:right;">-$${r.gastos.toFixed(2)}</td>
      <td style="text-align:right;">$${r.neto.toFixed(2)}</td>
      <td style="text-align:right;">${r.libras.toFixed(2)}</td>
      <td style="text-align:right;">$${r.costoLb.toFixed(2)}</td>
      <td style="text-align:right;">$${r.margenLb.toFixed(2)}</td>
      <td style="text-align:right;">${r.prodLb.toFixed(2)}</td>
      <td style="text-align:right;">${String(r.prodCajas)}</td>
      <td style="text-align:right;">-$${r.manoobra.toFixed(2)}</td>
      <td style="text-align:right;">-$${r.apps.toFixed(2)}</td>
      <td style="text-align:right;">$${r.moLb.toFixed(2)}</td>
      <td style="text-align:right;">$${r.appsLb.toFixed(2)}</td>
    </tr>
  `).join("");

  // si no hay data en ninguno de los 12 meses, pinta una fila vacía
  if (!tbody.innerHTML.trim()) {
    tbody.innerHTML = `<tr><td colspan="13" class="muted">No hay datos todavía.</td></tr>`;
  }
}

// ---------- UTILS ----------
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(value) {
  if (!value) return "";

  // Si viene como Date object
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    value = `${y}-${m}-${d}`;
  }

  // Si viene como "YYYY-MM-DDTHH:mm..." o "YYYY-MM-DD HH:mm..."
  let s = String(value).trim();
  if (s.includes("T")) s = s.split("T")[0];
  if (s.includes(" ")) s = s.split(" ")[0];

  // Asegura formato YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s; // fallback: muestra lo que sea que venga

  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);

  return dt.toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "2-digit" });
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}
function normalizeISODate(s) {
  if (!s) return "";
  s = String(s).trim();

  // YYYY-MM-DD (correcto)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yy = m[3];
    return `${yy}-${mm}-${dd}`;
  }

  // YYYY-MM (NO válido — debe venir con día)
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) return "";   // <- en vez de inventar día 01

  return "";
}
