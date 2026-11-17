/* El Rayo — Cotizador Automotriz (14 piezas + catalizador 2:1 + IVA 16%) */

export const BODY_PARTS_CATALOG = [
  { id: "cofre", name: "Cofre / Capó", baseLiters: 0.45, clearLiters: 0.40, laborHours: 3.5, basePrice: 2800 },
  { id: "toldo", name: "Toldo / Techo", baseLiters: 0.50, clearLiters: 0.45, laborHours: 4.0, basePrice: 3100 },
  { id: "cajuela", name: "Cajuela / Tapa Trasera", baseLiters: 0.38, clearLiters: 0.34, laborHours: 3.0, basePrice: 2450 },
  { id: "puerta-del-izq", name: "Puerta Delantera Izquierda", baseLiters: 0.36, clearLiters: 0.32, laborHours: 3.2, basePrice: 2500 },
  { id: "puerta-del-der", name: "Puerta Delantera Derecha", baseLiters: 0.36, clearLiters: 0.32, laborHours: 3.2, basePrice: 2500 },
  { id: "puerta-tras-izq", name: "Puerta Trasera Izquierda", baseLiters: 0.32, clearLiters: 0.28, laborHours: 2.8, basePrice: 2300 },
  { id: "puerta-tras-der", name: "Puerta Trasera Derecha", baseLiters: 0.32, clearLiters: 0.28, laborHours: 2.8, basePrice: 2300 },
  { id: "defensa-del", name: "Defensa / Fascia Delantera", baseLiters: 0.34, clearLiters: 0.30, laborHours: 3.0, basePrice: 2400 },
  { id: "defensa-tras", name: "Defensa / Fascia Trasera", baseLiters: 0.34, clearLiters: 0.30, laborHours: 3.0, basePrice: 2400 },
  { id: "salpicadera-izq", name: "Salpicadera Delantera Izq.", baseLiters: 0.26, clearLiters: 0.24, laborHours: 2.4, basePrice: 1950 },
  { id: "salpicadera-der", name: "Salpicadera Delantera Der.", baseLiters: 0.26, clearLiters: 0.24, laborHours: 2.4, basePrice: 1950 },
  { id: "costado-izq", name: "Costado / Quarter Tras. Izq.", baseLiters: 0.38, clearLiters: 0.34, laborHours: 3.4, basePrice: 2650 },
  { id: "costado-der", name: "Costado / Quarter Tras. Der.", baseLiters: 0.38, clearLiters: 0.34, laborHours: 3.4, basePrice: 2650 },
  { id: "espejos", name: "Par de Espejos / Carcasas", baseLiters: 0.12, clearLiters: 0.10, laborHours: 1.2, basePrice: 950 }
];

const REPAIR_TIERS = {
  repintado: { label: "Repintado Estándar", laborMult: 1.0 },
  hojalateria: { label: "Hojalatería Media y Plasteo", laborMult: 1.35 },
  restauracion: { label: "Resane Profundo / Restauración", laborMult: 1.75 }
};

const FINISH_MULT = {
  gloss: 1.0,
  metallic: 1.15,
  pearl: 1.35,
  matte: 1.25
};

const MATERIAL_UNIT_COSTS = {
  basePerLiter: 1850,
  clearPerLiter: 1450,
  catalystPerLiter: 1120,
  laborPerHour: 460
};

export class QuoteCalculator {
  constructor() {
    this.selectedIds = new Set();
    this.repairTier = "repintado";
    this.finish = "metallic";
    this.maskCoveragePct = 0;
  }

  setPartSelected(id, checked) {
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
  }

  selectAllParts() {
    for (const part of BODY_PARTS_CATALOG) {
      this.selectedIds.add(part.id);
    }
  }

  clearParts() {
    this.selectedIds.clear();
  }

  setRepairTier(tier) {
    if (REPAIR_TIERS[tier]) this.repairTier = tier;
  }

  setFinish(finish) {
    this.finish = finish || "metallic";
  }

  setMaskCoveragePct(pct) {
    this.maskCoveragePct = Math.max(0, Math.min(100, Number(pct) || 0));
  }

  calculate() {
    const tierInfo = REPAIR_TIERS[this.repairTier] || REPAIR_TIERS.repintado;
    const finishFactor = FINISH_MULT[this.finish] || 1.15;

    let baseLiters = 0;
    let clearLiters = 0;
    let laborHours = 0;
    let baseJobSubtotal = 0;
    let isAiEstimate = false;

    const chosen = BODY_PARTS_CATALOG.filter(p => this.selectedIds.has(p.id));

    if (chosen.length > 0) {
      for (const p of chosen) {
        baseLiters += p.baseLiters;
        clearLiters += p.clearLiters;
        laborHours += p.laborHours * tierInfo.laborMult;
        baseJobSubtotal += p.basePrice * finishFactor + (p.laborHours * (tierInfo.laborMult - 1) * MATERIAL_UNIT_COSTS.laborPerHour);
      }
    } else {
      isAiEstimate = true;
      // Estimación proporcional al área detectada por MobileSAM (típico carro completo ~18%–35% del lienzo 16:9)
      const normalizedSpan = Math.max(0.12, Math.min(1.0, this.maskCoveragePct > 0 ? this.maskCoveragePct / 28.0 : 0.25));
      baseLiters = 3.8 * normalizedSpan;
      clearLiters = 3.4 * normalizedSpan;
      laborHours = 28.0 * normalizedSpan * tierInfo.laborMult;
      baseJobSubtotal =
        baseLiters * MATERIAL_UNIT_COSTS.basePerLiter * finishFactor +
        clearLiters * MATERIAL_UNIT_COSTS.clearPerLiter +
        (clearLiters * 0.5) * MATERIAL_UNIT_COSTS.catalystPerLiter +
        laborHours * MATERIAL_UNIT_COSTS.laborPerHour;
    }

    // Relación de catalizador 2:1 respecto al transparente (barniz)
    const catalystLiters = clearLiters * 0.5;
    const subtotal = Math.round(baseJobSubtotal);
    const iva = Math.round(subtotal * 0.16);
    const total = subtotal + iva;

    return {
      isAiEstimate,
      maskCoveragePct: this.maskCoveragePct,
      selectedParts: chosen,
      tierLabel: tierInfo.label,
      finishFactor,
      baseLiters: Number(baseLiters.toFixed(2)),
      clearLiters: Number(clearLiters.toFixed(2)),
      catalystLiters: Number(catalystLiters.toFixed(2)),
      laborHours: Number(laborHours.toFixed(1)),
      baseCost: Math.round(baseLiters * MATERIAL_UNIT_COSTS.basePerLiter * finishFactor),
      clearAndCatCost: Math.round(
        clearLiters * MATERIAL_UNIT_COSTS.clearPerLiter +
        catalystLiters * MATERIAL_UNIT_COSTS.catalystPerLiter
      ),
      laborCost: Math.round(laborHours * MATERIAL_UNIT_COSTS.laborPerHour),
      subtotal,
      iva,
      total
    };
  }
}
