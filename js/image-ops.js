/**
 * El Rayo Studio — Operaciones de imagen (100% en el navegador).
 *
 *  - Conversión de color (sRGB ⇄ HSL, sRGB → CIELAB)
 *  - Repintado fotorrealista que conserva sombras y reflejos de la foto original
 *  - Varita mágica (flood fill en espacio LAB con freno en bordes)
 *  - Pincel / borrador de máscara
 *  - Rellenar huecos, difuminado de bordes, estadísticas de máscara
 *  - Propuesta automática de regiones (k-means LAB+XY + componentes conexas)
 */

/* ------------------------------------------------------------------ */
/* Utilidades de color                                                 */
/* ------------------------------------------------------------------ */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** Escribe RGB (0..255) en `out` para evitar asignaciones en bucles calientes. */
function hslToRgbInto(h, s, l, out) {
  if (s === 0) { out[0] = out[1] = out[2] = l * 255; return; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out[0] = hue2rgb(p, q, h + 1 / 3) * 255;
  out[1] = hue2rgb(p, q, h) * 255;
  out[2] = hue2rgb(p, q, h - 1 / 3) * 255;
}

const SRGB_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_LUT[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** Convierte un ImageData completo a CIELAB (Float32Array de 3·n). */
export function imageToLab(data, n) {
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = SRGB_LUT[data[p]], g = SRGB_LUT[data[p + 1]], b = SRGB_LUT[data[p + 2]];
    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const fx = labF(x), fy = labF(y), fz = labF(z);
    lab[i * 3] = 116 * fy - 16;
    lab[i * 3 + 1] = 500 * (fx - fy);
    lab[i * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

/** Luminancia perceptual (0..1) de cada píxel. */
export function imageToLuma(data, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[i] = (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) / 255;
  }
  return out;
}

/** Magnitud de gradiente Sobel (0..1 aprox.) sobre la luminancia. */
export function sobelMagnitude(luma, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = luma[i - w - 1], t = luma[i - w], tr = luma[i - w + 1];
      const l = luma[i - 1], r = luma[i + 1];
      const bl = luma[i + w - 1], b = luma[i + w], br = luma[i + w + 1];
      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      out[i] = Math.sqrt(gx * gx + gy * gy) / 4;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Máscaras                                                            */
/* ------------------------------------------------------------------ */

export function maskBBox(mask, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function maskArea(mask) {
  let a = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) a++;
  return a;
}

/**
 * Varita mágica estilo Photoshop.
 * tolerance: 0..100 (ΔE LAB ≈ tolerance·0.6)
 * edgeStop: si se pasa el mapa Sobel, el relleno no cruza bordes fuertes.
 */
export function magicWand({ lab, edges, w, h, sx, sy, tolerance, contiguous, edgeThreshold = 0.22 }) {
  const n = w * h;
  const out = new Uint8Array(n);
  const seed = sy * w + sx;
  const L0 = lab[seed * 3], A0 = lab[seed * 3 + 1], B0 = lab[seed * 3 + 2];
  const t = tolerance * 0.6;
  const t2 = t * t;
  const within = (i) => {
    const dl = lab[i * 3] - L0, da = lab[i * 3 + 1] - A0, db = lab[i * 3 + 2] - B0;
    // La luminosidad pesa menos para tolerar sombras y degradados sobre el mismo panel.
    return dl * dl * 0.45 + da * da + db * db <= t2;
  };

  if (!contiguous) {
    for (let i = 0; i < n; i++) if (within(i)) out[i] = 255;
    return out;
  }

  const stack = new Int32Array(n);
  let sp = 0;
  stack[sp++] = seed;
  out[seed] = 255;
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i / w) | 0;
    const blocked = edges && edges[i] > edgeThreshold;
    if (blocked && i !== seed) continue;
    if (x > 0) { const j = i - 1; if (!out[j] && within(j)) { out[j] = 255; stack[sp++] = j; } }
    if (x < w - 1) { const j = i + 1; if (!out[j] && within(j)) { out[j] = 255; stack[sp++] = j; } }
    if (y > 0) { const j = i - w; if (!out[j] && within(j)) { out[j] = 255; stack[sp++] = j; } }
    if (y < h - 1) { const j = i + w; if (!out[j] && within(j)) { out[j] = 255; stack[sp++] = j; } }
  }
  return out;
}

/** Rellena huecos internos (p. ej. reflejos que la varita dejó fuera). */
export function fillHoles(mask, w, h) {
  const n = w * h;
  const outside = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const push = (i) => { if (!mask[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = outside[i] ? 0 : 255;
  return out;
}

export function combineMasks(base, add, mode) {
  const out = new Uint8Array(base.length);
  for (let i = 0; i < base.length; i++) {
    if (mode === "add") out[i] = base[i] || add[i] ? 255 : 0;
    else if (mode === "subtract") out[i] = base[i] && !add[i] ? 255 : 0;
    else out[i] = add[i];
  }
  return out;
}

/** Pinta un círculo en la máscara (value 255 = añadir, 0 = borrar). */
export function stampCircle(mask, w, h, cx, cy, radius, value) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) mask[y * w + x] = value;
    }
  }
}

/** Difumina la máscara binaria (box blur separable) para bordes suaves. */
export function featherMask(mask, w, h, radius = 2) {
  if (radius < 1) return mask.slice();
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -radius; x <= radius; x++) acc += mask[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / size;
      acc += mask[row + Math.min(w - 1, x + radius + 1)] - mask[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / size;
      acc += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

/** Luminancia media ponderada por la máscara (necesaria para repintar). */
export function maskMeanLuma(luma, mask) {
  let s = 0, c = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i];
    if (a) { s += luma[i] * a; c += a; }
  }
  return c ? s / c : 0.5;
}

/* ------------------------------------------------------------------ */
/* Motor de repintado                                                  */
/* ------------------------------------------------------------------ */

const FINISH_PARAMS = {
  //           contraste  brillo especular  flakes  desplazamiento de tono
  solid:    { k: 1.0,  spec: 0.75, flakes: 0.0,  shift: 0.0 },
  metallic: { k: 1.28, spec: 0.9,  flakes: 0.16, shift: 0.0 },
  pearl:    { k: 1.15, spec: 0.95, flakes: 0.08, shift: 0.09 },
  matte:    { k: 0.62, spec: 0.12, flakes: 0.0,  shift: 0.0 },
};

const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function hash01(x, y) {
  let hsh = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
  return ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967296;
}

/**
 * Repinta los píxeles de una máscara conservando el sombreado de la foto.
 *
 * El modelo separa cada píxel en "sombreado" (desviación de su luminancia
 * respecto a la media del panel) y "pigmento" (color objetivo). El nuevo
 * píxel = pigmento a la luminosidad del objetivo + sombreado escalado por el
 * acabado, y luego se reinyectan los reflejos especulares de la foto original.
 */
export function recolorMasked({ src, dst, luma, alpha, w, bbox, meanL, color, finish, gloss, intensity }) {
  const [tr, tg, tb] = hexToRgb(color);
  const [th, ts, tl] = rgbToHsl(tr, tg, tb);
  const fp = FINISH_PARAMS[finish] || FINISH_PARAMS.solid;
  const k = fp.k * (0.75 + 0.5 * gloss);
  const spec = fp.spec * (0.4 + 0.6 * gloss);
  const darkMix = clamp01(1 - tl / 0.45); // colores oscuros: sombreado multiplicativo
  const safeMean = Math.max(meanL, 0.04);
  const rgb = [0, 0, 0];

  for (let y = bbox.y0; y <= bbox.y1; y++) {
    const row = y * w;
    for (let x = bbox.x0; x <= bbox.x1; x++) {
      const i = row + x;
      const a = alpha[i];
      if (!a) continue;
      const L = luma[i];
      const additive = tl + (L - meanL) * k;
      const multiplicative = tl * Math.pow(L / safeMean, k);
      const Ln = clamp01(additive * (1 - darkMix) + multiplicative * darkMix);
      const h = fp.shift ? (th + (L - meanL) * fp.shift + 1) % 1 : th;
      const s = ts * (1 - Math.abs(2 * Ln - 1) * 0.18);
      hslToRgbInto(h, s, Ln, rgb);

      if (fp.flakes) {
        const nz = hash01(x, y);
        if (nz > 0.9) {
          const f = ((nz - 0.9) / 0.1) * fp.flakes * (0.35 + L) * 255;
          rgb[0] += f; rgb[1] += f; rgb[2] += f;
        }
      }

      const sp = smoothstep(0.7, 0.97, L) * spec;
      const hl = 255 * L;
      const p = i * 4;
      const m = (a / 255) * intensity;
      const nr = rgb[0] * (1 - sp) + hl * sp;
      const ng = rgb[1] * (1 - sp) + hl * sp;
      const nb = rgb[2] * (1 - sp) + hl * sp;
      dst[p] = src[p] + (Math.min(255, nr) - src[p]) * m;
      dst[p + 1] = src[p + 1] + (Math.min(255, ng) - src[p + 1]) * m;
      dst[p + 2] = src[p + 2] + (Math.min(255, nb) - src[p + 2]) * m;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Propuesta automática de regiones                                    */
/* ------------------------------------------------------------------ */

/**
 * Agrupa la foto en regiones homogéneas (k-means sobre LAB + posición) y
 * devuelve componentes conexas grandes que no son fondo.
 *
 * NO es un modelo semántico entrenado: propone regiones y las etiqueta con
 * heurísticas (carrocería / vidrios / llantas). El administrador confirma,
 * renombra o divide cada región con la varita mágica.
 */
export function proposeRegions({ lab, w, h, k = 7, iterations = 10 }) {
  const n = w * h;
  const spatial = 55; // peso de la posición frente al color
  const step = Math.max(1, Math.floor(Math.sqrt(n / 12000)));

  // 1) Muestras submuestreadas
  const samples = [];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) samples.push(y * w + x);
  const feat = (i, out) => {
    out[0] = lab[i * 3]; out[1] = lab[i * 3 + 1]; out[2] = lab[i * 3 + 2];
    out[3] = ((i % w) / w) * spatial; out[4] = (((i / w) | 0) / h) * spatial;
  };

  // 2) Inicialización k-means++ (determinista)
  const C = [];
  const f = new Float32Array(5);
  feat(samples[Math.floor(samples.length / 2)], f);
  C.push(Float32Array.from(f));
  const dist = new Float32Array(samples.length).fill(Infinity);
  while (C.length < k) {
    let best = 0, bestD = -1;
    const c = C[C.length - 1];
    for (let s = 0; s < samples.length; s++) {
      feat(samples[s], f);
      let d = 0;
      for (let j = 0; j < 5; j++) d += (f[j] - c[j]) ** 2;
      if (d < dist[s]) dist[s] = d;
      if (dist[s] > bestD) { bestD = dist[s]; best = s; }
    }
    feat(samples[best], f);
    C.push(Float32Array.from(f));
  }

  // 3) Iteraciones sobre las muestras
  const assign = new Uint8Array(samples.length);
  for (let it = 0; it < iterations; it++) {
    const sum = C.map(() => new Float64Array(6));
    for (let s = 0; s < samples.length; s++) {
      feat(samples[s], f);
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let j = 0; j < 5; j++) d += (f[j] - C[c][j]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[s] = best;
      for (let j = 0; j < 5; j++) sum[best][j] += f[j];
      sum[best][5]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][5]) for (let j = 0; j < 5; j++) C[c][j] = sum[c][j] / sum[c][5];
  }

  // 4) Asignación a resolución completa
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    feat(i, f);
    let best = 0, bestD = Infinity;
    for (let c = 0; c < k; c++) {
      let d = 0;
      for (let j = 0; j < 5; j++) d += (f[j] - C[c][j]) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    labels[i] = best;
  }

  // 5) Componentes conexas
  const comp = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  const regions = [];
  const minArea = n * 0.012;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const lbl = labels[s];
    const id = regions.length;
    let sp = 0, area = 0, border = 0, sx = 0, sy = 0, sL = 0, sC = 0;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack[sp++] = s; comp[s] = id;
    const members = [];
    while (sp > 0) {
      const i = stack[--sp];
      members.push(i);
      const x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y;
      sL += lab[i * 3];
      sC += Math.hypot(lab[i * 3 + 1], lab[i * 3 + 2]);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && comp[i - 1] === -1 && labels[i - 1] === lbl) { comp[i - 1] = id; stack[sp++] = i - 1; }
      if (x < w - 1 && comp[i + 1] === -1 && labels[i + 1] === lbl) { comp[i + 1] = id; stack[sp++] = i + 1; }
      if (y > 0 && comp[i - w] === -1 && labels[i - w] === lbl) { comp[i - w] = id; stack[sp++] = i - w; }
      if (y < h - 1 && comp[i + w] === -1 && labels[i + w] === lbl) { comp[i + w] = id; stack[sp++] = i + w; }
    }
    regions.push({ id, area, border, members, cx: sx / area / w, cy: sy / area / h,
      meanL: sL / area, chroma: sC / area, bbox: { x0, y0, x1, y1 } });
  }

  const perimeter = 2 * (w + h);
  const kept = regions.filter((r) => r.area >= minArea && r.border / perimeter < 0.12);

  // 6) Etiquetado heurístico
  for (const r of kept) {
    const bw = (r.bbox.x1 - r.bbox.x0 + 1) / w, bh = (r.bbox.y1 - r.bbox.y0 + 1) / h;
    const aspect = (bw * w) / (bh * h);
    if (r.cy > 0.55 && r.meanL < 32 && r.chroma < 14 && aspect > 0.5 && aspect < 2.2) r.kind = "rines";
    else if (r.cy < 0.55 && r.meanL < 38 && r.chroma < 20) r.kind = "vidrios";
    else r.kind = "region";
  }
  const paintable = kept.filter((r) => r.kind === "region");
  if (paintable.length) {
    paintable.sort((a, b) => b.area * (1 + b.chroma / 30) - a.area * (1 + a.chroma / 30));
    paintable[0].kind = "carroceria";
  }

  return kept.map((r) => {
    const m = new Uint8Array(n);
    for (const i of r.members) m[i] = 255;
    return { kind: r.kind, mask: fillHoles(m, w, h), area: r.area };
  });
}

/* ------------------------------------------------------------------ */
/* Serialización compacta de máscaras (RLE)                            */
/* ------------------------------------------------------------------ */

export function encodeRLE(mask) {
  const runs = [];
  let cur = 0, len = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i] ? 1 : 0;
    if (v === cur) len++;
    else { runs.push(len); cur = v; len = 1; }
  }
  runs.push(len);
  return runs;
}

export function decodeRLE(runs, n) {
  const m = new Uint8Array(n);
  let i = 0, v = 0;
  for (const len of runs) {
    if (v) m.fill(255, i, i + len);
    i += len; v ^= 1;
  }
  return m;
}
