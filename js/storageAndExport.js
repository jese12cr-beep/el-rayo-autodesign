/* El Rayo — Persistencia Offline en IndexedDB y Exportación PDF con jsPDF@2.5.2 */

const DB_NAME = "ElRayoAutodesignDB";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const SESSION_KEY = "current-session";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSessionToIndexedDB(payload) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put({
      id: SESSION_KEY,
      updatedAt: Date.now(),
      ...payload
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSessionFromIndexedDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function formatMXN(amount) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

async function imageUrlToDataUrl(url) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function exportOrderQuotePDF({
  glCanvas,
  decalCanvas,
  quoteSummary,
  paintOptions,
  orderData
}) {
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm");

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter"
  });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Encabezado industrial oscuro
  doc.setFillColor(12, 14, 18);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 29, pageW, 1.5, "F");

  try {
    const logoData = await imageUrlToDataUrl("./assets/logo_el_rayo.png");
    doc.addImage(logoData, "PNG", margin, 4, 22, 22);
  } catch {
    // Continuar aunque el logo no haya cargado
  }

  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("EL RAYO — AUTODESIGN STUDIO", margin + 26, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(180, 192, 210);
  doc.text("Taller de Hojalatería, Pintura Automotriz & Diseño en Vinil", margin + 26, 19);
  const dateStr = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
  doc.text(`Fecha: ${dateStr} · Folio: RAY-${String(Date.now()).slice(-6)}`, margin + 26, 24.5);

  // Datos de Cliente y Vehículo
  let y = 37;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("DATOS DE ORDEN DE TRABAJO", margin, y);

  y += 3;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, pageW - margin * 2, 24, 2, 2, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Cliente: ${orderData.clientName || "Público General"}`, margin + 3, y + 6.5);
  doc.text(`Teléfono: ${orderData.clientPhone || "N/D"}`, margin + 102, y + 6.5);
  doc.text(`Vehículo: ${orderData.vehicleBrand || "Marca N/D"} ${orderData.vehicleModel || ""}`.trim(), margin + 3, y + 13);
  doc.text(`Placas: ${orderData.vehiclePlates || "Sin placas"}`, margin + 102, y + 13);
  doc.text(`VIN / Serie: ${orderData.vehicleVin || "N/D"}`, margin + 3, y + 19.5);
  doc.text(`Color: ${paintOptions.colorName || paintOptions.hex} (${paintOptions.hex}) · Acabado: ${paintOptions.finish.toUpperCase()}`, margin + 72, y + 19.5);

  // Snapshot limpio del vehículo pintado (WebGL2 + Viniles recortados, SIN guías ni puntos IA)
  y += 28;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = glCanvas.width;
  exportCanvas.height = glCanvas.height;
  const ectx = exportCanvas.getContext("2d");
  ectx.drawImage(glCanvas, 0, 0);
  if (decalCanvas) {
    ectx.drawImage(decalCanvas, 0, 0);
  }

  const imgW = pageW - margin * 2;
  const imgH = imgW * (9 / 16);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin - 0.5, y - 0.5, imgW + 1, imgH + 1);
  doc.addImage(exportCanvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, y, imgW, imgH);

  // Tabla de Materiales y Cotización
  y += imgH + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    quoteSummary.isAiEstimate
      ? `COTIZACIÓN ESTIMADA POR ÁREA IA (${quoteSummary.maskCoveragePct}%)`
      : `DESGLOSE POR PIEZAS (${quoteSummary.selectedParts.length} seleccionadas · ${quoteSummary.tierLabel})`,
    margin,
    y
  );

  y += 3;
  const colX = [margin, margin + 88, margin + 138];
  const rowH = 7;

  doc.setFillColor(20, 24, 32);
  doc.rect(margin, y, pageW - margin * 2, rowH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Concepto", colX[0] + 2, y + 4.8);
  doc.text("Cantidad / Medida", colX[1] + 2, y + 4.8);
  doc.text("Importe MXN", pageW - margin - 2, y + 4.8, { align: "right" });

  const rows = [
    ["Base Color Automotriz", `${quoteSummary.baseLiters} Litros`, formatMXN(quoteSummary.baseCost)],
    ["Transparente (Barniz) + Catalizador 2:1", `${quoteSummary.clearLiters} L + ${quoteSummary.catalystLiters} L cat.`, formatMXN(quoteSummary.clearAndCatCost)],
    ["Mano de Obra (Hojalatería, Cabina y Pulido)", `${quoteSummary.laborHours} Horas`, formatMXN(quoteSummary.laborCost)],
    ["Subtotal", quoteSummary.selectedParts.map(p => p.name).slice(0, 3).join(", ") || "Estimación IA", formatMXN(quoteSummary.subtotal)],
    ["IVA (16%)", "Tasa fiscal aplicable", formatMXN(quoteSummary.iva)]
  ];

  doc.setFont("helvetica", "normal");
  rows.forEach((row, idx) => {
    const ry = y + rowH * (idx + 1);
    doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255);
    doc.rect(margin, ry, pageW - margin * 2, rowH, "F");
    doc.setTextColor(15, 23, 42);
    doc.text(row[0], colX[0] + 2, ry + 4.8);
    doc.text(row[1], colX[1] + 2, ry + 4.8);
    doc.text(row[2], pageW - margin - 2, ry + 4.8, { align: "right" });
  });

  const totalY = y + rowH * (rows.length + 1);
  doc.setFillColor(220, 38, 38);
  doc.rect(margin, totalY, pageW - margin * 2, 8.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text("TOTAL GENERAL (IVA INCLUIDO)", margin + 3, totalY + 5.7);
  doc.text(formatMXN(quoteSummary.total), pageW - margin - 3, totalY + 5.7, { align: "right" });

  if (orderData.paintNotes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Notas de taller: ${orderData.paintNotes.slice(0, 140)}`, margin, totalY + 14);
  }

  const plateSlug = (orderData.vehiclePlates || "Cotizacion").replace(/[^A-Za-z0-9_-]/g, "_");
  const filename = `ElRayo_Orden_${plateSlug}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
