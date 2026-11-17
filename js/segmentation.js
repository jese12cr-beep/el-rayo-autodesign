/* El Rayo — Controlador de Segmentación IA (MobileSAM) + Pincel Manual + Fijar Pieza */

export class SegmentationController {
  constructor(overlayCanvas, { width = 1280, height = 720, onMaskUpdated, onStatus, onProgress, onDecalPointer } = {}) {
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext("2d");
    this.width = width;
    this.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;

    this.onMaskUpdated = onMaskUpdated || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onDecalPointer = onDecalPointer || (() => false);

    // Máscara de piezas ya fijadas ("Fijar Pieza")
    this.committedCanvas = document.createElement("canvas");
    this.committedCanvas.width = width;
    this.committedCanvas.height = height;
    this.committedCtx = this.committedCanvas.getContext("2d", { willReadFrequently: true });

    // Máscara activa actual (IA actual + pincel)
    this.workingCanvas = document.createElement("canvas");
    this.workingCanvas.width = width;
    this.workingCanvas.height = height;
    this.workingCtx = this.workingCanvas.getContext("2d", { willReadFrequently: true });

    // Máscara combinada que alimenta al shader WebGL2 y recorte destination-in
    this.combinedCanvas = document.createElement("canvas");
    this.combinedCanvas.width = width;
    this.combinedCanvas.height = height;
    this.combinedCtx = this.combinedCanvas.getContext("2d", { willReadFrequently: true });

    this.scratchCanvas = document.createElement("canvas");
    this.scratchCanvas.width = width;
    this.scratchCanvas.height = height;
    this.scratchCtx = this.scratchCanvas.getContext("2d");

    this.tool = "ai-add"; // ai-add | ai-sub | brush-add | brush-sub
    this.brushRadius = 24;
    this.featherRadius = 1.6;
    this.decalMode = false;
    this.showMaskTint = true;
    this.hasImage = false;
    this.isEncoded = false;
    this.modelReady = false;
    this.lastCoveragePct = 0;

    this.points = [];
    this.labels = [];
    this.undoStack = [];
    this.isBrushing = false;
    this.lastBrushPt = null;
    this.requestSeq = 0;

    this._initWorker();
    this._bindEvents();
  }

  _initWorker() {
    this.worker = new Worker("./js/samWorker.js", { type: "module" });
    this.worker.onmessage = event => {
      const msg = event.data || {};
      if (msg.type === "status") {
        this.onProgress(true, msg.message, msg.progress);
        this.onStatus("loading", `IA: ${msg.device?.toUpperCase() || "WASM"} (${msg.progress || 0}%)`);
      } else if (msg.type === "ready") {
        this.modelReady = true;
        this.onProgress(false, "MobileSAM listo", 100);
        this.onStatus("ready", `IA Lista (${(msg.device || "wasm").toUpperCase()})`);
      } else if (msg.type === "encoded") {
        this.isEncoded = true;
        this.onProgress(false, "Vehículo analizado por IA", 100);
      } else if (msg.type === "mask") {
        this._applyWorkerMask(msg.maskBuffer, msg.width, msg.height);
        this.onProgress(false, "Segmentación lista", 100);
      } else if (msg.type === "error") {
        this.onProgress(false, msg.message, 0);
        this.onStatus("error", `Error IA: ${msg.message}`);
      }
    };
    this.worker.onerror = err => {
      this.onProgress(false, "No se pudo inicializar el Worker MobileSAM.", 0);
      this.onStatus("error", `Worker IA: ${err.message || "error"}`);
    };
    this.worker.postMessage({ type: "init" });
  }

