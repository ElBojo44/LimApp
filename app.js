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

function preserveSelectValue(selectId, fn) {
    const sel = document.getElementById(selectId);
    const prev = sel ? sel.value : "";
    fn(); // aquí refrescas el select (fillSelect o lo que sea)
    const sel2 = document.getElementById(selectId);
    if (sel2 && prev && [...sel2.options].some(o => o.value === prev)) {
        sel2.value = prev;
    }
}

// ===============================
// CACHE (nivel 1 - memoria)
// - Carga inicial SOLO: ventas, gastos, produccion
// - ManoObra / Aplicaciones se cargan bajo demanda (lazy)
// ===============================
const CACHE = {
  ventas: null,
  gastos: null,
  produccion: null,
  manoobra: null,
  aplicaciones: null,
  loadedAt: 0,
};

const LOADED = {
  ventas: false,
  gastos: false,
  produccion: false,
  manoobra: false,
  aplicaciones: false,
  mensual: false,
};

async function warmCache() {
  if (CACHE.ventas && CACHE.gastos && CACHE.produccion) return CACHE;

  const [v, g, p] = await Promise.all([
    getVentas(),
    getGastos(),
    getProduccion(),
  ]);

  CACHE.ventas = v || [];
  CACHE.gastos = g || [];
  CACHE.produccion = p || [];
  CACHE.loadedAt = Date.now();
  return CACHE;
}

// Lazy loaders
async function warmCacheManoObra() {
  if (CACHE.manoobra) return CACHE.manoobra;
  CACHE.manoobra = (await getManoObra()) || [];
  CACHE.loadedAt = Date.now();
  return CACHE.manoobra;
}
async function warmCacheAplicaciones() {
  if (CACHE.aplicaciones) return CACHE.aplicaciones;
  CACHE.aplicaciones = (await getAplicaciones()) || [];
  CACHE.loadedAt = Date.now();
  return CACHE.aplicaciones;
}

// Para cuando guardas algo y quieres refrescar SOLO un tipo
async function refreshCache(type) {
  if (type === "ventas") CACHE.ventas = await getVentas();
  if (type === "gastos") CACHE.gastos = await getGastos();
  if (type === "produccion") CACHE.produccion = await getProduccion();
  if (type === "manoobra") CACHE.manoobra = await getManoObra();
  if (type === "aplicaciones") CACHE.aplicaciones = await getAplicaciones();
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
      // Lazy render del historial al entrar al tab
      openTabAndRender(btn.dataset.view);
    });
  });

  // Render inicial del tab activo
  const active = document.querySelector(".tabBtn.active");
  if (active) openTabAndRender(active.dataset.view);
}


async function openTabAndRender(viewId) {
  const v = String(viewId || "");
  // viewId viene como "viewVentas", etc.
  const key = v.replace(/^view/i, "").toLowerCase(); // "ventas", "gastos", ...

  try {
    // base cache para todo lo mensual (ventas/gastos/produccion)
    if (["ventas", "gastos", "produccion", "mensual"].includes(key)) {
      await warmCache();
    }

    if (key === "ventas" && !LOADED.ventas) {
      await renderVentas(CACHE.ventas);
      LOADED.ventas = true;
      return;
    }

    if (key === "gastos" && !LOADED.gastos) {
      await renderGastos(CACHE.gastos);
      LOADED.gastos = true;
      return;
    }

    if (key === "produccion" && !LOADED.produccion) {
      await renderProduccion(CACHE.produccion);
      LOADED.produccion = true;
      return;
    }

    if (key === "manoobra" && !LOADED.manoobra) {
      const arr = await warmCacheManoObra();
      await renderManoObraSimple(arr);
      LOADED.manoobra = true;
      return;
    }

    if (key === "aplicaciones" && !LOADED.aplicaciones) {
      const arr = await warmCacheAplicaciones();
      await renderAplicaciones(arr);
      LOADED.aplicaciones = true;
      return;
    }

    if (key === "mensual") {
      await renderDashboard();
      LOADED.mensual = true;
      return;
    }
  } catch (err) {
    console.error("openTabAndRender:", viewId, err);
  }
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
  // Hooks (solo listeners)
  hookVentas();
  hookGastos();
  hookCatalogForms();
  hookProduccion();
  hookManoObraSimple();
  hookAplicaciones();

  loadClientes();
  fillClienteSelect();
  hookClientesVentas();

  initDashboard();

  // Catálogos (Zonas / Empleados / Labores / Categorías)
  await loadCatalogos();
  // ✅ Carga inicial mínima (para que abra rápido)
  await warmCache();

  // ✅ Render inicial según el tab activo
  const activeBtn = document.querySelector(".tabBtn.active");
  const activeView = activeBtn?.dataset?.view || "viewMensual";
  await openTabAndRender(activeView);

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

function hookProduccion() {
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
    EDIT = { tipo: null, id: null };

    const submitBtn = document.querySelector("#prodForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar producción";

    document.querySelector("#prodForm .btnCancelEdit").style.display = "none";

    document.getElementById("prodForm").reset();

    // reset empleados
    const cont = document.getElementById("prodEmps");
    if (cont) cont.innerHTML = "";
    addProdEmpRow();

    setProdDefaultDate();
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

let _prodEmpSelectPendiente = null;


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

    // opcional: colapsar mini-boxes si estaban abiertos
    document.getElementById("gastoNewCatBox") && (document.getElementById("gastoNewCatBox").style.display = "none");
    document.getElementById("gastoNewEmpBox") && (document.getElementById("gastoNewEmpBox").style.display = "none");
  });

  form.appendChild(btn);
}
ensureCancelBtnGasto();

