/* El Rayo — Autodesign Studio | Orquestador Principal */
import { PaintEngine } from "./paintEngine.js?v=4";
import { SegmentationController } from "./segmentation.js?v=4";
import { DecalManager, DECAL_CATALOG } from "./decalManager.js?v=4";
import { BODY_PARTS_CATALOG, QuoteCalculator } from "./quoteCalculator.js?v=4";
import {
  saveSessionToIndexedDB,
  loadSessionFromIndexedDB,
  exportOrderQuotePDF
} from "./storageAndExport.js?v=4";

const OEM_SWATCHES = [
  { name: "Rojo El Rayo", hex: "#DC2626" },
  { name: "Azul Cobalto", hex: "#2563EB" },
  { name: "Negro Obsidiana", hex: "#14171D" },
  { name: "Blanco Ártico", hex: "#F1F5F9" },
  { name: "Gris Nardo", hex: "#64748B" },
  { name: "Plata Tungsteno", hex: "#94A3B8" },
  { name: "Verde Militar", hex: "#3B4D3C" },
  { name: "Amarillo Daytona", hex: "#EAB308" },
  { name: "Naranja Track", hex: "#EA580C" },
  { name: "Azul Medianoche", hex: "#0F172A" },
  { name: "Vino Cereza", hex: "#7F1D1D" },
  { name: "Perla Champagne", hex: "#D6C5A3" }
];

const ORDER_FIELD_IDS = [
  "clientName",
  "clientPhone",
  "vehicleBrand",
  "vehicleModel",
  "vehiclePlates",
  "vehicleVin",
  "paintNotes"
];

function isLightColor(hex) {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16) || 0;
  const g = Number.parseInt(clean.slice(2, 4), 16) || 0;
  const b = Number.parseInt(clean.slice(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 155;
}

function formatCurrency(val) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(val || 0);
}

