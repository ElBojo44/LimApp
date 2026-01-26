// ===== App Limones (Ventas + Dashboard Mensual) =====
// Requiere: storage.js cargado ANTES que app.js
// storage.js debe proveer: getVentas(), addVenta(), makeId()

document.addEventListener("DOMContentLoaded", () => {
  console.log("🍋 App Limones: cargó app.js");
  initApp().catch((err) => console.error("initApp error:", err));
});

async function initApp() {
  const form = document.getElementById("ventaForm");
  if (!form) {
    console.error("No encuentro #ventaForm. Revisa index.html");
    return;
  }

  form.addEventListener("submit", onSubmitVenta);

  // Default fecha = hoy
  const fechaInput = document.getElementById("ventaFecha");
  if (fechaInput && !fechaInput.value) fechaInput.value = toISODate(new Date());

  initDashboard();

  await renderVentas();
  await renderDashboard();
}

// Form gastos
const gastoForm = document.getElementById("gastoForm");
if (gastoForm) gastoForm.addEventListener("submit", onSubmitGasto);

// Default fecha gastos = hoy
const gastoFecha = document.getElementById("gastoFecha");
if (gastoFecha && !gastoFecha.value) gastoFecha.value = toISODate(new Date());

await renderGastos();


async function onSubmitVenta(e) {
  e.preventDefault();

  const fecha = document.getElementById("ventaFecha").value;
  const libras = Number(document.getElementById("ventaLibras").value);
  const precio = Number(document.getElementById("ventaPrecio").value);
  const cliente = document.getElementById("ventaCliente").value.trim();
  const nota = document.getElementById("ventaNota").value.trim();

  if (!fecha || !cliente || !isFinite(libras) || !isFinite(precio) || libras <= 0 || precio < 0) {
    alert("Revisa los campos: fecha, cliente, libras (>0) y precio (>=0).");
    return;
  }

  const venta = {
    id: makeId(),
    fecha,              // YYYY-MM-DD
    libras,
    precio,
    total: round2(libras * precio),
    cliente,
    nota: nota || "",
    createdAt: Date.now()
  };

  const btn = e.submitter;
  try {
    if (btn) btn.disabled = true;

    await addVenta(venta);

    // Reset parcial (dejamos la fecha)
    document.getElementById("ventaLibras").value = "";
    document.getElementById("ventaPrecio").value = "";
    document.getElementById("ventaCliente").value = "";
    document.getElementById("ventaNota").value = "";

    await renderVentas();
    await renderDashboard();
  } catch (err) {
    console.error(err);
    alert("No pude guardar en Google Sheets. Mira la consola (F12).");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function renderVentas() {
  const list = document.getElementById("ventasList");
  if (!list) {
    console.error("No encuentro #ventasList. Revisa index.html");
    return;
  }

  list.innerHTML = "<li>Cargando…</li>";

  try {
    const ventas = await getVentas();

    list.innerHTML = "";
    if (!ventas || ventas.length === 0) {
      list.innerHTML = "<li>No hay ventas todavía.</li>";
      return;
    }

    ventas.slice(0, 15).forEach((v) => {
      const li = document.createElement("li");
      li.className = "ventaItem";

      li.innerHTML = `
        <div class="ventaTop">
          <strong>${formatDate(v.fecha)}</strong>
          <span class="ventaTotal">$${Number(v.total || 0).toFixed(2)}</span>
        </div>
        <div class="ventaMeta">
          ${Number(v.libras || 0).toFixed(2)} lb × $${Number(v.precio || 0).toFixed(2)} — ${escapeHtml(v.cliente || "")}
          ${v.nota ? `<div class="ventaNota">${escapeHtml(v.nota)}</div>` : ""}
        </div>
      `;

      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = "<li>Error cargando ventas. Revisa consola (F12).</li>";
  }
}

async function onSubmitGasto(e) {
  e.preventDefault();

  const fecha = document.getElementById("gastoFecha").value;
  const monto = Number(document.getElementById("gastoMonto").value);
  const categoria = document.getElementById("gastoCategoria").value;
  const nota = document.getElementById("gastoNota").value.trim();

  if (!fecha || !categoria || !isFinite(monto) || monto <= 0) {
    alert("Revisa: fecha, categoría y monto (>0).");
    return;
  }

  const gasto = {
    id: makeId(),
    fecha,
    monto: round2(monto),
    categoria,
    nota: nota || "",
    createdAt: Date.now(),
  };

  const btn = e.submitter;
  try {
    if (btn) btn.disabled = true;

    await addGasto(gasto);

    document.getElementById("gastoMonto").value = "";
    document.getElementById("gastoCategoria").value = "";
    document.getElementById("gastoNota").value = "";

    await renderGastos();
    await renderDashboard();
  } catch (err) {
    console.error(err);
    alert("No pude guardar el gasto en Google Sheets. Mira la consola (F12).");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function renderGastos() {
  const list = document.getElementById("gastosList");
  if (!list) return;

  list.innerHTML = "<li>Cargando…</li>";

  try {
    const gastos = await getGastos();
    list.innerHTML = "";

    if (!gastos || gastos.length === 0) {
      list.innerHTML = "<li>No hay gastos todavía.</li>";
      return;
    }

    gastos.slice(0, 15).forEach((g) => {
      const li = document.createElement("li");
      li.className = "ventaItem"; // reutilizamos estilo

      li.innerHTML = `
        <div class="ventaTop">
          <strong>${formatDate(g.fecha)}</strong>
          <span class="ventaTotal">-$${Number(g.monto || 0).toFixed(2)}</span>
        </div>
        <div class="ventaMeta">
          ${escapeHtml(g.categoria || "")}
          ${g.nota ? ` — ${escapeHtml(g.nota)}` : ""}
        </div>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = "<li>Error cargando gastos. Revisa consola (F12).</li>";
  }
}


// ===== DASHBOARD =====
function initDashboard() {
  const inputMes = document.getElementById("dashMes");
  if (!inputMes) return;

  // Mes actual por defecto
  inputMes.value = toISOMonth(new Date());
  inputMes.addEventListener("change", () => renderDashboard());

  // Primer render (async)
  renderDashboard();
}

async function renderDashboard() {
  const mesEl = document.getElementById("dashMes");
  if (!mesEl) return;

  const mes = mesEl.value; // YYYY-MM

  try {
    const [ventas, gastos] = await Promise.all([getVentas(), getGastos()]);

    let totalVentas = 0;
    let totalLibras = 0;
    let countVentas = 0;

    (ventas || []).forEach((v) => {
      if (String(v.fecha || "").startsWith(mes)) {
        totalVentas += Number(v.total) || 0;
        totalLibras += Number(v.libras) || 0;
        countVentas++;
      }
    });

    let totalGastos = 0;
    let countGastos = 0;

    (gastos || []).forEach((g) => {
      if (String(g.fecha || "").startsWith(mes)) {
        totalGastos += Number(g.monto) || 0;
        countGastos++;
      }
    });

    const precioProm = totalLibras > 0 ? totalVentas / totalLibras : 0;
    const neto = totalVentas - totalGastos;

    // básicos (ya existen)
    document.getElementById("dashVentas").textContent = `$${totalVentas.toFixed(2)}`;
    document.getElementById("dashLibras").textContent = totalLibras.toFixed(2);
    document.getElementById("dashPrecio").textContent = `$${precioProm.toFixed(2)}`;
    document.getElementById("dashCount").textContent = countVentas;

    // extras (si no existen, los creamos)
    ensureDashExtra();

    document.getElementById("dashGastos").textContent = `-$${totalGastos.toFixed(2)}`;
    document.getElementById("dashNeto").textContent = `$${neto.toFixed(2)}`;
    document.getElementById("dashCountGastos").textContent = countGastos;
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

function ensureDashExtra() {
  if (document.getElementById("dashGastos")) return;

  const grid = document.querySelector(".dashGrid");
  if (!grid) return;

  const gastosBox = document.createElement("div");
  gastosBox.className = "dashItem";
  gastosBox.innerHTML = `<span class="dashLabel">Gastos</span><strong id="dashGastos">-$0.00</strong>`;

  const netoBox = document.createElement("div");
  netoBox.className = "dashItem";
  netoBox.innerHTML = `<span class="dashLabel">Neto</span><strong id="dashNeto">$0.00</strong>`;

  const countGBox = document.createElement("div");
  countGBox.className = "dashItem";
  countGBox.innerHTML = `<span class="dashLabel"># Gastos</span><strong id="dashCountGastos">0</strong>`;

  grid.appendChild(gastosBox);
  grid.appendChild(netoBox);
  grid.appendChild(countGBox);
}


// ===== Utils =====
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toISOMonth(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatDate(iso) {
  // iso: YYYY-MM-DD
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "2-digit" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}
