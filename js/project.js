/**
 * El Rayo Studio — Modelo de proyecto.
 *
 * Un proyecto = un vehículo. Contiene:
 *  - views: fotografías por ángulo (mín. 5 para la órbita 360°)
 *  - parts: piezas compartidas entre vistas (cofre, puertas, etc.)
 *  - masks: por vista y por pieza (la segmentación es por foto)
 *  - global: pintura general que heredan las piezas sin color propio
 */
import {
  imageToLab, imageToLuma, sobelMagnitude, featherMask, maskBBox,
  maskMeanLuma, recolorMasked, encodeRLE, decodeRLE,
} from "./image-ops.js";

export const MIN_VIEWS = 5;
export const MAX_DIM = 1600;

export const ANGLES = [
  { id: "front", label: "Frontal", deg: 0 },
  { id: "front34l", label: "3/4 delantera izq.", deg: 45 },
  { id: "left", label: "Lateral izquierda", deg: 90 },
  { id: "rear34l", label: "3/4 trasera izq.", deg: 135 },
  { id: "rear", label: "Trasera", deg: 180 },
  { id: "rear34r", label: "3/4 trasera der.", deg: 225 },
  { id: "right", label: "Lateral derecha", deg: 270 },
  { id: "front34r", label: "3/4 delantera der.", deg: 315 },
  { id: "top", label: "Superior", deg: 360 },
];
const DEFAULT_ANGLE_ORDER = ["front", "left", "rear", "right", "front34l", "rear34r", "front34r", "rear34l", "top"];

export const DEFAULT_PARTS = [
  ["carroceria", "Carrocería", true],
  ["cofre", "Cofre", true],
  ["toldo", "Toldo", true],
  ["puerta_del_izq", "Puerta del. izquierda", true],
  ["puerta_tras_izq", "Puerta tras. izquierda", true],
  ["puerta_del_der", "Puerta del. derecha", true],
  ["puerta_tras_der", "Puerta tras. derecha", true],
  ["salpicaderas", "Salpicaderas", true],
  ["fascia_del", "Fascia delantera", true],
  ["fascia_tras", "Fascia trasera", true],
  ["cajuela", "Cajuela / batea", true],
  ["espejos", "Espejos", true],
  ["rines", "Rines", false],
  ["calipers", "Calipers", false],
  ["vidrios", "Vidrios", false],
];

let uid = 0;
const newId = (p) => `${p}_${Date.now().toString(36)}_${(uid++).toString(36)}`;

export function createPart(id, name, paintable = true) {
  return {
    id: id || newId("pieza"),
    name,
    paintable,            // false = vidrios, llantas… no heredan la pintura general
    visible: true,
    override: false,      // true = color propio, ignora la pintura general
    paint: { color: "#C8102E", finish: "metallic", gloss: 0.8, intensity: 1 },
  };
}

export class Project {
  constructor(name = "Vehículo sin nombre") {
    this.name = name;
    this.vehicle = { make: "", model: "", year: "", plate: "", client: "" };
    this.global = { enabled: true, color: "#C8102E", finish: "metallic", gloss: 0.8, intensity: 1 };
    this.parts = DEFAULT_PARTS.map(([id, n, p]) => createPart(id, n, p));
    this.views = [];
  }

  /* ---------- Vistas ---------- */

  async addImageFile(file) {
    const bitmap = await createImageBitmap(file);
    return this.addBitmap(bitmap, file.name);
  }

  addBitmap(bitmap, fileName = "foto") {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    const base = ctx.getImageData(0, 0, w, h);
    const used = new Set(this.views.map((v) => v.angle));
    const angle = DEFAULT_ANGLE_ORDER.find((a) => !used.has(a)) || "top";
    const view = new View({ id: newId("vista"), fileName, angle, w, h, base, sourceCanvas: canvas });
    this.views.push(view);
    return view;
  }

  removeView(viewId) {
    this.views = this.views.filter((v) => v.id !== viewId);
  }

  sortedViews() {
    const order = (a) => ANGLES.find((x) => x.id === a)?.deg ?? 999;
    return [...this.views].sort((a, b) => order(a.angle) - order(b.angle));
  }

  /* ---------- Piezas ---------- */

  part(id) { return this.parts.find((p) => p.id === id); }

