/* El Rayo — Gestor de Viniles de Recorte (SVG vectorial + PNG + destination-in) */

export const DECAL_CATALOG = [
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
    this.workCtx = this.workCanvas.getContext("2d");

    this.onChange = onChange || (() => {});
    this.decals = [];
    this.selectedId = null;
    this.lastMaskCanvas = null;

    this.dragState = null; // { mode: 'move'|'transform', decalId, startPt, startX, startY, startScale, startAngle }
    this.handleCoords = null; // { boxHalfW, boxHalfH, scaleCenter, deleteCenter }
  }

  async addFromCatalog(templateId) {
    const tpl = DECAL_CATALOG.find(item => item.id === templateId);
    if (!tpl) return null;

    const src = tpl.svg ? svgToDataUrl(tpl.svg, tpl.defaultColor) : tpl.imageSrc;
    const img = await loadImage(src);

    const decal = {
      id: `dec_${Date.now()}_${Math.floor(Math.random() * 999)}`,
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
    const baseW = decal.img?.naturalWidth || decal.img?.width || 220;
    const baseH = decal.img?.naturalHeight || decal.img?.height || 140;
    const fit = Math.min(280 / Math.max(1, baseW), 220 / Math.max(1, baseH), 1.8);
    return {
      w: baseW * fit * decal.scale,
      h: baseH * fit * decal.scale
    };
  }

  render(maskCanvas = this.lastMaskCanvas, targetCtx = this.ctx) {
    this.lastMaskCanvas = maskCanvas;
    const ctx = targetCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.decals.length) return;

    // 1. Viniles NO recortados a la carrocería
    for (const d of this.decals) {
      if (d.clipToBody || !d.img) continue;
      this._drawSingleDecal(ctx, d);
    }

    // 2. Viniles recortados al contorno de la máscara con destination-in
    const hasClipped = this.decals.some(d => d.clipToBody && d.img);
    if (hasClipped) {
      const wctx = this.workCtx;
      wctx.clearRect(0, 0, this.width, this.height);
      for (const d of this.decals) {
        if (!d.clipToBody || !d.img) continue;
        this._drawSingleDecal(wctx, d);
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
    if (!d || !d.img) {
      this.handleCoords = null;
      return;
    }

    const { w, h } = this._drawDimensions(d);
    const hw = w * 0.5;
    const hh = h * 0.5;
    const rad = (d.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const toGlobal = (lx, ly) => ({
      x: d.x + lx * cos - ly * sin,
      y: d.y + lx * sin + ly * cos
    });

    const scalePt = toGlobal(hw, hh);
    const delPt = toGlobal(hw, -hh);
    this.handleCoords = { scalePt, delPt, hw, hh };

    overlayCtx.save();
    overlayCtx.translate(d.x, d.y);
    overlayCtx.rotate(rad);
    overlayCtx.strokeStyle = "#60a5fa";
    overlayCtx.lineWidth = 2;
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.strokeRect(-hw, -hh, w, h);
    overlayCtx.restore();

    // Nodo inferior derecho: Escalar / Rotar
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

    // Nodo superior derecho: Eliminar directo en canvas
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
    const rad = -(d.rotationDeg * Math.PI) / 180;
    const dx = pt.x - d.x;
    const dy = pt.y - d.y;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    return Math.abs(lx) <= w * 0.5 + 12 && Math.abs(ly) <= h * 0.5 + 12;
  }

  handlePointer(phase, pt, _e, forceDecalMode) {
    if (phase === "down") {
      if (this.handleCoords && this.selectedId) {
        const { delPt, scalePt } = this.handleCoords;
        if (Math.hypot(pt.x - delPt.x, pt.y - delPt.y) <= 16) {
          this.deleteDecal(this.selectedId);
          return true;
        }
        if (Math.hypot(pt.x - scalePt.x, pt.y - scalePt.y) <= 16) {
          const d = this.getSelected();
          this.dragState = {
            mode: "transform",
            decalId: d.id,
            startScale: d.scale,
            startDist: Math.max(20, Math.hypot(pt.x - d.x, pt.y - d.y)),
            startPointerAngle: Math.atan2(pt.y - d.y, pt.x - d.x),
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
        const curDist = Math.max(20, Math.hypot(pt.x - d.x, pt.y - d.y));
        const curAngle = Math.atan2(pt.y - d.y, pt.x - d.x);
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
      templateId: d.templateId,
      name: d.name,
      tintable: d.tintable,
      svgTemplate: d.svgTemplate,
      rawSrc: d.rawSrc,
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
