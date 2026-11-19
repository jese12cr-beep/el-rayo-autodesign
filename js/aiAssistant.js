/* El Rayo — Motor de Pensamiento Automotriz IA (NLU Local Offline + Gemini Multimodal Opcional) */

const STORAGE_KEY_API = "elRayoGeminiApiKey";
const STORAGE_KEY_MODEL = "elRayoGeminiModel";

const COLOR_DICTIONARY = [
  { keys: ["gris nardo", "nardo"], hex: "#64748B", name: "Gris Nardo", finish: "gloss" },
  { keys: ["gris oscuro", "grafito", "antracita", "oxford", "carbon"], hex: "#374151", name: "Gris Grafito", finish: "metallic" },
  { keys: ["gris claro", "plata", "plateado", "aluminio"], hex: "#94A3B8", name: "Plata Titanio", finish: "metallic" },
  { keys: ["gris", "plomo", "rata"], hex: "#6B7280", name: "Gris Metálico", finish: "metallic" },
  { keys: ["negro mate", "negro satinado"], hex: "#14171D", name: "Negro Mate", finish: "matte" },
  { keys: ["negro", "obsidiana", "obscuro", "azabache"], hex: "#14171D", name: "Negro Obsidiana", finish: "gloss" },
  { keys: ["blanco perla", "blanco aperlado", "perla"], hex: "#F8FAFC", name: "Blanco Aperlado", finish: "pearlescent" },
  { keys: ["blanco", "artico", "nieve"], hex: "#F1F5F9", name: "Blanco Ártico", finish: "gloss" },
  { keys: ["rojo ferrari", "rojo vivo", "rojo", "rojas", "roja"], hex: "#DC2626", name: "Rojo El Rayo", finish: "gloss" },
  { keys: ["vino", "guinda", "cereza", "carmesi", "candy"], hex: "#881337", name: "Rojo Candy Vino", finish: "candy" },
  { keys: ["azul cielo", "azul claro", "celeste", "pitufos"], hex: "#38BDF8", name: "Azul Cielo", finish: "gloss" },
  { keys: ["azul marino", "azul oscuro", "marino"], hex: "#1E3A8A", name: "Azul Marino", finish: "metallic" },
  { keys: ["azul", "cobalto", "electrico"], hex: "#2563EB", name: "Azul Cobalto", finish: "metallic" },
  { keys: ["verde militar", "oliva"], hex: "#3F6212", name: "Verde Militar", finish: "matte" },
  { keys: ["verde lima", "lima"], hex: "#84CC16", name: "Verde Lima", finish: "gloss" },
  { keys: ["verde", "esmeralda"], hex: "#15803D", name: "Verde Esmeralda", finish: "metallic" },
  { keys: ["amarillo racing", "amarillo", "amarillas", "amarilla"], hex: "#EAB308", name: "Amarillo Racing", finish: "gloss" },
  { keys: ["dorado", "oro", "bronce", "cobre"], hex: "#D97706", name: "Dorado / Bronce", finish: "metallic" },
  { keys: ["naranja", "mandarina"], hex: "#EA580C", name: "Naranja Deportivo", finish: "metallic" },
  { keys: ["morado", "purpura", "violeta"], hex: "#7E22CE", name: "Violeta Metálico", finish: "metallic" },
  { keys: ["rosa", "fucsia", "magenta"], hex: "#DB2777", name: "Magenta", finish: "gloss" },
  { keys: ["turquesa", "aqua", "cyan"], hex: "#06B6D4", name: "Turquesa", finish: "metallic" }
];

const FINISH_RULES = [
  { keys: ["mate", "satin", "satinado"], finish: "matte", label: "Mate Satinado" },
  { keys: ["candy", "caramelo", "profundo"], finish: "candy", label: "Candy Tricapa" },
  { keys: ["aperlado", "perla", "tornasol"], finish: "pearlescent", label: "Aperlado" },
  { keys: ["metalico", "metalizado", "metalica", "aluminio"], finish: "metallic", label: "Metálico" },
  { keys: ["brillante", "gloss", "brillo", "original"], finish: "gloss", label: "Brillante" }
];

