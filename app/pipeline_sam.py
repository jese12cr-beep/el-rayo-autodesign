# -*- coding: utf-8 -*-
"""
El Rayo AutoDesign Studio - Ejecución de Prueba del Motor SAM & Fusión de Pintura
"""

import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.paint_engine.sam_paint_core import (
    inicializar_ia,
    generar_mascara_carroceria,
    preservar_luminancia,
    aplicar_color_blend,
    recomponer_imagen,
    renderizar_color_en_vehiculo
)

def main():
    print("===============================================================")
    print("  [EL RAYO AUTODESIGN] - EJECUTANDO MOTOR SAM & PINTURA FASE 1-4")
    print("===============================================================")

    # 1. Cargar imagen de prueba
    test_img_path = PROJECT_ROOT / "assets" / "test_car" / "angle_180_rear.jpg"
    if not test_img_path.exists():
        print(f"Error: No se encontró la imagen en {test_img_path}")
        return

    # Cargar con PIL y convertir a formato BGR (estándar OpenCV)
    pil_img = Image.open(str(test_img_path)).convert("RGB")
    rgb_arr = np.array(pil_img)
    imagen_bgr = rgb_arr[:, :, ::-1] # RGB -> BGR
    h, w, _ = imagen_bgr.shape
    print(f"Imagen cargada exitosamente: {w}x{h} píxeles")

    # 2. Inicializar IA (SAM)
    print("\n[FASE 1] Inicializando predictor IA SAM...")
    predictor = inicializar_ia()

    # Punto de prueba en la carrocería (por ejemplo, el portón trasero o costado)
    input_point = [int(w * 0.65), int(h * 0.52)]
    print(f"Punto de selección: {input_point}")

    mascara_auto = generar_mascara_carroceria(imagen_bgr, predictor, input_point=input_point)
    pixels_afectados = np.count_nonzero(mascara_auto)
    print(f"Máscara generada: {pixels_afectados} píxeles de carrocería seleccionados")

    # 3. Preservar Luminancia con LAB + CLAHE
    print("\n[FASE 2] Extrayendo canal de Luminancia (L) y aplicando CLAHE...")
    l_canal = preservar_luminancia(imagen_bgr)
    print(f"Canal L procesado: rango [{np.min(l_canal)}, {np.max(l_canal)}]")

    # 4. Colorización matemática (Blend Overlay / Multiply)
    rojo_candy = "#cc0000"
    print(f"\n[FASE 3] Aplicando colorización matemática ({rojo_candy}) con fórmula Overlay...")
    auto_pintado = aplicar_color_blend(l_canal, rojo_candy, tipo="overlay")

    # 5. Recomposición de capas y brillos especulares
    print("\n[FASE 4] Recomponiendo imagen con barniz y brillos especulares...")
    render_final_bgr = recomponer_imagen(imagen_bgr, auto_pintado, mascara_auto, intensidad_brillo=200)

    # Convertir de vuelta a RGB para guardar con PIL
    render_final_rgb = render_final_bgr[:, :, ::-1]
    output_path = PROJECT_ROOT / "assets" / "resultado_rojo_candy.jpg"
    Image.fromarray(render_final_rgb).save(str(output_path), quality=95)
    print(f"\n¡ÉXITO! Render final guardado en: {output_path}")

    # Guardar también la máscara para verificación visual
    mask_path = PROJECT_ROOT / "assets" / "mascara_sam.png"
    Image.fromarray(mascara_auto).save(str(mask_path))
    print(f"Máscara binaria guardada en: {mask_path}")
    print("===============================================================")

if __name__ == "__main__":
    main()
