// ===== Google Sheets (Apps Script Web App) =====
const API_URL =
  "https://script.google.com/macros/s/AKfycbwaYmLuJZ9vkbGOtZMwciptTaOK8a_-TtW8bEK_16eYP5IHFodxGB0z4-WpKnVg8gqL/exec";

// --- helpers ---
async function apiGet(type) {
  const url = `${API_URL}?type=${encodeURIComponent(type)}&t=${Date.now()}`; // cache buster
  const res = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${type} failed: ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "GET error");
  return json.data || [];
}

async function apiPost(type, data) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
    body: JSON.stringify({ type, data }),
  });
  if (!res.ok) throw new Error(`POST ${type} failed: ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "POST error");
  return true;
}

function makeId() {
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}

function toDateNum(iso) {
  // iso esperado: YYYY-MM-DD
  if (!iso) return 0;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return 0;
  return y * 10000 + m * 100 + d;
}

// ===============================
// Ventas (Sheets)
// ===============================
async function getVentas() {
  const rows = await apiGet("ventas");
  return rows
    .map((v) => ({
      ...v,
      libras: Number(v.libras) || 0,
      precio: Number(v.precio) || 0,
      total: Number(v.total) || 0,
      createdAt: Number(v.createdAt) || 0,
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function addVenta(venta) {
  await apiPost("ventas", venta);
}

// ===============================
// Gastos (Sheets)  ✅ FIX: NO se sobreescribe con localStorage
// ===============================
async function getGastos() {
  const rows = await apiGet("gastos");

  const norm = rows.map((g) => {
    const created = Number(g.createdAt);
    return {
      ...g,
      monto: Number(g.monto) || 0,
      createdAt: Number.isFinite(created) && created > 0 ? created : 0,
      _fechaNum: toDateNum(g.fecha), // fallback
    };
  });

  // Orden: primero createdAt si existe, si no, por fecha
  norm.sort((a, b) => {
    const ac = a.createdAt || 0;
    const bc = b.createdAt || 0;
    if (ac !== bc) return bc - ac;
    return (b._fechaNum || 0) - (a._fechaNum || 0);
  });

  return norm;
}

async function addGasto(gasto) {
  await apiPost("gastos", gasto);
}

// ===============================
// Catálogos (Sheets)
// ===============================
async function getZonas() {
  const rows = await apiGet("zonas");
  return rows
    .map((z) => ({
      ...z,
      activo: String(z.activo ?? "1"),
      createdAt: Number(z.createdAt) || 0,
    }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

async function addZona(zona) {
  await apiPost("zonas", zona);
}

async function getLabores() {
  const rows = await apiGet("labores");
  return rows
    .map((l) => ({
      ...l,
      activo: String(l.activo ?? "1"),
      createdAt: Number(l.createdAt) || 0,
    }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

async function addLabor(labor) {
  await apiPost("labores", labor);
}

async function getEmpleados() {
  const rows = await apiGet("empleados");
  return rows
    .map((e) => ({
      ...e,
      activo: String(e.activo ?? "1"),
      createdAt: Number(e.createdAt) || 0,
    }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
}

async function addEmpleado(emp) {
  await apiPost("empleados", emp);
}

// ===============================
// Producción (Sheets)
// ===============================
async function getProduccion() {
  const rows = await apiGet("produccion");
  return rows
    .map((p) => ({
      ...p,
      libras: Number(p.libras) || 0,
      sacos: Number(p.sacos) || 0,
      createdAt: Number(p.createdAt) || 0,
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function addProduccion(item) {
  await apiPost("produccion", item);
}

// ===============================
// Mano de obra (Sheets)
// ===============================
async function getManoObra() {
  const rows = await apiGet("manoobra");
  return rows
    .map((m) => ({
      ...m,
      horas: Number(m.horas) || 0,
      pagoDia: Number(m.pagoDia) || 0,
      createdAt: Number(m.createdAt) || 0,
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function addManoObra(item) {
  await apiPost("manoobra", item);
}

// ===============================
// Aplicaciones (Sheets) - si tu backend no lo soporta todavía, lo dejamos local opcional
// ===============================
async function getAplicaciones() {
  const rows = await apiGet("aplicaciones");
  return rows
    .map((a) => ({
      ...a,
      costo: Number(a.costo) || 0,
      createdAt: Number(a.createdAt) || 0,
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// Si tu Apps Script no tiene type="aplicaciones" todavía, cambia esto a apiPost.
// Por ahora lo dejamos local para no romper.
async function addAplicacion(item) {
  const key = "LIM_APLICACIONES";
  const arr = (() => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } })();
  arr.unshift(item);
  localStorage.setItem(key, JSON.stringify(arr));
  return item;
}

// ===============================
// (Opcional) Storage LOCAL para respaldo / pruebas
//  - OJO: ya no sobreescribimos getGastos/addGasto.
// ===============================
const KEY_GASTO_CATS = "LIM_GASTO_CATS";
const KEY_GASTOS_LOCAL = "LIM_GASTOS";

function _readArr(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}
function _writeArr(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr || []));
}

// Categorías de gastos (local)
async function getGastoCategorias() {
  return _readArr(KEY_GASTO_CATS);
}

async function addGastoCategoria(cat) {
  const arr = _readArr(KEY_GASTO_CATS);
  arr.unshift(cat);
  _writeArr(KEY_GASTO_CATS, arr);
  return cat;
}

// Gastos LOCAL (si algún día quieres ver lo que se guardó solo en el device)
async function getGastosLocal() {
  return _readArr(KEY_GASTOS_LOCAL);
}

async function addGastoLocal(g) {
  const arr = _readArr(KEY_GASTOS_LOCAL);
  arr.unshift(g);
  _writeArr(KEY_GASTOS_LOCAL, arr);
  return g;
}
