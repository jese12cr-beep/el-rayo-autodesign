/* El Rayo — Motor Dual IA Automotriz (YOLO 33-Clases Car-Parts + SegFormer + SlimSAM) */

export const CARPART_NAMES = {
  0: "back-bumper", 1: "back-windshield", 2: "front-bumper", 3: "grille", 4: "hood",
  5: "left_back-door", 6: "left_back-wheel", 7: "left_back-window", 8: "left_fender",
  9: "left_front-door", 10: "left_front-wheel", 11: "left_front-window",
  12: "left_headlight", 13: "left_mirror", 14: "left_quarter-panel",
  15: "left_rocker-panel", 16: "left_tail-light", 17: "license-plate",
  18: "right_back-door", 19: "right_back-wheel", 20: "right_back-window",
  21: "right_fender", 22: "right_front-door", 23: "right_front-wheel",
  24: "right_front-window", 25: "right_headlight", 26: "right_mirror",
  27: "right_quarter-panel", 28: "right_rocker-panel", 29: "right_tail-light",
  30: "roof", 31: "trunk", 32: "windshield"
};

export const EXCLUDE_PART_CLASSES = new Set([
  "windshield", "back-windshield",
  "left_front-window", "left_back-window", "right_front-window", "right_back-window",
  "left_front-wheel", "left_back-wheel", "right_front-wheel", "right_back-wheel",
  "left_headlight", "right_headlight", "left_tail-light", "right_tail-light",
  "grille", "license-plate"
]);

export const PART_LABELS_ES = {
  "hood": ["Cofre / Capó", 1, "cofre"],
  "front-bumper": ["Defensa Delantera", 2, "defensa-del"],
  "left_fender": ["Salpicadera Del. Izq.", 3, "salpicadera-izq"],
  "right_fender": ["Salpicadera Del. Der.", 4, "salpicadera-der"],
  "left_front-door": ["Puerta Delantera Izq.", 5, "puerta-del-izq"],
  "right_front-door": ["Puerta Delantera Der.", 6, "puerta-del-der"],
  "left_back-door": ["Puerta Trasera Izq.", 7, "puerta-tras-izq"],
  "right_back-door": ["Puerta Trasera Der.", 8, "puerta-tras-der"],
  "left_quarter-panel": ["Costado Trasero Izq.", 9, "costado-izq"],
  "right_quarter-panel": ["Costado Trasero Der.", 10, "costado-der"],
  "left_rocker-panel": ["Estribo / Faldón Izq.", 11, null],
  "right_rocker-panel": ["Estribo / Faldón Der.", 12, null],
  "trunk": ["Cajuela / Portón", 13, "cajuela"],
  "back-bumper": ["Defensa Trasera", 14, "defensa-tras"],
  "roof": ["Toldo / Techo", 15, "toldo"],
  "left_mirror": ["Espejo Retrovisor Izq.", 16, "espejos"],
  "right_mirror": ["Espejo Retrovisor Der.", 17, "espejos"],
  "pillars": ["Postes y Marcos (A/C)", 18, null]
};

class CarPartsDetector {
  constructor() {
    this.yoloSess = null;
    this.segSess = null;
    this.loadingPromise = null;
  }

  _modelsBaseUrl() {
    return new URL("./assets/models/", window.location.href).href;
  }

