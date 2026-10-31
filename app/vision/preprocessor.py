"""
El Rayo AutoDesign Studio - Image Ingestion & Preprocessor
Module 2: Preprocessing pipeline for automotive workshop photographs.
- EXIF rotation normalization.
- Dynamic specular highlight and shadow decomposition.
- Contrast enhancement and luminance mapping for CAD vectorization.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Tuple, Optional
import numpy as np
from PIL import Image, ImageOps


@dataclass
class ProcessedVehicleImage:
    """Preprocessed vehicle container ready for segmentation and shaders."""
    image_path: str
    width: int
    height: int
    rgb_array: np.ndarray          # (H, W, 3) uint8
    gray_array: np.ndarray         # (H, W) uint8
    specular_map: np.ndarray       # (H, W) float32 in [0, 1]
    shadow_map: np.ndarray         # (H, W) float32 in [0, 1]
    aspect_ratio: float


class VehicleImagePreprocessor:
    """High-performance preprocessor for workshop car photographs."""

    def __init__(self, target_max_dimension: int = 1280):
        self.target_max_dimension = target_max_dimension

    def process(self, file_path: str) -> ProcessedVehicleImage:
        """Load, normalize EXIF orientation, resize if needed, and extract lighting maps."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"No se encontró el archivo de imagen: {file_path}")

        # 1. Load image and fix camera rotation
        raw_img = Image.open(path)
        img = ImageOps.exif_transpose(raw_img)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # 2. Scale down if larger than target dimension to keep CAD real-time responsiveness
        w, h = img.size
        max_dim = max(w, h)
        if max_dim > self.target_max_dimension:
            scale = self.target_max_dimension / float(max_dim)
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            w, h = new_w, new_h

        rgb_array = np.array(img, dtype=np.uint8)

        # 3. Grayscale conversion (Rec. 709 Luminance: 0.2126 R + 0.7152 G + 0.0722 B)
        weights = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        gray_float = np.tensordot(rgb_array.astype(np.float32), weights, axes=(-1, -1))
        gray_array = np.clip(gray_float, 0, 255).astype(np.uint8)

        # 4. Extract Specular Highlights & Shadows
        # Specular Highlights: High luminance pixels (clearcoat reflections)
        lum_norm = gray_float / 255.0
        # High-pass threshold for specular highlights
        specular_threshold = np.percentile(lum_norm, 85)
        specular_map = np.clip((lum_norm - specular_threshold) / (1.0 - specular_threshold + 1e-5), 0.0, 1.0)
        # Smooth specular map
        specular_map = np.power(specular_map, 1.4).astype(np.float32)

        # Shadows & Body Creases: Low luminance pixels
        shadow_threshold = np.percentile(lum_norm, 20)
        shadow_map = np.clip((shadow_threshold - lum_norm) / (shadow_threshold + 1e-5), 0.0, 1.0)
        shadow_map = np.power(shadow_map, 1.2).astype(np.float32)

        return ProcessedVehicleImage(
            image_path=str(path.resolve()),
            width=w,
            height=h,
            rgb_array=rgb_array,
            gray_array=gray_array,
            specular_map=specular_map,
            shadow_map=shadow_map,
            aspect_ratio=w / float(h)
        )