const PART_GROUPS = [
  { keys: ["cofre", "capo", "capot"], ids: ["hood"], label: "Cofre" },
  { keys: ["toldo", "techo"], ids: ["roof"], label: "Toldo" },
  { keys: ["cajuela", "porton", "maletero", "baul"], ids: ["trunk"], label: "Cajuela" },
  { keys: ["defensa delantera", "facias delanteras", "parachoque delantero"], ids: ["front-bumper"], label: "Defensa Del." },
  { keys: ["defensa trasera", "parachoque trasero"], ids: ["back-bumper"], label: "Defensa Tras." },
  { keys: ["defensas", "defensa", "parachoques", "facias"], ids: ["front-bumper", "back-bumper"], label: "Defensas" },
  { keys: ["espejos", "espejo", "retrovisores", "retrovisor"], ids: ["left_mirror", "right_mirror"], label: "Espejos" },
  { keys: ["salpicadera", "salpicaderas", "guardafangos"], ids: ["left_fender", "right_fender"], label: "Salpicaderas" },
  { keys: ["estribo", "estribos", "faldon", "faldones", "zocalos"], ids: ["left_rocker-panel", "right_rocker-panel"], label: "Estribos" },
  { keys: ["puerta delantera"], ids: ["left_front-door", "right_front-door"], label: "Puerta Del." },
  { keys: ["puerta trasera"], ids: ["left_back-door", "right_back-door"], label: "Puerta Tras." },
  { keys: ["puertas", "puerta"], ids: ["left_front-door", "left_back-door", "right_front-door", "right_back-door"], label: "Puertas" },
  { keys: ["costados", "costado", "cuartos traseros"], ids: ["left_quarter-panel", "right_quarter-panel"], label: "Costados" }
];

function normalizeSpanish(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findColorInText(clause) {
  for (const entry of COLOR_DICTIONARY) {
    for (const k of entry.keys) {
      const re = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`);
      if (re.test(clause)) return entry;
    }
  }
  const hexMatch = clause.match(/#[0-9a-f]{6}/i);
  if (hexMatch) {
    return { hex: hexMatch[0].toUpperCase(), name: `Tono ${hexMatch[0].toUpperCase()}`, finish: "gloss" };
  }
  return null;
}

function findFinishInText(clause) {
  for (const rule of FINISH_RULES) {
    for (const k of rule.keys) {
      const re = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`);
      if (re.test(clause)) return rule;
    }
  }
  return null;
}

function findPartsInText(clause) {
  const matchedIds = new Set();
  const labels = [];
  for (const g of PART_GROUPS) {
    for (const k of g.keys) {
      if (clause.includes(k)) {
        g.ids.forEach(id => matchedIds.add(id));
        if (!labels.includes(g.label)) labels.push(g.label);
        break;
      }
    }
  }
  return { ids: Array.from(matchedIds), labels };
}

function finishDefaults(finish, overrides = {}) {
  const map = {
    gloss: { metallic: 0.28, specular: 0.92, contrast: 1.25, opacity: 0.94 },
    metallic: { metallic: 0.78, specular: 0.88, contrast: 1.28, opacity: 0.95 },
    candy: { metallic: 0.72, specular: 0.96, contrast: 1.38, opacity: 0.95 },
    matte: { metallic: 0.20, specular: 0.22, contrast: 1.18, opacity: 0.95 },
    pearlescent: { metallic: 0.56, specular: 0.94, contrast: 1.24, opacity: 0.94 }
  };
  return { finish, ...(map[finish] || map.gloss), ...overrides };
}

