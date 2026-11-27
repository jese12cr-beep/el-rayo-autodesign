/* El Rayo — Asistente IA de Taller (Diagnóstico de Recepción y Ficha Técnica de Cabina) */
import { PARTS_CATALOG, FINISH_PROFILES } from "./quoteCalculator.js?v=15";

const KEYWORD_PART_MAP = [
  { regex: /\b(cofre|capo|capó)\b/i, partId: "cofre" },
  { regex: /\b(toldo|techo|quemacocos)\b/i, partId: "toldo" },
  { regex: /\b(cajuela|batea|tapa trasera)\b/i, partId: "cajuela" },
  { regex: /\b(defensa delantera|facia delantera|fascia delantera|parachoques delantero)\b/i, partId: "defensa-del" },
  { regex: /\b(defensa trasera|facia trasera|fascia trasera|parachoques trasero)\b/i, partId: "defensa-tras" },
  { regex: /\b(facia|fascia|defensa)\b/i, partId: "defensa-del" },
  { regex: /\b(puerta delantera izquierda|puerta piloto|puerta izq)\b/i, partId: "puerta-del-izq" },
  { regex: /\b(puerta delantera derecha|puerta copiloto|puerta der)\b/i, partId: "puerta-del-der" },
  { regex: /\b(puerta trasera izquierda)\b/i, partId: "puerta-tras-izq" },
  { regex: /\b(puerta trasera derecha)\b/i, partId: "puerta-tras-der" },
  { regex: /\b(salpicadera izquierda|guardafango izquierdo)\b/i, partId: "salpicadera-izq" },
  { regex: /\b(salpicadera derecha|guardafango derecho)\b/i, partId: "salpicadera-der" },
  { regex: /\b(costado izquierdo|estribo izquierdo)\b/i, partId: "costado-izq" },
  { regex: /\b(costado derecho|estribo derecho)\b/i, partId: "costado-der" },
  { regex: /\b(espejo|espejos|retrovisor)\b/i, partId: "espejos" }
];

export class AIWorkshopAssistant {
  /**
   * Analiza el texto de diagnóstico en recepción y la cobertura detectada en el canvas
   * para sugerir piezas del catálogo y alertar sobre insumos extra necesarios.
   */
  analyzeDamageAndNotes({ notesText = "", maskCoverage = 0, currentParts = [] } = {}) {
    const suggestedParts = new Set(currentParts.map(id => String(id).replace(/_/g, "-")));
    const recommendations = [];
    const covNorm = maskCoverage > 1 ? maskCoverage / 100 : maskCoverage;

    // 1. Detección semántica de piezas mencionadas en las notas de recepción
    for (const rule of KEYWORD_PART_MAP) {
      if (rule.regex.test(notesText)) {
        suggestedParts.add(rule.partId);
      }
    }

    // 2. Reglas de diagnóstico automotriz para evitar cotizaciones incompletas
    if (/ba[ñn]o completo|cambio de color|todo el auto|general/i.test(notesText) || covNorm > 0.24) {
      Object.keys(PARTS_CATALOG).forEach(id => suggestedParts.add(id));
      recommendations.push("Se detectó cambio de color o baño general: se sugieren todos los paneles exteriores (14 piezas).");
    }

    if (/golpe|abolladura|sumido|enderezado|choque/i.test(notesText)) {
      recommendations.push("Incluye trabajo de hojalatería: considera nivel 'Hojalatería Media', pasta automotriz, primer de relleno y lija P80–P320.");
    }

    if (/oxid[oa]|corrosi[oó]n|pelado|quemado por el sol/i.test(notesText)) {
      recommendations.push("Superficie dañada / oxidación: se recomienda pelado a lámina y primer epóxico anticorrosivo antes del bicapa.");
    }

    if (/perlado|tricapa|candy/i.test(notesText)) {
      recommendations.push("Sistema tricapa detectado: añadir base fondeadora (groundcoat) + capa de efecto/perla y prueba de igualación en placa.");
    }

    if (/pulido|brillo|encerado|descontaminado/i.test(notesText)) {
      recommendations.push("Estética y pulido: incluir lija al agua P2000–P3000 y pulimento de corte medio + abrillantador sin silicona.");
    }

    if (suggestedParts.size === 0 && covNorm > 0.05) {
      recommendations.push(`Área pintada detectada (${Math.round(covNorm * 100)}% del lienzo). Selecciona en la pestaña "Piezas" los paneles exactos para mayor precisión.`);
    }

    if (recommendations.length === 0) {
      recommendations.push("Preparación estándar: desengrasado antisilicona, lijado P400–P600, sellador húmedo sobre húmedo y barniz altos sólidos 2:1.");
    }

    return {
      suggestedParts: Array.from(suggestedParts),
      recommendations
    };
  }

  /**
   * Genera la ficha técnica de mezcla para cabina de pintura según el acabado y litros cotizados.
   */
  generatePainterMixFormula({ colorHex = "#2563EB", colorName = "Azul Cobalto", finish = "metallic", quote = {} } = {}) {
    const profile = FINISH_PROFILES[finish] || FINISH_PROFILES.metallic;
    const baseLiters = Number(quote?.baseLiters || 0.5);
    const clearLiters = Number(quote?.clearLiters ?? quote?.clearcoatLiters ?? 0.4);

    // Dilución estándar bicapa 1:1 y transparente altos sólidos 2:1 con 10% reductor
    const reducerLiters = Number((baseLiters * 1.0).toFixed(2));
    const hardenerLiters = Number((clearLiters * 0.5).toFixed(2));
    const clearReducerLiters = Number((clearLiters * 0.1).toFixed(2));

    let coatsAdvice = "2 a 3 manos cubrientes de color sólido + 2 manos de transparente altos sólidos.";
    let bakeSpec = "Oreo entre manos: 5–8 min a 20°C · Horneado en cabina: 30 min a 60°C.";

    if (finish === "metallic") {
      coatsAdvice = "2 manos húmedas de base + 1 mano de control (orientación de partícula) a 2.0 bar; 2 manos de transparente HS.";
    } else if (finish === "pearl") {
      coatsAdvice = "2 manos de base fondeadora + 2 manos de efecto perlado (orientación cruzada) + 2 manos de transparente HS.";
      bakeSpec = "Oreo entre manos: 8–10 min · Horneado en cabina: 35 min a 60°C.";
    } else if (finish === "candy") {
      coatsAdvice = "2 manos de base metálica plata/oro + 3 manos translúcidas de tinta Candy + 2 manos de transparente HS UV.";
      bakeSpec = "Oreo entre manos: 10 min · Horneado en cabina: 35 min a 60°C.";
    } else if (finish === "matte") {
      coatsAdvice = "2 manos uniformes de base + 2 manos cerradas de barniz mate satinado (NO pulir tras secado).";
      bakeSpec = "Oreo entre manos: 10–12 min · Horneado en cabina: 30 min a 55°C.";
    }

    return {
      title: `Ficha Técnica Cabina — ${colorName} (${String(colorHex).toUpperCase()})`,
      finishLabel: profile.label,
      mixBreakdown: [
        `Base Color (${profile.label}): ${baseLiters.toFixed(2)} L + Reductor Acrílico (1:1): ${reducerLiters.toFixed(2)} L`,
        `Transparente HS: ${clearLiters.toFixed(2)} L + Catalizador (2:1): ${hardenerLiters.toFixed(2)} L + Reductor (10%): ${clearReducerLiters.toFixed(2)} L`
      ],
      applicationSpec: coatsAdvice,
      bakeSpec
    };
  }
}
