function moneyRD(v){const n=Number(v||0);return 'RD$'+n.toFixed(2);} 
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


// ---------- INIT ----------
async function initApp() {
  // Hooks  
  hookVentas();
  hookGastos();
  hookCatalogForms();   
  hookManoObraSimple();
  await renderManoObraSimple();


  initDashboard();

  // Carga catálogos + dropdowns
  await loadCatalogos();
  await renderGastos();
  hookProduccion();
  

  // Render inicial
  await Promise.all([renderVentas(), renderGastos(), renderProduccion()]);
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

function addProdEmpRow() {
  const wrap = document.getElementById("prodEmps");
  const tpl = document.getElementById("prodEmpTpl");
  if (!wrap || !tpl) return;

  const node = tpl.content.cloneNode(true);
  const row = node.querySelector(".empRow");
  const sel = node.querySelector(".prodEmpleadoSel");
  const rm = node.querySelector(".empRemove");

  fillEmpleadoSelectEl(sel);

  rm?.addEventListener("click", () => row?.remove());
  wrap.appendChild(node);
}

let _prodEmpSelectPendiente = null;

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
}

// ===============================
// GASTOS (estilo AppSheet, local)
// ===============================

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

    // seleccionar la nueva
    const nueva = (GASTO_CATS || []).find(c => String(c.nombre || "").trim().toLowerCase() === nombre.toLowerCase());
    if (nueva) document.getElementById("gastoCategoria").value = nueva.id;

    document.getElementById("gastoNewCatBox").style.display = "none";
    if (nombreEl) nombreEl.value = "";
  });


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

function hookGastos() {
  setGastoDefaultDate();

  
  

  
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
  console.log("DEBUG categoria:", {
    exists: !!catEl,
    value: catEl?.value,
    text: catEl?.selectedOptions?.[0]?.textContent
  });

  const categoriaId = catEl?.value || "";
  const categoriaNombre = catEl?.selectedOptions?.[0]?.textContent || "";

  const monto = Number(document.getElementById("gastoMonto")?.value || 0);
  const metodoPago = document.getElementById("gastoMetodo")?.value || "";
  const proveedor = (document.getElementById("gastoProveedor")?.value || "").trim();

  const empEl = document.getElementById("gastoEmpleado");
  const empleadoId = empEl?.value || "";
  const empleadoNombre = empEl?.selectedOptions?.[0]?.textContent || "";

  const nota = (document.getElementById("gastoNota")?.value || "").trim();

  const file = document.getElementById("gastoRecibo")?.files?.[0] || null;
  const reciboFoto = await fileToDataURL(file);

  if (!fecha) return alert("Fecha inválida.");
  if (!categoriaId) return alert("Categoría requerida: selecciona una.");
  if (categoriaId === "__NEW__") return alert("Categoría requerida: termina de crearla.");
  if (!(monto > 0)) return alert("Monto debe ser > 0.");
  if (!metodoPago) return alert("Selecciona método de pago.");

  await addGasto({
    id: makeId(),
    fecha,
    categoriaId,
    categoriaNombre,
    monto: round2(monto),
    metodoPago,
    proveedor,
    empleadoId: (empleadoId && empleadoId !== "__NEW__") ? empleadoId : "",
    empleadoNombre: (empleadoId && empleadoId !== "__NEW__") ? empleadoNombre : "",
    nota,
    reciboFoto, // DataURL (opcional)
    createdAt: Date.now()
  });

  document.getElementById("gastoForm")?.reset();
  setGastoDefaultDate();

  await renderGastos();
  await renderDashboard();

  alert("✅ Gasto guardado");
}