function estimateVehicleVisualState(paintEngine, detectedParts, bodyMaskCanvas = null) {
  let detectedColorDesc = "tono neutro";
  if (paintEngine?.hasImage && paintEngine.stageCanvas) {
    const w = paintEngine.width, h = paintEngine.height;
    const ctx = paintEngine.stageCanvas.getContext("2d", { willReadFrequently: true });
    const px = ctx.getImageData(0, 0, w, h).data;
    const mpx = bodyMaskCanvas
      ? bodyMaskCanvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data
      : null;

    let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
    const y0 = Math.round(h * 0.15), y1 = Math.round(h * 0.85);
    const x0 = Math.round(w * 0.10), x1 = Math.round(w * 0.90);
    for (let y = y0; y < y1; y += 6) {
      for (let x = x0; x < x1; x += 6) {
        const idx = (y * w + x) << 2;
        if (mpx && mpx[idx + 3] < 128) continue;
        rSum += px[idx]; gSum += px[idx + 1]; bSum += px[idx + 2]; cnt++;
      }
    }
    if (cnt > 0) {
      const r = rSum / cnt, g = gSum / cnt, b = bSum / cnt;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat > 26) {
        if (r > g + 16 && r > b + 16) detectedColorDesc = "carro rojo / vino";
        else if (b > r + 14 && b > g + 8) detectedColorDesc = "carro azul";
        else if (g > r + 14 && g > b + 10) detectedColorDesc = "carro verde";
        else detectedColorDesc = "carro cromático";
      } else if (lum > 180) detectedColorDesc = "carro blanco / plata claro";
      else if (lum < 68) detectedColorDesc = "carro negro / oscuro";
      else detectedColorDesc = "carro gris / plata";
    }
  }

  const ids = new Set((detectedParts || []).map(p => p.id));
  const hasDoors = ids.has("left_front-door") || ids.has("left_back-door") || ids.has("right_front-door") || ids.has("right_back-door");
  const hasHood = ids.has("hood");
  const hasRoof = ids.has("roof");
  const sideLabel = ids.has("right_front-door") ? "perfil derecho" : (ids.has("left_front-door") ? "perfil izquierdo" : "vista frontal/trasera");

  return {
    partCount: detectedParts?.length || 0,
    hasDoors,
    hasHood,
    hasRoof,
    sideLabel,
    detectedColorDesc
  };
}

export class AiDesignAssistant {
  constructor() {
    this.apiKey = localStorage.getItem(STORAGE_KEY_API) || "";
    this.geminiModel = localStorage.getItem(STORAGE_KEY_MODEL) || "gemini-3.5-flash-lite";
  }

