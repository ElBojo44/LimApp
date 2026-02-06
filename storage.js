// ===== Google Sheets (Apps Script Web App) =====
const API_URL =
  "https://limones-proxy.elbojo.workers.dev/";

// --- helpers ---
// --- GET cache (in-app) ---
// Reduce latency by caching GET responses + de-duping concurrent calls.
// TTL is short on purpose: enough to make the UI feel instant, but still fresh.
const GET_CACHE_TTL_MS = 12_000; // 12s
const GET_CACHE = new Map(); // type -> { ts, data, promise }

function invalidateGetCache(type) {
  if (!type) return;
  GET_CACHE.delete(String(type));
}

async function apiGet(type, opts = {}) {
  const t = String(type || "");
  if (!t) return [];
  const force = !!opts.force;

  const now = Date.now();
  const hit = GET_CACHE.get(t);

  // Fresh cached data
  if (!force && hit?.data && (now - (hit.ts || 0) < GET_CACHE_TTL_MS)) {
    return hit.data;
  }

  // In-flight de-dupe
  if (!force && hit?.promise) {
    return hit.promise;
  }

  const url = `${API_URL}?type=${encodeURIComponent(t)}&t=${Date.now()}`; // cache buster (server)
  const p = fetch(url, { method: "GET", redirect: "follow", cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`GET ${t} failed: ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "GET error");
      const data = json.data || [];
      GET_CACHE.set(t, { ts: Date.now(), data });
      return data;
    })
    .finally(() => {
      // clear promise slot but keep data
      const cur = GET_CACHE.get(t);
      if (cur?.promise) {
        GET_CACHE.set(t, { ts: cur.ts, data: cur.data });
      }
    });

  GET_CACHE.set(t, { ts: now, data: hit?.data, promise: p });
  return p;
}

// POST genérico: permite enviar body completo (action:update/delete, etc.)
// Devuelve el JSON del servidor ({ok:true,...}) para que app.js pueda mostrar errores.
async function apiPostBody(bodyObj) {
  const res = await fetch(API_URL, {
    method: "POST",
    // Con Worker ya NO necesitamos "text/plain" para evitar CORS.
    // Pero si tú prefieres dejarlo en text/plain, igual funciona.
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj || {}),
  });

  // Leemos como texto primero para poder loggear si viene HTML.
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("Respuesta NO-JSON (primeros 300 chars):", text.slice(0, 300));
    throw new Error(`Servidor devolvió HTML/no-JSON. Status: ${res.status}`);
  }

  if (!res.ok) throw new Error(json?.error || `POST failed: ${res.status}`);
  if (!json.ok) throw new Error(json.error || "POST error");
  // Invalidate GET cache for this type so next UI refresh is instant + correct
  try { invalidateGetCache(bodyObj?.type); } catch {}
  return json;
}

// ✅ Compat: soporta ambas firmas
// 1) apiPost(type, data)
// 2) apiPost({type, data, action, id})  <-- usado por delete/update en app.js
async function apiPost(a, b) {
  if (typeof a === "string") {
    return apiPostBody({ type: a, data: b });
  }
  return apiPostBody(a || {});
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
async function getVentas(opts = {}) {
  const rows = await apiGet("ventas", opts);
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
async function getGastos(opts = {}) {
  const rows = await apiGet("gastos", opts);

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
async function getProduccion(opts = {}) {
  const rows = await apiGet("produccion", opts);
  return rows
    .map((p) => ({
      ...p,
      libras: Number(p.libras) || 0,
      cajas: Number(p.cajas ?? p.sacos ?? 0) || 0,
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
async function getManoObra(opts = {}) {
  const rows = await apiGet("manoobra", opts);
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
async function getAplicaciones(opts = {}) {
  const rows = await apiGet("aplicaciones", opts);
  return rows
    .map((a) => ({
      ...a,
      costo: Number(a.costo) || 0,
      createdAt: Number(a.createdAt) || 0,
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function addAplicacion(item) {
  await apiPost("aplicaciones", item);
}

async function updateAplicacion(id, patch) {
  return apiPostBody({
    type: "aplicaciones",
    action: "update",
    id,
    data: { id, ...(patch || {}) },
  });
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

// ===============================
// UPDATE (Sheets)
//  Requiere Apps Script con soporte: {type, action:"update", id, data}
// ===============================

async function updateVenta(id, patch) {
  return apiPostBody({
    type: "ventas",
    action: "update",
    id,
    data: { id, ...(patch || {}) },
  });
}

async function updateGasto(id, patch) {
  return apiPostBody({
    type: "gastos",
    action: "update",
    id,
    data: { id, ...(patch || {}) },
  });
}

async function updateProduccion(id, patch) {
  return apiPostBody({
    type: "produccion",
    action: "update",
    id,
    data: { id, ...(patch || {}) },
  });
}

async function updateManoObra(id, patch) {
  return apiPostBody({
    type: "manoobra",
    action: "update",
    id,
    data: { id, ...(patch || {}) },
  });
}
