// ===== Google Sheets (Apps Script Web App) =====
const API_URL =
  "https://script.google.com/macros/s/AKfycbwcb0b4FSVdOrv9QQFqbDBAg9ugjVnPgoTbZFVdEuBPZWHI8yYRAekdXoNUjamGCngb/exec";

async function apiGet(type) {
  const res = await fetch(`${API_URL}?type=${encodeURIComponent(type)}`, {
    method: "GET",
  });
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

// ===== Ventas =====
async function getVentas() {
  // Normaliza números por si Sheets devuelve strings
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

// ===== Gastos (los usaremos cuando lo activemos) =====
async function getGastos() {
  const rows = await apiGet("gastos");
  return rows
    .map((g) => ({
      ...g,
      monto: Number(g.monto) || 0,
      createdAt: Number(g.createdAt) || 0,
    }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function addGasto(gasto) {
  await apiPost("gastos", gasto);
}

// ===== Utils =====
function makeId() {
  return "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
}