  async ensureLoaded(onProgress) {
    if (this.yoloSess && this.segSess) return true;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const ort = window.ort;
      if (!ort) throw new Error("onnxruntime-web local no está disponible.");

      ort.env.wasm.wasmPaths = new URL("./assets/ort/", window.location.href).href;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;

      const base = this._modelsBaseUrl();
      if (!this.yoloSess) {
        onProgress?.("Cargando IA Automotriz (33 clases de autopartes)…", 28);
        this.yoloSess = await ort.InferenceSession.create(
          base + "carparts/parts_segmentation.onnx",
          { executionProviders: ["wasm"] }
        );
      }

      if (!this.segSess) {
        onProgress?.("Cargando detector de silueta vehicular (SegFormer)…", 52);
        this.segSess = await ort.InferenceSession.create(
          base + "segformer_b0_cityscapes_quant.onnx",
          { executionProviders: ["wasm"] }
        );
      }
      return true;
    })().catch(err => {
      this.loadingPromise = null;
      throw err;
    });

    return this.loadingPromise;
  }

  _nmsBoxes(boxes, scores, iouThresh = 0.50) {
    const order = scores.map((_, idx) => idx).sort((a, b) => scores[b] - scores[a]);
    const keep = [];
    for (const i of order) {
      const [ax1, ay1, ax2, ay2] = boxes[i];
      const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
      let suppressed = false;
      for (const k of keep) {
        const [bx1, by1, bx2, by2] = boxes[k];
        const xx1 = Math.max(ax1, bx1), yy1 = Math.max(ay1, by1);
        const xx2 = Math.min(ax2, bx2), yy2 = Math.min(ay2, by2);
        const inter = Math.max(0, xx2 - xx1) * Math.max(0, yy2 - yy1);
        const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
        if (inter / (areaA + areaB - inter + 1e-6) > iouThresh) {
          suppressed = true;
          break;
        }
      }
      if (!suppressed) keep.push(i);
    }
    return keep;
  }

  _dilateBool(src, w, h, radius) {
    const tmp = new Uint8Array(w * h);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let run = 0;
      for (let x = 0; x < w; x++) {
        if (src[row + x]) run = radius + 1;
        else if (run > 0) run--;
        if (run > 0) tmp[row + x] = 1;
      }
      run = 0;
      for (let x = w - 1; x >= 0; x--) {
        if (src[row + x]) run = radius + 1;
        else if (run > 0) run--;
        if (run > 0) tmp[row + x] = 1;
      }
    }
    for (let x = 0; x < w; x++) {
      let run = 0;
      for (let y = 0; y < h; y++) {
        const idx = y * w + x;
        if (tmp[idx]) run = radius + 1;
        else if (run > 0) run--;
        if (run > 0) out[idx] = 1;
      }
      run = 0;
      for (let y = h - 1; y >= 0; y--) {
        const idx = y * w + x;
        if (tmp[idx]) run = radius + 1;
        else if (run > 0) run--;
        if (run > 0) out[idx] = 1;
      }
    }
    return out;
  }

  _erodeBool(src, w, h, radius) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inv[i] = src[i] ? 0 : 1;
    const dil = this._dilateBool(inv, w, h, radius);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = dil[i] ? 0 : 1;
    return out;
  }

  _boxFilterMean(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const pref = new Float32Array(Math.max(w, h) + 1);

    // Horizontal pass (O(N) via 1D prefix sums)
    for (let y = 0; y < h; y++) {
      const row = y * w;
      pref[0] = 0;
      for (let x = 0; x < w; x++) pref[x + 1] = pref[x] + src[row + x];
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(w - 1, x + r);
        tmp[row + x] = (pref[x1 + 1] - pref[x0]) / (x1 - x0 + 1);
      }
    }

    // Vertical pass
    for (let x = 0; x < w; x++) {
      pref[0] = 0;
      for (let y = 0; y < h; y++) pref[y + 1] = pref[y] + tmp[y * w + x];
      for (let y = 0; y < h; y++) {
        const y0 = Math.max(0, y - r);
        const y1 = Math.min(h - 1, y + r);
        out[y * w + x] = (pref[y1 + 1] - pref[y0]) / (y1 - y0 + 1);
      }
    }
    return out;
  }

  _guidedFilterAlpha(boolOrProbArr, lumaArr, w, h, radius = 5, eps = 0.004) {
    const n = w * h;
    const I = new Float32Array(n);
    const P = new Float32Array(n);
    const II = new Float32Array(n);
    const IP = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const iv = lumaArr[i] / 255.0;
      const pv = boolOrProbArr[i] > 0 ? 1.0 : 0.0;
      I[i] = iv;
      P[i] = pv;
      II[i] = iv * iv;
      IP[i] = iv * pv;
    }

    const meanI = this._boxFilterMean(I, w, h, radius);
    const meanP = this._boxFilterMean(P, w, h, radius);
    const corrII = this._boxFilterMean(II, w, h, radius);
    const corrIP = this._boxFilterMean(IP, w, h, radius);

    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const varI = Math.max(0, corrII[i] - meanI[i] * meanI[i]);
      const covIP = corrIP[i] - meanI[i] * meanP[i];
      const ak = covIP / (varI + eps);
      a[i] = ak;
      b[i] = meanP[i] - ak * meanI[i];
    }

    const meanA = this._boxFilterMean(a, w, h, radius);
    const meanB = this._boxFilterMean(b, w, h, radius);
    const q = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // S-curve contrast around edges so interior stays ~1.0 solid and borders follow shutlines cleanly
      const raw = Math.max(0, Math.min(1, meanA[i] * I[i] + meanB[i]));
      const crisp = (raw - 0.5) * 1.45 + 0.5;
      q[i] = Math.max(0, Math.min(1, crisp));
    }
    return q;
  }

  _guidedToMaskCanvas(boolArr, lumaArr, hardZeroArr, w, h, targetW, targetH) {
    const q = this._guidedFilterAlpha(boolArr, lumaArr, w, h, 5, 0.0038);
    const sc = document.createElement("canvas");
    sc.width = w;
    sc.height = h;
    const sctx = sc.getContext("2d");
    const img = sctx.createImageData(w, h);
    for (let i = 0; i < boolArr.length; i++) {
      let a = boolArr[i] ? Math.max(0.55, q[i]) : Math.min(0.45, q[i]);
      if (hardZeroArr && hardZeroArr[i]) a = 0;
      const v = a > 0.08 ? Math.round(a * 255) : 0;
      const j = i << 2;
      img.data[j] = 255;
      img.data[j + 1] = 255;
      img.data[j + 2] = 255;
      img.data[j + 3] = v;
    }
    sctx.putImageData(img, 0, 0);

    const out = document.createElement("canvas");
    out.width = targetW;
    out.height = targetH;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.drawImage(sc, 0, 0, targetW, targetH);
    return out;
  }

  _buildPartOutlineCanvas(boolArr, w, h, targetW, targetH) {
    const sc = document.createElement("canvas");
    sc.width = w;
    sc.height = h;
    const sctx = sc.getContext("2d");
    const img = sctx.createImageData(w, h);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = row + x;
        if (!boolArr[idx]) continue;
        // 2px interior boundary ring para resaltar limpiamente la pieza
        const isEdge =
          !boolArr[idx - 1] || !boolArr[idx + 1] || !boolArr[idx - w] || !boolArr[idx + w] ||
          (x > 1 && !boolArr[idx - 2]) || (x < w - 2 && !boolArr[idx + 2]) ||
          (y > 1 && !boolArr[idx - 2 * w]) || (y < h - 2 && !boolArr[idx + 2 * w]);
        if (isEdge) {
          const j = idx << 2;
          img.data[j] = 56;
          img.data[j + 1] = 189;
          img.data[j + 2] = 248;
          img.data[j + 3] = 255;
        }
      }
    }
    sctx.putImageData(img, 0, 0);
    const out = document.createElement("canvas");
    out.width = targetW;
    out.height = targetH;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.drawImage(sc, 0, 0, targetW, targetH);
    return out;
  }

  _boolToMaskCanvas(boolArr, srcW, srcH, targetW, targetH, featherPx = 1.4) {
    const sc = document.createElement("canvas");
    sc.width = srcW;
    sc.height = srcH;
    const sctx = sc.getContext("2d");
    const img = sctx.createImageData(srcW, srcH);
    for (let i = 0; i < boolArr.length; i++) {
      const v = boolArr[i] ? 255 : 0;
      const j = i << 2;
      img.data[j] = 255;
      img.data[j + 1] = 255;
      img.data[j + 2] = 255;
      img.data[j + 3] = v;
    }
    sctx.putImageData(img, 0, 0);

    const out = document.createElement("canvas");
    out.width = targetW;
    out.height = targetH;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true;
    if (featherPx > 0) octx.filter = `blur(${featherPx}px)`;
    octx.drawImage(sc, 0, 0, targetW, targetH);
    octx.filter = "none";
    return out;
  }

  async _runSegformerMask(sourceCanvas, ow, oh) {
    const ort = window.ort;
    const isConstrained = /Android|iPhone|iPad|iPod|Mobile|; wv\)/i.test(navigator.userAgent || "");
    const sw = isConstrained ? 512 : 768;
    const sh = isConstrained ? 256 : 384;

    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0, sw, sh);
    const px = ctx.getImageData(0, 0, sw, sh).data;

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];
    const plane = sw * sh;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      const j = i << 2;
      input[i] = (px[j] / 255.0 - mean[0]) / std[0];
      input[plane + i] = (px[j + 1] / 255.0 - mean[1]) / std[1];
      input[2 * plane + i] = (px[j + 2] / 255.0 - mean[2]) / std[2];
    }

    const tensor = new ort.Tensor("float32", input, [1, 3, sh, sw]);
    let out = null;
    try {
      out = await this.segSess.run({ [this.segSess.inputNames[0]]: tensor });
      const outTensor = out[this.segSess.outputNames[0]];
      const logits = outTensor.data;
      const dims = outTensor.dims;
      const nCls = dims[1], lh = dims[2], lw = dims[3];
      const lPlane = lh * lw;

      const lowMask = new Uint8Array(lPlane);
      let hitCount = 0;
      for (let i = 0; i < lPlane; i++) {
        let bestC = 0, bestV = -1e9;
        for (let cls = 0; cls < nCls; cls++) {
          const val = logits[cls * lPlane + i];
          if (val > bestV) { bestV = val; bestC = cls; }
        }
        if (bestC === 13 || bestC === 14 || bestC === 15) {
          lowMask[i] = 1;
          hitCount++;
        }
      }
      if (hitCount < 40) {
        for (let i = 0; i < lPlane; i++) {
          const p13 = 1 / (1 + Math.exp(-logits[13 * lPlane + i]));
          if (p13 > 0.35) lowMask[i] = 1;
        }
      }

      const lc = document.createElement("canvas");
      lc.width = lw;
      lc.height = lh;
      const lctx = lc.getContext("2d");
      const limg = lctx.createImageData(lw, lh);
      for (let i = 0; i < lPlane; i++) {
        const j = i << 2;
        const v = lowMask[i] ? 255 : 0;
        limg.data[j] = v; limg.data[j + 1] = v; limg.data[j + 2] = v; limg.data[j + 3] = 255;
      }
      lctx.putImageData(limg, 0, 0);

      const fc = document.createElement("canvas");
      fc.width = ow;
      fc.height = oh;
      const fctx = fc.getContext("2d");
      fctx.imageSmoothingEnabled = true;
      fctx.drawImage(lc, 0, 0, ow, oh);
      const fpx = fctx.getImageData(0, 0, ow, oh).data;
      const fullMask = new Uint8Array(ow * oh);
      for (let i = 0; i < ow * oh; i++) {
        if (fpx[i << 2] > 120) fullMask[i] = 1;
      }
      return fullMask;
    } finally {
      tensor.dispose?.();
      if (out) Object.values(out).forEach(t => t?.dispose?.());
    }
  }

  _filterHeroVehicle(candBoxes, candCls, candConfs, finalItems, sz = 768) {
    const majors = finalItems.filter(i => !EXCLUDE_PART_CLASSES.has(CARPART_NAMES[candCls[i]]) && candConfs[i] >= 0.30);
    if (majors.length === 0) return finalItems;

    let bestI = majors[0], bestScore = -1;
    for (const i of majors) {
      const b = candBoxes[i];
      const area = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
      const cxN = 0.5 * (b[0] + b[2]) / sz, cyN = 0.5 * (b[1] + b[3]) / sz;
      const sc = area * Math.max(0.30, 1.0 - 0.60 * (Math.abs(cxN - 0.5) + Math.abs(cyN - 0.55)));
      if (sc > bestScore) { bestScore = sc; bestI = i; }
    }

    const bestB = candBoxes[bestI];
    const bestCx = 0.5 * (bestB[0] + bestB[2]), bestCy = 0.5 * (bestB[1] + bestB[3]);
    const uniqueSingle = new Set([
      "hood", "roof", "trunk", "front-bumper", "back-bumper", "windshield", "back-windshield",
      "left_quarter-panel", "right_quarter-panel", "left_fender", "right_fender",
      "left_back-door", "right_back-door", "left_front-door", "right_front-door"
    ]);
    const byCls = {};
    for (const i of finalItems) {
      const cname = CARPART_NAMES[candCls[i]];
      if (uniqueSingle.has(cname)) {
        if (!byCls[cname]) byCls[cname] = [];
        byCls[cname].push(i);
      }
    }
    const rejected = new Set();
    for (const idxs of Object.values(byCls)) {
      if (idxs.length <= 1) continue;
      let prim = idxs[0], pBest = -1;
      for (const i of idxs) {
        const b = candBoxes[i];
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        const dist = Math.hypot(0.5 * (b[0] + b[2]) - bestCx, 0.5 * (b[1] + b[3]) - bestCy);
        const sc = (area * candConfs[i]) / (1.0 + dist / (sz * 0.4));
        if (sc > pBest) { pBest = sc; prim = i; }
      }
      const [px0, py0, px1, py1] = candBoxes[prim];
      for (const i of idxs) {
        if (i === prim) continue;
        const [bx0, by0, bx1, by1] = candBoxes[i];
        if (Math.max(bx0, px0) > Math.min(bx1, px1) + 20 || Math.max(by0, py0) > Math.min(py1, py1) + 20) {
          rejected.add(i);
        }
      }
    }

    const pool = finalItems.filter(i => !rejected.has(i));
    const cluster = new Set([bestI]);
    const q = [bestI];
    const gap = 28;
    while (q.length > 0) {
      const cur = q.pop();
      const [cx0, cy0, cx1, cy1] = candBoxes[cur];
      for (const j of pool) {
        if (cluster.has(j)) continue;
        const [jx0, jy0, jx1, jy1] = candBoxes[j];
        if (Math.min(cx1, jx1) + gap >= Math.max(cx0, jx0) && Math.min(cy1, jy1) + gap >= Math.max(cy0, jy0)) {
          cluster.add(j);
          q.push(j);
        }
      }
    }

    let vx0 = 1e9, vy0 = 1e9, vx1 = -1e9, vy1 = -1e9;
    for (const k of cluster) {
      const b = candBoxes[k];
      if (b[0] < vx0) vx0 = b[0]; if (b[1] < vy0) vy0 = b[1];
      if (b[2] > vx1) vx1 = b[2]; if (b[3] > vy1) vy1 = b[3];
    }
    const vw = Math.max(40, vx1 - vx0), vh = Math.max(40, vy1 - vy0);
    const mx = Math.max(24, vw * 0.08), my = Math.max(24, vh * 0.08);

    const kept = [];
    for (const i of pool) {
      if (cluster.has(i)) { kept.push(i); continue; }
      const [bx1, by1, bx2, by2] = candBoxes[i];
      const cx = 0.5 * (bx1 + bx2), cy = 0.5 * (by1 + by2), bhI = by2 - by1;
      if (cx >= vx0 - mx && cx <= vx1 + mx && cy >= vy0 - my && cy <= vy1 + my) {
        const cn = CARPART_NAMES[candCls[i]];
        if (cy < vy0 + 0.22 * vh && bhI < 0.22 * vh &&
            cn !== "roof" && cn !== "windshield" && cn !== "back-windshield" && cn !== "left_mirror" && cn !== "right_mirror") {
          continue;
        }
        kept.push(i);
      }
    }
    return kept;
  }

  async analyzeStageCanvas(stageCanvas, targetW, targetH, onProgress) {
    const t0 = performance.now();
    await this.ensureLoaded(onProgress);

    const ort = window.ort;
    const workScale = Math.min(1.0, 960.0 / Math.max(targetW, targetH));
    const w = Math.max(64, Math.round(targetW * workScale));
    const h = Math.max(64, Math.round(targetH * workScale));

    const origC = document.createElement("canvas");
    origC.width = w;
    origC.height = h;
    const octx = origC.getContext("2d");
    octx.drawImage(stageCanvas, 0, 0, w, h);
    const origPx = octx.getImageData(0, 0, w, h).data;

    onProgress?.("Detectando silueta y separando vidrio/llantas…", 68);
    const carMask = await this._runSegformerMask(stageCanvas, w, h);
    const carMaskRegion = this._dilateBool(carMask, w, h, 4);
    const carEroded = this._erodeBool(carMask, w, h, 2);

    onProgress?.("Mapeando 33 clases de autopartes en carrocería…", 82);
    const sz = 768;
    const scale = Math.min(sz / w, sz / h);
    const nw = Math.round(w * scale);
    const nh = Math.round(h * scale);
    const padX = Math.floor((sz - nw) / 2);
    const padY = Math.floor((sz - nh) / 2);

    const yCanvas = document.createElement("canvas");
    yCanvas.width = sz;
    yCanvas.height = sz;
    const yctx = yCanvas.getContext("2d");
    yctx.fillStyle = "rgb(114,114,114)";
    yctx.fillRect(0, 0, sz, sz);
    yctx.drawImage(stageCanvas, padX, padY, nw, nh);
    const yPx = yctx.getImageData(0, 0, sz, sz).data;

    const planeSz = sz * sz;
    const yInput = new Float32Array(3 * planeSz);
    for (let i = 0; i < planeSz; i++) {
      const j = i << 2;
      yInput[i] = yPx[j] / 255.0;
      yInput[planeSz + i] = yPx[j + 1] / 255.0;
      yInput[2 * planeSz + i] = yPx[j + 2] / 255.0;
    }

    const yTensor = new ort.Tensor("float32", yInput, [1, 3, sz, sz]);
    let yOut = null;
    try {
      yOut = await this.yoloSess.run({ [this.yoloSess.inputNames[0]]: yTensor });
      const out0 = yOut[this.yoloSess.outputNames[0]];
      const out1 = yOut[this.yoloSess.outputNames[1]];
      const predData = out0.data;
      const protoData = out1.data;
      const numAnch = out0.dims[2];
      const mh = out1.dims[2], mw = out1.dims[3];
      const mPlane = mh * mw;

      const candIndices = [], candCls = [], candConfs = [], candBoxes = [];
      for (let a = 0; a < numAnch; a++) {
        let bestC = 0, bestConf = -1;
        for (let c = 0; c < 33; c++) {
          const v = predData[(4 + c) * numAnch + a];
          if (v > bestConf) { bestConf = v; bestC = c; }
        }
        if (bestConf >= 0.20) {
          const cx = predData[0 * numAnch + a];
          const cy = predData[1 * numAnch + a];
          const bw = predData[2 * numAnch + a];
          const bh = predData[3 * numAnch + a];
          candIndices.push(a);
          candCls.push(bestC);
          candConfs.push(bestConf);
          candBoxes.push([cx - bw * 0.5, cy - bh * 0.5, cx + bw * 0.5, cy + bh * 0.5]);
        }
      }

      const nPix = w * h;
      if (candIndices.length === 0) {
        return { vehicleDetected: false, parts: [], bodyCoveragePct: 0, protectedCount: 0, inferenceMs: Math.round(performance.now() - t0) };
      }

      let finalItems = [];
      for (const c of new Set(candCls)) {
        const groupIdx = [], gBoxes = [], gConfs = [];
        for (let k = 0; k < candCls.length; k++) {
          if (candCls[k] === c) {
            groupIdx.push(k);
            gBoxes.push(candBoxes[k]);
            gConfs.push(candConfs[k]);
          }
        }
        const kept = this._nmsBoxes(gBoxes, gConfs, 0.50);
        for (const gk of kept) finalItems.push(groupIdx[gk]);
      }

      finalItems = this._filterHeroVehicle(candBoxes, candCls, candConfs, finalItems, sz);

      const sxm = mw / sz, sym = mh / sz;
      const px1 = Math.round(padX * sxm), py1 = Math.round(padY * sym);
      const px2 = Math.round((padX + nw) * sxm), py2 = Math.round((padY + nh) / 1 * sym);
      const upW = Math.max(1, px2 - px1), upH = Math.max(1, py2 - py1);

      const tmpMC = document.createElement("canvas");
      tmpMC.width = mw; tmpMC.height = mh;
      const tmpMctx = tmpMC.getContext("2d");
      const tmpImg = tmpMctx.createImageData(mw, mh);

      const fullScaleC = document.createElement("canvas");
      fullScaleC.width = w; fullScaleC.height = h;
      const fullScaleCtx = fullScaleC.getContext("2d");
      fullScaleCtx.imageSmoothingEnabled = true;

      const hardExcl = new Uint8Array(nPix);
      const grilleCand = new Uint8Array(nPix);
      const paintParts = {};
      const partConfs = {};
      let protectedCount = 0;

      for (const idx of finalItems) {
        const anchor = candIndices[idx];
        const cname = CARPART_NAMES[candCls[idx]];
        const conf = candConfs[idx];
        const [bx1, by1, bx2, by2] = candBoxes[idx];

        const mx1 = Math.max(0, Math.floor(bx1 * sxm));
        const my1 = Math.max(0, Math.floor(by1 * sym));
        const mx2 = Math.min(mw, Math.ceil(bx2 * sxm));
        const my2 = Math.min(mh, Math.ceil(by2 * sym));

        const coeffs = new Float32Array(32);
        for (let k = 0; k < 32; k++) coeffs[k] = predData[(37 + k) * numAnch + anchor];

        tmpImg.data.fill(0);
        for (let y = my1; y < my2; y++) {
          for (let x = mx1; x < mx2; x++) {
            const pIdx = y * mw + x;
            let dot = 0;
            for (let k = 0; k < 32; k++) dot += coeffs[k] * protoData[k * mPlane + pIdx];
            const prob = 1.0 / (1.0 + Math.exp(-Math.max(-30, Math.min(30, dot))));
            const val = Math.max(0, Math.min(255, Math.round(prob * 255)));
            const j = pIdx << 2;
            tmpImg.data[j] = val; tmpImg.data[j + 1] = val; tmpImg.data[j + 2] = val; tmpImg.data[j + 3] = 255;
          }
        }
        tmpMctx.putImageData(tmpImg, 0, 0);

        fullScaleCtx.clearRect(0, 0, w, h);
        fullScaleCtx.drawImage(tmpMC, px1, py1, upW, upH, 0, 0, w, h);
        const fData = fullScaleCtx.getImageData(0, 0, w, h).data;

        const mFull = new Uint8Array(nPix);
        let count = 0;
        const isExcl = EXCLUDE_PART_CLASSES.has(cname);
        for (let i = 0; i < nPix; i++) {
          if (fData[i << 2] > 122) {
            mFull[i] = 1;
            count++;
          }
        }
        const minPct = isExcl ? 0.01 : 0.06;
        if ((count / nPix) * 100.0 < minPct) continue;

        if (isExcl) {
          protectedCount++;
          if (cname === "grille") {
            for (let i = 0; i < nPix; i++) if (mFull[i]) grilleCand[i] = 1;
          } else {
            for (let i = 0; i < nPix; i++) if (mFull[i]) hardExcl[i] = 1;
          }
        } else {
          if (!paintParts[cname]) {
            paintParts[cname] = mFull;
            partConfs[cname] = conf;
          } else {
            const existing = paintParts[cname];
            for (let i = 0; i < nPix; i++) if (mFull[i]) existing[i] = 1;
            if (conf > partConfs[cname]) partConfs[cname] = conf;
          }
        }
      }

      const lumaArr = new Float32Array(nPix);
      const satArr = new Float32Array(nPix);
      for (let i = 0; i < nPix; i++) {
        const j = i << 2;
        const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
        lumaArr[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        satArr[i] = Math.max(r, g, b) - Math.min(r, g, b);
      }

      const coreKeys = [
        "hood", "left_fender", "right_fender",
        "left_front-door", "right_front-door", "left_back-door", "right_back-door",
        "left_quarter-panel", "right_quarter-panel", "trunk"
      ];
      const coreMask = new Uint8Array(nPix);
      let coreCnt = 0;
      for (const ck of coreKeys) {
        const arr = paintParts[ck];
        if (arr) for (let i = 0; i < nPix; i++) if (arr[i] && !coreMask[i]) { coreMask[i] = 1; coreCnt++; }
      }
      if (coreCnt === 0) {
        for (const arr of Object.values(paintParts)) {
          for (let i = 0; i < nPix; i++) if (arr[i] && !coreMask[i]) { coreMask[i] = 1; coreCnt++; }
        }
      }
      if (coreCnt === 0) {
        return { vehicleDetected: false, parts: [], bodyCoveragePct: 0, protectedCount, inferenceMs: Math.round(performance.now() - t0) };
      }

      const sampIdx = [];
      for (let i = 0; i < nPix; i++) if (coreMask[i] && !hardExcl[i] && lumaArr[i] > 48) sampIdx.push(i);
      if (sampIdx.length < 50) {
        sampIdx.length = 0;
        for (let i = 0; i < nPix; i++) if (coreMask[i] && !hardExcl[i]) sampIdx.push(i);
      }
      if (sampIdx.length === 0) for (let i = 0; i < nPix; i++) if (coreMask[i]) sampIdx.push(i);

      const stride = Math.max(1, Math.floor(sampIdx.length / 4096));
      const sR = [], sG = [], sB = [], sSat = [], sLuma = [];
      for (let k = 0; k < sampIdx.length; k += stride) {
        const idx = sampIdx[k], j = idx << 2;
        sR.push(origPx[j]); sG.push(origPx[j + 1]); sB.push(origPx[j + 2]);
        sSat.push(satArr[idx]); sLuma.push(lumaArr[idx]);
      }
      const medOf = a => { a.sort((x, y) => x - y); return a[a.length >> 1] || 0; };
      const medR = medOf(sR), medG = medOf(sG), medB = medOf(sB);
      const medSat = medOf(sSat), medLuma = medOf(sLuma);
      const medCb = medR - medG, medCy = 0.5 * (medR + medG) - medB;
      const isChromaticCar = (medSat >= 34 && medLuma >= 65) || (medSat >= 58);

      const fullExcl = new Uint8Array(nPix);
      const grilleLumaLim = medLuma > 95 ? medLuma * 0.72 : 95;
      for (let i = 0; i < nPix; i++) {
        if (hardExcl[i]) fullExcl[i] = 1;
        else if (grilleCand[i]) {
          if (isChromaticCar) {
            const j = i << 2;
            const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
            const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
            if (!(satArr[i] > 20 && cd < 68)) fullExcl[i] = 1;
          } else if (lumaArr[i] < grilleLumaLim) {
            fullExcl[i] = 1;
          }
        }
      }

      const trimParts = new Set(["front-bumper", "back-bumper", "left_rocker-panel", "right_rocker-panel", "left_fender", "right_fender"]);
      const achromTrimParts = new Set(["front-bumper", "back-bumper", "left_rocker-panel", "right_rocker-panel"]);
      const bodyMask = new Uint8Array(nPix);

      for (const k of Object.keys(paintParts)) {
        const arr = paintParts[k];
        const inTrim = trimParts.has(k);
        const vividChroma = isChromaticCar && medSat >= 75 && inTrim;
        const subtleChroma = isChromaticCar && medSat < 75 && inTrim;
        const achromTrim = !isChromaticCar && medLuma >= 90 && achromTrimParts.has(k);
        let keptCnt = 0;
        for (let i = 0; i < nPix; i++) {
          if (!arr[i]) continue;
          if (fullExcl[i]) { arr[i] = 0; continue; }
          if (vividChroma && (lumaArr[i] < 36 || (satArr[i] < 14 && lumaArr[i] < 72))) { arr[i] = 0; continue; }
          if (subtleChroma && lumaArr[i] < 30) { arr[i] = 0; continue; }
          if (achromTrim && lumaArr[i] < 40) { arr[i] = 0; continue; }
          keptCnt++;
        }
        if ((keptCnt / nPix) * 100.0 < 0.12) delete paintParts[k];
        else for (let i = 0; i < nPix; i++) if (arr[i]) bodyMask[i] = 1;
      }

      let by0 = h, by1 = 0, bx0 = w, bx1 = 0, bodyCount = 0;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          if (bodyMask[row + x]) {
            if (y < by0) by0 = y; if (y > by1) by1 = y;
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
            bodyCount++;
          }
        }
      }

      if (bodyCount === 0) {
        return { vehicleDetected: false, parts: [], bodyCoveragePct: 0, protectedCount, inferenceMs: Math.round(performance.now() - t0) };
      }

      const bh = Math.max(1, by1 - by0), bw = Math.max(1, bx1 - bx0);
      const padBx = Math.floor(bw * 0.025), padBy = Math.floor(bh * 0.025);
      const boxY0 = Math.max(0, by0 - padBy), boxY1 = Math.min(h - 1, by1 + padBy);
      const boxX0 = Math.max(0, bx0 - padBx), boxX1 = Math.min(w - 1, bx1 + padBx);

      const origBodyMask = new Uint8Array(bodyMask);
      const darkRubber = new Uint8Array(nPix);
      if (!isChromaticCar) {
        const rubberCutY = by0 + 0.48 * bh;
        const darkThresh = medLuma < 60 ? 30 : 52;
        for (let y = 0; y < Math.min(h, Math.ceil(rubberCutY)); y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            const idx = row + x;
            if (lumaArr[idx] < darkThresh) {
              darkRubber[idx] = 1; bodyMask[idx] = 0; origBodyMask[idx] = 0;
            }
          }
        }
        for (const k of Object.keys(paintParts)) {
          if (k.includes("door") || k.includes("roof")) {
            const arr = paintParts[k];
            for (let i = 0; i < nPix; i++) if (darkRubber[i]) arr[i] = 0;
          }
        }
      }

      const bodyWideHalo = this._dilateBool(bodyMask, w, h, 25);
      const bodyMidHalo = this._dilateBool(bodyMask, w, h, 15);
      const allowedGrow = new Uint8Array(nPix);
      const q = new Int32Array(nPix);
      const qDist = new Uint8Array(nPix);
      let qHead = 0, qTail = 0;
      const pMinY = by0 + 0.03 * bh, pMaxY = by0 + (isChromaticCar ? 0.65 : 0.62) * bh;
      const rMinY = by0 + 0.55 * bh;
      const lumaTol = medLuma >= 90 ? 135 : 75;
      const rLumaTol = medLuma >= 90 ? 115 : 65;
      const minAchromL = medLuma < 60 ? 38 : 56;
      const minRockerL = medLuma < 60 ? 42 : 68;

      for (let y = boxY0; y <= boxY1; y++) {
        const row = y * w;
        for (let x = boxX0; x <= boxX1; x++) {
          const idx = row + x;
          if (bodyMask[idx]) { q[qTail++] = idx; qDist[idx] = 1; }
          if (fullExcl[idx]) continue;
          const j = idx << 2;
          const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
          const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
          if (isChromaticCar) {
            if (!carMaskRegion[idx]) continue;
            if (cd < 68 && satArr[idx] >= 16 && lumaArr[idx] >= 26) {
              allowedGrow[idx] = 1;
              if (!bodyMask[idx] && carEroded[idx] && bodyWideHalo[idx] && y >= by0 && y <= pMaxY && cd < 62 && satArr[idx] >= 18 && lumaArr[idx] >= 28) {
                bodyMask[idx] = 1; q[qTail++] = idx; qDist[idx] = 1;
              }
            }
          } else {
            if (!carMask[idx] || darkRubber[idx]) continue;
            const dL = Math.abs(lumaArr[idx] - medLuma);
            if (satArr[idx] < 58 && cd < 56 && dL < lumaTol && lumaArr[idx] > minAchromL) {
              allowedGrow[idx] = 1;
              const isPillar = carEroded[idx] && bodyWideHalo[idx] && y >= pMinY && y <= pMaxY && satArr[idx] < 54 && cd < 52;
              const isRocker = carEroded[idx] && bodyMidHalo[idx] && y >= rMinY && y <= by1 && satArr[idx] < 42 && cd < 46 && dL < rLumaTol && lumaArr[idx] > minRockerL;
              if (!bodyMask[idx] && (isPillar || isRocker)) {
                bodyMask[idx] = 1; q[qTail++] = idx; qDist[idx] = 1;
              }
            }
          }
        }
      }

      const stepTol = 24;
      while (qHead < qTail) {
        const cur = q[qHead++];
        const d = qDist[cur];
        if (d >= 81) continue;
        const lC = lumaArr[cur];
        const cx = cur % w, cy = (cur / w) | 0;
        const nbrs = [cy > 0 ? cur - w : -1, cy < h - 1 ? cur + w : -1, cx > 0 ? cur - 1 : -1, cx < w - 1 ? cur + 1 : -1];
        for (let ni = 0; ni < 4; ni++) {
          const nb = nbrs[ni];
          if (nb < 0 || bodyMask[nb] || !allowedGrow[nb]) continue;
          if (Math.abs(lumaArr[nb] - lC) <= stepTol) {
            bodyMask[nb] = 1; qDist[nb] = d + 1; q[qTail++] = nb;
          }
        }
      }

      const recovered = new Uint8Array(nPix);
      let recCnt = 0;
      for (let i = 0; i < nPix; i++) if (bodyMask[i] && !origBodyMask[i]) { recovered[i] = 1; recCnt++; }
      if ((recCnt / nPix) * 100.0 >= 0.25) {
        paintParts["pillars"] = recovered;
        partConfs["pillars"] = 0.85;
      }

      const sortedIds = Object.keys(paintParts).sort((a, b) => (PART_LABELS_ES[a]?.[1] ?? 99) - (PART_LABELS_ES[b]?.[1] ?? 99));
      const mappedParts = [];
      for (const pid of sortedIds) {
        const arr = paintParts[pid];
        let cnt = 0;
        for (let i = 0; i < nPix; i++) if (arr[i]) cnt++;
        const apct = Math.round((cnt / nPix) * 1000) / 10;
        if (apct < 0.2) continue;
        const meta = PART_LABELS_ES[pid] || [pid, 99, null];
        mappedParts.push({
          id: pid,
          label: meta[0],
          quotePartId: meta[2],
          areaPct: apct,
          confidence: Math.round((partConfs[pid] || 0.8) * 100) / 100,
          maskCanvas: this._guidedToMaskCanvas(arr, lumaArr, fullExcl, w, h, targetW, targetH),
          outlineCanvas: this._buildPartOutlineCanvas(arr, w, h, targetW, targetH)
        });
      }

      // Dilatar ligeramente zonas duras protegidas (vidrios/rines/faros) contra sangrado de frontera
      const strictExclEdge = this._dilateBool(hardExcl, w, h, 1);
      for (let i = 0; i < nPix; i++) if (fullExcl[i]) strictExclEdge[i] = 1;

      let finalBodyCnt = 0;
      for (let i = 0; i < nPix; i++) if (bodyMask[i]) finalBodyCnt++;

      return {
        maskCanvas: this._guidedToMaskCanvas(bodyMask, lumaArr, strictExclEdge, w, h, targetW, targetH),
        protectedMaskCanvas: this._boolToMaskCanvas(strictExclEdge, w, h, targetW, targetH, 0.8),
        vehicleDetected: true,
        bodyCoveragePct: Math.round((finalBodyCnt / nPix) * 1000) / 10,
        protectedCount,
        parts: mappedParts,
        inferenceMs: Math.round(performance.now() - t0),
        method: "wasm_yolo26_carparts"
      };
    } finally {
      yTensor.dispose?.();
      if (yOut) Object.values(yOut).forEach(t => t?.dispose?.());
    }
  }
}