async function renderGastos() {
  const list = document.getElementById("gastosList");
  if (!list) return;

  const items = (await getGastos()) || [];
  list.innerHTML = "";

  items.slice(0, 30).forEach(g => {
    const li = document.createElement("li");
    const montoTxt = money(g.monto || 0);
    const meta = `${g.fecha || ""} • ${g.categoriaNombre || ""} • ${g.metodoPago || ""}`;
    const prov = g.proveedor ? ` • ${g.proveedor}` : "";
    const emp = g.empleadoNombre ? ` • ${g.empleadoNombre}` : "";

    li.innerHTML = `
      <div class="itemTop">
        <strong>${montoTxt}</strong>
        <span class="muted">${escapeHtml(meta + prov + emp)}</span>
      </div>
      ${g.nota ? `<div class="muted">${escapeHtml(g.nota)}</div>` : ""}
      ${g.reciboFoto ? `<img src="${g.reciboFoto}" alt="recibo" style="max-width:180px; border-radius:10px; margin-top:8px; display:block;">` : ""}
    `;
    list.appendChild(li);
  });
}


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

  await addProduccion(data);

  // reset
  document.getElementById("prodForm")?.reset();
  document.getElementById("prodEmps") && (document.getElementById("prodEmps").innerHTML = "");
  addProdEmpRow();
  setProdDefaultDate();

  await renderProduccion();
  await renderDashboard();

  alert("✅ Producción guardada");
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
fillSelect("gastoCategoria", GASTO_CATS, false, true);

const gc = document.getElementById("gastoCategoria");
if (gc && (!gc.value || gc.value === "__NEW__")) {
  const firstReal = [...gc.options].find(o => o.value && o.value !== "__NEW__");
  if (firstReal) gc.value = firstReal.value;
}



// Empleado en gastos (opcional, con + Nuevo…)
fillSelect("gastoEmpleado", EMPLEADOS, true, true);

  fillSelect("prodZona", ZONAS, false, true); // 👈 allowNew = true

  fillSelect("moEmpleado", EMPLEADOS, false, true);
  fillSelect("moZona", ZONAS, false);
  fillSelect("moTarea", LABORES, false, true);
  
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


async function renderProduccion() {
  const ul = document.getElementById("prodList");
  if (!ul) return;
  ul.innerHTML = "<li>Cargando…</li>";

  const arr = await getProduccion();
  if (!arr.length) {
    ul.innerHTML = "<li>No hay producción.</li>";
    return;
  }

  ul.innerHTML = arr.slice(0, 10).map(p => `
    <li class="ventaItem">
      <div class="ventaTop">
        <strong>${fmtDate(p.fecha)} — ${escapeHtml(p.zonaNombre || "")}</strong>
        <span class="ventaTotal">${Number(p.libras || 0).toFixed(2)} lb</span>
      </div>
      <div class="ventaMeta">
        ${escapeHtml(p.laborNombre || "")}${p.responsableNombre ? " • " + escapeHtml(p.responsableNombre) : ""}
      </div>
    </li>
  `).join("");
}

