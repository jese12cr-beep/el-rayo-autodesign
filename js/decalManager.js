/* El Rayo — Gestor de Viniles + Motor Geométrico 3D Contorneado (SVG, PNG y Franjas Adaptativas) */

export const DECAL_CATALOG = [
  {
    id: "double-thin-contour",
    name: "Franjas Dobles Finas 3D",
    tintable: true,
    defaultColor: "#ffffff",
    defaultScale: 1.0,
    contourSpec: {
      zone: "doors",
      style: "double-thin",
      bandPos: 0.56,
      thicknessPx: 6,
      gapPx: 5,
      taper: 0.78
    },
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120">
      <path d="M18 68 Q185 48 342 36" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
      <path d="M18 82 Q185 62 342 49" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
    </svg>`
  },
  {
    id: "racing-stripes",
    name: "Franjas Racing",
    tintable: true,
    defaultColor: "#ffffff",
    defaultScale: 0.9,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">
      <rect x="78" y="10" width="66" height="200" rx="4" fill="currentColor"/>
      <rect x="176" y="10" width="66" height="200" rx="4" fill="currentColor"/>
      <rect x="54" y="10" width="12" height="200" rx="2" fill="currentColor"/>
      <rect x="254" y="10" width="12" height="200" rx="2" fill="currentColor"/>
    </svg>`
  },
  {
    id: "side-stripe",
    name: "Franja Lateral",
    tintable: true,
    defaultColor: "#dc2626",
    defaultScale: 1.15,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 120">
      <polygon points="10,48 410,28 398,66 4,82" fill="currentColor"/>
      <polygon points="18,90 385,73 378,92 12,106" fill="currentColor"/>
    </svg>`
  },
  {
    id: "checkered-flag",
    name: "Ajedrez",
    tintable: true,
    defaultColor: "#f8fafc",
    defaultScale: 0.78,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 120">
      <g fill="currentColor">
        <rect x="10" y="12" width="38" height="32"/><rect x="86" y="12" width="38" height="32"/>
        <rect x="162" y="12" width="38" height="32"/><rect x="238" y="12" width="32" height="32"/>
        <rect x="48" y="44" width="38" height="32"/><rect x="124" y="44" width="38" height="32"/>
        <rect x="200" y="44" width="38" height="32"/>
        <rect x="10" y="76" width="38" height="32"/><rect x="86" y="76" width="38" height="32"/>
        <rect x="162" y="76" width="38" height="32"/><rect x="238" y="76" width="32" height="32"/>
      </g>
    </svg>`
  },
  {
    id: "number-01",
    name: "Dorsal #01",
    tintable: true,
    defaultColor: "#ffffff",
    defaultScale: 0.62,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="96" fill="none" stroke="currentColor" stroke-width="14"/>
      <text x="110" y="136" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="94" font-weight="900" fill="currentColor">01</text>
    </svg>`
  },
  {
    id: "emblem-4x4",
    name: "Emblema 4x4",
    tintable: true,
    defaultColor: "#dc2626",
    defaultScale: 0.65,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">
      <rect x="8" y="14" width="304" height="92" rx="14" fill="none" stroke="currentColor" stroke-width="10"/>
      <text x="160" y="79" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="66" font-weight="900" letter-spacing="4" fill="currentColor">4x4</text>
    </svg>`
  },
  {
    id: "seal-el-rayo",
    name: "Sello El Rayo",
    tintable: false,
    defaultColor: "#ffffff",
    defaultScale: 0.52,
    imageSrc: "./assets/logo_el_rayo.png"
  }
];