  hasGeminiKey() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 10);
  }

  saveSettings({ apiKey, model }) {
    this.apiKey = (apiKey || "").trim();
    this.geminiModel = (model || "gemini-3.5-flash-lite").trim();
    if (this.apiKey) localStorage.setItem(STORAGE_KEY_API, this.apiKey);
    else localStorage.removeItem(STORAGE_KEY_API);
    localStorage.setItem(STORAGE_KEY_MODEL, this.geminiModel);
  }

  parseDesignPromptLocal(rawPrompt, vehicleInfo) {
    const norm = normalizeSpanish(rawPrompt);
    // Dividir en cláusulas para no mezclar el color base con el color de cofre o franjas
    const rawClauses = norm.split(/[,;.]+|\s+y\s+|\s+pero\s+|\s+ademas\s+|\s+con\s+(?=(?:el\s+cofre|cofre|toldo|techo|espejos|puertas|franjas|lineas|rayas|vinil))/);
    const clauses = rawClauses.map(c => c.trim()).filter(Boolean);

    let baseColor = null;
    let baseFinish = findFinishInText(norm)?.finish || null;
    const partOverrides = {};
    const overrideLabels = [];
    let stripeSpec = null;

    const wholeCarHint = /\b(carro|auto|coche|vehiculo|carroceria|completo|todo)\b/;
    const stripeHint = /\b(franja|franjas|linea|lineas|raya|rayas|banda|bandas|stripe|stripes|pinstripe|racing)\b/;

    for (const cl of clauses) {
      const col = findColorInText(cl);
      const fin = findFinishInText(cl);

      if (stripeHint.test(cl)) {
        const isDouble = /\b(doble|dobles|dos|par)\b/.test(cl) || !/\b(sola|unica|simple|triple)\b/.test(cl);
        const isTriple = /\b(triple|triples)\b/.test(cl);
        const isRacing = /\b(racing|deportiva)\b/.test(cl);
        const isThin = /\b(muy delgad|delgad|fina|finas|finita|finitas|angosta|pinstripe|sutil)\b/.test(cl);
        const isWide = /\b(ancha|anchas|gruesa|gruesas)\b/.test(cl);

        let zone = "doors";
        if (/\b(cofre|capo)\b/.test(cl) && !/\b(puerta|puertas|lateral|costado)\b/.test(cl)) zone = "hood";
        else if (/\b(toldo|techo)\b/.test(cl) && !/\b(puerta|puertas|lateral)\b/.test(cl)) zone = "roof";
        else if (/\b(costado completo|todo el lateral|punta a punta|fender)\b/.test(cl)) zone = "side";
        else if (/\b(estribo|faldon|abajo|baja)\b/.test(cl)) zone = "doors";

        let bandPos = 0.56;
        if (/\b(arriba|alta|superior|cintura)\b/.test(cl)) bandPos = 0.30;
        else if (/\b(abajo|baja|inferior|estribo)\b/.test(cl)) bandPos = 0.78;

        const style = isRacing ? "double-racing" : (isTriple ? "triple" : (isDouble ? "double-thin" : "single"));
        stripeSpec = {
          zone,
          style,
          thicknessPx: isThin ? 5.2 : (isWide ? 14 : 7.5),
          gapPx: isThin ? 4.5 : (isWide ? 8 : 5.5),
          bandPos,
          colorHex: col?.hex || "#FFFFFF",
          colorName: col?.name || "Blanco"
        };
        continue;
      }

      const partsFound = findPartsInText(cl);
      if (partsFound.ids.length > 0 && !wholeCarHint.test(cl)) {
        const targetColor = col || { hex: "#14171D", name: "Negro Obsidiana", finish: "gloss" };
        const targetFin = fin?.finish || targetColor.finish || "gloss";
        for (const pid of partsFound.ids) {
          partOverrides[pid] = {
            hex: targetColor.hex,
            name: targetColor.name,
            ...finishDefaults(targetFin)
          };
        }
        partsFound.labels.forEach(l => {
          if (!overrideLabels.includes(`${l} ${targetColor.name}`)) {
            overrideLabels.push(`${l} ${targetColor.name}`);
          }
        });
        continue;
      }

      // Cláusula de color base de carrocería
      if (col && (!baseColor || wholeCarHint.test(cl))) {
        baseColor = col;
        if (fin) baseFinish = fin.finish;
      }
    }

    // Si es una petición abierta sin colores ("recomiendame", "sorprendeme"), proponer paleta inteligente
    if (!baseColor) {
      const isCurrentlyDark = vehicleInfo.detectedColorDesc.includes("negro") || vehicleInfo.detectedColorDesc.includes("rojo");
      baseColor = isCurrentlyDark
        ? { hex: "#64748B", name: "Gris Nardo", finish: "metallic" }
        : { hex: "#2563EB", name: "Azul Cobalto", finish: "metallic" };
    }
    const chosenFinish = baseFinish || baseColor.finish || "metallic";

    const thinkingSteps = [
      `Visión IA: ${vehicleInfo.detectedColorDesc} con ${vehicleInfo.partCount} piezas carroceras aisladas (${vehicleInfo.sideLabel}, vidrios y rines protegidos).`,
      `Interpretación: Carrocería base en ${baseColor.name} (${chosenFinish})${overrideLabels.length ? `, acentos en ${overrideLabels.join(", ")}` : ""}${stripeSpec ? ` + franjas ${stripeSpec.style === "double-thin" ? "dobles delgadas" : stripeSpec.style} en ${stripeSpec.colorName}` : ""}.`,
      `Contorneado 3D: ${vehicleInfo.hasDoors ? "proyección adaptativa sobre curva de puertas y perspectiva lateral" : "alineación de ejes y sombras del vehículo"}${vehicleInfo.hasHood ? " + eje central del cofre" : ""}.`
    ];

    const buildPartMapObj = (extraMap = {}) => ({ ...partOverrides, ...extraMap });

    // Construir 3 opciones visuales diferenciadas y coherentes con el vehículo
    const opt1Stripes = stripeSpec
      ? [{
          ...stripeSpec,
          name: `Franjas ${stripeSpec.colorName} (Puertas)`
        }]
      : [];

    const opt2Overrides = buildPartMapObj(
      Object.keys(partOverrides).length > 0
        ? {
            left_mirror: partOverrides.hood || { hex: "#14171D", name: "Negro Gloss", ...finishDefaults("gloss") },
            right_mirror: partOverrides.hood || { hex: "#14171D", name: "Negro Gloss", ...finishDefaults("gloss") }
          }
        : {}
    );
    const opt2Finish = chosenFinish === "matte" ? "metallic" : (chosenFinish === "gloss" ? "metallic" : chosenFinish);
    const opt2Stripes = stripeSpec
      ? [{
          ...stripeSpec,
          bandPos: stripeSpec.bandPos > 0.45 ? 0.30 : 0.76,
          thicknessPx: Math.max(4.5, stripeSpec.thicknessPx * 0.9),
          gapPx: Math.max(4, stripeSpec.gapPx * 1.15),
          name: `Franjas ${stripeSpec.colorName} (Cintura Alta)`
        }]
      : (vehicleInfo.hasDoors ? [{
          zone: "doors",
          style: "double-thin",
          thicknessPx: 5.5,
          gapPx: 5,
          bandPos: 0.76,
          colorHex: baseColor.hex === "#F1F5F9" || baseColor.hex === "#F8FAFC" ? "#14171D" : "#FFFFFF",
          colorName: baseColor.hex === "#F1F5F9" ? "Negro" : "Blanco",
          name: "Franjas Deportivas Finas"
        }] : []);

    const opt3Overrides = buildPartMapObj({
      ...(partOverrides.hood ? { roof: { ...partOverrides.hood, name: "Toldo Contraste" } } : {
        roof: { hex: "#14171D", name: "Negro Gloss", ...finishDefaults("gloss") },
        left_mirror: { hex: "#14171D", name: "Negro Gloss", ...finishDefaults("gloss") },
        right_mirror: { hex: "#14171D", name: "Negro Gloss", ...finishDefaults("gloss") }
      })
    });
    const opt3Finish = chosenFinish === "matte" ? "gloss" : "matte";
    const opt3Stripes = stripeSpec
      ? [{
          ...stripeSpec,
          zone: vehicleInfo.hasDoors ? "side" : stripeSpec.zone,
          style: stripeSpec.style === "single" ? "double-thin" : stripeSpec.style,
          bandPos: 0.72,
          thicknessPx: Math.max(4.2, stripeSpec.thicknessPx * 0.85),
          name: `Línea Contorno ${stripeSpec.colorName} (Costado)`
        }]
      : (vehicleInfo.hasHood ? [{
          zone: "hood",
          style: "double-racing",
          thicknessPx: 8,
          gapPx: 6,
          bandPos: 0.5,
          colorHex: "#FFFFFF",
          colorName: "Blanco",
          name: "Franjas Racing Cofre 3D"
        }] : []);

    const proposals = [
      {
        id: "prop-1",
        title: "Opción 1 · Fiel al Pedido",
        subtitle: `${baseColor.name} (${chosenFinish})${overrideLabels.length ? ` · ${overrideLabels[0]}` : ""}`,
        basePaint: { hex: baseColor.hex, name: baseColor.name, ...finishDefaults(chosenFinish) },
        partOverrides: buildPartMapObj(),
        stripes: opt1Stripes
      },
      {
        id: "prop-2",
        title: "Opción 2 · Contraste Deportivo",
        subtitle: `${baseColor.name} (${opt2Finish}) · Espejos a juego + línea estilizada`,
        basePaint: { hex: baseColor.hex, name: baseColor.name, ...finishDefaults(opt2Finish) },
        partOverrides: opt2Overrides,
        stripes: opt2Stripes
      },
      {
        id: "prop-3",
        title: "Opción 3 · Edición Taller Pro",
        subtitle: `${baseColor.name} (${opt3Finish}) · Bitono con toldo y flujo lateral`,
        basePaint: { hex: baseColor.hex, name: baseColor.name, ...finishDefaults(opt3Finish) },
        partOverrides: opt3Overrides,
        stripes: opt3Stripes
      }
    ];

    return {
      source: "local",
      detectedVehicle: null,
      thinkingSteps,
      proposals
    };
  }

  async _stageCanvasToJpegBase64(stageCanvas) {
    const tmp = document.createElement("canvas");
    tmp.width = 640;
    tmp.height = 360;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(stageCanvas, 0, 0, 640, 360);
    const dataUrl = tmp.toDataURL("image/jpeg", 0.82);
    return dataUrl.split(",")[1];
  }

  async analyzeWithGemini(rawPrompt, { stageCanvas, detectedParts, vehicleInfo }) {
    const { GoogleGenAI } = await import("https://cdn.jsdelivr.net/npm/@google/genai/+esm");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const base64Jpg = stageCanvas ? await this._stageCanvasToJpegBase64(stageCanvas) : null;
    const detectedPartIds = (detectedParts || []).map(p => p.id).join(", ");

    const systemPrompt = `Eres el diseñador senior de hojalatería y pintura de "El Rayo Autodesign Studio".
Analiza la foto del vehículo y la petición del cliente en español: "${rawPrompt}".
Piezas segmentadas disponibles en el canvas: [${detectedPartIds}].
Resuelve exactamente 3 propuestas visuales distintas y coherentes para el taller, usando estos finish válidos: "gloss", "metallic", "matte", "candy", "pearlescent".
Para franjas/viniles contorneados usa zone: "doors" | "side" | "hood" | "roof", style: "double-thin" | "double-racing" | "single" | "triple" | "spear", bandPos entre 0.22 y 0.82, thicknessPx entre 4 y 14, gapPx entre 4 y 10.
Responde ÚNICAMENTE con un JSON válido siguiendo el esquema solicitado.`;

    const schema = {
      type: "object",
      properties: {
        brand: { type: "string" },
        model: { type: "string" },
        originalColor: { type: "string" },
        thinkingSteps: { type: "array", items: { type: "string" } },
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              subtitle: { type: "string" },
              baseColorHex: { type: "string" },
              baseColorName: { type: "string" },
              finish: { type: "string" },
              partOverrides: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    partId: { type: "string" },
                    hex: { type: "string" },
                    name: { type: "string" },
                    finish: { type: "string" }
                  },
                  required: ["partId", "hex", "finish"]
                }
              },
              stripes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    zone: { type: "string" },
                    style: { type: "string" },
                    colorHex: { type: "string" },
                    bandPos: { type: "number" },
                    thicknessPx: { type: "number" },
                    gapPx: { type: "number" },
                    name: { type: "string" }
                  },
                  required: ["zone", "style", "colorHex"]
                }
              }
            },
            required: ["title", "subtitle", "baseColorHex", "baseColorName", "finish"]
          }
        }
      },
      required: ["thinkingSteps", "proposals"]
    };

    const inputParts = [{ type: "text", text: systemPrompt }];
    if (base64Jpg) {
      inputParts.push({ type: "image", data: base64Jpg, mime_type: "image/jpeg" });
    }

    const interaction = await ai.interactions.create({
      model: this.geminiModel || "gemini-3.5-flash-lite",
      input: inputParts,
      response_format: schema
    });

    const parsedJson = JSON.parse(interaction.output_text || "{}");
    if (!Array.isArray(parsedJson.proposals) || parsedJson.proposals.length === 0) {
      throw new Error("Respuesta vacía de Gemini");
    }

    const normalizedProposals = parsedJson.proposals.slice(0, 3).map((p, idx) => {
      const partMap = {};
      for (const ov of p.partOverrides || []) {
        if (!ov.partId) continue;
        partMap[ov.partId] = {
          hex: /^#[0-9a-f]{6}$/i.test(ov.hex || "") ? ov.hex.toUpperCase() : "#14171D",
          name: ov.name || ov.partId,
          ...finishDefaults(ov.finish || "gloss")
        };
      }
      return {
        id: `prop-${idx + 1}`,
        title: p.title || `Opción ${idx + 1}`,
        subtitle: p.subtitle || `${p.baseColorName} (${p.finish})`,
        basePaint: {
          hex: /^#[0-9a-f]{6}$/i.test(p.baseColorHex || "") ? p.baseColorHex.toUpperCase() : "#64748B",
          name: p.baseColorName || "Personalizado",
          ...finishDefaults(p.finish || "metallic")
        },
        partOverrides: partMap,
        stripes: (p.stripes || []).map(st => ({
          zone: st.zone || (vehicleInfo.hasDoors ? "doors" : "hood"),
          style: st.style || "double-thin",
          colorHex: /^#[0-9a-f]{6}$/i.test(st.colorHex || "") ? st.colorHex.toUpperCase() : "#FFFFFF",
          bandPos: typeof st.bandPos === "number" ? Math.max(0.18, Math.min(0.84, st.bandPos)) : 0.56,
          thicknessPx: typeof st.thicknessPx === "number" ? Math.max(4, Math.min(18, st.thicknessPx)) : 6,
          gapPx: typeof st.gapPx === "number" ? Math.max(3, Math.min(14, st.gapPx)) : 5,
          name: st.name || "Franjas Contorneadas 3D"
        }))
      };
    });

    // Asegurar siempre 3 opciones completando con motor local si hiciera falta
    if (normalizedProposals.length < 3) {
      const localBackup = this.parseDesignPromptLocal(rawPrompt, vehicleInfo);
      while (normalizedProposals.length < 3 && localBackup.proposals[normalizedProposals.length]) {
        normalizedProposals.push(localBackup.proposals[normalizedProposals.length]);
      }
    }

    return {
      source: "gemini",
      detectedVehicle: {
        brand: parsedJson.brand || "",
        model: parsedJson.model || "",
        originalColor: parsedJson.originalColor || ""
      },
      thinkingSteps: parsedJson.thinkingSteps,
      proposals: normalizedProposals
    };
  }

  async generateDesignProposals(rawPrompt, context) {
    const vehicleInfo = estimateVehicleVisualState(context.paintEngine, context.detectedParts, context.bodyMaskCanvas);
    if (this.hasGeminiKey() && navigator.onLine) {
      try {
        return await this.analyzeWithGemini(rawPrompt, { ...context, vehicleInfo });
      } catch (err) {
        console.warn("Gemini fallback al motor local El Rayo:", err);
        const fallback = this.parseDesignPromptLocal(rawPrompt, vehicleInfo);
        fallback.thinkingSteps.unshift(`Respaldo automático local activado (${err.message || "sin conexión Gemini"}).`);
        return fallback;
      }
    }
    return this.parseDesignPromptLocal(rawPrompt, vehicleInfo);
  }
}