function generateSampleVehicleDataUrl() {
  const c = document.createElement("canvas");
  c.width = 1280;
  c.height = 720;
  const ctx = c.getContext("2d");

  // Fondo estudio automotriz iluminado
  const bg = ctx.createLinearGradient(0, 0, 0, 720);
  bg.addColorStop(0, "#dbe2ec");
  bg.addColorStop(0.68, "#eef2f7");
  bg.addColorStop(1, "#94a3b8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1280, 720);

  // Sombra piso
  const shadow = ctx.createRadialGradient(640, 560, 60, 640, 560, 440);
  shadow.addColorStop(0, "rgba(15, 23, 42, 0.58)");
  shadow.addColorStop(1, "rgba(15, 23, 42, 0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(150, 480, 980, 160);

  // Carrocería Fastback Coupe con degradados volumétricos y reflejos blancos
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(205, 455);
  ctx.quadraticCurveTo(212, 372, 305, 345);
  ctx.lineTo(445, 255);
  ctx.quadraticCurveTo(605, 222, 805, 260);
  ctx.lineTo(955, 338);
  ctx.quadraticCurveTo(1065, 355, 1085, 435);
  ctx.lineTo(1075, 495);
  ctx.lineTo(980, 502);
  ctx.arc(890, 498, 86, 0, Math.PI, true);
  ctx.lineTo(475, 502);
  ctx.arc(385, 498, 86, 0, Math.PI, true);
  ctx.lineTo(212, 495);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(0, 235, 0, 515);
  bodyGrad.addColorStop(0, "#cbd5e1");
  bodyGrad.addColorStop(0.28, "#94a3b8");
  bodyGrad.addColorStop(0.36, "#f8fafc");
  bodyGrad.addColorStop(0.55, "#64748b");
  bodyGrad.addColorStop(0.88, "#334155");
  bodyGrad.addColorStop(1, "#1e293b");
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.restore();

  // Vidrios oscuros excluidos de lámina
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.moveTo(458, 270);
  ctx.quadraticCurveTo(615, 240, 770, 272);
  ctx.lineTo(885, 340);
  ctx.lineTo(355, 340);
  ctx.closePath();
  ctx.fill();

  // Faros y parrilla
  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(1025, 392, 54, 42);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(1038, 398, 26, 22);

  // Rines y llantas
  for (const wx of [385, 890]) {
    ctx.beginPath();
    ctx.arc(wx, 502, 74, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(wx, 502, 48, 0, Math.PI * 2);
    ctx.fillStyle = "#cbd5e1";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(wx, 502, 16, 0, Math.PI * 2);
    ctx.fillStyle = "#334155";
    ctx.fill();
  }

  return c.toDataURL("image/png");
}

class ElRayoStudioApp {
  constructor() {
    this.paint = new PaintEngine(document.getElementById("glPaintCanvas"), 1280, 720);
    this.quoteCalc = new QuoteCalculator();

    this.state = {
      imageDataUrl: null,
      vehicleLabel: "Sin fotografía cargada",
      selectedColorName: OEM_SWATCHES[0].name,
      paintOptions: { ...this.paint.options }
    };

    this.decalManager = new DecalManager(document.getElementById("decalCanvas"), {
      width: 1280,
      height: 720,
      onChange: () => this._handleDecalChanged()
    });

    this.seg = new SegmentationController(document.getElementById("maskOverlayCanvas"), {
      width: 1280,
      height: 720,
      onMaskUpdated: (combinedCanvas, coveragePct, computeStats) => {
        this.paint.updateMask(combinedCanvas);
        this.decalManager.render(combinedCanvas);
        this.seg.renderOverlay(ctx => this.decalManager.drawHandles(ctx));
        if (computeStats) {
          document.getElementById("maskCoverageBadge").textContent = `Área IA: ${coveragePct.toFixed(1)}%`;
          this.quoteCalc.setMaskCoveragePct(coveragePct);
          this._renderQuoteSummary();
          this._scheduleSave();
        }
      },
      onStatus: (kind, text) => this._setAiStatus(kind, text),
      onProgress: (visible, text, value) => this._setAiOverlay(visible, text, value),
      onDecalPointer: (phase, pt, e, decalMode) => this.decalManager.handlePointer(phase, pt, e, decalMode)
    });

    this.saveTimer = null;
    this.deferredPrompt = null;

    this._initUI();
    this._registerServiceWorker();
    this._restoreSavedSession();
  }

  _initUI() {
    const webglBadge = document.getElementById("webglStatusBadge");
    if (webglBadge) {
      webglBadge.textContent = this.paint.isWebGL2 ? "WebGL2: activo" : "WebGL2: respaldo 2D";
    }

    // Swatches OEM
    const swatchGrid = document.getElementById("swatchGrid");
    for (const sw of OEM_SWATCHES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swatch-btn";
      btn.style.backgroundColor = sw.hex;
      btn.style.color = isLightColor(sw.hex) ? "#0f172a" : "#ffffff";
      btn.dataset.hex = sw.hex;
      btn.dataset.name = sw.name;
      btn.setAttribute("aria-label", sw.name);
      btn.setAttribute("aria-pressed", String(sw.hex === this.state.paintOptions.hex));
      btn.textContent = sw.hex === this.state.paintOptions.hex ? "✓" : "";
      btn.addEventListener("click", () => this._applyColor(sw.hex, sw.name));
      swatchGrid.appendChild(btn);
    }

    // Subida de vehículo
    const fileInput = document.getElementById("fileUploadInput");
    document.getElementById("btnUpload").addEventListener("click", () => fileInput.click());
    document.getElementById("btnEmptyUpload").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) this._loadVehicleFile(file);
      fileInput.value = "";
    });

    // Auto demo local sin red
    document.getElementById("btnLoadSampleCar").addEventListener("click", () => {
      const demoUrl = generateSampleVehicleDataUrl();
      this._loadVehicleFromDataUrl(demoUrl, "Fastback Coupe Demo (Taller)", true);
    });

    // Drag & drop sobre el lienzo
    const dropZone = document.getElementById("canvasDropZone");
    dropZone.addEventListener("dragover", e => e.preventDefault());
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith("image/")) {
        this._loadVehicleFile(file);
      }
    });

    // Barra superior de máscara y PDF
    document.getElementById("btnCommitPart").addEventListener("click", () => {
      this.seg.commitCurrentPart();
      this.showToast("Pieza fijada en la carrocería. Ya puedes seleccionar la siguiente.");
      this._scheduleSave();
    });

    document.getElementById("btnUndo").addEventListener("click", () => {
      if (this.seg.undo()) {
        this.showToast("Última acción deshecha");
      } else {
        this.showToast("No hay más acciones para deshacer");
      }
    });

    document.getElementById("btnResetMask").addEventListener("click", () => {
      this.seg.resetMask(true);
      this.decalManager.render(this.seg.combinedCanvas);
      this.showToast("Máscara limpiada");
    });

    const handlePdfExport = () => this._handleExportPDF();
    document.getElementById("btnExportPDF").addEventListener("click", handlePdfExport);
    document.getElementById("btnExportPDFFooter").addEventListener("click", handlePdfExport);

    // Herramientas izquierda
    document.querySelectorAll(".tool-btn[data-tool]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tool-btn[data-tool]").forEach(b => {
          const active = b === btn;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        this.seg.setTool(btn.dataset.tool);
        if (this.seg.decalMode) {
          this._setDecalMode(false);
        }
      });
    });

    const brushInput = document.getElementById("brushSize");
    const brushVal = document.getElementById("brushSizeValue");
    brushInput.addEventListener("input", () => {
      const val = Number(brushInput.value);
      brushVal.textContent = `${val} px`;
      this.seg.setBrushRadius(val);
    });

    document.getElementById("btnToggleDecalMode").addEventListener("click", () => {
      this._setDecalMode(!this.seg.decalMode);
    });

    document.getElementById("chkShowMaskTint").addEventListener("change", e => {
      this.seg.setShowMaskTint(e.target.checked);
    });

    // Pestañas derecha + teclado WAI-ARIA
    const tabBtns = Array.from(document.querySelectorAll(".tab-btn[role='tab']"));
    const activateTab = btn => {
      tabBtns.forEach(t => {
        const isSel = t === btn;
        t.classList.toggle("active", isSel);
        t.setAttribute("aria-selected", String(isSel));
        const panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) {
          panel.hidden = !isSel;
          panel.classList.toggle("active", isSel);
        }
      });
    };
    tabBtns.forEach((btn, idx) => {
      btn.addEventListener("click", () => activateTab(btn));
      btn.addEventListener("keydown", e => {
        if (e.key === "ArrowRight") {
          const next = tabBtns[(idx + 1) % tabBtns.length];
          next.focus();
          activateTab(next);
        } else if (e.key === "ArrowLeft") {
          const prev = tabBtns[(idx - 1 + tabBtns.length) % tabBtns.length];
          prev.focus();
          activateTab(prev);
        }
      });
    });

    // Pintura: picker, hex, acabados y sliders
    document.getElementById("colorPicker").addEventListener("input", e => {
      this._applyColor(e.target.value.toUpperCase(), "Tono Personalizado");
    });

    document.getElementById("hexInput").addEventListener("change", e => {
      const raw = e.target.value.trim();
      if (/^#?[0-9A-Fa-f]{6}$/.test(raw)) {
        const hex = raw.startsWith("#") ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
        this._applyColor(hex, "Tono Personalizado");
      } else {
        e.target.value = this.state.paintOptions.hex;
      }
    });

    document.querySelectorAll(".finish-btn[data-finish]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".finish-btn[data-finish]").forEach(b => {
          const active = b === btn;
          b.classList.toggle("active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        this.state.paintOptions.finish = btn.dataset.finish;
        this.paint.setOptions({ finish: btn.dataset.finish });
        this.quoteCalc.setFinish(btn.dataset.finish);
        this._renderQuoteSummary();
        this._scheduleSave();
      });
    });

    this._bindRange("paintContrast", "paintContrastVal", v => `${v.toFixed(2)}`, v => {
      this.state.paintOptions.contrast = v;
      this.paint.setOptions({ contrast: v });
    });
    this._bindRange("paintMetallic", "paintMetallicVal", v => `${Math.round(v)}%`, v => {
      this.state.paintOptions.metallic = v / 100;
      this.paint.setOptions({ metallic: v / 100 });
    });
    this._bindRange("paintSpecular", "paintSpecularVal", v => `${Math.round(v)}%`, v => {
      this.state.paintOptions.specular = v / 100;
      this.paint.setOptions({ specular: v / 100 });
    });
    this._bindRange("paintOpacity", "paintOpacityVal", v => `${Math.round(v)}%`, v => {
      this.state.paintOptions.opacity = v / 100;
      this.paint.setOptions({ opacity: v / 100 });
    });

    // Piezas (14 partes)
    this._renderPartsChecklist();
    document.getElementById("repairTierSelect").addEventListener("change", e => {
      this.quoteCalc.setRepairTier(e.target.value);
      this._renderQuoteSummary();
      this._scheduleSave();
    });
    document.getElementById("btnSelectAllParts").addEventListener("click", () => {
      if (this.quoteCalc.selectedIds.size === BODY_PARTS_CATALOG.length) {
        this.quoteCalc.clearParts();
      } else {
        this.quoteCalc.selectAllParts();
      }
      this._syncPartsCheckboxes();
      this._renderQuoteSummary();
      this._scheduleSave();
    });

    // Viniles SVG + PNG upload
    this._renderDecalCatalog();
    const decalUpload = document.getElementById("decalUploadInput");
    document.getElementById("btnUploadDecal").addEventListener("click", () => decalUpload.click());
    decalUpload.addEventListener("change", async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      await this.decalManager.addCustomFile(file);
      this._setDecalMode(true);
      this.showToast(`Vinil "${file.name}" agregado`);
      decalUpload.value = "";
    });

    document.getElementById("decalColorPicker").addEventListener("input", e => {
      this.decalManager.updateSelected({ color: e.target.value });
    });
    document.getElementById("decalScale").addEventListener("input", e => {
      const pct = Number(e.target.value);
      document.getElementById("decalScaleVal").textContent = `${pct}%`;
      this.decalManager.updateSelected({ scale: pct / 100 });
    });
    document.getElementById("decalRotation").addEventListener("input", e => {
      const deg = Number(e.target.value);
      document.getElementById("decalRotationVal").textContent = `${deg}°`;
      this.decalManager.updateSelected({ rotationDeg: deg });
    });
    document.getElementById("decalOpacity").addEventListener("input", e => {
      const op = Number(e.target.value);
      document.getElementById("decalOpacityVal").textContent = `${op}%`;
      this.decalManager.updateSelected({ opacity: op / 100 });
    });
    document.getElementById("chkDecalClip").addEventListener("change", e => {
      this.decalManager.updateSelected({ clipToBody: e.target.checked });
    });

    // Autosave al editar orden de trabajo
    for (const id of ORDER_FIELD_IDS) {
      document.getElementById(id)?.addEventListener("input", () => this._scheduleSave());
    }

    // Atajos de teclado (Ctrl+Z)
    window.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        const tag = (document.activeElement?.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        if (this.seg.undo()) this.showToast("Deshacer (Ctrl+Z)");
      }
    });

    // Conectividad offline/online y PWA Install
    const updateNetBadge = () => {
      const el = document.getElementById("offlineIndicator");
      if (el) el.textContent = navigator.onLine ? "En línea · Caché PWA activa" : "Sin conexión · Modo Offline activo";
    };
    window.addEventListener("online", updateNetBadge);
    window.addEventListener("offline", updateNetBadge);
    updateNetBadge();

    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault();
      this.deferredPrompt = e;
      const installBtn = document.getElementById("btnInstallPWA");
      if (installBtn) installBtn.hidden = false;
    });

    document.getElementById("btnInstallPWA")?.addEventListener("click", async () => {
      if (!this.deferredPrompt) return;
      this.deferredPrompt.prompt();
      await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      document.getElementById("btnInstallPWA").hidden = true;
    });

    this._renderQuoteSummary();
  }

  _bindRange(inputId, outId, formatter, onVal) {
    const inp = document.getElementById(inputId);
    const out = document.getElementById(outId);
    if (!inp) return;
    inp.addEventListener("input", () => {
      const val = Number(inp.value);
      if (out) out.textContent = formatter(val);
      onVal(val);
      this._scheduleSave();
    });
  }

  _applyColor(hex, name) {
    const upper = hex.toUpperCase();
    this.state.paintOptions.hex = upper;
    this.state.selectedColorName = name;
    document.getElementById("selectedColorName").textContent = name;
    document.getElementById("colorPicker").value = upper;
    document.getElementById("hexInput").value = upper;

    document.querySelectorAll(".swatch-btn").forEach(btn => {
      const match = btn.dataset.hex.toUpperCase() === upper;
      btn.setAttribute("aria-pressed", String(match));
      btn.textContent = match ? "✓" : "";
    });

    this.paint.setOptions({ hex: upper });
    if (this.paint.hasImage && this.seg.lastCoveragePct < 0.2) {
      this.seg.triggerAutoSegment();
      this.showToast(
        this.seg.isEncoded
          ? "Detectando carrocería automática para aplicar color…"
          : "Analizando vehículo con IA; en un momento se aplicará el tono."
      );
    }
    this._scheduleSave();
  }

  _setDecalMode(active) {
    this.seg.setDecalMode(active);
    const btn = document.getElementById("btnToggleDecalMode");
    btn.setAttribute("aria-pressed", String(active));
    this.seg.renderOverlay(ctx => this.decalManager.drawHandles(ctx));
  }

  _renderPartsChecklist() {
    const root = document.getElementById("partsChecklist");
    root.innerHTML = "";
    for (const part of BODY_PARTS_CATALOG) {
      const row = document.createElement("div");
      row.className = "part-item";

      const lbl = document.createElement("label");
      lbl.htmlFor = `part_${part.id}`;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = `part_${part.id}`;
      cb.dataset.partId = part.id;
      cb.addEventListener("change", () => {
        this.quoteCalc.setPartSelected(part.id, cb.checked);
        this._updatePartsCounter();
        this._renderQuoteSummary();
        this._scheduleSave();
      });

      const titleSpan = document.createElement("span");
      titleSpan.textContent = part.name;

      const meta = document.createElement("span");
      meta.className = "part-meta";
      meta.textContent = `${part.laborHours}h · ${formatCurrency(part.basePrice)}`;

      lbl.appendChild(cb);
      lbl.appendChild(titleSpan);
      row.appendChild(lbl);
      row.appendChild(meta);
      root.appendChild(row);
    }
    this._updatePartsCounter();
  }

  _syncPartsCheckboxes() {
    document.querySelectorAll("#partsChecklist input[type='checkbox']").forEach(cb => {
      cb.checked = this.quoteCalc.selectedIds.has(cb.dataset.partId);
    });
    this._updatePartsCounter();
  }

  _updatePartsCounter() {
    document.getElementById("partsSelectedCount").textContent = `${this.quoteCalc.selectedIds.size} piezas`;
  }

  _renderDecalCatalog() {
    const grid = document.getElementById("decalCatalogGrid");
    grid.innerHTML = "";
    for (const tpl of DECAL_CATALOG) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "decal-catalog-btn";

      if (tpl.svg) {
        const preview = document.createElement("div");
        preview.style.width = "48px";
        preview.style.height = "26px";
        preview.style.color = tpl.defaultColor;
        preview.innerHTML = tpl.svg;
        preview.querySelector("svg")?.setAttribute("aria-hidden", "true");
        preview.querySelector("svg")?.style.setProperty("width", "100%");
        preview.querySelector("svg")?.style.setProperty("height", "100%");
        btn.appendChild(preview);
      } else {
        const img = document.createElement("img");
        img.src = tpl.imageSrc;
        img.alt = "";
        img.width = 28;
        img.height = 28;
        btn.appendChild(img);
      }

      const name = document.createElement("span");
      name.textContent = tpl.name;
      btn.appendChild(name);

      btn.addEventListener("click", async () => {
        await this.decalManager.addFromCatalog(tpl.id);
        this._setDecalMode(true);
        this.showToast(`Vinil "${tpl.name}" agregado — arrástralo sobre el vehículo`);
      });

      grid.appendChild(btn);
    }
  }

  _handleDecalChanged() {
    this.decalManager.render(this.seg.combinedCanvas);
    this.seg.renderOverlay(ctx => this.decalManager.drawHandles(ctx));
    this._syncDecalInspector();
    this._scheduleSave();
  }

  _syncDecalInspector() {
    const selected = this.decalManager.getSelected();
    const controls = document.getElementById("decalControls");
    const hint = document.getElementById("noDecalHint");

    if (!selected) {
      controls.hidden = true;
      hint.hidden = false;
    } else {
      controls.hidden = false;
      hint.hidden = true;
      document.getElementById("decalColorPicker").value = selected.color || "#ffffff";
      document.getElementById("decalScale").value = Math.round(selected.scale * 100);
      document.getElementById("decalScaleVal").textContent = `${Math.round(selected.scale * 100)}%`;
      document.getElementById("decalRotation").value = Math.round(selected.rotationDeg);
      document.getElementById("decalRotationVal").textContent = `${Math.round(selected.rotationDeg)}°`;
      document.getElementById("decalOpacity").value = Math.round(selected.opacity * 100);
      document.getElementById("decalOpacityVal").textContent = `${Math.round(selected.opacity * 100)}%`;
      document.getElementById("chkDecalClip").checked = Boolean(selected.clipToBody);
    }

    const list = document.getElementById("activeDecalsList");
    list.innerHTML = "";
    for (const d of this.decalManager.decals) {
      const li = document.createElement("li");
      li.className = `decal-layer-item${d.id === this.decalManager.selectedId ? " selected" : ""}`;

      const selBtn = document.createElement("button");
      selBtn.type = "button";
      selBtn.className = "decal-select-btn";
      selBtn.textContent = d.name;
      selBtn.addEventListener("click", () => {
        this.decalManager.select(d.id);
        this._setDecalMode(true);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-inline";
      delBtn.setAttribute("aria-label", `Eliminar vinil ${d.name}`);
      delBtn.textContent = "Quitar";
      delBtn.addEventListener("click", () => this.decalManager.deleteDecal(d.id));

      li.appendChild(selBtn);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
  }

  _renderQuoteSummary() {
    const q = this.quoteCalc.calculate();
    const tbody = document.getElementById("quoteTableBody");
    const tfoot = document.getElementById("quoteTableFoot");

    tbody.innerHTML = `
      <tr>
        <td>${q.isAiEstimate ? "Área estimada por IA MobileSAM" : `Piezas seleccionadas (${q.selectedParts.length})`}</td>
        <td>${q.isAiEstimate ? `${q.maskCoveragePct.toFixed(1)}%` : q.tierLabel}</td>
        <td>—</td>
      </tr>
      <tr>
        <td>Base Color Automotriz</td>
        <td>${q.baseLiters} L</td>
        <td>${formatCurrency(q.baseCost)}</td>
      </tr>
      <tr>
        <td>Transparente + Catalizador (2:1)</td>
        <td>${q.clearLiters} L + ${q.catalystLiters} L</td>
        <td>${formatCurrency(q.clearAndCatCost)}</td>
      </tr>
      <tr>
        <td>Mano de Obra</td>
        <td>${q.laborHours} hrs</td>
        <td>${formatCurrency(q.laborCost)}</td>
      </tr>
    `;

    tfoot.innerHTML = `
      <tr>
        <th scope="row" colspan="2">Subtotal</th>
        <td>${formatCurrency(q.subtotal)}</td>
      </tr>
      <tr>
        <th scope="row" colspan="2">IVA (16%)</th>
        <td>${formatCurrency(q.iva)}</td>
      </tr>
      <tr>
        <th scope="row" colspan="2">Total Estimado MXN</th>
        <td>${formatCurrency(q.total)}</td>
      </tr>
    `;
  }

  _loadVehicleFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      const label = file.name.replace(/\.[^.]+$/, "").slice(0, 32);
      this._loadVehicleFromDataUrl(ev.target.result, label, false);
    };
    reader.readAsDataURL(file);
  }

  _loadVehicleFromDataUrl(dataUrl, label, applyDemoMask = false) {
    const img = new Image();
    img.onload = () => {
      this.state.imageDataUrl = dataUrl;
      this.state.vehicleLabel = label || "Vehículo";
      document.getElementById("emptyDropOverlay").hidden = true;
      document.getElementById("stageVehicleLabel").textContent = this.state.vehicleLabel;

      const imageData = this.paint.setImage(img);
      this.seg.encodeImageData(imageData, { autoSegment: !applyDemoMask });

      if (applyDemoMask) {
        // Permite probar inmediatamente la pintura WebGL2 y recorte de viniles en el demo
        const ctx = this.seg.workingCtx;
        ctx.clearRect(0, 0, 1280, 720);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(205, 455);
        ctx.quadraticCurveTo(212, 372, 305, 345);
        ctx.lineTo(445, 255);
        ctx.quadraticCurveTo(605, 222, 805, 260);
        ctx.lineTo(955, 338);
        ctx.quadraticCurveTo(1065, 355, 1085, 435);
        ctx.lineTo(1075, 495);
        ctx.lineTo(980, 502);
        ctx.arc(890, 498, 86, 0, Math.PI, true);
        ctx.lineTo(475, 502);
        ctx.arc(385, 498, 86, 0, Math.PI, true);
        ctx.lineTo(212, 495);
        ctx.closePath();
        ctx.fill();

        // Excluir cristal del demo
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.moveTo(458, 270);
        ctx.quadraticCurveTo(615, 240, 770, 272);
        ctx.lineTo(885, 340);
        ctx.lineTo(355, 340);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        this.seg._composeCombinedMask(true);
      }

      this._scheduleSave();
    };
    img.src = dataUrl;
  }

  _collectOrderData() {
    const out = {};
    for (const id of ORDER_FIELD_IDS) {
      out[id] = document.getElementById(id)?.value?.trim() || "";
    }
    return out;
  }

  async _handleExportPDF() {
    try {
      this.showToast("Generando orden de trabajo en PDF…");
      this.decalManager.render(this.seg.combinedCanvas);
      const quoteSummary = this.quoteCalc.calculate();
      const filename = await exportOrderQuotePDF({
        glCanvas: this.paint.canvas,
        decalCanvas: this.decalManager.canvas,
        quoteSummary,
        paintOptions: {
          ...this.state.paintOptions,
          colorName: this.state.selectedColorName
        },
        orderData: this._collectOrderData()
      });
      this.showToast(`PDF guardado: ${filename}`);
    } catch (err) {
      console.error("Error exportando PDF:", err);
      this.showToast(`Error al exportar PDF: ${err.message || err}`);
    }
  }

  _scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      try {
        const masks = this.seg.exportMaskUrls();
        await saveSessionToIndexedDB({
          imageDataUrl: this.state.imageDataUrl,
          vehicleLabel: this.state.vehicleLabel,
          selectedColorName: this.state.selectedColorName,
          paintOptions: this.state.paintOptions,
          committedMaskUrl: masks.committedUrl,
          workingMaskUrl: masks.workingUrl,
          selectedParts: Array.from(this.quoteCalc.selectedIds),
          repairTier: this.quoteCalc.repairTier,
          decals: this.decalManager.serialize(),
          orderData: this._collectOrderData()
        });
      } catch (err) {
        console.warn("Autoguardado IndexedDB omitido:", err);
      }
    }, 700);
  }

  async _restoreSavedSession() {
    try {
      const saved = await loadSessionFromIndexedDB();
      if (!saved) return;

      if (saved.orderData) {
        for (const id of ORDER_FIELD_IDS) {
          const el = document.getElementById(id);
          if (el && saved.orderData[id]) el.value = saved.orderData[id];
        }
      }

      if (Array.isArray(saved.selectedParts)) {
        saved.selectedParts.forEach(pid => this.quoteCalc.setPartSelected(pid, true));
        this._syncPartsCheckboxes();
      }
      if (saved.repairTier) {
        this.quoteCalc.setRepairTier(saved.repairTier);
        document.getElementById("repairTierSelect").value = saved.repairTier;
      }

      if (saved.paintOptions?.hex) {
        this._applyColor(saved.paintOptions.hex, saved.selectedColorName || "Recuperado");
        this.state.paintOptions = { ...this.state.paintOptions, ...saved.paintOptions };
        this.paint.setOptions(this.state.paintOptions);
      }

      if (Array.isArray(saved.decals) && saved.decals.length) {
        await this.decalManager.restore(saved.decals);
      }

      if (saved.imageDataUrl) {
        await new Promise(resolve => {
          const img = new Image();
          img.onload = async () => {
            this.state.imageDataUrl = saved.imageDataUrl;
            this.state.vehicleLabel = saved.vehicleLabel || "Sesión recuperada";
            document.getElementById("emptyDropOverlay").hidden = true;
            document.getElementById("stageVehicleLabel").textContent = this.state.vehicleLabel;
            const imageData = this.paint.setImage(img);
            this.seg.encodeImageData(imageData, { autoSegment: false });
            await this.seg.restoreFromDataUrls({
              committedUrl: saved.committedMaskUrl,
              workingUrl: saved.workingMaskUrl
            });
            resolve();
          };
          img.onerror = resolve;
          img.src = saved.imageDataUrl;
        });
        this.showToast("Trabajo anterior recuperado desde almacenamiento offline.");
      }

      this._renderQuoteSummary();
    } catch (err) {
      console.warn("No se pudo restaurar sesión IndexedDB:", err);
    }
  }

  _setAiStatus(kind, text) {
    const badge = document.getElementById("aiStatusBadge");
    if (!badge) return;
    badge.className = `status-pill status-${kind}`;
    badge.textContent = text;
  }

  _setAiOverlay(visible, text, value) {
    const overlay = document.getElementById("aiProgressOverlay");
    const txt = document.getElementById("aiProgressText");
    const bar = document.getElementById("aiProgressBar");
    if (!overlay) return;
    overlay.hidden = !visible;
    if (txt && text) txt.textContent = text;
    if (bar && typeof value === "number") {
      bar.value = value;
      bar.textContent = `${value}%`;
    }
  }

  _registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js?v=4").then(reg => {
        reg.update?.().catch(() => {});
      }).catch(err => {
        console.warn("Registro de Service Worker omitido:", err);
      });
    });
  }

  showToast(message) {
    const region = document.getElementById("toastRegion");
    if (!region) return;
    region.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "toast-msg";
    msg.textContent = message;
    region.appendChild(msg);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      msg.remove();
    }, 3200);
  }
}

window.elRayoApp = new ElRayoStudioApp();
