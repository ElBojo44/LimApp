// ===== App Limones (Ventas + Gastos + Dashboard Mensual) =====
// Requiere: storage.js cargado ANTES que app.js
// storage.js debe proveer: getVentas(), addVenta(), getGastos(), addGasto(), makeId()

document.addEventListener("DOMContentLoaded", () => {
  console.log("🍋 App Limones: cargó app.js");
  initApp().catch((err) => console.error("initApp error:", err));
});

async function initApp() {
  // ===== Ventas =====
  const ventaForm = document.getElementById("ventaForm");
  if (!ventaForm) {
    console.error("No encuentro #ventaForm. Revisa index.html");
    return;
  }
  ventaForm.addEventListener("submit", onSubmitVenta);

  const ventaFecha = document.getElementById("ventaFecha");
  if (ventaFecha && !ventaFecha.value) ventaFecha.value = toISODate(new Date());

  // ===== Gastos =====
  const gastoForm = document.getElementById("gastoForm");
  if (gastoForm) {
    gastoForm.addEventListener("submit", onSubmitGasto);
    const gastoFecha = document.getElementById("gastoFecha");
    if (gastoFecha && !gastoFecha.value) gastoFecha.value = toISODate(new Date());
  } else {
    console.warn("No encuentro #gastoForm (ok si aún no agregaste gastos al index.html).");
  }

  // Dashboard
  initDashboard();

  // Render inicial
  await renderVentas();
  await renderGastos();
  await renderDashboard();
}

// =====================
//        VENTAS
// =====================
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

    document.getElementById("ventaLibras").value = "";
    document.getElementById("ventaPrecio").value = "";
    document.getElementById("ventaCliente").value = "";
    document.getElementById("ventaNota").value = "";

    await renderVentas();
    await renderDashboard();
  } catch (err) {
    console.error("Guardar venta error:", err);
    alert("No pude guardar la venta en Google Sheets. Abre F12 → Console para ver el error.");
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
    console.error("Cargar ventas error:", err);
    list.innerHTML = "<li>Error cargando ventas. Revisa consola (F12).</li>";
  }
}

// =====================
//        GASTOS
// =====================
async function onSubmitGasto(e) {
  e.preventDefault();

  const fecha = document.getElementById("gastoFecha")?.value;
  const monto = Number(document.getElementById("gastoMonto")?.value);
  const categoria = document.getElementById("gastoCategoria")?.value;
  const nota = document.getElementById("gastoNota")?.value?.trim() || "";

  if (!fecha || !categoria || !isFinite(monto) || monto <= 0) {
    alert("Revisa: fecha, categoría y monto (>0).");
    return;
  }

  const gasto = {
    id: makeId(),
    fecha,
    monto: round2(monto),
    categoria,
    nota,
    createdAt: Date.now()
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
    console.error("Guardar gasto error:", err);
    alert("No pude guardar el gasto en Google Sheets. Abre F12 → Console para ver el error.");
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
      li.className = "ventaItem";

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
    console.error("Cargar gastos error:", err);
    list.innerHTML = "<li>Error cargando gastos. Revisa consola (F12).</li>";
  }
}

// =====================
//      DASHBOARD
// =====================
function initDashboard() {
  const inputMes = document.getElementById("dashMes");
  if (!inputMes) return;

  inputMes.value = toISOMonth(new Date());
  inputMes.addEventListener("change", () => renderDashboard());

  renderDashboard();
}

async function renderDashboard() {
  const mesEl = document.getElementById("dashMes");
  if (!mesEl) return;

  const mes = mesEl.value;

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

    setText("dashVentas", `$${totalVentas.toFixed(2)}`);
    setText("dashLibras", totalLibras.toFixed(2));
    setText("dashPrecio", `$${precioProm.toFixed(2)}`);
    setText("dashCount", String(countVentas));

    ensureDashExtra();
    setText("dashGastos", `-$${totalGastos.toFixed(2)}`);
    setText("dashNeto", `$${neto.toFixed(2)}`);
    setText("dashCountGastos", String(countGastos));

    const netoEl = document.getElementById("dashNeto");
    if (netoEl) netoEl.style.color = neto >= 0 ? "#3ddc84" : "#ff5c5c";
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

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// =====================
//         Utils
// =====================
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
