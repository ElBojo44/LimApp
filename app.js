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
    const ventas = await getVentas();

    let totalVentas = 0;
    let totalLibras = 0;
    let count = 0;

    (ventas || []).forEach((v) => {
      if (String(v.fecha || "").startsWith(mes)) {
        totalVentas += Number(v.total) || 0;
        totalLibras += Number(v.libras) || 0;
        count++;
      }
    });

    const precioProm = totalLibras > 0 ? totalVentas / totalLibras : 0;

    const elVentas = document.getElementById("dashVentas");
    const elLibras = document.getElementById("dashLibras");
    const elPrecio = document.getElementById("dashPrecio");
    const elCount = document.getElementById("dashCount");

    if (elVentas) elVentas.textContent = `$${totalVentas.toFixed(2)}`;
    if (elLibras) elLibras.textContent = totalLibras.toFixed(2);
    if (elPrecio) elPrecio.textContent = `$${precioProm.toFixed(2)}`;
    if (elCount) elCount.textContent = count;
  } catch (err) {
    console.error("Dashboard error:", err);
  }
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
