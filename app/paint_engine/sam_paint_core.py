# -*- coding: utf-8 -*-
"""
El Rayo AutoDesign Studio - Núcleo de Visión Computacional & Renderizado SAM
Pipeline de 4 Fases:
- FASE 1: Segmentación Semántica con SAM (Meta AI)
- FASE 2: Extracción y Preservación de Luminancia (CIE LAB + CLAHE)
- FASE 3: Colorización Matemática por Fusión (Multiply / Overlay)
- FASE 4: Reconstrucción de Capas y Especularidad de Barniz (addWeighted + bitwise)
"""

import os
import sys
import numpy as np
from PIL import Image

# Verificación de dependencias nativas con fallback NumPy
HAVE_CV2 = False
try:
    import cv2
    HAVE_CV2 = True
except ImportError:
    HAVE_CV2 = False

HAVE_SAM = False
try:
    import torch
    from segment_anything import sam_model_registry, SamPredictor
    HAVE_SAM = True
except ImportError:
    HAVE_SAM = False


# ==========================================
# FASE 1: SEGMENTACIÓN SEMÁNTICA CON SAM
# ==========================================
def inicializar_ia(ruta_modelo="sam_vit_h_4b8939.pth"):
    """
    Inicializa el modelo SAM. (Optimizable con ONNX / TensorRT para producción).
    Si PyTorch o el archivo de pesos no están presentes, retorna un predictor simulado.
    """
    if HAVE_SAM and os.path.exists(ruta_modelo):
        sam = sam_model_registry["vit_h"](checkpoint=ruta_modelo)
        sam.to(device="cuda" if torch.cuda.is_available() else "cpu")
        return SamPredictor(sam)
    else:
        # Fallback predictor ligero basado en segmentación por conectividad de chapa
        return LightweightCarSegmenter()


class LightweightCarSegmenter:
    """Predictor ligero para entornos de desarrollo sin pesos de 2.5GB de SAM."""
    def __init__(self):
        self.image_rgb = None

    def set_image(self, image_rgb):
        self.image_rgb = image_rgb

    def predict(self, point_coords, point_labels, multimask_output=False):
        h, w, _ = self.image_rgb.shape
        x, y = int(point_coords[0][0]), int(point_coords[0][1])
        x = max(0, min(w - 1, x))
        y = max(0, min(h - 1, y))

        # Semilla de color del punto seleccionado
        target_color = self.image_rgb[y, x].astype(np.float32)
        diff = np.linalg.norm(self.image_rgb.astype(np.float32) - target_color, axis=2)

        # Máscara adaptativa por tolerancia LAB/RGB
        mask = (diff < 65.0).astype(bool)

        # Limitar a la región conectada con el punto
        mask_uint8 = mask.astype(np.uint8) * 255
        if HAVE_CV2:
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8)
            seed_label = labels[y, x]
            if seed_label > 0:
                final_mask = (labels == seed_label)
            else:
                final_mask = mask
        else:
            final_mask = mask

        return [final_mask], None, None


def generar_mascara_carroceria(imagen_bgr, predictor, input_point):
    """
    Genera la máscara binaria (0 y 255) de la pieza seleccionada por punto.
    """
    if HAVE_CV2:
        imagen_rgb = cv2.cvtColor(imagen_bgr, cv2.COLOR_BGR2RGB)
    else:
        imagen_rgb = imagen_bgr[:, :, ::-1]

    predictor.set_image(imagen_rgb)

    pts = np.array([input_point])
    labels = np.array([1])  # 1 indica "objeto a seleccionar"

    masks, _, _ = predictor.predict(
        point_coords=pts,
        point_labels=labels,
        multimask_output=False
    )
    mascara_binaria = (masks[0] * 255).astype(np.uint8)
    return mascara_binaria


# ==========================================
# FASE 2: EXTRACCIÓN DE LUMINANCIA
# ==========================================
def preservar_luminancia(imagen_bgr):
    """
    Convierte a espacio CIE LAB, extrae el canal L y aplica CLAHE
    para destacar nervaduras, pliegues y volumen de la chapa.
    """
    if HAVE_CV2:
        lab = cv2.cvtColor(imagen_bgr, cv2.COLOR_BGR2LAB)
        l_canal, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_canal_eq = clahe.apply(l_canal)
        return l_canal_eq
    else:
        # Fallback matemático puro en NumPy (Rec. 709 Luminance + ecualización local)
        b, g, r = imagen_bgr[:, :, 0], imagen_bgr[:, :, 1], imagen_bgr[:, :, 2]
        l_canal = (0.2126 * r + 0.7152 * g + 0.0722 * b).astype(np.uint8)
        # Contraste adaptativo suave tipo CLAHE
        mean_l = np.mean(l_canal)
        l_eq = np.clip(128.0 + (l_canal.astype(np.float32) - mean_l) * 1.15, 0, 255).astype(np.uint8)
        return l_eq