function hookGastos() {
  setGastoDefaultDate();

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
  const reciboFotoNew = await fileToDataURL(file);

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

  document.getElementById("gastoForm")?.reset();
  setGastoDefaultDate();

  await renderGastos();
  await renderDashboard();
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




async function renderGastos(arrIn) {
  const list = document.getElementById("gastosList");
  if (!list) return;

  const items = (await getGastos()) || [];
  list.innerHTML = "";

  items.slice(0, 30).forEach(g => {
    const li = document.createElement("li");

    // ✅ usa el mismo estilo “card” que Ventas / Producción
    li.className = "ventaItem";

    const montoTxt = moneyRD(g.monto || 0);
    const fechaTxt = formatFechaES(g.fecha || g.createdAt);

    const catTxt = (g.categoriaNombre || g.categoria || "Sin categoría").trim();
    const metodoTxt = (g.metodoPago || "").trim();
    const provTxt = (g.proveedor || "").trim();
    const empTxt = (g.empleadoNombre || "").trim();

    // Línea 1 abajo: categoría + método (+ proveedor opcional)
    const linea1 = [
      catTxt,
      metodoTxt,
      provTxt ? provTxt : ""
    ].filter(Boolean).join(" • ");

    // Línea 2 abajo: empleado opcional (como “Alberto — Tarea 5 • 8h” si lo tienes en nota)
    const linea2 = empTxt ? empTxt : "";

    li.innerHTML = `
      <div class="itemTop">
        <strong>${escapeHtml(montoTxt)}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
      </div>

      <div class="muted">${escapeHtml(linea1)}</div>
      ${linea2 ? `<div class="muted">${escapeHtml(linea2)}</div>` : ""}

      ${g.nota ? `<div class="muted">${escapeHtml(g.nota)}</div>` : ""}
      ${g.reciboFoto ? `<img src="${g.reciboFoto}" alt="recibo" style="max-width:180px; border-radius:10px; margin-top:8px; display:block;">` : ""}
    `;

    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditGasto(g));
list.appendChild(li);
  });
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
  fillSelect("appZona", ZONAS, true);
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

    // salir de modo edición
    EDIT = { tipo: null, id: null };
    const sb = document.querySelector("#prodForm button[type='submit']");
    if (sb) sb.textContent = "Guardar producción";
    const cb = document.querySelector("#prodForm .btnCancelEdit");
    if (cb) cb.style.display = "none";

    alert("✅ Producción actualizada");
  } else {
    await addProduccion(data);
    alert("✅ Producción guardada");
  }

  // reset
  document.getElementById("prodForm")?.reset();
  document.getElementById("prodEmps") && (document.getElementById("prodEmps").innerHTML = "");
  addProdEmpRow();
  setProdDefaultDate();

  await renderProduccion();
  await renderDashboard();
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