function hookManoObraSimple() {
  const form = document.getElementById("moForm");
  if (!form) return;

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
    const nuevo = EMPLEADOS.find(e => e.nombre === nombre);
    if (nuevo && empSel) empSel.value = nuevo.id;

    document.getElementById("moNewEmpBox").style.display = "none";
    document.getElementById("moNewEmpNombre").value = "";
    document.getElementById("moNewEmpTel").value = "";
  });

  // Guardar nueva tarea (Labores)
  document.getElementById("moSaveNewTask")?.addEventListener("click", async () => {
    const nombre = document.getElementById("moNewTaskNombre").value.trim();
    if (!nombre) return alert("Pon el nombre de la tarea.");

    await addLabor({
      id: makeId(),
      nombre,
      categoria: "ManoObra",
      activo: "1",
      createdAt: Date.now()
    });

    await loadCatalogos();
    const nueva = LABORES.find(t => t.nombre === nombre);
    if (nueva && taskSel) taskSel.value = nueva.id;

    document.getElementById("moNewTaskBox").style.display = "none";
    document.getElementById("moNewTaskNombre").value = "";
  });

  // Submit mano de obra simple
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fecha = normalizeISODate(document.getElementById("moFecha").value);
    const empleadoId = document.getElementById("moEmpleado").value;
    const tareaId = document.getElementById("moTarea").value;
    const horas = Number(document.getElementById("moHoras").value);
    const pagoDia = Number(document.getElementById("moPagoDia").value);
    const nota = document.getElementById("moNota").value.trim();

    if (!fecha) return alert("Fecha inválida. Usa el calendario.");
    if (!empleadoId || empleadoId === "__NEW__") return alert("Selecciona un empleado.");
    if (!tareaId || tareaId === "__NEW__") return alert("Selecciona una tarea.");
    if (!isFinite(horas) || horas <= 0) return alert("Horas debe ser > 0.");
    if (!isFinite(pagoDia) || pagoDia < 0) return alert("Pago día debe ser >= 0.");

    const emp = EMPLEADOS.find(x => x.id === empleadoId) || {};
    const task = LABORES.find(x => x.id === tareaId) || {};

    await addManoObra({
      id: makeId(),
      fecha,
      empleadoId: emp.id || "",
      empleadoNombre: emp.nombre || "",
      tareaId: task.id || "",
      tareaNombre: task.nombre || "",
      horas: round2(horas),
      pagoDia: round2(pagoDia),
      nota,
      createdAt: Date.now(),
    });

    // Guardar también como Gasto (Mano de obra)

const empNombre = (emp && emp.nombre) ? emp.nombre : "";
const tareaNombre = (task && task.nombre) ? task.nombre : "";

await addGasto({
  id: makeId(),
  fecha,
  monto: round2(pagoDia),
  categoria: "Mano de obra",
  nota: `${empNombre} — ${tareaNombre} • ${round2(horas)}h${nota ? " • " + nota : ""}`,
  createdAt: Date.now()
});

    // refrescar gastos + dashboard (aunque estés en otro tab)
await renderGastos();
await renderDashboard();


    form.reset();
    document.getElementById("moFecha").value = todayISO();
    await renderManoObraSimple();
  });
}

async function renderManoObraSimple() {
  const ul = document.getElementById("moList");
  if (!ul) return;
  ul.innerHTML = "<li>Cargando…</li>";

  const arr = await getManoObra();
  if (!arr.length) {
    ul.innerHTML = "<li>No hay mano de obra.</li>";
    return;
  }

  ul.innerHTML = arr.slice(0, 10).map(m => `
    <li class="ventaItem">
      <div class="ventaTop">
        <strong>${fmtDate(m.fecha)} — ${escapeHtml(m.empleadoNombre || "")}</strong>
        <span class="ventaTotal">$${Number(m.pagoDia || 0).toFixed(2)}</span>
      </div>
      <div class="ventaMeta">
        ${escapeHtml(m.tareaNombre || "")} • ${Number(m.horas || 0).toFixed(2)} h
        ${m.nota ? `<div class="ventaNota">${escapeHtml(m.nota)}</div>` : ""}
      </div>
    </li>
  `).join("");
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
    const cliente = (elCliente?.value || "").trim();
    const libras = Number(elLibras?.value || 0);
    const precio = Number(elPrecio?.value || 0);
    const metodo = String(elMetodo?.value || "");
    const estado = String(elEstado?.value || "");
    const nota = (elNota?.value || "").trim();

    if (!fecha) return alert("Fecha requerida");
    if (!cliente) return alert("Cliente requerido");
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
      cliente,
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
  });
}