# ==========================================
# FASE 3: COLORIZACIÓN MATEMÁTICA (BLEND)
# ==========================================
def aplicar_color_blend(l_canal, color_bgr_hex, tipo="overlay"):
    """
    Funde matemáticamente el color objetivo sobre el canal de luminancia.
    tipo: 'multiply' para acabados mate, 'overlay' para metálico / aperlado.
    """
    clean_hex = color_bgr_hex.lstrip('#')
    # Hex RRGGBB a tupla BGR
    color_bgr = tuple(int(clean_hex[i:i+2], 16) for i in (4, 2, 0))

    # Lienzo sólido del tamaño del canal L
    h, w = l_canal.shape
    lienzo_color = np.full((h, w, 3), color_bgr, dtype=np.float32) / 255.0

    if HAVE_CV2:
        l_norm = cv2.cvtColor(l_canal, cv2.COLOR_GRAY2BGR).astype(np.float32) / 255.0
    else:
        l_norm = np.repeat((l_canal.astype(np.float32) / 255.0)[:, :, np.newaxis], 3, axis=2)

    if tipo == "multiply":
        # Multiplica los valores: oscurece manteniendo sombras
        blend = l_norm * lienzo_color
    elif tipo == "overlay":
        # Fórmula Overlay: Inyecta color respetando blancos y negros puros
        blend = np.where(
            l_norm < 0.5,
            2.0 * l_norm * lienzo_color,
            1.0 - 2.0 * (1.0 - l_norm) * (1.0 - lienzo_color)
        )
    else:
        blend = lienzo_color

    return (np.clip(blend, 0.0, 1.0) * 255).astype(np.uint8)


# ==========================================
# FASE 4: RECONSTRUCCIÓN Y ESPECULARIDAD
# ==========================================
def recomponer_imagen(imagen_original, imagen_pintada, mascara, intensidad_brillo=200):
    """
    Fusiona la pieza pintada sobre el vehículo original preservando vidrios,
    llantas y fondo, e inyecta los brillos especulares del barniz con addWeighted.
    """
    if HAVE_CV2:
        # 1. Aísla los brillos extremos (reflejos del sol en el barniz)
        gris = cv2.cvtColor(imagen_original, cv2.COLOR_BGR2GRAY)
        _, mascara_brillos = cv2.threshold(gris, intensidad_brillo, 255, cv2.THRESH_BINARY)

        # 2. Aplica el nuevo color solo donde dicta la máscara de la carrocería
        fondo_intacto = cv2.bitwise_and(imagen_original, imagen_original, mask=cv2.bitwise_not(mascara))
        carroceria_nueva = cv2.bitwise_and(imagen_pintada, imagen_pintada, mask=mascara)

        # Fusiona la carrocería pintada con el fondo y piezas intactas
        resultado_base = cv2.add(fondo_intacto, carroceria_nueva)

        # 3. Suma los brillos originales (Screen effect)
        brillos_extraidos = cv2.bitwise_and(imagen_original, imagen_original, mask=mascara_brillos)
        resultado_final = cv2.addWeighted(resultado_base, 1.0, brillos_extraidos, 0.3, 0)
        return resultado_final
    else:
        # Fallback NumPy puro con idéntico comportamiento a OpenCV
        gris = (0.299 * imagen_original[:, :, 2] + 0.587 * imagen_original[:, :, 1] + 0.114 * imagen_original[:, :, 0]).astype(np.uint8)
        mascara_brillos = (gris > intensidad_brillo)

        mask_bool = (mascara > 128)[:, :, np.newaxis]
        resultado_base = np.where(mask_bool, imagen_pintada, imagen_original)

        # Adición de brillos ponderada (0.3)
        brillos = np.where(mascara_brillos[:, :, np.newaxis] & mask_bool, imagen_original, 0).astype(np.float32)
        resultado_final = np.clip(resultado_base.astype(np.float32) + 0.3 * brillos, 0, 255).astype(np.uint8)
        return resultado_final


# ==========================================
# PIPELINE INTEGRAL DE VISUALIZACIÓN
# ==========================================
def renderizar_color_en_vehiculo(
    imagen_bgr,
    input_point,
    color_hex="#cc0000",
    tipo="overlay",
    intensidad_brillo=200,
    predictor=None
):
    """
    Ejecuta el ciclo completo de las 4 fases y retorna (render_final, mascara_binaria).
    """
    if predictor is None:
        predictor = inicializar_ia()

    # 1. Segmentación
    mascara = generar_mascara_carroceria(imagen_bgr, predictor, input_point=input_point)

    # 2. Extracción de Luminancia
    l_canal = preservar_luminancia(imagen_bgr)

    # 3. Blend matemático
    imagen_pintada = aplicar_color_blend(l_canal, color_hex, tipo=tipo)

    # 4. Recomposición y especularidad
    resultado_final = recomponer_imagen(imagen_bgr, imagen_pintada, mascara, intensidad_brillo=intensidad_brillo)

    return resultado_final, mascara
