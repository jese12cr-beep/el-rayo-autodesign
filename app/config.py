"""
El Rayo AutoDesign Studio - Global Configuration & Palette
Industrial-grade CAD Automotive Customization Suite
"""
from dataclasses import dataclass
from typing import Dict, List, Tuple
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
WEB_CANVAS_DIR = BASE_DIR / "app" / "web_canvas"
ASSETS_DIR = BASE_DIR / "app" / "assets"

# App Metadata
APP_NAME = "El Rayo AutoDesign Studio"
APP_VERSION = "2.4.0-CAD.Preview"
TAGLINE = "Hojalatería, Pintura & Personalización Industrial"

# Automotive Body Parts Definition for SAM / Semantic Segmentation
CAR_PARTS: Dict[str, Dict[str, str]] = {
    "cofre": {"label": "Cofre (Hood)", "color": "#00F2FE", "icon": "⚡"},
    "toldo": {"label": "Toldo (Roof)", "color": "#7F00FF", "icon": "🔝"},
    "puerta_del_izq": {"label": "Puerta Delantera Izq", "color": "#00C9FF", "icon": "🚪"},
    "puerta_del_der": {"label": "Puerta Delantera Der", "color": "#92FE9D", "icon": "🚪"},
    "puerta_tras_izq": {"label": "Puerta Trasera Izq", "color": "#FEE140", "icon": "🚪"},
    "puerta_tras_der": {"label": "Puerta Trasera Der", "color": "#FA709A", "icon": "🚪"},
    "fascia_del": {"label": "Fascia / Defensa Delantera", "color": "#FF0844", "icon": "🛡️"},
    "fascia_tras": {"label": "Fascia / Defensa Trasera", "color": "#FFB199", "icon": "🛡️"},
    "rines": {"label": "Rines de Aleación", "color": "#E0C3FC", "icon": "⚙️"},
    "vidrios": {"label": "Cristales & Parabrisas", "color": "#8EC5FC", "icon": "🪟"},
}

# Paint Finishes & Formulas
PAINT_FINISHES = [
    {
        "id": "oem",
        "name": "OEM (Agencia de Fábrica)",
        "blend_mode": "multiply",
        "specular_boost": 1.0,
        "roughness": 0.25,
        "metallic": 0.0,
        "clearcoat": 0.8,
    },
    {
        "id": "metallic",
        "name": "Metálico (Flakes de Aluminio)",
        "blend_mode": "overlay",
        "specular_boost": 1.45,
        "roughness": 0.18,
        "metallic": 0.85,
        "clearcoat": 0.95,
    },
    {
        "id": "pearl",
        "name": "Perlado (Tricapa / Flip-Flop)",
        "blend_mode": "soft_light",
        "specular_boost": 1.6,
        "roughness": 0.12,
        "metallic": 0.6,
        "clearcoat": 1.0,
    },
    {
        "id": "gloss",
        "name": "Super Gloss / Piano (Alto Brillo)",
        "blend_mode": "color_burn",
        "specular_boost": 1.8,
        "roughness": 0.05,
        "metallic": 0.1,
        "clearcoat": 1.0,
    },
    {
        "id": "neon",
        "name": "Neón Hi-Vis / Luminescente",
        "blend_mode": "screen",
        "specular_boost": 2.2,
        "roughness": 0.08,
        "metallic": 0.3,
        "clearcoat": 0.9,
    },
]

# Glassmorphism Color Tokens (Dark Cyberpunk / Industrial Slate)
COLOR_TOKENS = {
    "bg_dark": "#0A0D14",
    "bg_glass_deep": "rgba(14, 18, 28, 0.82)",
    "bg_glass_surface": "rgba(22, 28, 42, 0.65)",
    "bg_glass_elevated": "rgba(32, 40, 60, 0.75)",
    "border_glass": "rgba(255, 255, 255, 0.09)",
    "border_active": "rgba(0, 242, 254, 0.55)",
    "accent_cyan": "#00F2FE",
    "accent_electric": "#4FACFE",
    "accent_amber": "#FFB703",
    "accent_danger": "#FF3366",
    "text_primary": "#F2F5F9",
    "text_secondary": "#9AA5B8",
    "text_muted": "#5A667A",
}