function svgToDataUrl(svgString, color) {
  const colored = svgString.replaceAll("currentColor", color || "#ffffff");
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(colored);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitRobustLine(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    num += dx * (ys[i] - my);
    den += dx * dx;
  }
  const slope = den > 1e-3 ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function medianOf(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export class DecalManager {
  constructor(decalCanvas, { width = 1280, height = 720, onChange } = {}) {
    this.canvas = decalCanvas;
    this.ctx = decalCanvas.getContext("2d");
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.workCanvas = document.createElement("canvas");
    this.workCanvas.width = width;
    this.workCanvas.height = height;
    this.workCtx = this.workCanvas.getContext("2d", { willReadFrequently: true });

    this.stripeCanvas = document.createElement("canvas");
    this.stripeCanvas.width = width;
    this.stripeCanvas.height = height;
    this.stripeCtx = this.stripeCanvas.getContext("2d", { willReadFrequently: true });

    this.onChange = onChange || (() => {});
    this.decals = [];
    this.selectedId = null;
    this.lastMaskCanvas = null;
    this.stageCanvas = null;
    this.stagePx = null;
    this.detectedParts = [];
    this.vehicleGeometry = null;

    this.dragState = null;
    this.handleCoords = null;
  }

  setSceneContext({ stageCanvas = null, detectedParts = [], bodyMaskCanvas = null } = {}) {
    if (stageCanvas) {
      this.stageCanvas = stageCanvas;
      const sctx = stageCanvas.getContext("2d", { willReadFrequently: true });
      this.stagePx = sctx ? sctx.getImageData(0, 0, this.width, this.height).data : null;
    }
    if (Array.isArray(detectedParts)) {
      this.detectedParts = detectedParts;
    }
    if (bodyMaskCanvas) {
      this.lastMaskCanvas = bodyMaskCanvas;
    }
    this.vehicleGeometry = this._extractVehicleGeometry(this.detectedParts, this.lastMaskCanvas);
    this.render(this.lastMaskCanvas);
  }

  _buildUnionMask(partIds, fallbackCanvas = null) {
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    let drawn = 0;
    for (const id of partIds) {
      const p = this.detectedParts.find(item => item.id === id);
      if (p?.maskCanvas) {
        ctx.drawImage(p.maskCanvas, 0, 0, this.width, this.height);
        drawn++;
      }
    }
    if (!drawn && fallbackCanvas) {
      ctx.drawImage(fallbackCanvas, 0, 0, this.width, this.height);
    }
    return { canvas: c, count: drawn };
  }

  _extractColumnProfile(maskCanvas, gridW = 320, gridH = 180) {
    if (!maskCanvas) return null;
    const gc = document.createElement("canvas");
    gc.width = gridW;
    gc.height = gridH;
    const gctx = gc.getContext("2d");
    gctx.drawImage(maskCanvas, 0, 0, gridW, gridH);
    const px = gctx.getImageData(0, 0, gridW, gridH).data;

    const sx = this.width / gridW;
    const sy = this.height / gridH;
    const rawCols = [];
    for (let x = 0; x < gridW; x++) {
      // Buscar el segmento inferior continuo de puerta para evitar saltos por poste A/B/espejo
      let yBotG = -1;
      for (let y = gridH - 1; y >= 0; y--) {
        if (px[(y * gridW + x) * 4 + 3] > 95) {
          yBotG = y;
          break;
        }
      }
      if (yBotG < 0) continue;
      let yTopG = yBotG;
      let misses = 0;
      for (let y = yBotG; y >= 0; y--) {
        if (px[(y * gridW + x) * 4 + 3] > 95) {
          yTopG = y;
          misses = 0;
        } else {
          misses++;
          if (misses >= 3) break;
        }
      }
      const hPx = (yBotG - yTopG) * sy;
      if (hPx >= 24) {
        rawCols.push({ x: x * sx + sx * 0.5, yTop: yTopG * sy, yBot: yBotG * sy, h: hPx });
      }
    }
    if (rawCols.length < 5) return null;

    const medHAll = medianOf(rawCols.map(c => c.h));
    const coreCols = rawCols.filter((c, i) => {
      const frac = i / (rawCols.length - 1);
      return frac >= 0.08 && frac <= 0.92 && c.h >= medHAll * 0.62 && c.h <= medHAll * 1.28;
    });
    const fitSet = coreCols.length >= 4 ? coreCols : rawCols;

    // 1. Ajuste proyectivo robusto de la línea inferior (estribo / borde bajo de puerta)
    const botLine = fitRobustLine(fitSet.map(c => c.x), fitSet.map(c => c.yBot));
    const botInliersX = [], botInliersY = [];
    for (let i = 0; i < fitSet.length; i++) {
      const pred = botLine.slope * fitSet[i].x + botLine.intercept;
      if (Math.abs(fitSet[i].yBot - pred) <= Math.max(18, medHAll * 0.14)) {
        botInliersX.push(fitSet[i].x);
        botInliersY.push(fitSet[i].yBot);
      }
    }
    const botFinal = botInliersX.length >= 3 ? fitRobustLine(botInliersX, botInliersY) : botLine;

    // 2. Ajuste proyectivo de la línea de cintura (descartando picos en poste A/C/espejo)
    const cleanTopCandidates = fitSet.map(c => {
      const estBot = botFinal.slope * c.x + botFinal.intercept;
      return { x: c.x, yTop: Math.max(estBot - medHAll * 1.15, c.yTop) };
    });
    const topLine = fitRobustLine(cleanTopCandidates.map(c => c.x), cleanTopCandidates.map(c => c.yTop));
    const topInliersX = [], topInliersY = [];
    for (const c of cleanTopCandidates) {
      const pred = topLine.slope * c.x + topLine.intercept;
      if (Math.abs(c.yTop - pred) <= Math.max(18, medHAll * 0.16)) {
        topInliersX.push(c.x);
        topInliersY.push(c.yTop);
      }
    }
    const topFinal = topInliersX.length >= 3 ? fitRobustLine(topInliersX, topInliersY) : topLine;

    // 3. Curvatura automotriz suave y continua (elimina ondas por manijas o postes)
    const xStart = rawCols[0].x;
    const xEnd = rawCols[rawCols.length - 1].x;
    const spanX = Math.max(60, xEnd - xStart);
    const points = [];
    for (let x = xStart; x <= xEnd; x += 6) {
      const u = ((x - xStart) / spanX) * 2 - 1;
      const camber = 5.0 * (1 - u * u);
      const yT = topFinal.slope * x + topFinal.intercept + camber * 0.35;
      const yB = botFinal.slope * x + botFinal.intercept + camber;
      points.push({ x, yTop: yT, yBot: yB, h: Math.max(24, yB - yT) });
    }
    const medH = medianOf(points.map(p => p.h)) || medHAll;

    return {
      xMin: xStart,
      xMax: xEnd,
      medH,
      topLine: topFinal,
      botLine: botFinal,
      points
    };
  }

  _extractHoodSpineProfile(maskCanvas, gridW = 320, gridH = 180) {
    if (!maskCanvas) return null;
    const gc = document.createElement("canvas");
    gc.width = gridW;
    gc.height = gridH;
    const gctx = gc.getContext("2d");
    gctx.drawImage(maskCanvas, 0, 0, gridW, gridH);
    const px = gctx.getImageData(0, 0, gridW, gridH).data;

    const sx = this.width / gridW;
    const sy = this.height / gridH;
    const rows = [];
    for (let y = 0; y < gridH; y++) {
      let xMin = gridW, xMax = -1, cnt = 0;
      const row = y * gridW;
      for (let x = 0; x < gridW; x++) {
        if (px[(row + x) * 4 + 3] > 80) {
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          cnt++;
        }
      }
      if (cnt >= 6) {
        const w = (xMax - xMin) * sx;
        rows.push({ y: y * sy + sy * 0.5, xL: xMin * sx, xR: xMax * sx, xMid: 0.5 * (xMin + xMax) * sx, w });
      }
    }
    if (rows.length < 4) return null;

    // Ajuste lineal robusto en banda central (18%-82%) para proyectar perspectiva real del cofre hacia el frente
    const i0 = Math.floor(rows.length * 0.18);
    const i1 = Math.max(i0 + 2, Math.ceil(rows.length * 0.82));
    const core = rows.slice(i0, i1);
    let sySum = 0, sxSum = 0, swSum = 0, n = core.length;
    for (const r of core) { sySum += r.y; sxSum += r.xMid; swSum += r.w; }
    const my = sySum / n, mx = sxSum / n, mw = swSum / n;
    let numX = 0, numW = 0, den = 0;
    for (const r of core) {
      const dy = r.y - my;
      numX += dy * (r.xMid - mx);
      numW += dy * (r.w - mw);
      den += dy * dy;
    }
    const slopeX = den > 1e-3 ? numX / den : 0;
    const slopeW = den > 1e-3 ? numW / den : 0;
    const clampedSlopeX = Math.max(-2.2, Math.min(2.2, slopeX));

    return {
      yMin: rows[0].y,
      yMax: rows[rows.length - 1].y,
      medW: mw,
      points: rows.map(r => ({
        y: r.y,
        xCenter: mx + clampedSlopeX * (r.y - my),
        w: Math.max(40, mw + slopeW * 0.75 * (r.y - my))
      }))
    };
  }

  _extractVehicleGeometry(detectedParts = [], fallbackBodyMask = null) {
    const partArea = id => detectedParts.find(p => p.id === id)?.areaPct || 0;
    const leftScore = partArea("left_front-door") + partArea("left_back-door") + partArea("left_fender") + partArea("left_quarter-panel");
    const rightScore = partArea("right_front-door") + partArea("right_back-door") + partArea("right_fender") + partArea("right_quarter-panel");
    const sidePrefix = rightScore > leftScore ? "right" : "left";

    const doorIds = [`${sidePrefix}_front-door`, `${sidePrefix}_back-door`];
    const sideIds = [`${sidePrefix}_fender`, `${sidePrefix}_front-door`, `${sidePrefix}_back-door`, `${sidePrefix}_quarter-panel`, `${sidePrefix}_rocker-panel`];
    const rockerIds = [`${sidePrefix}_rocker-panel`, `${sidePrefix}_front-door`, `${sidePrefix}_back-door`];

    const doorsUnion = this._buildUnionMask(doorIds, fallbackBodyMask);
    const sideUnion = this._buildUnionMask(sideIds, fallbackBodyMask);
    const rockerUnion = this._buildUnionMask(rockerIds, doorsUnion.canvas);
    const hoodUnion = this._buildUnionMask(["hood"], fallbackBodyMask);
    const roofUnion = this._buildUnionMask(["roof"], fallbackBodyMask);
    const trunkUnion = this._buildUnionMask(["trunk"], fallbackBodyMask);

    const doorsProfile = this._extractColumnProfile(doorsUnion.canvas);
    // Extender suavemente los ejes proyectivos de las puertas sobre salpicadera y costado sin brincar sobre rines
    let sideExtendedProfile = doorsProfile;
    if (doorsProfile && sideUnion.count > doorsUnion.count) {
      const rawSide = this._extractColumnProfile(sideUnion.canvas);
      if (rawSide) {
        const { topLine, botLine, medH } = doorsProfile;
        const x0 = rawSide.xMin;
        const x1 = rawSide.xMax;
        const span = Math.max(60, x1 - x0);
        const points = [];
        for (let x = x0; x <= x1; x += 6) {
          const u = ((x - x0) / span) * 2 - 1;
          const camber = 5.5 * (1 - u * u);
          const yT = topLine.slope * x + topLine.intercept + camber * 0.35;
          const yB = botLine.slope * x + botLine.intercept + camber;
          points.push({ x, yTop: yT, yBot: yB, h: Math.max(24, yB - yT) });
        }
        sideExtendedProfile = { xMin: x0, xMax: x1, medH, topLine, botLine, points };
      }
    }

    return {
      sidePrefix,
      hasDoors: doorsUnion.count > 0,
      hasHood: hoodUnion.count > 0,
      hasRoof: roofUnion.count > 0,
      masks: {
        doors: doorsUnion.canvas,
        side: sideUnion.canvas,
        rocker: rockerUnion.canvas,
        hood: hoodUnion.canvas,
        roof: roofUnion.canvas,
        trunk: trunkUnion.canvas,
        full: fallbackBodyMask
      },
      profiles: {
        doors: doorsProfile,
        side: sideExtendedProfile,
        hood: this._extractHoodSpineProfile(hoodUnion.canvas),
        roof: this._extractHoodSpineProfile(roofUnion.canvas)
      }
    };
  }

  async addFromCatalog(templateId) {
    const tpl = DECAL_CATALOG.find(item => item.id === templateId);
    if (!tpl) return null;

    if (tpl.contourSpec) {
      return this.addContouredStripe({
        name: tpl.name,
        color: tpl.defaultColor,
        scale: tpl.defaultScale,
        ...tpl.contourSpec
      });
    }

    const src = tpl.svg ? svgToDataUrl(tpl.svg, tpl.defaultColor) : tpl.imageSrc;
    const img = await loadImage(src);

    const decal = {
      id: `dec_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      kind: "raster",
      templateId: tpl.id,
      name: tpl.name,
      tintable: tpl.tintable,
      svgTemplate: tpl.svg || null,
      rawSrc: tpl.svg ? null : tpl.imageSrc,
      color: tpl.defaultColor,
      x: this.width * 0.5,
      y: this.height * 0.52,
      scale: tpl.defaultScale,
      rotationDeg: 0,
      opacity: 0.94,
      clipToBody: true,
      img
    };

    this.decals.push(decal);
    this.selectedId = decal.id;
    this.render();
    this.onChange();
    return decal;
  }

  addContouredStripe(spec = {}) {
    const contourSpec = {
      zone: spec.zone || "doors", // 'doors' | 'side' | 'rocker' | 'hood' | 'roof'
      style: spec.style || "double-thin", // 'double-thin' | 'double-racing' | 'single' | 'triple' | 'spear'
      bandPos: typeof spec.bandPos === "number" ? spec.bandPos : 0.56,
      thicknessPx: typeof spec.thicknessPx === "number" ? spec.thicknessPx : 6,
      gapPx: typeof spec.gapPx === "number" ? spec.gapPx : 5,
      taper: typeof spec.taper === "number" ? spec.taper : 0.78
    };

    const decal = {
      id: `dec_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      kind: "contour-stripe",
      templateId: `contour-${contourSpec.style}`,
      name: spec.name || "Franjas Contorneadas 3D",
      tintable: true,
      svgTemplate: null,
      rawSrc: null,
      contourSpec,
      color: spec.color || "#ffffff",
      x: this.width * 0.5,
      y: this.height * 0.52,
      scale: typeof spec.scale === "number" ? spec.scale : 1.0,
      rotationDeg: typeof spec.rotationDeg === "number" ? spec.rotationDeg : 0,
      opacity: typeof spec.opacity === "number" ? spec.opacity : 0.93,
      clipToBody: spec.clipToBody !== false,
      lastBounds: null,
      img: null
    };

    this.decals.push(decal);
    this.selectedId = decal.id;
    this.render();
    this.onChange();
    return decal;
  }

  clearByKind(kind) {
    this.decals = this.decals.filter(d => d.kind !== kind);
    if (this.selectedId && !this.decals.some(d => d.id === this.selectedId)) {
      this.selectedId = this.decals.length ? this.decals[this.decals.length - 1].id : null;
    }
    this.render();
    this.onChange();
  }

  async addCustomFile(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const img = await loadImage(dataUrl);
    const decal = {
      id: `dec_${Date.now()}_${Math.floor(Math.random() * 999)}`,
      kind: "raster",
      templateId: "custom",
      name: (file.name || "Logo").replace(/\.[^.]+$/, "").slice(0, 22),
      tintable: false,
      svgTemplate: null,
      rawSrc: dataUrl,
      color: "#ffffff",
      x: this.width * 0.5,
      y: this.height * 0.5,
      scale: 0.65,
      rotationDeg: 0,
      opacity: 0.95,
      clipToBody: true,
      img
    };

    this.decals.push(decal);
    this.selectedId = decal.id;
    this.render();
    this.onChange();
    return decal;
  }

  getSelected() {
    return this.decals.find(d => d.id === this.selectedId) || null;
  }

  select(id) {
    this.selectedId = id;
    this.onChange();
  }

  deleteDecal(id) {
    const idx = this.decals.findIndex(d => d.id === id);
    if (idx === -1) return false;
    this.decals.splice(idx, 1);
    if (this.selectedId === id) {
      this.selectedId = this.decals.length ? this.decals[this.decals.length - 1].id : null;
    }
    this.render();
    this.onChange();
    return true;
  }

  async updateSelected(props) {
    const d = this.getSelected();
    if (!d) return;

    const colorChanged = props.color && props.color !== d.color;
    Object.assign(d, props);

    if (colorChanged && d.svgTemplate) {
      d.img = await loadImage(svgToDataUrl(d.svgTemplate, d.color));
    }

    this.render();
    this.onChange();
  }

  _drawDimensions(decal) {
    if (decal.kind === "contour-stripe") {
      if (decal.lastBounds) {
        return { w: decal.lastBounds.w, h: decal.lastBounds.h };
      }
      return { w: 420 * decal.scale, h: 90 * decal.scale };
    }
    const baseW = decal.img?.naturalWidth || decal.img?.width || 220;
    const baseH = decal.img?.naturalHeight || decal.img?.height || 140;
    const fit = Math.min(280 / Math.max(1, baseW), 220 / Math.max(1, baseH), 1.8);
    return {
      w: baseW * fit * decal.scale,
      h: baseH * fit * decal.scale
    };
  }

  _buildOffsetsForStyle(style, thicknessPx, gapPx, scale = 1.0) {
    const t = Math.max(2, thicknessPx * scale);
    const g = Math.max(2, gapPx * scale);
    if (style === "single") {
      return [{ offset: 0, width: t * 1.45 }];
    }
    if (style === "double-racing") {
      const main = Math.max(14, t * 2.6);
      const pin = Math.max(3, t * 0.55);
      const cGap = Math.max(8, g * 1.6);
      return [
        { offset: -(cGap * 0.5 + main * 0.5), width: main },
        { offset: cGap * 0.5 + main * 0.5, width: main },
        { offset: -(cGap * 0.5 + main + g + pin * 0.5), width: pin },
        { offset: cGap * 0.5 + main + g + pin * 0.5, width: pin }
      ];
    }
    if (style === "triple") {
      const mid = t * 1.25;
      const side = Math.max(2.5, t * 0.65);
      const step = mid * 0.5 + g + side * 0.5;
      return [
        { offset: 0, width: mid },
        { offset: -step, width: side },
        { offset: step, width: side }
      ];
    }
    if (style === "spear") {
      return [
        { offset: -t * 0.7, width: t * 1.2, isSpear: true },
        { offset: t * 0.9, width: Math.max(2.5, t * 0.55), isSpear: true }
      ];
    }
    // default 'double-thin': franjas dobles muy delgadas y limpias
    const step = t * 0.5 + g * 0.5;
    return [
      { offset: -step, width: t },
      { offset: step, width: t }
    ];
  }

  _applyVehicleLightingToCanvas(canvasCtx, bx, by, bw, bh) {
    if (!this.stagePx) return;
    const x0 = Math.max(0, Math.floor(bx));
    const y0 = Math.max(0, Math.floor(by));
    const x1 = Math.min(this.width - 1, Math.ceil(bx + bw));
    const y1 = Math.min(this.height - 1, Math.ceil(by + bh));
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 2 || h <= 2) return;

    const img = canvasCtx.getImageData(x0, y0, w, h);
    const px = img.data;
    const spx = this.stagePx;

    // Mediana de luminancia bajo las franjas para normalizar sombras reales e iluminación de cabina
    const lums = [];
    for (let ry = 0; ry < h; ry += 2) {
      const sy = y0 + ry;
      for (let rx = 0; rx < w; rx += 2) {
        const j = (ry * w + rx) << 2;
        if (px[j + 3] < 40) continue;
        const sj = (sy * this.width + (x0 + rx)) << 2;
        lums.push(0.299 * spx[sj] + 0.587 * spx[sj + 1] + 0.114 * spx[sj + 2]);
      }
    }
    if (lums.length < 6) return;
    lums.sort((a, b) => a - b);
    const refLum = Math.max(38, lums[lums.length >> 1]);

    for (let ry = 0; ry < h; ry++) {
      const sy = y0 + ry;
      for (let rx = 0; rx < w; rx++) {
        const j = (ry * w + rx) << 2;
        if (px[j + 3] === 0) continue;
        const sj = (sy * this.width + (x0 + rx)) << 2;
        const carLum = 0.299 * spx[sj] + 0.587 * spx[sj + 1] + 0.114 * spx[sj + 2];
        const ratio = carLum / refLum;
        // Modulación física: junta de puerta / sombra baja brillo suavemente y reflejos de barniz aclaran
        const shade = Math.max(0.42, Math.min(1.16, 0.46 + 0.56 * ratio));
        const spec = carLum > 205 ? (carLum - 205) * 0.55 : 0;
        px[j] = Math.min(255, Math.round(px[j] * shade + spec));
        px[j + 1] = Math.min(255, Math.round(px[j + 1] * shade + spec));
        px[j + 2] = Math.min(255, Math.round(px[j + 2] * shade + spec));
      }
    }
    canvasCtx.putImageData(img, x0, y0);
  }

  _drawContouredStripeDecal(targetCtx, d, fallbackBodyMask) {
    const geom = this.vehicleGeometry;
    const spec = d.contourSpec || {};
    const zone = spec.zone || "doors";
    const sctx = this.stripeCtx;
    sctx.clearRect(0, 0, this.width, this.height);

    const verticalOffset = (d.y - this.height * 0.52) / 260;
    const bandPos = Math.max(0.12, Math.min(0.88, (spec.bandPos ?? 0.56) + verticalOffset));
    const bands = this._buildOffsetsForStyle(spec.style, spec.thicknessPx ?? 6, spec.gapPx ?? 5, d.scale);

    let clipMask = fallbackBodyMask;
    let bx0 = this.width, by0 = this.height, bx1 = 0, by1 = 0;

    if ((zone === "hood" || zone === "roof") && geom?.profiles?.[zone]) {
      const prof = geom.profiles[zone];
      clipMask = (d.clipToBody && geom.masks[zone]) ? geom.masks[zone] : fallbackBodyMask;
      const pts = prof.points;
      const horizShift = d.x - this.width * 0.5;
      const rotRad = ((d.rotationDeg || 0) * Math.PI) / 180;
      const midPt = pts[pts.length >> 1];

      for (const band of bands) {
        sctx.beginPath();
        const leftSide = [];
        const rightSide = [];
        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          const wScale = pt.w / Math.max(40, prof.medW);
          const halfT = Math.max(1.2, band.width * 0.5 * (0.65 + 0.35 * wScale));
          const cOffset = band.offset * (0.62 + 0.38 * wScale);
          const cx = pt.xCenter + horizShift * 0.5 + cOffset + Math.tan(rotRad) * (pt.y - midPt.y);
          leftSide.push([cx - halfT, pt.y]);
          rightSide.push([cx + halfT, pt.y]);
          bx0 = Math.min(bx0, cx - halfT - 4);
          bx1 = Math.max(bx1, cx + halfT + 4);
          by0 = Math.min(by0, pt.y - 4);
          by1 = Math.max(by1, pt.y + 4);
        }
        sctx.moveTo(leftSide[0][0], leftSide[0][1]);
        for (let i = 1; i < leftSide.length; i++) sctx.lineTo(leftSide[i][0], leftSide[i][1]);
        for (let i = rightSide.length - 1; i >= 0; i--) sctx.lineTo(rightSide[i][0], rightSide[i][1]);
        sctx.closePath();
        sctx.fillStyle = d.color || "#ffffff";
        sctx.fill();
      }
    } else if (geom?.profiles?.[zone === "side" ? "side" : "doors"] || geom?.profiles?.doors) {
      const useSide = zone === "side" && geom.profiles.side;
      const prof = useSide ? geom.profiles.side : (geom.profiles.doors || geom.profiles.side);
      clipMask = (d.clipToBody && geom.masks[zone]) ? geom.masks[zone] : (d.clipToBody ? (geom.masks.side || fallbackBodyMask) : fallbackBodyMask);
      const pts = prof.points;
      const midPt = pts[pts.length >> 1];
      const rotRad = ((d.rotationDeg || 0) * Math.PI) / 180;
      const shiftX = (d.x - this.width * 0.5) * 0.35;

      for (const band of bands) {
        const upper = [];
        const lower = [];
        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          const progress = i / Math.max(1, pts.length - 1);
          const persp = pt.h / Math.max(24, prof.medH);
          const spearFactor = band.isSpear ? Math.max(0.22, 1.0 - 0.72 * Math.pow(progress, 1.35)) : 1.0;
          const halfT = Math.max(1.2, band.width * 0.5 * (1 - (1 - (spec.taper ?? 0.78)) * (1 - persp)) * spearFactor);
          const yc = pt.yTop + bandPos * pt.h + band.offset * (0.65 + 0.35 * persp) + Math.tan(rotRad) * (pt.x - midPt.x);
          const xc = pt.x + shiftX;
          upper.push([xc, yc - halfT]);
          lower.push([xc, yc + halfT]);
          bx0 = Math.min(bx0, xc - 4);
          bx1 = Math.max(bx1, xc + 4);
          by0 = Math.min(by0, yc - halfT - 4);
          by1 = Math.max(by1, yc + halfT + 4);
        }
        sctx.beginPath();
        sctx.moveTo(upper[0][0], upper[0][1]);
        for (let i = 1; i < upper.length; i++) sctx.lineTo(upper[i][0], upper[i][1]);
        for (let i = lower.length - 1; i >= 0; i--) sctx.lineTo(lower[i][0], lower[i][1]);
        sctx.closePath();
        sctx.fillStyle = d.color || "#ffffff";
        sctx.fill();
      }
    } else {
      // Respaldo geométrico limpio cuando la máscara aún es manual (demo o punto único)
      const cx = d.x, cy = d.y, spanW = 360 * d.scale;
      const rad = ((d.rotationDeg || 0) * Math.PI) / 180;
      sctx.save();
      sctx.translate(cx, cy);
      sctx.rotate(rad);
      sctx.fillStyle = d.color || "#ffffff";
      for (const band of bands) {
        sctx.beginPath();
        sctx.moveTo(-spanW * 0.5, band.offset - band.width * 0.5);
        sctx.quadraticCurveTo(0, band.offset - band.width * 0.5 - 10, spanW * 0.5, band.offset - band.width * 0.5 - 6);
        sctx.lineTo(spanW * 0.5, band.offset + band.width * 0.5 - 6);
        sctx.quadraticCurveTo(0, band.offset + band.width * 0.5 - 10, -spanW * 0.5, band.offset + band.width * 0.5);
        sctx.closePath();
        sctx.fill();
      }
      sctx.restore();
      bx0 = cx - spanW * 0.5; bx1 = cx + spanW * 0.5;
      by0 = cy - 45; by1 = cy + 45;
    }

    if (d.clipToBody && clipMask) {
      sctx.save();
      sctx.globalCompositeOperation = "destination-in";
      sctx.drawImage(clipMask, 0, 0, this.width, this.height);
      sctx.restore();
    }

    if (bx1 > bx0 && by1 > by0) {
      this._applyVehicleLightingToCanvas(sctx, bx0, by0, bx1 - bx0, by1 - by0);
      d.lastBounds = {
        cx: 0.5 * (bx0 + bx1),
        cy: 0.5 * (by0 + by1),
        w: Math.max(40, bx1 - bx0),
        h: Math.max(32, by1 - by0)
      };
    }

    targetCtx.save();
    targetCtx.globalAlpha = d.opacity ?? 0.93;
    targetCtx.drawImage(this.stripeCanvas, 0, 0);
    targetCtx.restore();
  }

  render(maskCanvas = this.lastMaskCanvas, targetCtx = this.ctx) {
    this.lastMaskCanvas = maskCanvas;
    const ctx = targetCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.decals.length) return;

    // 1. Viniles libres (no recortados)
    for (const d of this.decals) {
      if (d.clipToBody) continue;
      if (d.kind === "contour-stripe") {
        this._drawContouredStripeDecal(ctx, d, maskCanvas);
      } else if (d.img) {
        this._drawSingleDecal(ctx, d);
      }
    }

    // 2. Viniles recortados al contorno exacto del vehículo / pieza
    const clippedDecals = this.decals.filter(d => d.clipToBody && (d.kind === "contour-stripe" || d.img));
    if (clippedDecals.length) {
      const wctx = this.workCtx;
      wctx.clearRect(0, 0, this.width, this.height);

      for (const d of clippedDecals) {
        if (d.kind === "contour-stripe") {
          this._drawContouredStripeDecal(wctx, d, maskCanvas);
        } else {
          this._drawSingleDecal(wctx, d);
        }
      }

      if (maskCanvas) {
        wctx.save();
        wctx.globalCompositeOperation = "destination-in";
        wctx.drawImage(maskCanvas, 0, 0, this.width, this.height);
        wctx.restore();
      }

      ctx.drawImage(this.workCanvas, 0, 0);
    }
  }

  _drawSingleDecal(ctx, d) {
    const { w, h } = this._drawDimensions(d);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate((d.rotationDeg * Math.PI) / 180);
    ctx.globalAlpha = d.opacity;
    ctx.drawImage(d.img, -w * 0.5, -h * 0.5, w, h);
    ctx.restore();
  }

  drawHandles(overlayCtx) {
    const d = this.getSelected();
    if (!d || (d.kind !== "contour-stripe" && !d.img)) {
      this.handleCoords = null;
      return;
    }

    const { w, h } = this._drawDimensions(d);
    const cx = d.kind === "contour-stripe" && d.lastBounds ? d.lastBounds.cx : d.x;
    const cy = d.kind === "contour-stripe" && d.lastBounds ? d.lastBounds.cy : d.y;
    const hw = w * 0.5;
    const hh = h * 0.5;
    const rad = d.kind === "contour-stripe" ? 0 : (d.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const toGlobal = (lx, ly) => ({
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos
    });

    const scalePt = toGlobal(hw, hh);
    const delPt = toGlobal(hw, -hh);
    this.handleCoords = { scalePt, delPt, hw, hh, cx, cy };

    overlayCtx.save();
    overlayCtx.translate(cx, cy);
    overlayCtx.rotate(rad);
    overlayCtx.strokeStyle = "#60a5fa";
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.strokeRect(-hw, -hh, w, h);
    overlayCtx.restore();

    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.arc(scalePt.x, scalePt.y, 11, 0, Math.PI * 2);
    overlayCtx.fillStyle = "#2563eb";
    overlayCtx.fill();
    overlayCtx.lineWidth = 2.5;
    overlayCtx.strokeStyle = "#ffffff";
    overlayCtx.stroke();
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.font = "bold 12px sans-serif";
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    overlayCtx.fillText("↻", scalePt.x, scalePt.y + 0.5);

    overlayCtx.beginPath();
    overlayCtx.arc(delPt.x, delPt.y, 11, 0, Math.PI * 2);
    overlayCtx.fillStyle = "#dc2626";
    overlayCtx.fill();
    overlayCtx.lineWidth = 2.5;
    overlayCtx.strokeStyle = "#ffffff";
    overlayCtx.stroke();
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.fillText("×", delPt.x, delPt.y + 0.5);
    overlayCtx.restore();
  }

  _hitTestDecalBody(pt, d) {
    const { w, h } = this._drawDimensions(d);
    const cx = d.kind === "contour-stripe" && d.lastBounds ? d.lastBounds.cx : d.x;
    const cy = d.kind === "contour-stripe" && d.lastBounds ? d.lastBounds.cy : d.y;
    const rad = d.kind === "contour-stripe" ? 0 : -(d.rotationDeg * Math.PI) / 180;
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    return Math.abs(lx) <= w * 0.5 + 14 && Math.abs(ly) <= h * 0.5 + 14;
  }

  handlePointer(phase, pt, _e, forceDecalMode) {
    if (phase === "down") {
      if (this.handleCoords && this.selectedId) {
        const { delPt, scalePt, cx, cy } = this.handleCoords;
        if (Math.hypot(pt.x - delPt.x, pt.y - delPt.y) <= 16) {
          this.deleteDecal(this.selectedId);
          return true;
        }
        if (Math.hypot(pt.x - scalePt.x, pt.y - scalePt.y) <= 16) {
          const d = this.getSelected();
          this.dragState = {
            mode: "transform",
            decalId: d.id,
            anchorX: cx,
            anchorY: cy,
            startScale: d.scale,
            startDist: Math.max(20, Math.hypot(pt.x - cx, pt.y - cy)),
            startPointerAngle: Math.atan2(pt.y - cy, pt.x - cx),
            startRot: d.rotationDeg
          };
          return true;
        }
      }

      if (!forceDecalMode) return false;

      for (let i = this.decals.length - 1; i >= 0; i--) {
        const d = this.decals[i];
        if (this._hitTestDecalBody(pt, d)) {
          this.selectedId = d.id;
          this.dragState = {
            mode: "move",
            decalId: d.id,
            offsetX: pt.x - d.x,
            offsetY: pt.y - d.y
          };
          this.onChange();
          return true;
        }
      }
      return false;
    }

    if (phase === "move") {
      if (!this.dragState) return false;
      const d = this.decals.find(item => item.id === this.dragState.decalId);
      if (!d) return false;

      if (this.dragState.mode === "move") {
        d.x = Math.max(0, Math.min(this.width, pt.x - this.dragState.offsetX));
        d.y = Math.max(0, Math.min(this.height, pt.y - this.dragState.offsetY));
      } else if (this.dragState.mode === "transform") {
        const ax = this.dragState.anchorX ?? d.x;
        const ay = this.dragState.anchorY ?? d.y;
        const curDist = Math.max(20, Math.hypot(pt.x - ax, pt.y - ay));
        const curAngle = Math.atan2(pt.y - ay, pt.x - ax);
        const deltaDeg = ((curAngle - this.dragState.startPointerAngle) * 180) / Math.PI;
        d.scale = Math.max(0.15, Math.min(2.6, Number((this.dragState.startScale * (curDist / this.dragState.startDist)).toFixed(2))));
        d.rotationDeg = Math.round(((this.dragState.startRot + deltaDeg + 180) % 360) - 180);
      }

      this.render();
      this.onChange();
      return true;
    }

    if (phase === "up") {
      if (this.dragState) {
        this.dragState = null;
        return true;
      }
    }

    return false;
  }

  serialize() {
    return this.decals.map(d => ({
      id: d.id,
      kind: d.kind || "raster",
      templateId: d.templateId,
      name: d.name,
      tintable: d.tintable,
      svgTemplate: d.svgTemplate,
      rawSrc: d.rawSrc,
      contourSpec: d.contourSpec || null,
      color: d.color,
      x: d.x,
      y: d.y,
      scale: d.scale,
      rotationDeg: d.rotationDeg,
      opacity: d.opacity,
      clipToBody: d.clipToBody
    }));
  }

  async restore(serialized = []) {
    this.decals = [];
    for (const item of serialized) {
      if (item.kind === "contour-stripe" && item.contourSpec) {
        this.decals.push({ ...item, img: null, lastBounds: null });
        continue;
      }
      const src = item.svgTemplate ? svgToDataUrl(item.svgTemplate, item.color) : item.rawSrc;
      if (!src) continue;
      try {
        const img = await loadImage(src);
        this.decals.push({ ...item, img });
      } catch {
        // Ignorar decal si no cargó
      }
    }
    this.selectedId = this.decals.length ? this.decals[0].id : null;
    this.render();
    this.onChange();
  }
}