export class SegmentationController {
  constructor(
    overlayCanvas,
    { width = 1280, height = 720, onMaskUpdated, onPartsDetected, onPartClicked, onSplitDrag, onStatus, onProgress, onDecalPointer } = {}
  ) {
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx = overlayCanvas.getContext("2d");
    this.width = width;
    this.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;

    this.onMaskUpdated = onMaskUpdated || (() => {});
    this.onPartsDetected = onPartsDetected || (() => {});
    this.onPartClicked = onPartClicked || (() => {});
    this.onSplitDrag = onSplitDrag || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onDecalPointer = onDecalPointer || (() => false);

    this.carPartsAI = new CarPartsDetector();

    this.committedCanvas = document.createElement("canvas");
    this.committedCanvas.width = width;
    this.committedCanvas.height = height;
    this.committedCtx = this.committedCanvas.getContext("2d", { willReadFrequently: true });

    this.workingCanvas = document.createElement("canvas");
    this.workingCanvas.width = width;
    this.workingCanvas.height = height;
    this.workingCtx = this.workingCanvas.getContext("2d", { willReadFrequently: true });

    this.combinedCanvas = document.createElement("canvas");
    this.combinedCanvas.width = width;
    this.combinedCanvas.height = height;
    this.combinedCtx = this.combinedCanvas.getContext("2d", { willReadFrequently: true });

    this.scratchCanvas = document.createElement("canvas");
    this.scratchCanvas.width = width;
    this.scratchCanvas.height = height;
    this.scratchCtx = this.scratchCanvas.getContext("2d");

    this.tool = "ai-part"; // ai-part | ai-add | ai-sub | brush-add | brush-sub
    this.brushRadius = 24;
    this.featherRadius = 1.6;
    this.decalMode = false;
    this.showMaskTint = true;
    this.hasImage = false;
    this.isEncoded = false;
    this.modelReady = false;
    this.lastCoveragePct = 0;

    this.detectedParts = [];
    this.protectedCount = 0;
    this.protectedMaskCanvas = null;
    this.hasCarPartsMask = false;
    this.hitGrid = null;
    this.hitW = 320;
    this.hitH = 180;
    this.hoveredPart = null;
    this.selectedPartId = null;
    this.lastPointer = null;

    this.splitEnabled = false;
    this.splitPos = 0.5;
    this.draggingSplit = false;
    this.pendingSamMode = "replace";

    this.points = [];
    this.labels = [];
    this.pendingClicks = [];
    this.undoStack = [];
    this.isBrushing = false;
    this.lastBrushPt = null;
    this.requestSeq = 0;
    this.analyzeSeq = 0;

    this._initSamWorker();
    this._bindEvents();
  }

