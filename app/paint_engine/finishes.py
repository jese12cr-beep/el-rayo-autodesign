"""
El Rayo AutoDesign Studio - Automotive Paint Formulas & Finishes
Module 3: Mathematical specification of realistic automotive paints:
- OEM (Agencia / Fábrica)
- Metálico (Flakes de aluminio / Escamas direccionales)
- Perlado (Tricapa / Flip-Flop iridiscente)
- Super Gloss / Piano (Alto brillo con barniz profundo)
- Neón Hi-Vis / Luminescente
"""

from dataclasses import dataclass
from typing import Dict, Tuple, List
import numpy as np


@dataclass
class PaintFormula:
    id: str
    name: str
    category: str
    blend_mode: str
    base_roughness: float       # 0.0 (espejo) a 1.0 (mate)
    metallic_fraction: float    # Proporción de partículas metálicas
    specular_boost: float       # Multiplicador de reflejo especular
    clearcoat_gloss: float      # Intensidad de la capa de barniz
    flip_flop_shift: float      # Ángulo de desplazamiento cromático (perlado)
    description: str


AUTOMOTIVE_FINISHES: Dict[str, PaintFormula] = {
    "oem": PaintFormula(
        id="oem",
        name="OEM (Agencia de Fábrica)",
        category="Solido / Poliuretano",
        blend_mode="multiply",
        base_roughness=0.22,
        metallic_fraction=0.0,
        specular_boost=1.0,
        clearcoat_gloss=0.82,
        flip_flop_shift=0.0,
        description="Esmalte automotriz monocapa estándar de equipo original con reflejo difuso natural."
    ),
    "metallic": PaintFormula(
        id="metallic",
        name="Metálico (Flakes de Aluminio)",
        category="Bicapa Metálica",
        blend_mode="overlay",
        base_roughness=0.15,
        metallic_fraction=0.85,
        specular_boost=1.45,
        clearcoat_gloss=0.92,
        flip_flop_shift=0.0,
        description="Micropartículas de aluminio de 15 a 35 micras que dispersan la luz en ángulos rasantes."
    ),
    "pearl": PaintFormula(
        id="pearl",
        name="Perlado (Tricapa / Flip-Flop)",
        category="Tricapa Iridiscente",
        blend_mode="soft_light",
        base_roughness=0.10,
        metallic_fraction=0.60,
        specular_boost=1.65,
        clearcoat_gloss=0.98,
        flip_flop_shift=35.0,  # 35 grados de variación de tono
        description="Escamas de mica sintética recubiertas de dióxido de titanio con interferencia óptica."
    ),
    "gloss": PaintFormula(
        id="gloss",
        name="Super Gloss / Piano (Alto Brillo)",
        category="Barniz Cerámico",
        blend_mode="color_burn",
        base_roughness=0.03,
        metallic_fraction=0.08,
        specular_boost=1.90,
        clearcoat_gloss=1.0,
        flip_flop_shift=0.0,
        description="Doble capa de transparente cerámico pulido a espejo con alta profundidad y contraste."
    ),
    "neon": PaintFormula(
        id="neon",
        name="Neón Hi-Vis / Luminescente",
        category="Flúor Especializado",
        blend_mode="screen",
        base_roughness=0.08,
        metallic_fraction=0.25,
        specular_boost=2.20,
        clearcoat_gloss=0.88,
        flip_flop_shift=0.0,
        description="Pigmentos fluorescentes con absorción ultravioleta y reemisión de alta luminosidad."
    ),
}
