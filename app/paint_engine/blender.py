"""
El Rayo AutoDesign Studio - Mathematical Paint Blender Engine
Module 3: Fast NumPy vectorized shader blender.
Accurately preserves original photographic highlights (specular) and shadows
while applying automotive formulas (OEM, Metallic, Pearl, Gloss, Neon).
"""

from typing import Dict, Any, Optional
import numpy as np
from app.paint_engine.finishes import AUTOMOTIVE_FINISHES, PaintFormula


class PaintBlender:
    """High-precision photographic automotive paint shader blender."""

    def __init__(self):
        self.finishes = AUTOMOTIVE_FINISHES

    def apply_paint_to_part(
        self,
        rgb_image: np.ndarray,          # (H, W, 3) uint8 original photo
        mask: np.ndarray,               # (H, W) bool piece mask
        hex_color: str,                 # e.g. "#FF1744"
        finish_id: str = "metallic",    # "oem", "metallic", "pearl", "gloss", "neon"
        specular_map: Optional[np.ndarray] = None, # (H, W) float32 [0, 1]
        shadow_map: Optional[np.ndarray] = None,   # (H, W) float32 [0, 1]
        flake_density: float = 0.75,
        specular_boost_override: Optional[float] = None
    ) -> np.ndarray:
        """
        Blends automotive paint onto masked vehicle panels, preserving
        natural specular highlights, reflections, and sheet-metal crease shadows.
        """
        if not np.any(mask):
            return rgb_image.copy()

        formula: PaintFormula = self.finishes.get(finish_id, self.finishes["metallic"])
        spec_boost = specular_boost_override if specular_boost_override is not None else formula.specular_boost

        # 1. Normalize image channels to float32 [0, 1]
        orig_float = rgb_image.astype(np.float32) / 255.0
        h, w, _ = orig_float.shape

        # 2. Extract relative luminance (Rec. 709)
        lum = 0.2126 * orig_float[..., 0] + 0.7152 * orig_float[..., 1] + 0.0722 * orig_float[..., 2]
        lum_3d = np.repeat(lum[..., np.newaxis], 3, axis=2)

        # 3. Target paint color in normalized RGB
        target_rgb = self._hex_to_rgb_norm(hex_color) # (3,)
        paint_base = np.zeros_like(orig_float)
        paint_base[:] = target_rgb

        # If Pearl finish, compute iridescent flip-flop hue shift
        if finish_id == "pearl":
            paint_base = self._apply_pearl_flip_flop(paint_base, lum, formula.flip_flop_shift)

        # 4. Execute Mathematical Blend Mode
        mode = formula.blend_mode.lower()
        if mode == "multiply": # OEM Agency finish
            blended = lum_3d * paint_base

        elif mode == "overlay": # Metallic with crisp reflection
            low = 2.0 * lum_3d * paint_base
            high = 1.0 - 2.0 * (1.0 - lum_3d) * (1.0 - paint_base)
            blended = np.where(lum_3d < 0.5, low, high)

        elif mode == "color_burn": # Super Gloss / Piano Black or Deep Clearcoat
            eps = 1e-4
            blended = 1.0 - (1.0 - lum_3d) / (paint_base + eps)
            blended = np.clip(blended, 0.0, 1.0)
            # Boost color depth
            blended = np.power(blended, 0.9)

        elif mode == "screen": # Neon Hi-Vis / Luminescent
            blended = 1.0 - (1.0 - lum_3d) * (1.0 - paint_base)
            # Add neon luminescence core
            blended += paint_base * 0.25

        elif mode == "soft_light": # Tri-coat pearl
            blended = (1.0 - 2.0 * paint_base) * (lum_3d ** 2) + 2.0 * paint_base * lum_3d

        else:
            blended = lum_3d * paint_base

        # 5. Metallic Flakes Simulation (Micro-facet aluminum glints)
        if formula.metallic_fraction > 0.0 and flake_density > 0.0:
            flakes = self._generate_metallic_flakes(h, w, flake_density * formula.metallic_fraction)
            flakes_3d = np.repeat(flakes[..., np.newaxis], 3, axis=2)
            # Flakes glint in highlight zones
            blended = np.clip(blended + flakes_3d * 0.28 * (lum_3d + 0.2), 0.0, 1.0)

        # 6. Re-inject Original Specular Highlights (Clearcoat Reflections)
        if specular_map is not None:
            spec_3d = np.repeat(specular_map[..., np.newaxis], 3, axis=2)
            # High-intensity specular reflection retains pure white sun / shop light
            blended = blended * (1.0 - spec_3d) + spec_3d * spec_boost

        # 7. Re-inject Body Seams and Crease Shadows (Depth Preservation)
        if shadow_map is not None:
            shad_3d = np.repeat(shadow_map[..., np.newaxis], 3, axis=2)
            # Subtract or multiply shadows to keep shut-lines dark and crisp
            blended = blended * (1.0 - shad_3d * 0.65)

        # 8. Clearcoat gloss enhancement (Fresnel contrast boost)
        if formula.clearcoat_gloss > 0.8:
            blended = np.clip(blended * 1.05, 0.0, 1.0)

        # 9. Composite onto original image using mask
        result = orig_float.copy()
        mask_3d = np.repeat(mask[..., np.newaxis], 3, axis=2)
        result = np.where(mask_3d, blended, result)

        return np.clip(result * 255.0, 0, 255).astype(np.uint8)

    def _hex_to_rgb_norm(self, hex_color: str) -> np.ndarray:
        clean = hex_color.lstrip("#")
        if len(clean) == 3:
            clean = "".join([c*2 for c in clean])
        r = int(clean[0:2], 16) / 255.0
        g = int(clean[2:4], 16) / 255.0
        b = int(clean[4:6], 16) / 255.0
        return np.array([r, g, b], dtype=np.float32)

    def _generate_metallic_flakes(self, h: int, w: int, intensity: float) -> np.ndarray:
        """Procedural aluminum micro-flake distribution."""
        np.random.seed(42)
        # Sparse high-intensity noise
        raw_noise = np.random.uniform(0.0, 1.0, (h, w)).astype(np.float32)
        flakes = np.where(raw_noise > (1.0 - 0.12 * intensity), raw_noise, 0.0)
        return flakes

    def _apply_pearl_flip_flop(self, base_paint: np.ndarray, lum: np.ndarray, shift_deg: float) -> np.ndarray:
        """Simulate two-tone angle-dependent color shift for tri-coat pearl."""
        # Shift red/blue channels based on surface normal luminance gradient
        shifted = base_paint.copy()
        # Flip factor derived from curvature (lum gradient)
        flip = np.clip((lum - 0.5) * (shift_deg / 45.0), -0.25, 0.25)
        shifted[..., 0] = np.clip(shifted[..., 0] + flip * 0.4, 0.0, 1.0) # Red shift
        shifted[..., 2] = np.clip(shifted[..., 2] - flip * 0.3, 0.0, 1.0) # Blue shift
        return shifted