async function renderVentas() {
  const ul = document.getElementById("ventasList");
  if (!ul) return;
  ul.innerHTML = "<li>Cargando…</li>";

  const arr = await getVentas();
  if (!arr.length) {
    ul.innerHTML = "<li>No hay ventas.</li>";
    return;
  }

  ul.innerHTML = arr.slice(0, 10).map(v => {
    const total = Number(v.total || 0);
    const cobrado = Number(v.montoCobrado || 0);
    const balance = Number.isFinite(Number(v.balance)) ? Number(v.balance) : (total - cobrado);
    const estado = v.estadoCobro || "";
    const metodo = v.metodoCobro || "";
    const cliente = v.cliente || "";

    return `
    <li class="ventaItem">
      <div class="ventaTop">
        <strong>${fmtDate(v.fecha)}</strong>
        <span class="ventaTotal">${moneyRD(total)}</span>
      </div>
      <div class="ventaMeta">
        ${escapeHtml(cliente)} — ${Number(v.libras || 0).toFixed(2)} lb × RD$${Number(v.precio || 0).toFixed(2)}
      </div>
      <div class="ventaMeta">
        ${estado ? `<span>${escapeHtml(estado)}</span>` : ""}${metodo ? ` • <span>${escapeHtml(metodo)}</span>` : ""}
        ${(cobrado || balance) ? ` • <span>Cobrado: ${moneyRD(cobrado)} • Balance: ${moneyRD(balance)}</span>` : ""}
      </div>
    </li>`;
  }).join("");
}

// ---------- GASTOS ----------
function hookGastos() {
  const form = document.getElementById("gastoForm");
  if (!form) return;

  const f = document.getElementById("gastoFecha");
  if (f && !f.value) f.value = todayISO();

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const fecha = normalizeISODate(document.getElementById("gastoFecha").value);
    const monto = Number(document.getElementById("gastoMonto").value);
    const categoria = document.getElementById("gastoCategoria").value;
    const nota = document.getElementById("gastoNota").value.trim();

    if (!fecha) return alert("Fecha inválida. Usa el calendario.");
    if (!categoria) return alert("Categoría requerida");
    if (!isFinite(monto) || monto <= 0) return alert("Monto debe ser > 0");

    await addGasto({
      id: makeId(),
      fecha,
      monto: round2(monto),
      categoria,
      nota,
      createdAt: Date.now()
    });

    form.reset();
    document.getElementById("gastoFecha").value = todayISO();

    await renderGastos();
    await renderDashboard();
  });
}

async function renderGastos() {
  const ul = document.getElementById("gastosList");
  if (!ul) return;
  ul.innerHTML = "<li>Cargando…</li>";

  const arr = await getGastos();
  if (!arr.length) {
    ul.innerHTML = "<li>No hay gastos.</li>";
    return;
  }

  ul.innerHTML = arr.slice(0, 10).map(g => `
    <li class="ventaItem">
      <div class="ventaTop">
        <strong>${fmtDate(g.fecha)}</strong>
        <span class="ventaTotal">-$${Number(g.monto || 0).toFixed(2)}</span>
      </div>
      <div class="ventaMeta">${escapeHtml(g.categoria || "")}</div>
    </li>
  `).join("");
}

// ---------- DASHBOARD (incluye categorías + mensual) ----------
async function renderDashboard() {
  const mes = document.getElementById("dashMes")?.value;
  if (!mes) return;

  const [ventas, gastos] = await Promise.all([getVentas(), getGastos()]);

  let tv = 0, tl = 0, tg = 0, cv = 0, cg = 0;

  ventas.forEach(v => {
    if (String(v.fecha || "").startsWith(mes)) {
      tv += Number(v.total) || 0;
      tl += Number(v.libras) || 0;
      cv++;
    }
  });

  gastos.forEach(g => {
    if (String(g.fecha || "").startsWith(mes)) {
      tg += Number(g.monto) || 0;
      cg++;
    }
  });

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

  // Gastos por categoría
  const catMap = {};
  gastos.forEach(g => {
    if (String(g.fecha || "").startsWith(mes)) {
      const cat = (g.categoria || "Sin categoría").trim() || "Sin categoría";
      catMap[cat] = (catMap[cat] || 0) + (Number(g.monto) || 0);
    }
  });
  renderGastosPorCategoria(catMap);

  // Mensual
  await renderMensualTable(ventas, gastos);
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