  _bindEvents() {
    this.overlayCanvas.addEventListener("contextmenu", e => e.preventDefault());

    this.overlayCanvas.addEventListener("pointerdown", e => {
      if (!this.hasImage) return;
      const pt = this._toCanvasPoint(e);

      // Si estamos en modo Mover Viniles o tocando un manipulador de vinil
      if (this.onDecalPointer("down", pt, e, this.decalMode)) {
        try { this.overlayCanvas.setPointerCapture(e.pointerId); } catch {}
        return;
      }

      if (this.decalMode) return;

      const isRightClick = e.button === 2;
      if (isRightClick || this.tool === "ai-sub") {
        this._addAiPoint(pt.x, pt.y, 0);
        return;
      }

      if (this.tool === "ai-add") {
        this._addAiPoint(pt.x, pt.y, 1);
        return;
      }

      if (this.tool === "brush-add" || this.tool === "brush-sub") {
        this._pushUndo();
        this.isBrushing = true;
        this.lastBrushPt = pt;
        try { this.overlayCanvas.setPointerCapture(e.pointerId); } catch {}
        this._paintBrushSegment(pt, pt, this.tool === "brush-add");
        this._composeCombinedMask(true);
      }
    });

    this.overlayCanvas.addEventListener("pointermove", e => {
      if (!this.hasImage) return;
      const pt = this._toCanvasPoint(e);
      if (this.onDecalPointer("move", pt, e, this.decalMode)) return;

      if (!this.isBrushing || !this.lastBrushPt) return;
      this._paintBrushSegment(this.lastBrushPt, pt, this.tool === "brush-add");
      this.lastBrushPt = pt;
      this._composeCombinedMask(false);
    });

    const endStroke = e => {
      const pt = this._toCanvasPoint(e);
      this.onDecalPointer("up", pt, e, this.decalMode);
      if (this.isBrushing) {
        this.isBrushing = false;
        this.lastBrushPt = null;
        this._composeCombinedMask(true);
      }
    };

    this.overlayCanvas.addEventListener("pointerup", endStroke);
    this.overlayCanvas.addEventListener("pointercancel", endStroke);
  }

  _toCanvasPoint(e) {
    const rect = this.overlayCanvas.getBoundingClientRect();
    const sx = this.width / Math.max(1, rect.width);
    const sy = this.height / Math.max(1, rect.height);
    return {
      x: Math.max(0, Math.min(this.width, (e.clientX - rect.left) * sx)),
      y: Math.max(0, Math.min(this.height, (e.clientY - rect.top) * sy))
    };
  }

  setTool(toolName) {
    this.tool = toolName;
    this.renderOverlay();
  }

  setBrushRadius(radius) {
    this.brushRadius = Math.max(4, Math.min(90, Number(radius) || 24));
  }

  setDecalMode(active) {
    this.decalMode = Boolean(active);
    this.overlayCanvas.style.cursor = this.decalMode ? "move" : "crosshair";
  }

  setShowMaskTint(show) {
    this.showMaskTint = Boolean(show);
    this.renderOverlay();
  }

  async encodeImageData(imageData) {
    this.hasImage = true;
    this.isEncoded = false;
    this.resetMask(false);
    this.undoStack = [];
    this.onProgress(true, "Preparando embeddings de imagen para MobileSAM…", 35);
    const bufferCopy = imageData.data.buffer.slice(0);
    this.worker.postMessage(
      {
        type: "encode",
        payload: {
          rgbaBuffer: bufferCopy,
          width: imageData.width,
          height: imageData.height
        }
      },
      [bufferCopy]
    );
  }

  _addAiPoint(x, y, label) {
    if (!this.isEncoded) {
      this.onStatus("loading", "Esperando codificación MobileSAM…");
      return;
    }
    this._pushUndo();
    this.points.push([Math.round(x), Math.round(y)]);
    this.labels.push(label);
    this.renderOverlay();

    const requestId = ++this.requestSeq;
    this.onProgress(true, label === 1 ? "Segmentando pieza con IA…" : "Excluyendo zona con IA…", 70);
    this.worker.postMessage({
      type: "segment",
      payload: {
        requestId,
        points: this.points,
        labels: this.labels
      }
    });
  }

  _applyWorkerMask(maskBuffer, w, h) {
    const bin = new Uint8Array(maskBuffer);
    const img = this.scratchCtx.createImageData(w, h);
    for (let i = 0; i < bin.length; i++) {
      const a = bin[i];
      const j = i << 2;
      img.data[j] = 255;
      img.data[j + 1] = 255;
      img.data[j + 2] = 255;
      img.data[j + 3] = a;
    }
    this.scratchCtx.putImageData(img, 0, 0);

    this.workingCtx.clearRect(0, 0, this.width, this.height);
    this.workingCtx.save();
    this.workingCtx.filter = `blur(${this.featherRadius}px)`;
    this.workingCtx.drawImage(this.scratchCanvas, 0, 0);
    this.workingCtx.restore();

    this._composeCombinedMask(true);
  }

  _paintBrushSegment(fromPt, toPt, addMode) {
    const ctx = this.workingCtx;
    const dist = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y);
    const step = Math.max(2, this.brushRadius * 0.28);
    const count = Math.max(1, Math.ceil(dist / step));