  addPart(name, paintable = true) {
    const p = createPart(null, name, paintable);
    this.parts.push(p);
    return p;
  }

  removePart(id) {
    this.parts = this.parts.filter((p) => p.id !== id);
    for (const v of this.views) v.deleteMask(id);
  }

  /** Pintura efectiva de una pieza (propia o heredada de la general). */
  effectivePaint(part) {
    if (part.override) return part.paint;
    if (part.paintable && this.global.enabled) return this.global;
    return null;
  }

  /* ---------- Render ---------- */

  renderView(view) {
    const out = view.composite;
    out.data.set(view.base.data);
    for (const part of this.parts) {
      if (!part.visible) continue;
      const paint = this.effectivePaint(part);
      if (!paint) continue;
      const m = view.masks.get(part.id);
      if (!m || !m.bbox) continue;
      recolorMasked({
        src: view.base.data, dst: out.data, luma: view.luma, alpha: m.alpha, w: view.w,
        bbox: m.bbox, meanL: m.meanL, color: paint.color, finish: paint.finish,
        gloss: paint.gloss, intensity: paint.intensity,
      });
    }
    view.compositeCtx.putImageData(out, 0, 0);
    view.dirty = false;
    return view.compositeCanvas;
  }

  /* ---------- Persistencia ---------- */

  toJSON() {
    return {
      format: "elrayo-studio/1",
      name: this.name,
      vehicle: this.vehicle,
      global: this.global,
      parts: this.parts,
      views: this.views.map((v) => ({
        id: v.id, fileName: v.fileName, angle: v.angle, w: v.w, h: v.h,
        image: v.sourceCanvas.toDataURL("image/jpeg", 0.9),
        masks: Object.fromEntries([...v.masks].map(([pid, m]) => [pid, encodeRLE(m.mask)])),
      })),
    };
  }

  static async fromJSON(json) {
    const p = new Project(json.name);
    p.vehicle = json.vehicle || p.vehicle;
    p.global = json.global;
    p.parts = json.parts;
    for (const vj of json.views) {
      const img = new Image();
      img.src = vj.image;
      await img.decode();
      const bmp = await createImageBitmap(img);
      const v = p.addBitmap(bmp, vj.fileName);
      v.id = vj.id;
      v.angle = vj.angle;
      for (const [pid, runs] of Object.entries(vj.masks || {})) v.setMask(pid, decodeRLE(runs, v.w * v.h));
    }
    return p;
  }
}

export class View {
  constructor({ id, fileName, angle, w, h, base, sourceCanvas }) {
    Object.assign(this, { id, fileName, angle, w, h, base, sourceCanvas });
    const n = w * h;
    this.luma = imageToLuma(base.data, n);
    this._lab = null;
    this._edges = null;
    this.masks = new Map(); // partId -> { mask, alpha, bbox, meanL }
    this.compositeCanvas = document.createElement("canvas");
    this.compositeCanvas.width = w;
    this.compositeCanvas.height = h;
    this.compositeCtx = this.compositeCanvas.getContext("2d");
    this.composite = new ImageData(new Uint8ClampedArray(base.data), w, h);
    this.compositeCtx.putImageData(this.composite, 0, 0);
    this.dirty = true;
  }

  get lab() { return (this._lab ||= imageToLab(this.base.data, this.w * this.h)); }
  get edges() { return (this._edges ||= sobelMagnitude(this.luma, this.w, this.h)); }

  getMask(partId) { return this.masks.get(partId)?.mask || null; }

  setMask(partId, mask) {
    const bbox = maskBBox(mask, this.w, this.h);
    if (!bbox) { this.masks.delete(partId); this.dirty = true; return; }
    const alpha = featherMask(mask, this.w, this.h, 2);
    // El bbox se amplía para incluir el borde difuminado.
    const fb = { x0: Math.max(0, bbox.x0 - 3), y0: Math.max(0, bbox.y0 - 3),
      x1: Math.min(this.w - 1, bbox.x1 + 3), y1: Math.min(this.h - 1, bbox.y1 + 3) };
    this.masks.set(partId, { mask, alpha, bbox: fb, meanL: maskMeanLuma(this.luma, mask) });
    this.dirty = true;
  }

  deleteMask(partId) { this.masks.delete(partId); this.dirty = true; }
}