  _initSamWorker() {
    this.worker = new Worker("./js/samWorker.js?v=6", { type: "module" });
    this.worker.onmessage = event => {
      const msg = event.data || {};
      if (msg.type === "ready") {
        this.modelReady = true;
        if (!this.hasImage) {
          this.onStatus("ready", "IA Dual Lista (CarParts 33 + SAM)");
        }
      } else if (msg.type === "encoded") {
        this.isEncoded = true;
        if (this.pendingClicks.length > 0) {
          const queued = this.pendingClicks.splice(0);
          for (const item of queued) {
            this.points.push([Math.round(item.x), Math.round(item.y)]);
            this.labels.push(item.label);
          }
          this._dispatchSegment(this.points.length <= 2);
        }
      } else if (msg.type === "mask") {
        this._applySamMask(msg.maskBuffer, msg.width, msg.height, msg.mode || this.pendingSamMode);
        this.onProgress(false, "Refinamiento IA listo", 100);
      } else if (msg.type === "error") {
        console.warn("SlimSAM aviso:", msg.message);
      }
    };
    this.worker.postMessage({ type: "init" });
  }

  setSplitState(enabled, pos = 0.5) {
    this.splitEnabled = Boolean(enabled);
    this.splitPos = Math.max(0.05, Math.min(0.95, Number(pos) || 0.5));
    this.renderOverlay();
  }