    ctx.save();
    ctx.globalCompositeOperation = addMode ? "source-over" : "destination-out";

    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = fromPt.x + (toPt.x - fromPt.x) * t;
      const y = fromPt.y + (toPt.y - fromPt.y) * t;
      const rOuter = this.brushRadius + this.featherRadius;
      const innerStop = Math.max(0.05, Math.min(0.92, (this.brushRadius - this.featherRadius) / rOuter));

      const grad = ctx.createRadialGradient(x, y, 0, x, y, rOuter);
      grad.addColorStop(0, "rgba(255, 255, 255, 1)");
      grad.addColorStop(innerStop, "rgba(255, 255, 255, 1)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rOuter, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  commitCurrentPart() {
    this._pushUndo();
    this.committedCtx.drawImage(this.workingCanvas, 0, 0);
    this.workingCtx.clearRect(0, 0, this.width, this.height);
    this.points = [];
    this.labels = [];
    this._composeCombinedMask(true);
    return true;
  }

  resetMask(saveUndo = true) {
    if (saveUndo) this._pushUndo();
    this.committedCtx.clearRect(0, 0, this.width, this.height);
    this.workingCtx.clearRect(0, 0, this.width, this.height);
    this.combinedCtx.clearRect(0, 0, this.width, this.height);
    this.points = [];
    this.labels = [];
    this.lastCoveragePct = 0;
    this.renderOverlay();
    this.onMaskUpdated(this.combinedCanvas, 0, true);
  }

  _pushUndo() {
    const snap = {
      committed: this.committedCtx.getImageData(0, 0, this.width, this.height),
      working: this.workingCtx.getImageData(0, 0, this.width, this.height),
      points: this.points.map(p => [...p]),
      labels: [...this.labels]
    };
    this.undoStack.push(snap);
    if (this.undoStack.length > 20) this.undoStack.shift();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.committedCtx.putImageData(snap.committed, 0, 0);
    this.workingCtx.putImageData(snap.working, 0, 0);
    this.points = snap.points;
    this.labels = snap.labels;
    this._composeCombinedMask(true);
    return true;
  }

  _composeCombinedMask(computeStats = true) {
    const ctx = this.combinedCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.committedCanvas, 0, 0);
    ctx.drawImage(this.workingCanvas, 0, 0);

    if (computeStats) {
      const px = ctx.getImageData(0, 0, this.width, this.height).data;
      let active = 0;
      const step = 4; // muestreo uniforme 4x para velocidad en tiempo real
      for (let i = 3; i < px.length; i += 4 * step) {
        if (px[i] > 90) active++;
      }
      const sampledTotal = (this.width * this.height) / step;
      this.lastCoveragePct = Number(((active / sampledTotal) * 100).toFixed(2));
    }

    this.renderOverlay();
    this.onMaskUpdated(this.combinedCanvas, this.lastCoveragePct, computeStats);
  }

  renderOverlay(decalDrawFn = null) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.showMaskTint && !this.decalMode && this.lastCoveragePct > 0.05) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(this.combinedCanvas, 0, 0);
      ctx.restore();
    }

    // Puntos guía MobileSAM
    if (!this.decalMode) {
      for (let i = 0; i < this.points.length; i++) {
        const [x, y] = this.points[i];
        const isPos = this.labels[i] === 1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = isPos ? "#2563eb" : "#dc2626";
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isPos ? "+" : "−", x, y + 0.5);
        ctx.restore();
      }
    }

    if (typeof decalDrawFn === "function") {
      decalDrawFn(ctx);
    }
  }

  async restoreFromDataUrls({ committedUrl, workingUrl } = {}) {
    const loadTo = (url, ctx) =>
      new Promise(resolve => {
        if (!url) {
          ctx.clearRect(0, 0, this.width, this.height);
          resolve();
          return;
        }
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, this.width, this.height);
          ctx.drawImage(img, 0, 0, this.width, this.height);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = url;
      });

    await Promise.all([
      loadTo(committedUrl, this.committedCtx),
      loadTo(workingUrl, this.workingCtx)
    ]);
    this.points = [];
    this.labels = [];
    this._composeCombinedMask(true);
  }

  exportMaskUrls() {
    return {
      committedUrl: this.committedCanvas.toDataURL("image/png"),
      workingUrl: this.workingCanvas.toDataURL("image/png")
    };
  }
}
