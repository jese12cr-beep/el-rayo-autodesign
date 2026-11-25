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
    this.lastCache = null;
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
    const q = this._guidedFilterAlpha(boolArr, lumaArr, w, h, 3, 0.0022);
    const edgeRing = this._dilateBool(boolArr, w, h, 1);
    const solidCore = this._erodeBool(boolArr, w, h, 1);
    const sc = document.createElement("canvas");
    sc.width = w;
    sc.height = h;
    const sctx = sc.getContext("2d");
    const img = sctx.createImageData(w, h);
    for (let i = 0; i < boolArr.length; i++) {
      let a = 0;
      if (hardZeroArr && hardZeroArr[i]) {
        a = 0;
      } else if (solidCore[i]) {
        a = 1;
      } else if (boolArr[i]) {
        a = Math.max(0.78, Math.min(1, q[i] * 1.45));
      } else if (edgeRing[i]) {
        // Borde máximo de 1px para suavizado antialiasing sin halo en fondo/árboles
        a = q[i] > 0.45 ? Math.min(0.75, (q[i] - 0.45) * 1.8) : 0;
      }
      const v = a > 0.05 ? Math.round(a * 255) : 0;
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

  _extractHeroConnectedMask(binMask, anchorMask, w, h, minRelOverlap = 0.25) {
    const n = w * h;
    const ccId = new Int32Array(n);
    const q = new Int32Array(n);
    const comps = [];
    let nextId = 1;

    for (let i = 0; i < n; i++) {
      if (!binMask[i] || ccId[i] !== 0) continue;
      if (anchorMask && !anchorMask[i]) continue;
      const id = nextId++;
      let head = 0, tail = 0, area = 0, overlap = 0;
      ccId[i] = id;
      q[tail++] = i;
      while (head < tail) {
        const cur = q[head++];
        area++;
        if (!anchorMask || anchorMask[cur]) overlap++;
        const cx = cur % w, cy = (cur / w) | 0;
        const nbrs = [
          cy > 0 ? cur - w : -1,
          cy < h - 1 ? cur + w : -1,
          cx > 0 ? cur - 1 : -1,
          cx < w - 1 ? cur + 1 : -1
        ];
        for (let k = 0; k < 4; k++) {
          const nb = nbrs[k];
          if (nb >= 0 && binMask[nb] && ccId[nb] === 0) {
            ccId[nb] = id;
            q[tail++] = nb;
          }
        }
      }
      comps.push({ id, area, overlap });
    }

    const out = new Uint8Array(n);
    if (comps.length === 0) return out;
    comps.sort((a, b) => (b.overlap - a.overlap) || (b.area - a.area));
    const bestOverlap = Math.max(1, comps[0].overlap);
    const keepIds = new Set();
    for (const c of comps) {
      if (c.id === comps[0].id || c.overlap >= bestOverlap * minRelOverlap) keepIds.add(c.id);
    }
    for (let i = 0; i < n; i++) {
      if (ccId[i] && keepIds.has(ccId[i])) out[i] = 1;
    }
    return out;
  }

  _filterLargeComponents(mask, w, h, minFrac = 0.018) {
    const n = w * h;
    const ccId = new Int32Array(n);
    const q = new Int32Array(n);
    const comps = [];
    let nextId = 1;
    let total = 0;

    for (let i = 0; i < n; i++) {
      if (!mask[i] || ccId[i] !== 0) continue;
      const id = nextId++;
      let head = 0, tail = 0;
      ccId[i] = id;
      q[tail++] = i;
      while (head < tail) {
        const cur = q[head++];
        const cx = cur % w, cy = (cur / w) | 0;
        const nbrs = [
          cy > 0 ? cur - w : -1,
          cy < h - 1 ? cur + w : -1,
          cx > 0 ? cur - 1 : -1,
          cx < w - 1 ? cur + 1 : -1
        ];
        for (let k = 0; k < 4; k++) {
          const nb = nbrs[k];
          if (nb >= 0 && mask[nb] && ccId[nb] === 0) {
            ccId[nb] = id;
            q[tail++] = nb;
          }
        }
      }
      total += tail;
      comps.push({ id, size: tail });
    }

    const out = new Uint8Array(n);
    if (total === 0) return out;
    const minSize = Math.max(24, total * minFrac);
    const keepIds = new Set();
    let best = comps[0];
    for (const c of comps) {
      if (c.size > best.size) best = c;
      if (c.size >= minSize) keepIds.add(c.id);
    }
    if (best) keepIds.add(best.id);
    for (let i = 0; i < n; i++) {
      if (ccId[i] && keepIds.has(ccId[i])) out[i] = 1;
    }
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

      const lowCar = new Uint8Array(lPlane);
      const lowBg = new Uint8Array(lPlane);
      // Clases estáticas de escena en Cityscapes: road(0), sidewalk(1), building(2), wall(3), fence(4), pole(5), vegetation(8), terrain(9), sky(10)
      const bgClsSet = new Set([0, 1, 2, 3, 4, 5, 8, 9, 10]);
      let hitCount = 0;

      for (let i = 0; i < lPlane; i++) {
        let bestC = 0, bestV = -1e9;
        for (let cls = 0; cls < nCls; cls++) {
          const val = logits[cls * lPlane + i];
          if (val > bestV) { bestV = val; bestC = cls; }
        }
        let sumExp = 0;
        for (let cls = 0; cls < nCls; cls++) {
          sumExp += Math.exp(Math.max(-30, logits[cls * lPlane + i] - bestV));
        }
        const pVeh = (
          (13 < nCls ? Math.exp(Math.max(-30, logits[13 * lPlane + i] - bestV)) : 0) +
          (14 < nCls ? Math.exp(Math.max(-30, logits[14 * lPlane + i] - bestV)) : 0) +
          (15 < nCls ? Math.exp(Math.max(-30, logits[15 * lPlane + i] - bestV)) : 0)
        ) / (sumExp || 1);

        if (bestC === 13 || bestC === 14 || bestC === 15 || pVeh >= 0.34) {
          lowCar[i] = 1;
          hitCount++;
        } else if (bgClsSet.has(bestC) && pVeh < 0.20) {
          lowBg[i] = 1;
        }
      }
      if (hitCount < 40) {
        for (let i = 0; i < lPlane; i++) {
          const p13 = 1 / (1 + Math.exp(-logits[13 * lPlane + i]));
          if (p13 > 0.35) lowCar[i] = 1;
        }
      }

      const upsampleBin = (srcArr, thresh) => {
        const lc = document.createElement("canvas");
        lc.width = lw;
        lc.height = lh;
        const lctx = lc.getContext("2d");
        const limg = lctx.createImageData(lw, lh);
        for (let i = 0; i < lPlane; i++) {
          const j = i << 2;
          const v = srcArr[i] ? 255 : 0;
          limg.data[j] = v; limg.data[j + 1] = v; limg.data[j + 2] = v; limg.data[j + 3] = 255;
        }
        lctx.putImageData(limg, 0, 0);

        const fc = document.createElement("canvas");
        fc.width = ow;
        fc.height = oh;
        const fctx = fc.getContext("2d", { willReadFrequently: true });
        fctx.imageSmoothingEnabled = true;
        fctx.drawImage(lc, 0, 0, ow, oh);
        const fpx = fctx.getImageData(0, 0, ow, oh).data;
        const outMask = new Uint8Array(ow * oh);
        for (let i = 0; i < ow * oh; i++) {
          if (fpx[i << 2] > thresh) outMask[i] = 1;
        }
        return outMask;
      };

      return {
        carMask: upsampleBin(lowCar, 118),
        hardBgMask: upsampleBin(lowBg, 148)
      };
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
    const bestArea = Math.max(1, (bestB[2] - bestB[0]) * (bestB[3] - bestB[1]));
    const cluster = new Set([bestI]);
    const q = [bestI];
    const gap = 12;
    while (q.length > 0) {
      const cur = q.pop();
      const [cx0, cy0, cx1, cy1] = candBoxes[cur];
      for (const j of pool) {
        if (cluster.has(j)) continue;
        const bJ = candBoxes[j];
        const areaJ = Math.max(1, (bJ[2] - bJ[0]) * (bJ[3] - bJ[1]));
        const cnJ = CARPART_NAMES[candCls[j]];
        // No encadenar cajas diminutas lejanas (p. ej. otro auto en el fondo) hacia fuera del vehículo principal
        if (areaJ < bestArea * 0.035 && candConfs[j] < 0.45 && !EXCLUDE_PART_CLASSES.has(cnJ)) continue;
        if (Math.min(cx1, bJ[2]) + gap >= Math.max(cx0, bJ[0]) && Math.min(cy1, bJ[3]) + gap >= Math.max(cy0, bJ[1])) {
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

  async analyzeStageCanvas(stageCanvas, targetW, targetH, onProgress, tolerance = 0.88) {
    const t0 = performance.now();
    await this.ensureLoaded(onProgress);

    const ort = window.ort;
    const workScale = Math.min(1.0, 960.0 / Math.max(targetW, targetH));
    const w = Math.max(64, Math.round(targetW * workScale));
    const h = Math.max(64, Math.round(targetH * workScale));

    const origC = document.createElement("canvas");
    origC.width = w;
    origC.height = h;
    const octx = origC.getContext("2d", { willReadFrequently: true });
    octx.drawImage(stageCanvas, 0, 0, w, h);
    const origPx = octx.getImageData(0, 0, w, h).data;

    onProgress?.("Detectando silueta y separando vidrio/llantas…", 68);
    const { carMask, hardBgMask } = await this._runSegformerMask(stageCanvas, w, h);

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
    const yctx = yCanvas.getContext("2d", { willReadFrequently: true });
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
        const candName = CARPART_NAMES[bestC];
        const minAnchorConf = EXCLUDE_PART_CLASSES.has(candName)
          ? (candName === "grille" ? 0.20 : 0.15)
          : 0.16;
        if (bestConf >= minAnchorConf) {
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
      const tmpMctx = tmpMC.getContext("2d", { willReadFrequently: true });
      const tmpImg = tmpMctx.createImageData(mw, mh);

      const fullScaleC = document.createElement("canvas");
      fullScaleC.width = w; fullScaleC.height = h;
      const fullScaleCtx = fullScaleC.getContext("2d", { willReadFrequently: true });
      fullScaleCtx.imageSmoothingEnabled = true;

      const hardExcl = new Uint8Array(nPix);
      const glassMask = new Uint8Array(nPix);
      const sideFrontWin = new Uint8Array(nPix);
      const sideBackWin = new Uint8Array(nPix);
      const rearGlassMask = new Uint8Array(nPix);
      const wheelMask = new Uint8Array(nPix);
      const lightMask = new Uint8Array(nPix);
      const plateMask = new Uint8Array(nPix);
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
        const isLightOrPlate = cname.endsWith("light") || cname === "license-plate";
        // Faros/placas más ceñidos (128) para no invadir cejas del cofre; vidrios/llantas ligeramente amplios (114/108)
        const binThresh = !isExcl ? 126 : (isLightOrPlate ? 128 : (cname.endsWith("-wheel") ? 108 : 114));
        for (let i = 0; i < nPix; i++) {
          if (fData[i << 2] > binThresh) {
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
            const isGlass = cname === "windshield" || cname === "back-windshield" || cname.endsWith("-window");
            const isFrontWin = cname === "left_front-window" || cname === "right_front-window";
            const isBackWin = cname === "left_back-window" || cname === "right_back-window";
            const isWheel = cname.endsWith("-wheel");
            const isLight = cname.endsWith("light");
            for (let i = 0; i < nPix; i++) {
              if (!mFull[i]) continue;
              hardExcl[i] = 1;
              if (isGlass) glassMask[i] = 1;
              if (isFrontWin) sideFrontWin[i] = 1;
              if (isBackWin) sideBackWin[i] = 1;
              if (cname === "back-windshield") rearGlassMask[i] = 1;
              if (isWheel) wheelMask[i] = 1;
              if (isLight) lightMask[i] = 1;
              if (cname === "license-plate") plateMask[i] = 1;
            }
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
        if (arr) {
          for (let i = 0; i < nPix; i++) {
            if (arr[i] && !hardBgMask[i] && !coreMask[i]) { coreMask[i] = 1; coreCnt++; }
          }
        }
      }
      if (coreCnt === 0) {
        for (const arr of Object.values(paintParts)) {
          for (let i = 0; i < nPix; i++) if (arr[i] && !coreMask[i]) { coreMask[i] = 1; coreCnt++; }
        }
      }
      if (coreCnt === 0) {
        return { vehicleDetected: false, parts: [], bodyCoveragePct: 0, protectedCount, inferenceMs: Math.round(performance.now() - t0) };
      }

      // Aislar únicamente el componente conectado de SegFormer perteneciente al vehículo principal
      let heroCarMask = this._extractHeroConnectedMask(carMask, coreMask, w, h, 0.25);
      let heroCarPix = 0;
      for (let i = 0; i < nPix; i++) if (heroCarMask[i]) heroCarPix++;
      if (heroCarPix < Math.max(50, coreCnt * 0.25)) heroCarMask = carMask;
      const heroCarRegion = this._dilateBool(heroCarMask, w, h, 1);
      // Cómputo preliminar del alto del vehículo para escalar tolerancia del toldo al tamaño real del auto
      let prelimY0 = h, prelimY1 = 0;
      for (let i = 0; i < nPix; i++) {
        if (heroCarMask[i]) {
          const yy = (i / w) | 0;
          if (yy < prelimY0) prelimY0 = yy;
          if (yy > prelimY1) prelimY1 = yy;
        }
      }
      const prelimBh = Math.max(40, prelimY1 - prelimY0);
      const heroCarRoofRegion = this._dilateBool(heroCarMask, w, h, Math.max(9, Math.round(prelimBh * 0.038)));
      const heroCarEroded = this._erodeBool(heroCarMask, w, h, 2);

      // Limitar TODAS las piezas detectadas al vehículo principal y excluir escena de fondo (cielo/árboles/muros/autos lejanos)
      let hy0 = h, hy1 = 0, hx0 = w, hx1 = 0;
      for (const k of Object.keys(paintParts)) {
        const arr = paintParts[k];
        const isRoofPart = k === "roof";
        let kCnt = 0;
        for (let i = 0; i < nPix; i++) {
          if (!arr[i]) continue;
          if (hardExcl[i]) { arr[i] = 0; continue; }
          if (!isRoofPart) {
            if (!heroCarRegion[i] || hardBgMask[i]) { arr[i] = 0; continue; }
          } else {
            // YOLO 'roof' ya delimita el arco superior del vehículo; podar si queda lejos del vehículo o parece follaje/cielo
            if (!heroCarRoofRegion[i]) { arr[i] = 0; continue; }
            if (hardBgMask[i]) {
              const j = i << 2;
              const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
              const lum = lumaArr[i], sat = satArr[i];
              const isPureBg = (g - Math.max(r, b) > 24) || (r - b > 34 && sat > 22 && lum < 75) || lum > 224 || lum < 45;
              if (isPureBg) { arr[i] = 0; continue; }
            }
          }
          kCnt++;
          const yy = (i / w) | 0, xx = i % w;
          if (yy < hy0) hy0 = yy; if (yy > hy1) hy1 = yy;
          if (xx < hx0) hx0 = xx; if (xx > hx1) hx1 = xx;
        }
        if ((kCnt / nPix) * 100.0 < 0.08) delete paintParts[k];
      }

      if (hy1 <= hy0) {
        return { vehicleDetected: false, parts: [], bodyCoveragePct: 0, protectedCount, inferenceMs: Math.round(performance.now() - t0) };
      }
      const bhEst = Math.max(40, hy1 - hy0);
      const bwEst = Math.max(60, hx1 - hx0);

      // Muestreo limpio de color base excluyendo cercanías de vidrios (evita contaminar con molduras negras / postes B)
      const sampGlassExcl = this._dilateBool(glassMask, w, h, Math.max(6, Math.round(bhEst * 0.025)));
      const sampWheelExcl = this._dilateBool(wheelMask, w, h, 4);
      const sampIdx = [];
      for (let i = 0; i < nPix; i++) {
        if (coreMask[i] && heroCarMask[i] && !hardExcl[i] && !sampGlassExcl[i] && !sampWheelExcl[i] &&
            (lumaArr[i] > 28 || satArr[i] > 26)) {
          sampIdx.push(i);
        }
      }
      if (sampIdx.length < 50) {
        sampIdx.length = 0;
        for (let i = 0; i < nPix; i++) if (coreMask[i] && heroCarRegion[i] && !hardExcl[i]) sampIdx.push(i);
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
      const isChromaticCar = (medSat >= 30 && medLuma >= 34) || (medSat >= 48);

      // Reclamación cromática de bordes finos (cejas de cofre sobre faros, postes A y labios de salpicadera invadidos por proto 192x192)
      const reclaimedRimMask = new Uint8Array(nPix);
      if (isChromaticCar) {
        const rimR = Math.max(3, Math.min(4, Math.round(bhEst * 0.011)));
        const glassInner = this._erodeBool(glassMask, w, h, rimR);
        const lightInner = this._erodeBool(lightMask, w, h, rimR);
        const wheelInner = this._erodeBool(wheelMask, w, h, 2);
        for (let i = 0; i < nPix; i++) {
          const onGlassRim = glassMask[i] && !glassInner[i];
          const onLightRim = lightMask[i] && !lightInner[i];
          const onWheelRim = wheelMask[i] && !wheelInner[i];
          if (!onGlassRim && !onLightRim && !onWheelRim) continue;
          const j = i << 2;
          const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
          const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
          const minSatRim = onGlassRim ? Math.max(18, medSat * 0.34) : (onWheelRim ? Math.max(28, medSat * 0.48) : Math.max(22, medSat * 0.40));
          const maxCdRim = onWheelRim ? 34 : 44;
          if (satArr[i] >= minSatRim && cd < maxCdRim && lumaArr[i] >= 20) {
            hardExcl[i] = 0;
            reclaimedRimMask[i] = 1;
            if (onGlassRim) glassMask[i] = 0;
            if (onLightRim) lightMask[i] = 0;
            if (onWheelRim) wheelMask[i] = 0;
          }
        }
      }

      const fullExcl = new Uint8Array(nPix);
      const grilleLumaLim = medLuma > 95 ? medLuma * 0.72 : 95;
      for (let i = 0; i < nPix; i++) {
        if (hardExcl[i]) fullExcl[i] = 1;
        else if (grilleCand[i]) {
          if (isChromaticCar) {
            const j = i << 2;
            const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
            const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
            if (!(satArr[i] >= Math.max(22, medSat * 0.42) && cd < 58)) fullExcl[i] = 1;
          } else if (lumaArr[i] < grilleLumaLim) {
            fullExcl[i] = 1;
          }
        }
      }

      if (isChromaticCar && paintParts["roof"]) {
        const rArr = paintParts["roof"];
        for (let i = 0; i < nPix; i++) {
          if (rArr[i] && hardBgMask[i]) {
            const j = i << 2;
            const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
            const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
            if (satArr[i] < Math.max(26, medSat * 0.42) || cd > 46) rArr[i] = 0;
          }
        }
      }

      // 1. EXCLUSIÓN QUIRÚRGICA DE MOLDURAS DE VENTANA, HULES PERIMETRALES, POSTE B NEGRO Y ALETAS TRASERAS
      const moldingExcl = new Uint8Array(nPix);
      const rGasket = Math.max(3, Math.round(bhEst * 0.011));
      const rChrome = Math.max(2, Math.round(bhEst * 0.007));
      const glassTightGasket = this._dilateBool(glassMask, w, h, rGasket);
      const glassChromeRim = this._dilateBool(glassMask, w, h, rChrome);

      // Aletas aero negras únicamente a izquierda/derecha horizontales del medallón trasero (sin morder poste C)
      const rearFinHalo = new Uint8Array(nPix);
      const rRearX = Math.max(9, Math.round(bhEst * 0.032));
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let run = 0;
        for (let x = 0; x < w; x++) {
          if (rearGlassMask[row + x]) run = rRearX + 1;
          else if (run > 0) run--;
          if (run > 0 && !glassMask[row + x]) rearFinHalo[row + x] = 1;
        }
        run = 0;
        for (let x = w - 1; x >= 0; x--) {
          if (rearGlassMask[row + x]) run = rRearX + 1;
          else if (run > 0) run--;
          if (run > 0 && !glassMask[row + x]) rearFinHalo[row + x] = 1;
        }
      }

      // Escaneo geométrico por fila del Poste B exacto entre ventana delantera y ventana trasera
      const bPillarZone = new Uint8Array(nPix);
      let bpTotal = 0, bpNonPaint = 0, bpRows = 0, bpDarkRows = 0;
      const bpYMin = Math.max(0, Math.floor(hy0 + 0.05 * bhEst));
      const bpYMax = Math.min(h - 1, Math.ceil(hy0 + 0.54 * bhEst));
      const maxBpGap = Math.max(24, Math.round(bwEst * 0.075));

      for (let y = bpYMin; y <= bpYMax; y++) {
        const row = y * w;
        let fMin = w, fMax = -1, bMin = w, bMax = -1;
        for (let x = 0; x < w; x++) {
          if (sideFrontWin[row + x]) { if (x < fMin) fMin = x; if (x > fMax) fMax = x; }
          if (sideBackWin[row + x]) { if (x < bMin) bMin = x; if (x > bMax) bMax = x; }
        }
        if (fMax < 0 || bMax < 0) continue;
        let g0 = -1, g1 = -1;
        if (fMax < bMin) { g0 = fMax + 1; g1 = bMin - 1; }
        else if (bMax < fMin) { g0 = bMax + 1; g1 = fMin - 1; }
        else continue;
        const gapW = g1 - g0 + 1;
        if (gapW <= 0 || gapW > maxBpGap) continue;

        bpRows++;
        let rowHasDarkCore = false;
        const padX = Math.max(1, Math.min(2, Math.round(gapW * 0.12)));
        const ex0 = Math.max(0, g0 - padX);
        const ex1 = Math.min(w - 1, g1 + padX);
        for (let x = ex0; x <= ex1; x++) {
          const i = row + x;
          if (glassMask[i]) continue;
          bPillarZone[i] = 1;
          if (x < g0 || x > g1) continue;
          bpTotal++;
          const j = i << 2;
          const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
          const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
          const isTrim = isChromaticCar
            ? (satArr[i] < Math.max(24, medSat * 0.42) || cd > 45)
            : (medLuma >= 80 ? (lumaArr[i] < Math.max(106, medLuma * 0.70)) : lumaArr[i] < 48);
          if (isTrim) bpNonPaint++;
          if (lumaArr[i] < 70 && (!isChromaticCar || satArr[i] < 24 || cd > 45)) rowHasDarkCore = true;
        }
        if (rowHasDarkCore) bpDarkRows++;
      }
      const blackBPillarWhole = (bpTotal > 12 && (bpNonPaint / bpTotal) >= 0.28)
        || (bpRows >= 6 && (!isChromaticCar ? medLuma >= 80 : true) && (bpDarkRows / bpRows) >= 0.45 && (bpNonPaint / Math.max(1, bpTotal)) >= 0.14);

      for (let i = 0; i < nPix; i++) {
        if (glassMask[i]) { moldingExcl[i] = 1; continue; }
        const j = i << 2;
        const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
        const lum = lumaArr[i], sat = satArr[i];
        const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);

        if (bPillarZone[i]) {
          if (blackBPillarWhole) { moldingExcl[i] = 1; continue; }
          const isBpTrim = isChromaticCar
            ? (sat < Math.max(24, medSat * 0.42) || cd > 45)
            : (lum < Math.max(96, medLuma * 0.68));
          if (isBpTrim) { moldingExcl[i] = 1; continue; }
        }

        if (glassChromeRim[i]) {
          const isGasket = isChromaticCar
            ? (sat < Math.max(22, medSat * 0.36) && cd > 48)
            : (medLuma >= 78 ? (lum < Math.min(82, medLuma * 0.54) && sat < 26) : (lum < 44));
          if (isGasket) { moldingExcl[i] = 1; continue; }
        }

        if (glassTightGasket[i]) {
          const isOuterRubber = isChromaticCar
            ? (sat < Math.max(18, medSat * 0.32) && lum < 92 && cd > 42)
            : (medLuma >= 82 ? (lum < Math.min(76, medLuma * 0.50) && sat < 24) : (lum < 40));
          if (isOuterRubber) { moldingExcl[i] = 1; continue; }
        }

        if (rearFinHalo[i]) {
          const isFinTrim = isChromaticCar
            ? (sat < Math.max(20, medSat * 0.34) && lum < 85 && cd > 45)
            : (medLuma >= 78 && lum < Math.min(78, medLuma * 0.52) && sat < 24);
          if (isFinTrim) { moldingExcl[i] = 1; continue; }
        }
      }

      // 2. EXCLUSIÓN DE LLANTAS/PASARRUEDAS Y DIFUSORES/FALDONES DE PLÁSTICO SIN PINTAR
      const plasticTrimExcl = new Uint8Array(nPix);
      const wheelEdge = this._dilateBool(wheelMask, w, h, Math.max(4, Math.round(bhEst * 0.015)));
      for (let i = 0; i < nPix; i++) {
        if (wheelMask[i]) { plasticTrimExcl[i] = 1; continue; }
        if (wheelEdge[i]) {
          const j = i << 2;
          const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
          const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
          const isLiner = isChromaticCar
            ? (satArr[i] < Math.max(24, medSat * 0.38) && cd > 40)
            : (medLuma >= 75 ? lumaArr[i] < Math.max(76, medLuma * 0.56) : lumaArr[i] < 38);
          if (isLiner) plasticTrimExcl[i] = 1;
        }
      }

      // Remover antena shark-fin en el 8% superior del toldo si es protrusión oscura o angosta
      if (paintParts["roof"]) {
        const roofArr = paintParts["roof"];
        let ry0 = h, ry1 = 0;
        for (let i = 0; i < nPix; i++) {
          if (roofArr[i]) {
            const yy = (i / w) | 0;
            if (yy < ry0) ry0 = yy;
            if (yy > ry1) ry1 = yy;
          }
        }
        const antYMax = ry0 + Math.max(10, Math.round(bhEst * 0.05));
        const maxAntWidth = Math.max(14, Math.round(bwEst * 0.036));
        for (let y = ry0; y <= Math.min(ry1, antYMax); y++) {
          const row = y * w;
          let x = 0;
          while (x < w) {
            if (!roofArr[row + x]) { x++; continue; }
            const start = x;
            while (x < w && roofArr[row + x]) x++;
            const runW = x - start;
            if (runW <= maxAntWidth) {
              for (let rx = start; rx < x; rx++) {
                const idx = row + rx;
                if (!isChromaticCar && lumaArr[idx] < Math.max(115, medLuma * 0.72)) plasticTrimExcl[idx] = 1;
                else if (isChromaticCar && satArr[idx] < Math.max(24, medSat * 0.42)) plasticTrimExcl[idx] = 1;
              }
            }
          }
        }
      }

      // Flood controlado de difusor inferior en defensas/estribos para frenar exacto en la línea de diseño
      const diffuserFlood = (partArr) => {
        if (!partArr) return;
        let py0 = h, py1 = 0;
        const topLumas = [];
        for (let i = 0; i < nPix; i++) {
          if (!partArr[i] || fullExcl[i] || moldingExcl[i]) continue;
          const yy = (i / w) | 0;
          if (yy < py0) py0 = yy;
          if (yy > py1) py1 = yy;
        }
        if (py1 <= py0) return;
        const ph = py1 - py0;
        const midY = py0 + ph * 0.55;
        for (let i = 0; i < nPix; i++) {
          if (!partArr[i] || fullExcl[i] || moldingExcl[i]) continue;
          const yy = (i / w) | 0;
          if (yy <= midY && lumaArr[i] > 38) topLumas.push(lumaArr[i]);
        }
        topLumas.sort((a, b) => a - b);
        const refPaintL = topLumas.length > 15 ? topLumas[topLumas.length >> 1] : medLuma;
        const maxDiffL = Math.min(92, Math.max(66, refPaintL * 0.58));

        const fq = [];
        let fHead = 0;
        for (let y = Math.floor(py0 + ph * 0.45); y <= py1; y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            const i = row + x;
            if (partArr[i] && lumaArr[i] < 54 && satArr[i] < 24) {
              plasticTrimExcl[i] = 1;
              fq.push(i);
            }
          }
        }
        while (fHead < fq.length) {
          const cur = fq[fHead++];
          const lC = lumaArr[cur];
          const cx = cur % w, cy = (cur / w) | 0;
          const nbrs = [cy > py0 ? cur - w : -1, cy < py1 ? cur + w : -1, cx > 0 ? cur - 1 : -1, cx < w - 1 ? cur + 1 : -1];
          for (let ni = 0; ni < 4; ni++) {
            const nb = nbrs[ni];
            if (nb < 0 || !partArr[nb] || plasticTrimExcl[nb]) continue;
            if (lumaArr[nb] < maxDiffL && satArr[nb] < 26 && Math.abs(lumaArr[nb] - lC) <= 20) {
              plasticTrimExcl[nb] = 1;
              fq.push(nb);
            }
          }
        }
      };

      if (!isChromaticCar && medLuma >= 85) {
        diffuserFlood(paintParts["back-bumper"]);
        diffuserFlood(paintParts["front-bumper"]);
        diffuserFlood(paintParts["left_rocker-panel"]);
        diffuserFlood(paintParts["right_rocker-panel"]);
      }

      const trimParts = new Set(["front-bumper", "back-bumper", "left_rocker-panel", "right_rocker-panel", "left_fender", "right_fender", "left_quarter-panel", "right_quarter-panel"]);
      const achromTrimParts = new Set(["front-bumper", "back-bumper", "left_rocker-panel", "right_rocker-panel"]);
      const bodyMask = new Uint8Array(nPix);

      for (const k of Object.keys(paintParts)) {
        const arr = paintParts[k];
        const inTrim = trimParts.has(k);
        const achromTrim = !isChromaticCar && medLuma >= 85 && achromTrimParts.has(k);
        let keptCnt = 0;
        for (let i = 0; i < nPix; i++) {
          if (!arr[i]) continue;
          if (fullExcl[i] || moldingExcl[i] || plasticTrimExcl[i]) { arr[i] = 0; continue; }
          if (inTrim && isChromaticCar) {
            const j = i << 2;
            const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
            const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
            if ((lumaArr[i] < 20 && satArr[i] < 20) || (satArr[i] < Math.max(16, medSat * 0.28) && cd > 48 && lumaArr[i] < 142)) {
              arr[i] = 0; continue;
            }
          } else if (achromTrim && lumaArr[i] < 46 && satArr[i] < 20) {
            arr[i] = 0; continue;
          }
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
      const origBodyMask = new Uint8Array(bodyMask);

      // 3. CACHÉ INTERMEDIA PARA DETECCIÓN EN TIEMPO REAL CON TOLERANCIA MÁXIMA DE CARROCERÍA
      const hasRocker = Boolean(paintParts["left_rocker-panel"] || paintParts["right_rocker-panel"]);
      const pillarZone = this._dilateBool(glassMask, w, h, Math.max(42, Math.round(bh * 0.175)));
      const rockerZone = !hasRocker ? this._dilateBool(bodyMask, w, h, 14) : null;

      const basePaintParts = {};
      for (const [k, arr] of Object.entries(paintParts)) basePaintParts[k] = new Uint8Array(arr);

      this.lastCache = {
        origBodyMask,
        basePaintParts,
        basePartConfs: { ...partConfs },
        origPx,
        lumaArr,
        satArr,
        heroCarMask,
        heroCarEroded,
        hardBgMask,
        fullExcl,
        moldingExcl,
        plasticTrimExcl,
        bPillarZone,
        blackBPillarWhole,
        glassMask,
        wheelMask,
        lightMask,
        plateMask,
        reclaimedRimMask,
        pillarZone,
        rockerZone,
        medCb,
        medCy,
        medSat,
        medLuma,
        isChromaticCar,
        bx0,
        by0,
        bx1,
        by1,
        bh,
        bw,
        w,
        h,
        targetW,
        targetH,
        protectedCount
      };

      return this._solveBodyFromCache(this.lastCache, tolerance, Math.round(performance.now() - t0));
    } finally {
      yTensor.dispose?.();
      if (yOut) Object.values(yOut).forEach(t => t?.dispose?.());
    }
  }

  recomputeFromCache(tolerance = 0.88) {
    if (!this.lastCache) return null;
    const t0 = performance.now();
    return this._solveBodyFromCache(this.lastCache, tolerance, Math.round(performance.now() - t0));
  }

  _solveBodyFromCache(cache, tolerance = 0.88, inferenceMs = 0) {
    const t = Math.max(0, Math.min(1, Number(tolerance) || 0));
    const {
      origBodyMask, basePaintParts, basePartConfs, origPx, lumaArr, satArr,
      heroCarMask, heroCarEroded, hardBgMask, fullExcl, moldingExcl, plasticTrimExcl,
      bPillarZone, blackBPillarWhole, glassMask, wheelMask, plateMask, reclaimedRimMask,
      pillarZone, rockerZone, medCb, medCy, medSat, medLuma, isChromaticCar,
      bx0, by0, bx1, by1, bh, w, h, targetW, targetH, protectedCount
    } = cache;

    const nPix = w * h;
    const bodyMask = new Uint8Array(origBodyMask);
    const paintParts = {};
    for (const [k, arr] of Object.entries(basePaintParts)) paintParts[k] = new Uint8Array(arr);
    const partConfs = { ...basePartConfs };

    // Escudo estricto de exclusión: ventanas, faros, calaveras, rines, llantas, placas, parrilla, molduras y entorno
    const strictExclEdge = new Uint8Array(nPix);
    const glass1 = this._dilateBool(glassMask, w, h, 1);
    const wheel1 = this._dilateBool(wheelMask, w, h, 1);
    const plate1 = plateMask ? this._dilateBool(plateMask, w, h, 1) : null;
    for (let i = 0; i < nPix; i++) {
      let g1 = glass1[i] && !glassMask[i];
      if (g1 && isChromaticCar) {
        const j = i << 2;
        const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
        const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
        if (satArr[i] >= Math.max(28, medSat * 0.48) && cd < 40) g1 = false;
      }
      if (
        fullExcl[i] || moldingExcl[i] || plasticTrimExcl[i] ||
        g1 || wheel1[i] || (plate1 && plate1[i]) ||
        (bPillarZone[i] && blackBPillarWhole)
      ) {
        strictExclEdge[i] = 1;
        bodyMask[i] = 0;
      }
    }

    // FASE A + B: Expansión guiada por tolerancia dentro de la silueta del vehículo héroe (heroCarMask)
    const allowedGrow = new Uint8Array(nPix);
    const q = new Int32Array(nPix);
    const qDist = new Uint16Array(nPix);
    let qHead = 0, qTail = 0;
    const pMinY = by0 + 0.03 * bh, pMaxY = by0 + 0.64 * bh;
    const rMinY = by0 + 0.60 * bh;

    const chromCdMax = 44 + t * 26;
    const chromSatMin = Math.max(14, medSat * (0.42 - t * 0.16));
    const minAchromL = medLuma < 65
      ? Math.max(18, Math.round(32 - t * 10))
      : Math.max(46, medLuma * (0.52 - t * 0.12));
    const achromSatMax = 44 + t * 18;
    const fullHeroMode = t >= 0.35;
    // Acotar la expansión de tolerancia máxima a la envolvente real del vehículo (nunca trepa al entorno/letreros/autos de fondo)
    const bodyGrowHalo = fullHeroMode
      ? this._dilateBool(origBodyMask, w, h, Math.max(12, Math.round(bh * 0.055)))
      : null;
    const heroFloorY = by0 + Math.round(bh * 0.04);

    for (let y = by0; y <= by1; y++) {
      const row = y * w;
      for (let x = bx0; x <= bx1; x++) {
        const idx = row + x;
        if (bodyMask[idx]) { q[qTail++] = idx; qDist[idx] = 1; continue; }
        if (!heroCarMask[idx] || hardBgMask[idx] || strictExclEdge[idx] || bPillarZone[idx]) continue;

        const inPillarBand = pillarZone[idx] && y >= pMinY && y <= pMaxY;
        const inRockerBand = rockerZone && rockerZone[idx] && y >= rMinY && y <= by1;
        const inReclaimedRim = reclaimedRimMask[idx];
        const inSafeHeroBody = fullHeroMode && heroCarEroded[idx] && bodyGrowHalo[idx] && y >= heroFloorY;
        if (!inSafeHeroBody && !inPillarBand && !inRockerBand && !inReclaimedRim) continue;

        const j = idx << 2;
        const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
        const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
        if (isChromaticCar) {
          const strongSpecularPaint = inSafeHeroBody &&
            lumaArr[idx] >= Math.max(175, medLuma * 1.18) && lumaArr[idx] < 248 && satArr[idx] < 48;
          if ((cd < chromCdMax && satArr[idx] >= chromSatMin && lumaArr[idx] >= 20) || strongSpecularPaint || inReclaimedRim) {
            allowedGrow[idx] = 1;
          }
        } else {
          const dHi = lumaArr[idx] - medLuma;
          const dLo = medLuma - lumaArr[idx];
          const tolHi = (inRockerBand ? 105 : 85) + t * 32;
          const tolLo = (medLuma >= 90 ? 74 : 48) + t * 20;
          const coolSkyOnSilver = medLuma >= 100 && b >= g - 4 && g >= r - 8 && (r - b) <= 18 && (g - Math.max(r, b)) <= 12 && (b - r) <= 82;
          const colorOk = (satArr[idx] < achromSatMax && cd < (42 + t * 14)) || coolSkyOnSilver;
          if (colorOk && dHi <= tolHi && dLo <= tolLo && lumaArr[idx] >= minAchromL) {
            allowedGrow[idx] = 1;
            if (inRockerBand && lumaArr[idx] >= Math.max(78, medLuma * 0.54)) {
              let hasBodyAbove = false;
              for (let dy = 1; dy <= 5 && y - dy >= by0; dy++) {
                if (bodyMask[(y - dy) * w + x]) { hasBodyAbove = true; break; }
              }
              if (hasBodyAbove) {
                bodyMask[idx] = 1; q[qTail++] = idx; qDist[idx] = 1;
              }
            }
          }
        }
      }
    }

    const stepTol = 50 + Math.round(t * 26);
    const maxBfsDist = 110 + Math.round(t * 95);
    const bridgeR = t >= 0.72 ? 4 : 3;
    const allowedBridge = this._dilateBool(bodyMask, w, h, bridgeR);
    for (let i = 0; i < nPix; i++) {
      if (!bodyMask[i] && allowedGrow[i] && allowedBridge[i]) {
        bodyMask[i] = 1; qDist[i] = 1; q[qTail++] = i;
      }
    }
    while (qHead < qTail) {
      const cur = q[qHead++];
      const d = qDist[cur];
      if (d >= maxBfsDist) continue;
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

    // Asignar recuperación en zona de postes a "pillars" (el resto se propagará al panel adyacente en _healDeadPixelsAndAssignParts)
    const recoveredPillars = new Uint8Array(nPix);
    let recPillarCnt = 0;
    for (let i = 0; i < nPix; i++) {
      if (bodyMask[i] && !origBodyMask[i] && pillarZone[i]) {
        recoveredPillars[i] = 1;
        recPillarCnt++;
      }
    }
    if ((recPillarCnt / nPix) * 100.0 >= 0.20) {
      paintParts["pillars"] = recoveredPillars;
      partConfs["pillars"] = 0.85;
    }

    // Filtrado final por componentes conectadas (elimina motas o islas sueltas en fondo/reflejos)
    const cleanBodyMask = this._filterLargeComponents(bodyMask, w, h, 0.015);
    for (let i = 0; i < nPix; i++) bodyMask[i] = cleanBodyMask[i] && !strictExclEdge[i] ? 1 : 0;

    // FASE C: Cierre morfológico sensible al color + relleno de micro-huecos encerrados + asignación por panel
    const healBlocked = new Uint8Array(nPix);
    for (let i = 0; i < nPix; i++) {
      if (strictExclEdge[i] || hardBgMask[i] || (bPillarZone[i] && blackBPillarWhole)) {
        healBlocked[i] = 1;
      }
    }
    this._healDeadPixelsAndAssignParts({
      bodyMask,
      paintParts,
      partConfs,
      origPx,
      lumaArr,
      satArr,
      blockedMask: healBlocked,
      heroCarMask,
      reclaimedRimMask,
      isChromaticCar,
      medCb,
      medCy,
      medSat,
      medLuma,
      bx0: Math.max(0, bx0 - 8),
      by0: Math.max(0, by0 - 8),
      bx1: Math.min(w - 1, bx1 + 8),
      by1: Math.min(h - 1, by1 + 8),
      w,
      h,
      tolerance: t
    });

    const sortedIds = Object.keys(paintParts).sort((a, b) => (PART_LABELS_ES[a]?.[1] ?? 99) - (PART_LABELS_ES[b]?.[1] ?? 99));
    const mappedParts = [];
    for (const pid of sortedIds) {
      const arr = paintParts[pid];
      let cnt = 0;
      for (let i = 0; i < nPix; i++) {
        if (arr[i] && (!bodyMask[i] || strictExclEdge[i])) arr[i] = 0;
        if (arr[i]) cnt++;
      }
      const apct = Math.round((cnt / nPix) * 1000) / 10;
      if (apct < 0.2) continue;
      const meta = PART_LABELS_ES[pid] || [pid, 99, null];
      mappedParts.push({
        id: pid,
        label: meta[0],
        quotePartId: meta[2],
        areaPct: apct,
        confidence: Math.round((partConfs[pid] || 0.8) * 100) / 100,
        maskCanvas: this._guidedToMaskCanvas(arr, lumaArr, strictExclEdge, w, h, targetW, targetH),
        outlineCanvas: this._buildPartOutlineCanvas(arr, w, h, targetW, targetH)
      });
    }

    let finalBodyCnt = 0;
    for (let i = 0; i < nPix; i++) if (bodyMask[i]) finalBodyCnt++;

    return {
      maskCanvas: this._guidedToMaskCanvas(bodyMask, lumaArr, strictExclEdge, w, h, targetW, targetH),
      protectedMaskCanvas: this._boolToMaskCanvas(strictExclEdge, w, h, targetW, targetH, 0.8),
      vehicleDetected: true,
      bodyCoveragePct: Math.round((finalBodyCnt / nPix) * 1000) / 10,
      protectedCount,
      parts: mappedParts,
      inferenceMs,
      method: "wasm_yolo26_carparts"
    };
  }

  /**
   * Cierra grietas finas de 1-3px sensibles al color y rellena micro-huecos encerrados
   * dentro de la carrocería sin invadir molduras ni vidrios, propagando cada píxel
   * curado a la pieza adyacente en paintParts.
   */
  _healDeadPixelsAndAssignParts({
    bodyMask,
    paintParts,
    partConfs,
    origPx,
    lumaArr,
    satArr,
    blockedMask,
    heroCarMask,
    reclaimedRimMask,
    isChromaticCar,
    medCb,
    medCy,
    medSat,
    medLuma,
    bx0,
    by0,
    bx1,
    by1,
    w,
    h,
    tolerance = 0.88
  }) {
    const nPix = w * h;
    const minLumaClose = isChromaticCar ? 18 : (medLuma >= 90 ? Math.max(36, medLuma * 0.34) : 22);
    const satFloorClose = Math.max(14, medSat * (0.30 - tolerance * 0.08));

    // 1. Cierre morfológico direccional 1..3px en huecos acotados de carrocería y bordes reclamados
    const bodySnap = new Uint8Array(bodyMask);
    const rimReach = this._dilateBool(bodySnap, w, h, 3);
    for (let y = Math.max(1, by0); y <= Math.min(h - 2, by1); y++) {
      const row = y * w;
      for (let x = Math.max(1, bx0); x <= Math.min(w - 2, bx1); x++) {
        const i = row + x;
        if (bodySnap[i] || blockedMask[i] || !heroCarMask[i] || !rimReach[i]) continue;

        let hasL = false, hasR = false, hasU = false, hasD = false;
        for (let d = 1; d <= 3; d++) {
          if (!hasL && x - d >= bx0 && bodySnap[row + x - d]) hasL = true;
          if (!hasR && x + d <= bx1 && bodySnap[row + x + d]) hasR = true;
          if (!hasU && y - d >= by0 && bodySnap[(y - d) * w + x]) hasU = true;
          if (!hasD && y + d <= by1 && bodySnap[(y + d) * w + x]) hasD = true;
        }
        const bridged = (hasL && hasR) || (hasU && hasD);
        const onReclaimed = Boolean(reclaimedRimMask && reclaimedRimMask[i]);
        if (!bridged && !onReclaimed) continue;

        const j = i << 2;
        const r = origPx[j], g = origPx[j + 1], b = origPx[j + 2];
        const cd = Math.hypot((r - g) - medCb, (0.5 * (r + g) - b) - medCy);
        const lum = lumaArr[i], sat = satArr[i];
        const colorOk = isChromaticCar
          ? ((sat >= satFloorClose && cd < 58 && lum >= minLumaClose) || (bridged && lum >= 24 && sat < 45 && cd < 72))
          : (lum >= minLumaClose && cd < 52);
        if (colorOk || onReclaimed) bodyMask[i] = 1;
      }
    }

    // 2. Relleno de micro-huecos encerrados (manijas, emblemas, reflejos especulares en puertas/cofre) escalado por tolerancia
    const maxHolePx = Math.max(160, Math.min(540, Math.round(nPix * (0.0005 + tolerance * 0.00065))));
    const visited = new Uint8Array(nPix);
    const bfsQ = new Int32Array(nPix);
    const comp = [];

    for (let y = by0 + 1; y < by1; y++) {
      const row = y * w;
      for (let x = bx0 + 1; x < bx1; x++) {
        const start = row + x;
        if (bodyMask[start] || blockedMask[start] || visited[start] || !heroCarMask[start]) continue;

        let qh = 0, qt = 0;
        let touchesBorder = false;
        let blockedAdj = 0;
        comp.length = 0;

        visited[start] = 1;
        bfsQ[qt++] = start;

        while (qh < qt) {
          const cur = bfsQ[qh++];
          comp.push(cur);
          const cx = cur % w, cy = (cur / w) | 0;
          if (cx <= bx0 || cx >= bx1 || cy <= by0 || cy >= by1) touchesBorder = true;

          const n4 = [cur - 1, cur + 1, cur - w, cur + w];
          for (let ni = 0; ni < 4; ni++) {
            const nb = n4[ni];
            if (nb < 0 || nb >= nPix) { touchesBorder = true; continue; }
            if (bodyMask[nb]) continue;
            if (blockedMask[nb]) { blockedAdj++; continue; }
            if (visited[nb] || !heroCarMask[nb]) continue;
            visited[nb] = 1;
            bfsQ[qt++] = nb;
          }
          if (comp.length > maxHolePx * 3) break;
        }

        if (!touchesBorder && comp.length > 0 && comp.length <= maxHolePx && blockedAdj <= comp.length * 0.8) {
          for (let k = 0; k < comp.length; k++) {
            const idx = comp[k];
            if (!blockedMask[idx]) bodyMask[idx] = 1;
          }
        }
      }
    }

    // 3. Asignar píxeles recién curados a su panel adyacente más cercano en paintParts
    const sortedKeys = Object.keys(paintParts).sort((a, b) => (PART_LABELS_ES[a]?.[1] ?? 99) - (PART_LABELS_ES[b]?.[1] ?? 99));
    if (sortedKeys.length === 0) return;

    const owner = new Int16Array(nPix).fill(-1);
    for (let pi = 0; pi < sortedKeys.length; pi++) {
      const arr = paintParts[sortedKeys[pi]];
      for (let i = 0; i < nPix; i++) {
        if (arr[i] && bodyMask[i] && owner[i] === -1) owner[i] = pi;
      }
    }

    let missing = [];
    for (let i = 0; i < nPix; i++) {
      if (bodyMask[i] && owner[i] === -1) missing.push(i);
    }
    if (missing.length === 0) return;

    for (let pass = 0; pass < 8 && missing.length > 0; pass++) {
      const nextMissing = [];
      const toAssign = [];
      for (let k = 0; k < missing.length; k++) {
        const idx = missing[k];
        const x = idx % w, y = (idx / w) | 0;
        let foundOwner = -1;
        if (x > 0 && owner[idx - 1] >= 0) foundOwner = owner[idx - 1];
        else if (x + 1 < w && owner[idx + 1] >= 0) foundOwner = owner[idx + 1];
        else if (y > 0 && owner[idx - w] >= 0) foundOwner = owner[idx - w];
        else if (y + 1 < h && owner[idx + w] >= 0) foundOwner = owner[idx + w];
        if (foundOwner >= 0) toAssign.push(idx, foundOwner);
        else nextMissing.push(idx);
      }
      if (toAssign.length === 0) break;
      for (let k = 0; k < toAssign.length; k += 2) {
        const idx = toAssign[k], pi = toAssign[k + 1];
        owner[idx] = pi;
        paintParts[sortedKeys[pi]][idx] = 1;
      }
      missing = nextMissing;
    }

    if (missing.length > 0) {
      let fallbackKey = paintParts["pillars"] ? "pillars" : null;
      if (!fallbackKey) {
        fallbackKey = "pillars";
        paintParts[fallbackKey] = new Uint8Array(nPix);
        partConfs[fallbackKey] = 0.8;
      }
      const fbArr = paintParts[fallbackKey];
      for (let k = 0; k < missing.length; k++) fbArr[missing[k]] = 1;
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
    this.scratchCtx = this.scratchCanvas.getContext("2d", { willReadFrequently: true });

    this.tool = "ai-part"; // ai-part | ai-add | ai-sub | brush-add | brush-sub
    this.brushRadius = 24;
    this.featherRadius = 1.6;
    this.detectionTolerance = 0.88;
    this.decalMode = false;
    this.showMaskTint = true;
    this.hasImage = false;
    this.isEncoded = false;
    this.modelReady = false;
    this.lastCoveragePct = 0;

    this.detectedParts = [];
    this.protectedCount = 0;
    this.protectedMaskCanvas = null;
    this._protectedAlpha = null;
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
    this.lastSamClickPt = null;

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
    this.worker = new Worker("./js/samWorker.js?v=12", { type: "module" });
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

  async preloadModels() {
    try {
      if (!this.hasImage) this.onStatus("loading", "Precargando IA 33 (detección instantánea)…");
      await this.carPartsAI.ensureLoaded();
      if (!this.hasImage) this.onStatus("ready", "IA Dual Lista (Detección Instantánea)");
    } catch {
      // Se reintentará al cargar el vehículo
    }
  }

  recomputeWithTolerance(tolerance01) {
    this.detectionTolerance = Math.max(0, Math.min(1, Number(tolerance01) || 0));
    const res = this.carPartsAI.recomputeFromCache(this.detectionTolerance);
    if (!res || !res.vehicleDetected || !res.parts.length) return false;

    this.detectedParts = res.parts;
    this.protectedCount = res.protectedCount;
    this.protectedMaskCanvas = res.protectedMaskCanvas || null;
    this._cacheProtectedAlpha();
    this.hasCarPartsMask = true;
    this._buildHitGrid(res.parts);

    this.workingCtx.clearRect(0, 0, this.width, this.height);
    this.workingCtx.drawImage(res.maskCanvas, 0, 0, this.width, this.height);
    this._composeCombinedMask(true);
    this.onPartsDetected(res.parts, res.protectedCount, res.inferenceMs);
    this.onStatus("ready", `IA: ${res.parts.length} piezas · ${res.protectedCount} zonas protegidas`);
    return true;
  }

  async runCarPartsScan(stageCanvas) {
    const seq = ++this.analyzeSeq;
    this.onProgress(true, "Analizando vehículo con IA de 33 clases…", 20);
    this.onStatus("loading", "Escaneando piezas IA…");

    try {
      const res = await this.carPartsAI.analyzeStageCanvas(stageCanvas, this.width, this.height, (msg, pct) => {
        if (seq === this.analyzeSeq) this.onProgress(true, msg, pct);
      }, this.detectionTolerance);
      if (seq !== this.analyzeSeq) return;

      if (res.vehicleDetected && res.parts.length > 0) {
        this.detectedParts = res.parts;
        this.protectedCount = res.protectedCount;
        this.protectedMaskCanvas = res.protectedMaskCanvas || null;
        this._cacheProtectedAlpha();
        this.hasCarPartsMask = true;
        this._buildHitGrid(res.parts);

        this.workingCtx.clearRect(0, 0, this.width, this.height);
        this.workingCtx.drawImage(res.maskCanvas, 0, 0, this.width, this.height);
        this.points = [];
        this.labels = [];
        this.lastSamClickPt = null;

        this._composeCombinedMask(true);
        this.onPartsDetected(res.parts, res.protectedCount, res.inferenceMs);
        this.onStatus("ready", `IA: ${res.parts.length} piezas · ${res.protectedCount} zonas protegidas`);
      } else {
        this.hasCarPartsMask = false;
        this.protectedMaskCanvas = null;
        this._protectedAlpha = null;
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

  _cacheProtectedAlpha() {
    if (!this.protectedMaskCanvas) {
      this._protectedAlpha = null;
      return;
    }
    const w = this.width, h = this.height;
    this.scratchCtx.clearRect(0, 0, w, h);
    this.scratchCtx.drawImage(this.protectedMaskCanvas, 0, 0, w, h);
    const data = this.scratchCtx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[(i << 2) + 3];
    this._protectedAlpha = alpha;
  }

  _sampleSamGuardPoints(cx, cy, mode) {
    const w = this.width, h = this.height;
    const combData = this.combinedCtx.getImageData(0, 0, w, h).data;
    const protAlpha = this._protectedAlpha;
    const guards = [];
    const minDim = Math.min(w, h);
    const radii = [
      Math.max(26, Math.round(minDim * 0.085)),
      Math.max(52, Math.round(minDim * 0.17)),
      Math.max(96, Math.round(minDim * 0.30))
    ];
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]
    ];

    const protGuards = [];
    const emptyGuards = [];
    const bodyGuards = [];

    for (let ri = 0; ri < radii.length; ri++) {
      const r = radii[ri];
      for (let di = 0; di < dirs.length; di++) {
        const px = Math.round(cx + dirs[di][0] * r);
        const py = Math.round(cy + dirs[di][1] * r);
        if (px < 4 || px >= w - 4 || py < 4 || py >= h - 4) continue;
        const idx = py * w + px;
        const ca = combData[(idx << 2) + 3];
        const pa = protAlpha ? protAlpha[idx] : 0;

        if (pa > 155 && r >= 24 && protGuards.length < 2) {
          protGuards.push([px, py]);
        } else if (ca < 10 && pa < 40 && r >= radii[1] && emptyGuards.length < 2) {
          emptyGuards.push([px, py]);
        } else if (ca > 200 && pa < 40 && r >= 34 && bodyGuards.length < 3) {
          bodyGuards.push([px, py]);
        }
      }
    }

    if (emptyGuards.length === 0) {
      const corners = [[14, 14], [w - 15, 14], [14, h - 15], [w - 15, h - 15]];
      for (const [qx, qy] of corners) {
        if (Math.hypot(qx - cx, qy - cy) < 60) continue;
        const idx = qy * w + qx;
        if (combData[(idx << 2) + 3] < 10 && (!protAlpha || protAlpha[idx] < 40)) {
          emptyGuards.push([qx, qy]);
          break;
        }
      }
    }

    if (mode === "subtract") {
      // Para excluir un defecto/moldura/cielo sin borrar toda la carrocería, anclamos negativos en la pintura ya válida
      for (const p of bodyGuards.slice(0, 2)) guards.push(p);
      if (protGuards.length > 0 && guards.length < 3) guards.push(protGuards[0]);
      if (guards.length < 3 && emptyGuards.length > 0) guards.push(emptyGuards[0]);
    } else {
      // Para añadir pieza/grieta, anclamos negativos en vidrios/rines protegidos y en el fondo vacío
      for (const p of protGuards.slice(0, 2)) guards.push(p);
      for (const p of emptyGuards.slice(0, Math.max(1, 3 - guards.length))) guards.push(p);
    }
    return guards;
  }

  _isolateConnectedComponent(bin, w, h, cx, cy, maxSeedDist = 20) {
    let seed = -1;
    let bestDist2 = maxSeedDist * maxSeedDist + 1;
    const x0 = Math.max(0, Math.floor(cx - maxSeedDist));
    const x1 = Math.min(w - 1, Math.ceil(cx + maxSeedDist));
    const y0 = Math.max(0, Math.floor(cy - maxSeedDist));
    const y1 = Math.min(h - 1, Math.ceil(cy + maxSeedDist));

    for (let y = y0; y <= y1; y++) {
      const row = y * w;
      for (let x = x0; x <= x1; x++) {
        const idx = row + x;
        if (bin[idx] <= 24) continue;
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 < bestDist2) {
          bestDist2 = d2;
          seed = idx;
        }
      }
    }
    if (seed < 0) return false;

    const keep = new Uint8Array(bin.length);
    const q = new Int32Array(bin.length);
    let qh = 0, qt = 0;
    keep[seed] = 1;
    q[qt++] = seed;

    while (qh < qt) {
      const cur = q[qh++];
      const x = cur % w, y = (cur / w) | 0;
      if (x > 0 && bin[cur - 1] > 20 && !keep[cur - 1]) { keep[cur - 1] = 1; q[qt++] = cur - 1; }
      if (x + 1 < w && bin[cur + 1] > 20 && !keep[cur + 1]) { keep[cur + 1] = 1; q[qt++] = cur + 1; }
      if (y > 0 && bin[cur - w] > 20 && !keep[cur - w]) { keep[cur - w] = 1; q[qt++] = cur - w; }
      if (y + 1 < h && bin[cur + w] > 20 && !keep[cur + w]) { keep[cur + w] = 1; q[qt++] = cur + w; }
    }
    for (let i = 0; i < bin.length; i++) if (!keep[i]) bin[i] = 0;
    return true;
  }

  _dispatchSegment(preferFullObject = true, mode = "replace", singlePt = null, singleLabel = 1) {
    this.renderOverlay();
    const requestId = ++this.requestSeq;
    let ptsToSend = this.points;
    let lblsToSend = this.labels;
    let samTask = "full";

    if (singlePt && (mode === "add" || mode === "subtract")) {
      const guards = this._sampleSamGuardPoints(singlePt[0], singlePt[1], mode);
      ptsToSend = [singlePt, ...guards];
      lblsToSend = [singleLabel, ...guards.map(() => 0)];
      samTask = "refine";
    }

    this.pendingSamMode = mode;
    this.onProgress(true, mode === "subtract" ? "Excluyendo pieza seleccionada…" : "Refinando zona con SlimSAM…", 70);
    this.worker.postMessage({
      type: "segment",
      payload: { requestId, points: ptsToSend, labels: lblsToSend, preferFullObject, samTask, mode }
    });
  }

  triggerAutoSegment() {
    this.lastSamClickPt = null;
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
      // Refina incrementalmente sobre CarParts 33 manteniendo anclas negativas locales y sin invadir vidrios/rines
      const mode = label === 0 ? "subtract" : "add";
      this.lastSamClickPt = pt;
      this._dispatchSegment(false, mode, pt, 1);
    } else {
      this.lastSamClickPt = null;
      this._dispatchSegment(this.points.length <= 2, "replace");
    }
  }

  _applySamMask(maskBuffer, w, h, mode = "replace") {
    const bin = new Uint8Array(maskBuffer);
    if ((mode === "add" || mode === "subtract") && this.lastSamClickPt) {
      const [cx, cy] = this.lastSamClickPt;
      const isolated = this._isolateConnectedComponent(bin, w, h, cx, cy, 22);
      if (!isolated) bin.fill(0);

      if (mode === "add" && this._protectedAlpha && this._protectedAlpha.length === bin.length) {
        const scx = Math.max(0, Math.min(w - 1, Math.round(cx)));
        const scy = Math.max(0, Math.min(h - 1, Math.round(cy)));
        const clickedProtected = this._protectedAlpha[scy * w + scx] > 160;
        const guardR = clickedProtected ? 34 : 12;
        const guardR2 = guardR * guardR;
        for (let i = 0; i < bin.length; i++) {
          if (bin[i] === 0 || this._protectedAlpha[i] <= 160) continue;
          const px = i % w, py = (i / w) | 0;
          if ((px - scx) * (px - scx) + (py - scy) * (py - scy) > guardR2) {
            bin[i] = 0;
          }
        }
      }
    }

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
    this.lastSamClickPt = null;
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