async function renderProduccion(arrIn) {
  const ul = document.getElementById("prodList");
  if (!ul) return;

  ul.innerHTML = "<li>Cargando…</li>";

  const arr = (arrIn ?? CACHE.produccion ?? (await getProduccion())) || [];
  CACHE.produccion = arr;
  if (!arr.length) {
    ul.innerHTML = "<li>No hay producción.</li>";
    return;
  }

  ul.innerHTML = "";
  arr.slice(0, 10).forEach(p => {
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
      </div>

      <div class="muted">${escapeHtml(zonaTxt || "Zona")}</div>
      ${respTxt ? `<div class="muted">👷 ${escapeHtml(respTxt)}</div>` : ""}
      ${p.nota ? `<div class="muted">${escapeHtml(p.nota)}</div>` : ""}
    `;
    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditProduccion(p));


    // (Edición de producción la arreglamos después)
    ul.appendChild(li);
  });
}


function hookManoObraSimple() {
  const form = document.getElementById("moForm");
  if (!form) return;

  ensureCancelBtn("moForm", () => {
    EDIT = { tipo: null, id: null };

    const submitBtn = document.querySelector("#moForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar mano de obra";

    document.querySelector("#moForm .btnCancelEdit").style.display = "none";

    document.getElementById("moForm").reset();
    document.getElementById("moFecha").value = todayISO();
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

  // Submit mano de obra simple
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fecha = normalizeISODate(document.getElementById("moFecha")?.value);
    const empleadoId = document.getElementById("moEmpleado")?.value || "";
    const tareaId = document.getElementById("moTarea")?.value || "";
    const horas = Number(document.getElementById("moHoras")?.value || 0);
    const pagoDia = Number(document.getElementById("moPagoDia")?.value || 0);
    const nota = (document.getElementById("moNota")?.value || "").trim();

    if (!fecha) return alert("Fecha inválida. Usa el calendario.");
    if (!empleadoId || empleadoId === "__NEW__") return alert("Selecciona un empleado.");
    if (!tareaId || tareaId === "__NEW__") return alert("Selecciona una tarea.");
    if (!isFinite(horas) || horas <= 0) return alert("Horas debe ser > 0.");
    if (!isFinite(pagoDia) || pagoDia < 0) return alert("Pago día debe ser >= 0.");

    const emp = (EMPLEADOS || []).find(x => x.id === empleadoId) || {};
    const task = (LABORES || []).find(x => x.id === tareaId) || {};

    const empleadoNombre = String(emp.nombre || "").trim();
    const tareaNombre = String(task.nombre || "").trim();

    const isEdit = (EDIT && EDIT.tipo === "mo" && EDIT.id);

    const payload = {
      id: isEdit ? EDIT.id : makeId(),
      fecha,
      empleadoId,
      empleadoNombre,
      tareaId,
      tareaNombre,
      horas: round2(horas),
      pagoDia: round2(pagoDia),
      nota,
      createdAt: Date.now()
    };

    if (isEdit) {
      await updateManoObra(payload.id, payload);
      alert("✅ Mano de obra actualizada");
    } else {
      await addManoObra(payload);

      // ✅ Gasto automático SOLO cuando es NUEVO
      await addGasto({
        id: makeId(),
        fecha,
        monto: round2(pagoDia),
        categoriaId: "",
        categoriaNombre: "Mano de obra",
        categoria: "Mano de obra",
        nota: `${empleadoNombre} — ${tareaNombre} • ${round2(horas)}h${nota ? " • " + nota : ""}`,
        createdAt: Date.now()
      });

      alert("✅ Mano de obra guardada");
    }

    // reset modo edición
    EDIT = { tipo: null, id: null };
    const submitBtn = document.querySelector("#moForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar mano de obra";
    const cancelBtn = document.querySelector("#moForm .btnCancelEdit");
    if (cancelBtn) cancelBtn.style.display = "none";

    // refrescar cache + dashboard
    await refreshCache("gastos");
    await refreshCache("manoobra");
    await warmCache(); // por si no estaba
    await renderDashboard();

    form.reset();
    const f = document.getElementById("moFecha");
    if (f) f.value = todayISO();

    // la lista se renderiza bajo demanda; si estás en el tab, se verá al instante
    await renderManoObraSimple(CACHE.manoobra);
  });
}

async function renderManoObraSimple(arrIn) {
  const ul = document.getElementById("moList");
  if (!ul) return;

  ul.innerHTML = "<li>Cargando…</li>";

  await warmCacheManoObra();
  const arr = (arrIn && Array.isArray(arrIn)) ? arrIn : (CACHE.manoobra || []);
  if (!arr.length) {
    ul.innerHTML = "<li>No hay mano de obra.</li>";
    return;
  }

  ul.innerHTML = "";
  arr.slice(0, 10).forEach(m => {
    const li = document.createElement("li");
    li.className = "ventaItem";

    li.innerHTML = `
      <div class="ventaTop">
        <strong>${escapeHtml(fmtDate(m.fecha))} — ${escapeHtml(m.empleadoNombre || "")}</strong>
        <span class="ventaTotal">$${Number(m.pagoDia || 0).toFixed(2)}</span>
      </div>
      <div class="ventaMeta">
        ${escapeHtml(m.tareaNombre || "")} • ${Number(m.horas || 0).toFixed(2)} h
        ${m.nota ? `<div class="ventaNota">${escapeHtml(m.nota)}</div>` : ""}
      </div>
    `;

    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditManoObra(m));

    ul.appendChild(li);
  });
}


function ensureCancelBtnMO() {
  const form = document.getElementById("moForm");
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

    const submitBtn = document.querySelector("#moForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar mano de obra";

    btn.style.display = "none";
    form.reset();
    const f = document.getElementById("moFecha");
    if (f) f.value = todayISO();
  });

  form.appendChild(btn);
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

  // Recalcula total/balance en vivo
  const recalc = () => {
    const libras = Number(elLibras?.value || 0);
    const precio = Number(elPrecio?.value || 0);
    const total = (isFinite(libras) ? libras : 0) * (isFinite(precio) ? precio : 0);

    // Si cobrado está vacío, lo tratamos como 0 para cálculo visual
    const cobrado = Number(elCobrado?.value || 0);
    const balance = total - (isFinite(cobrado) ? cobrado : 0);

    if (elTotal) elTotal.value = moneyRD(total);
    if (elBalance) elBalance.value = moneyRD(balance);
  };

  [elLibras, elPrecio, elCobrado].forEach(el => el?.addEventListener("input", recalc));
  elEstado?.addEventListener("change", () => {
    // si marcan Pagado y no han puesto cobrado, autocompleta con total
    if (!elCobrado) return recalc();
    const estado = String(elEstado.value || "");
    const libras = Number(elLibras?.value || 0);
    const precio = Number(elPrecio?.value || 0);
    const total = (isFinite(libras) ? libras : 0) * (isFinite(precio) ? precio : 0);

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


    const libras = Number(elLibras?.value || 0);
    const precio = Number(elPrecio?.value || 0);
    const metodo = String(elMetodo?.value || "");
    const estado = String(elEstado?.value || "");
    const nota = (elNota?.value || "").trim();

    if (!fecha) return alert("Fecha requerida");
    if (!clienteNombre) return alert("Cliente requerido");
    if (!isFinite(libras) || libras <= 0) return alert("Libras debe ser > 0");
    if (!isFinite(precio) || precio < 0) return alert("Precio debe ser >= 0");
    if (!metodo) return alert("Selecciona método de cobro");
    if (!estado) return alert("Selecciona estado de cobro");

    const total = round2(libras * precio);

    // cobrado: si vacío -> 0, si Pagado y vacío -> total
    let cobrado = Number(elCobrado?.value || 0);
    if (!isFinite(cobrado) || cobrado < 0) cobrado = 0;
    if (estado === "Pagado" && cobrado === 0) cobrado = total;

    const balance = round2(total - cobrado);

    // foto
    const file = elFoto?.files?.[0] || null;
    const foto = await fileToDataURL(file);

    await addVenta({
      id: makeId(),
      fecha,
      clienteId,
      cliente: clienteNombre,
      libras: round2(libras),
      precio: round2(precio),
      total,
      metodoCobro: metodo,
      estadoCobro: estado,
      montoCobrado: round2(cobrado),
      balance,
      nota,
      foto, // dataURL
      createdAt: Date.now()
    });

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



async function renderVentas(arrIn) {
  const list = document.getElementById("ventasList");
  if (!list) return;

  list.innerHTML = "<li>Cargando…</li>";
const arr = (arrIn ?? CACHE.ventas ?? (await getVentas())) || [];
  CACHE.ventas = arr;
  if (!arr.length) {
    list.innerHTML = "<li>No hay ventas.</li>";
    return;
  }

  list.innerHTML = "";

  arr.slice(0, 10).forEach(v => {
      const li = document.createElement("li");
      li.className = "ventaItem"; 

    const fechaTxt = formatFechaES(v.fecha);
    const clienteTxt = (v.cliente || v.clienteNombre || "").trim();
    const totalNum = toMoneyNumber(v.total);
    const totalTxt = moneyRD(totalNum);

    const cobradoNum = toMoneyNumber(v.montoCobrado ?? v.cobrado ?? v.pagado ?? 0);

    // si existe balance úsalo; si no, calcúlalo con total - cobrado
    let balanceNum = toMoneyNumber(v.balance);
    const hasBalanceValue =
      v.balance !== null &&
      v.balance !== undefined &&
      String(v.balance).trim() !== "";

    const hasCobradoValue =
      v.montoCobrado !== null &&
      v.montoCobrado !== undefined &&
      String(v.montoCobrado).trim() !== "";

    if (!hasBalanceValue && hasCobradoValue) {
      balanceNum = totalNum - toMoneyNumber(v.montoCobrado);
    }


    const balanceTxt = moneyRD(balanceNum);


    const estadoTxt = (v.estadoCobro || v.estado || "").trim();
    const fotoTag = v.foto ? " 📷" : "";

    li.innerHTML = `
      <div class="itemTop">
        <strong>${escapeHtml(totalTxt)}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
      </div>

      <div class="muted">${escapeHtml(clienteTxt || "Cliente")}</div>

      <div class="muted">
        ${escapeHtml(estadoTxt)}${fotoTag}
        &nbsp;|&nbsp; Balance: ${escapeHtml(balanceTxt)}
      </div>
    `;

    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditVenta(v));

    list.appendChild(li);
  });
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
  const balEl    = document.getElementById("ventaBalance");
  const notaEl   = document.getElementById("ventaNota");
  const clienteSel = document.getElementById("ventaCliente");

  if (fechaEl) fechaEl.value = String(v.fecha || "").includes("T") ? String(v.fecha).slice(0,10) : (v.fecha || "");
  if (librasEl) librasEl.value = v.libras ?? "";
  if (precioEl) precioEl.value = v.precio ?? "";
  if (totalEl)  totalEl.value  = v.total ?? "";

  if (estadoEl) estadoEl.value = v.estadoCobro || v.estado || "";
  if (cobEl)    cobEl.value = v.montoCobrado ?? v.cobrado ?? v.pagado ?? "";
  if (balEl)    balEl.value = (v.balance !== undefined && v.balance !== null && String(v.balance).trim() !== "")
    ? toMoneyNumber(v.balance).toFixed(2)
    : "";

  if (notaEl) notaEl.value = v.nota || "";

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
}

function setAppDefaultDate() {
  const el = document.getElementById("appFecha");
  if (!el) return;
  if (!el.value) el.value = todayISO();
}

function hookAplicaciones() {
  setAppDefaultDate();

  const form = document.getElementById("appForm");
  if (!form) return;

  // crear botón cancelar edición (reusa el mismo helper que usas en Ventas)
  ensureCancelBtn("appForm", () => {
    EDIT = { tipo: null, id: null };

    const submitBtn = document.querySelector("#appForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar aplicación";

    document.querySelector("#appForm .btnCancelEdit").style.display = "none";

    form.reset();
    setAppDefaultDate();
  });

  form.addEventListener("submit", saveAplicacion);
}

async function saveAplicacion(e) {
  e.preventDefault();

  const fechaEl = document.getElementById("appFecha");
  const zonaEl = document.getElementById("appZona");
  const prodEl = document.getElementById("appProducto");
  const tipoEl = document.getElementById("appTipo");
  const dosisEl = document.getElementById("appDosis");
  const costoEl = document.getElementById("appCosto");
  const notaEl = document.getElementById("appNota");

  const fechaRaw = String(fechaEl?.value || "");
  const fecha = fechaRaw.includes("T") ? fechaRaw.slice(0,10) : fechaRaw;

  const zonaId = zonaEl?.value || "";
  const zonaNombre = zonaEl?.selectedOptions?.[0]?.textContent || "";

  const producto = (prodEl?.value || "").trim();
  const tipo = (tipoEl?.value || "").trim();
  const dosis = (dosisEl?.value || "").trim();
  const costo = Number(costoEl?.value || 0);
  const nota = (notaEl?.value || "").trim();

  if (!fecha) return alert("Fecha inválida.");
  if (!producto) return alert("Producto requerido.");
  if (!tipo) return alert("Tipo requerido.");
  if (!isFinite(costo) || costo < 0) return alert("Costo inválido.");

  const payload = {
    fecha,
    zonaId,
    zonaNombre,
    producto,
    tipo,
    dosis,
    costo: round2(costo),
    nota,
  };

  if (EDIT?.tipo === "app" && EDIT?.id) {
    // EDIT
    if (typeof updateAplicacion !== "function") {
      alert("Falta updateAplicacion() en storage.js.");
      return;
    }

    await updateAplicacion(EDIT.id, payload);

    // (por ahora) NO tocamos gastos automáticos al editar, para no duplicar
    EDIT = { tipo: null, id: null };
    const submitBtn = document.querySelector("#appForm button[type='submit']");
    if (submitBtn) submitBtn.textContent = "Guardar aplicación";
    const cancelBtn = document.querySelector("#appForm .btnCancelEdit");
    if (cancelBtn) cancelBtn.style.display = "none";

    alert("✅ Aplicación actualizada");
  } else {
    // ADD
    const id = makeId();

    await addAplicacion({
      id,
      ...payload,
      createdAt: Date.now(),
    });

    // gasto automático (opcional pero recomendado)
    if (payload.costo > 0) {
      await addGasto({
        id: makeId(),
        fecha,
        monto: payload.costo,
        categoriaId: "",
        categoriaNombre: "Aplicaciones",
        categoria: "Aplicaciones",
        nota: `${payload.producto}${payload.dosis ? " — " + payload.dosis : ""}${payload.zonaNombre ? " • " + payload.zonaNombre : ""}${payload.tipo ? " • " + payload.tipo : ""}${payload.nota ? " • " + payload.nota : ""}`,
        createdAt: Date.now(),
      });
    }

    alert("✅ Aplicación guardada");
  }

  document.getElementById("appForm")?.reset();
  setAppDefaultDate();

  await renderAplicaciones();
  await renderGastos();
  await renderDashboard();
}

function beginEditAplicacion(a) {
  EDIT = { tipo: "app", id: a.id };

  // fecha (igual que ventas)
  const f = document.getElementById("appFecha");
  if (f) {
    const s = String(a.fecha || "");
    f.value = s.includes("T") ? s.slice(0,10) : (s.includes(" ") ? s.split(" ")[0] : s);
  }

  const z = document.getElementById("appZona");
  if (z) z.value = a.zonaId || "";

  document.getElementById("appProducto").value = a.producto || "";
  document.getElementById("appTipo").value = a.tipo || "";
  document.getElementById("appDosis").value = a.dosis || "";
  document.getElementById("appCosto").value = a.costo ?? 0;
  document.getElementById("appNota").value = (a.nota || "").trim();

  const submitBtn = document.querySelector("#appForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Guardar cambios";

  const cancelBtn = document.querySelector("#appForm .btnCancelEdit");
  if (cancelBtn) cancelBtn.style.display = "inline-block";

  document.getElementById("appForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function renderAplicaciones(arrIn) {
  const ul = document.getElementById("appsList");
  if (!ul) return;

  ul.innerHTML = "<li>Cargando…</li>";

  let arr = [];
  try {
    await warmCacheAplicaciones();
    arr = (arrIn && Array.isArray(arrIn)) ? arrIn : (CACHE.aplicaciones || []);
  } catch (e) {
    ul.innerHTML = "<li>No se pudo cargar aplicaciones (backend no listo).</li>";
    console.error(e);
    return;
  }

  if (!arr.length) {
    ul.innerHTML = "<li>No hay aplicaciones.</li>";
    return;
  }

  ul.innerHTML = "";
  arr.slice(0, 15).forEach(a => {
    const li = document.createElement("li");
    li.className = "ventaItem";

    const fechaTxt = formatFechaES(a.fecha || a.createdAt);
    const costoTxt = moneyRD(Number(a.costo || 0));
    const zonaTxt  = String(a.zonaNombre ?? "").trim();
    const prodTxt  = String(a.producto ?? "").trim();
    const tipoTxt  = String(a.tipo ?? "").trim();
    const dosisTxt = String(a.dosis ?? "").trim();
    


    const meta = [
      tipoTxt,
      dosisTxt ? dosisTxt : "",
      zonaTxt ? zonaTxt : ""
    ].filter(Boolean).join(" • ");

    li.innerHTML = `
      <div class="itemTop">
        <strong>${escapeHtml(costoTxt)}</strong>
        <span class="muted">${escapeHtml(fechaTxt)}</span>
      </div>
      <div class="muted">${escapeHtml(prodTxt || "Aplicación")}</div>
      ${meta ? `<div class="muted">${escapeHtml(meta)}</div>` : ""}
      ${a.nota ? `<div class="muted">${escapeHtml(a.nota)}</div>` : ""}
    `;

    li.style.cursor = "pointer";
    li.title = "Click para editar";
    li.addEventListener("click", () => beginEditAplicacion(a));

    ul.appendChild(li);
  });
}




// ---------- DASHBOARD (incluye categorías + mensual) ----------
async function renderDashboard() {
  const mes = document.getElementById("dashMes")?.value;
  if (!mes) return;

  await warmCache();
  const ventas = CACHE.ventas;
  const gastos = CACHE.gastos;
  const produccion = CACHE.produccion;

  


  let tv = 0, tl = 0, tg = 0, cv = 0, cg = 0;
  let tMO = 0;
  let tApps = 0;


  // Ventas
  ventas.forEach(v => {
    if (String(v.fecha || "").startsWith(mes)) {
      tv += Number(v.total) || 0;
      tl += Number(v.libras) || 0;
      cv++;
    }
  });

  // Gastos
  gastos.forEach(g => {
    if (String(g.fecha || "").startsWith(mes)) {
      tg += Number(g.monto) || 0;
      cg++;
    }
  });

  // Producción
  let tProdLb = 0, tProdCajas = 0, cProd = 0;
  (produccion || []).forEach(p => {
    if (String(p.fecha || "").startsWith(mes)) {
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
  setText("dashManoObra", `-$${tMO.toFixed(2)}`);
  setText("dashAplicaciones", `-$${tApps.toFixed(2)}`);

  

  // Gastos por categoría (igual que ya tienes)
  const catMap = {};


gastos.forEach(g => {
  if (!String(g.fecha || "").startsWith(mes)) return;

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
  await renderMensualTable(ventas, gastos);

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

async function renderMensualTable(ventas, gastos) {
  const tbody = document.getElementById("mensualTable");
  if (!tbody) return;

  const months = {};
  (ventas || []).forEach(v => {
    const m = String(v.fecha || "").slice(0, 7);
    if (!m) return;
    months[m] = months[m] || { ventas: 0, gastos: 0, libras: 0 };
    months[m].ventas += Number(v.total) || 0;
    months[m].libras += Number(v.libras) || 0;
  });
  (gastos || []).forEach(g => {
    const m = String(g.fecha || "").slice(0, 7);
    if (!m) return;
    months[m] = months[m] || { ventas: 0, gastos: 0, libras: 0 };
    months[m].gastos += Number(g.monto) || 0;
  });

  const keys = Object.keys(months).sort().reverse().slice(0, 12);
  if (!keys.length) {
    tbody.innerHTML = `<tr><td colspan="5">No hay datos todavía.</td></tr>`;
    return;
  }

  tbody.innerHTML = keys.map(m => {
    const x = months[m];
    const neto = x.ventas - x.gastos;
    return `
      <tr>
        <td>${m}</td>
        <td style="text-align:right;">$${x.ventas.toFixed(2)}</td>
        <td style="text-align:right;">-$${x.gastos.toFixed(2)}</td>
        <td style="text-align:right;">$${neto.toFixed(2)}</td>
        <td style="text-align:right;">${x.libras.toFixed(2)}</td>
      </tr>
    `;
  }).join("");
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

async function updateAplicacion(id, patch) {
  return apiPostBody({
    type: "aplicaciones",
    action: "update",
    id,
    data: { id, ...(patch || {}) },
  });
}