  _bindEvents() {
    this.overlayCanvas.addEventListener("contextmenu", e => e.preventDefault());

    this.overlayCanvas.addEventListener("pointerdown", e => {
      if (!this.hasImage) return;
      const pt = this._toCanvasPoint(e);
      this.lastPointer = pt;

      if (this.splitEnabled && Math.abs(pt.x - this.splitPos * this.width) <= 22) {
        this.draggingSplit = true;
        try { this.overlayCanvas.setPointerCapture(e.pointerId); } catch {}
        return;
      }

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

      if (this.tool === "ai-part") {
        const hit = this._hitTestPart(pt.x, pt.y);
        if (hit) {
          this.selectedPartId = hit.id;
          this.onPartClicked(hit);
          this.renderOverlay();
        } else {
          this._addAiPoint(pt.x, pt.y, 1);
        }
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
      this.lastPointer = pt;

      if (this.draggingSplit) {
        const nextPos = Math.max(0.05, Math.min(0.95, pt.x / this.width));
        this.splitPos = nextPos;
        this.onSplitDrag(nextPos);
        this.renderOverlay();
        return;
      }

      if (this.splitEnabled && Math.abs(pt.x - this.splitPos * this.width) <= 22) {
        this.overlayCanvas.style.cursor = "ew-resize";
      } else if (!this.isBrushing && !this.decalMode && this.tool !== "ai-part") {
        this.overlayCanvas.style.cursor = "crosshair";
      }

      if (this.onDecalPointer("move", pt, e, this.decalMode)) return;

      if (!this.isBrushing && !this.decalMode && this.tool === "ai-part") {
        const hit = this._hitTestPart(pt.x, pt.y);
        if ((hit?.id || null) !== (this.hoveredPart?.id || null) || hit) {
          this.hoveredPart = hit;
          if (!this.splitEnabled || Math.abs(pt.x - this.splitPos * this.width) > 22) {
            this.overlayCanvas.style.cursor = hit ? "pointer" : "crosshair";
          }
          this.renderOverlay();
        }
        return;
      }

      if (!this.isBrushing || !this.lastBrushPt) return;
      this._paintBrushSegment(this.lastBrushPt, pt, this.tool === "brush-add");
      this.lastBrushPt = pt;
      this._composeCombinedMask(false);
    });

    const endStroke = e => {
      const pt = this._toCanvasPoint(e);
      if (this.draggingSplit) {
        this.draggingSplit = false;
        return;
      }
      this.onDecalPointer("up", pt, e, this.decalMode);
      if (this.isBrushing) {
        this.isBrushing = false;
        this.lastBrushPt = null;
        this._composeCombinedMask(true);
      }
    };

    this.overlayCanvas.addEventListener("pointerup", endStroke);
    this.overlayCanvas.addEventListener("pointercancel", endStroke);
    this.overlayCanvas.addEventListener("pointerleave", () => {
      if (this.hoveredPart) {
        this.hoveredPart = null;
        this.lastPointer = null;
        this.renderOverlay();
      }
    });
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

  _buildHitGrid(parts) {
    const hw = this.hitW, hh = this.hitH;
    const grid = new Int16Array(hw * hh).fill(-1);
    const tc = document.createElement("canvas");
    tc.width = hw; tc.height = hh;
    const tctx = tc.getContext("2d", { willReadFrequently: true });

    for (let pi = parts.length - 1; pi >= 0; pi--) {
      if (!parts[pi].maskCanvas) continue;
      tctx.clearRect(0, 0, hw, hh);
      tctx.drawImage(parts[pi].maskCanvas, 0, 0, hw, hh);
      const data = tctx.getImageData(0, 0, hw, hh).data;
      for (let i = 0; i < hw * hh; i++) {
        if (grid[i] === -1 && data[(i << 2) + 3] > 75) grid[i] = pi;
      }
    }
    this.hitGrid = grid;
  }

  _hitTestPart(x, y) {
    if (!this.hitGrid || !this.detectedParts.length) return null;
    const gx = Math.max(0, Math.min(this.hitW - 1, Math.floor((x / this.width) * this.hitW)));
    const gy = Math.max(0, Math.min(this.hitH - 1, Math.floor((y / this.height) * this.hitH)));
    const idx = this.hitGrid[gy * this.hitW + gx];
    return idx >= 0 ? this.detectedParts[idx] : null;
  }

  setTool(toolName) {
    this.tool = toolName;
    if (toolName !== "ai-part") this.hoveredPart = null;
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

  async encodeAndAnalyze(stageCanvas, imageData, { autoAnalyze = true } = {}) {
    this.hasImage = true;
    this.isEncoded = false;
    this.pendingClicks = [];
    this.detectedParts = [];
    this.protectedCount = 0;
    this.hitGrid = null;
    this.hoveredPart = null;
    this.selectedPartId = null;

    if (autoAnalyze) this.resetMask(false);
    this.undoStack = [];

    // Codificación en paralelo de SlimSAM para retoque manual posterior
    const bufferCopy = imageData.data.buffer.slice(0);
    this.worker.postMessage(
      { type: "encode", payload: { rgbaBuffer: bufferCopy, width: imageData.width, height: imageData.height } },
      [bufferCopy]
    );

    if (!autoAnalyze) {
      try {
        await this.carPartsAI.ensureLoaded();
      } catch {
        // Ignorar en restauración
      }
      return;
    }

    await this.runCarPartsScan(stageCanvas);
  }

  async runCarPartsScan(stageCanvas) {
    const seq = ++this.analyzeSeq;
    this.onProgress(true, "Analizando vehículo con IA de 33 clases…", 20);
    this.onStatus("loading", "Escaneando piezas IA…");

    try {
      const res = await this.carPartsAI.analyzeStageCanvas(stageCanvas, this.width, this.height, (msg, pct) => {
        if (seq === this.analyzeSeq) this.onProgress(true, msg, pct);
      });
      if (seq !== this.analyzeSeq) return;

      if (res.vehicleDetected && res.parts.length > 0) {
        this.detectedParts = res.parts;
        this.protectedCount = res.protectedCount;
        this.protectedMaskCanvas = res.protectedMaskCanvas || null;
        this.hasCarPartsMask = true;
        this._buildHitGrid(res.parts);

        this.workingCtx.clearRect(0, 0, this.width, this.height);
        this.workingCtx.drawImage(res.maskCanvas, 0, 0, this.width, this.height);
        this.points = [];
        this.labels = [];

        this._composeCombinedMask(true);
        this.onPartsDetected(res.parts, res.protectedCount, res.inferenceMs);
        this.onStatus("ready", `IA: ${res.parts.length} piezas · ${res.protectedCount} zonas protegidas`);
      } else {
        this.hasCarPartsMask = false;
        this.protectedMaskCanvas = null;
        this.onPartsDetected([], 0, res.inferenceMs);
        this.onStatus("ready", "IA Lista (usa Pincel + o IA + Pieza)");
      }
    } catch (err) {
      console.warn("Error en CarParts ONNX, disponible SlimSAM/Pincel:", err);
      this.hasCarPartsMask = false;
      this.onStatus("ready", "IA SlimSAM / Pincel listos");
    } finally {
      if (seq === this.analyzeSeq) this.onProgress(false, "Análisis completado", 100);
    }
  }

  _dispatchSegment(preferFullObject = true, mode = "replace", singlePt = null, singleLabel = 1) {
    this.renderOverlay();
    const requestId = ++this.requestSeq;
    const ptsToSend = singlePt ? [singlePt] : this.points;
    const lblsToSend = singlePt ? [singleLabel] : this.labels;
    this.pendingSamMode = mode;
    this.onProgress(true, mode === "subtract" ? "Excluyendo pieza seleccionada…" : "Refinando zona con SlimSAM…", 70);
    this.worker.postMessage({
      type: "segment",
      payload: { requestId, points: ptsToSend, labels: lblsToSend, preferFullObject }
    });
  }

  triggerAutoSegment() {
    this._addAiPoint(this.width * 0.50, this.height * 0.54, 1);
  }

  _addAiPoint(x, y, label) {
    if (!this.isEncoded) {
      this.pendingClicks.push({ x, y, label });
      this.onStatus("loading", "Punto en cola IA…");
      return;
    }
    this._pushUndo();
    const pt = [Math.round(x), Math.round(y)];
    this.points.push(pt);
    this.labels.push(label);

    if (this.hasCarPartsMask && this.lastCoveragePct > 1.0) {
      // Refina incrementalmente sobre CarParts 33 sin borrar vidrios ni rines protegidos
      const mode = label === 0 ? "subtract" : "add";
      this._dispatchSegment(false, mode, pt, 1);
    } else {
      this._dispatchSegment(this.points.length <= 2, "replace");
    }
  }

  _applySamMask(maskBuffer, w, h, mode = "replace") {
    const bin = new Uint8Array(maskBuffer);
    const img = this.scratchCtx.createImageData(w, h);
    for (let i = 0; i < bin.length; i++) {
      const j = i << 2;
      img.data[j] = 255; img.data[j + 1] = 255; img.data[j + 2] = 255;
      img.data[j + 3] = bin[i];
    }
    this.scratchCtx.putImageData(img, 0, 0);

    if (mode === "add") {
      this.workingCtx.save();
      this.workingCtx.globalCompositeOperation = "source-over";
      this.workingCtx.filter = `blur(${this.featherRadius}px)`;
      this.workingCtx.drawImage(this.scratchCanvas, 0, 0);
      this.workingCtx.restore();
    } else if (mode === "subtract") {
      this.workingCtx.save();
      this.workingCtx.globalCompositeOperation = "destination-out";
      this.workingCtx.filter = `blur(${this.featherRadius}px)`;
      this.workingCtx.drawImage(this.scratchCanvas, 0, 0);
      this.workingCtx.restore();

      this.committedCtx.save();
      this.committedCtx.globalCompositeOperation = "destination-out";
      this.committedCtx.filter = `blur(${this.featherRadius}px)`;
      this.committedCtx.drawImage(this.scratchCanvas, 0, 0);
      this.committedCtx.restore();
    } else {
      this.workingCtx.clearRect(0, 0, this.width, this.height);
      this.workingCtx.save();
      this.workingCtx.filter = `blur(${this.featherRadius}px)`;
      this.workingCtx.drawImage(this.scratchCanvas, 0, 0);
      this.workingCtx.restore();
    }

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
    this.undoStack.push({
      committed: this.committedCtx.getImageData(0, 0, this.width, this.height),
      working: this.workingCtx.getImageData(0, 0, this.width, this.height),
      points: this.points.map(p => [...p]),
      labels: [...this.labels]
    });
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
      const step = 4;
      for (let i = 3; i < px.length; i += 4 * step) if (px[i] > 90) active++;
      this.lastCoveragePct = Number(((active / ((this.width * this.height) / step)) * 100).toFixed(2));
    }

    this.renderOverlay();
    this.onMaskUpdated(this.combinedCanvas, this.lastCoveragePct, computeStats);
  }

  renderOverlay(decalDrawFn = null) {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Resaltado interactivo con relleno suave + contorno brillante alrededor de la pieza enfocada
    const focusPart = this.hoveredPart || this.detectedParts.find(p => p.id === this.selectedPartId);
    if (!this.decalMode && focusPart?.maskCanvas && this.showMaskTint) {
      ctx.save();
      ctx.globalAlpha = this.hoveredPart ? 0.16 : 0.08;
      ctx.fillStyle = this.hoveredPart ? "#38bdf8" : "#60a5fa";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(focusPart.maskCanvas, 0, 0, this.width, this.height);
      ctx.restore();

      if (focusPart.outlineCanvas) {
        ctx.save();
        ctx.shadowColor = this.hoveredPart ? "#38bdf8" : "#22d3ee";
        ctx.shadowBlur = this.hoveredPart ? 10 : 6;
        ctx.globalAlpha = this.hoveredPart ? 0.95 : 0.72;
        ctx.drawImage(focusPart.outlineCanvas, 0, 0, this.width, this.height);
        ctx.restore();
      }
    }

    if (focusPart && !this.decalMode && this.showMaskTint) {
      const actionHint = this.hoveredPart ? " · Clic para personalizar" : " (Activa)";
      const label = `${focusPart.label} · ${Math.round(focusPart.confidence * 100)}%${actionHint}`;
      ctx.save();
      ctx.font = "600 14px system-ui, sans-serif";
      const tw = ctx.measureText(label).width + 22;
      let bx = 18;
      let by = 18;
      if (this.hoveredPart && this.lastPointer) {
        bx = Math.max(12, Math.min(this.width - tw - 12, this.lastPointer.x + 16));
        by = Math.max(12, Math.min(this.height - 42, this.lastPointer.y - 42));
      }
      ctx.fillStyle = "rgba(12, 14, 18, 0.92)";
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 32, 8);
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + 11, by + 16);
      ctx.restore();
    }

    if (!this.decalMode && this.showMaskTint) {
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

    // Divisor visual "Antes | Después" cuando el comparador GPU está activo
    if (this.splitEnabled) {
      const sx = Math.round(this.splitPos * this.width);
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.height);
      ctx.stroke();

      // Etiquetas Original / El Rayo
      ctx.fillStyle = "rgba(12, 14, 18, 0.85)";
      ctx.fillRect(Math.max(8, sx - 86), 14, 74, 26);
      ctx.fillRect(Math.min(this.width - 82, sx + 12), 14, 74, 26);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ORIGINAL", Math.max(45, sx - 49), 27);
      ctx.fillText("PINTADO", Math.min(this.width - 45, sx + 49), 27);

      // Manija central circular
      const cy = this.height * 0.5;
      ctx.beginPath();
      ctx.arc(sx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = "#2563eb";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("↔", sx, cy + 0.5);
      ctx.restore();
    }
  }

  async restoreFromDataUrls({ committedUrl, workingUrl } = {}) {
    const loadTo = (url, ctx) =>
      new Promise(resolve => {
        if (!url) { ctx.clearRect(0, 0, this.width, this.height); resolve(); return; }
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, this.width, this.height); ctx.drawImage(img, 0, 0, this.width, this.height); resolve(); };
        img.onerror = () => resolve();
        img.src = url;
      });
    await Promise.all([loadTo(committedUrl, this.committedCtx), loadTo(workingUrl, this.workingCtx)]);
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
