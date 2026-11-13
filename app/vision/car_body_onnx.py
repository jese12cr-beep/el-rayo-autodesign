# -*- coding: utf-8 -*-
"""
El Rayo AutoDesign Studio - Motor Híbrido SegFormer + SlimSAM (ONNX)
1. SegFormer B0 (4.3 MB): Aísla al 100% el vehículo del fondo (calle, muros, árboles, cielo).
2. Detector Geométrico de Rines y Cristales: Ubica llantas+rines y ventanas como anclas negativas.
3. SlimSAM (Meta Segment Anything cuantizado, 13 MB): Segmenta con precisión sub-píxel cada panel
   pintable (Cofre, Salpicaderas, Puertas, Costados, Cajuela, Defensas, Toldo) y devuelve tanto
   la máscara maestra de carrocería como el mapeo lógico de piezas individuales.
"""

import io
import base64
import time
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

try:
    import onnxruntime as ort
    HAVE_ORT = True
except ImportError:
    HAVE_ORT = False

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SEGFORMER_PATH = PROJECT_ROOT / "assets" / "models" / "segformer_b0_cityscapes_quant.onnx"
if not SEGFORMER_PATH.exists():
    SEGFORMER_PATH = Path(__file__).resolve().parent / "segformer_b0_cityscapes_quant.onnx"

SLIMSAM_DIR = PROJECT_ROOT / "assets" / "models" / "slimsam"
SAM_ENC_PATH = SLIMSAM_DIR / "vision_encoder_quantized.onnx"
SAM_DEC_PATH = SLIMSAM_DIR / "prompt_encoder_mask_decoder_quantized.onnx"


def _mask_to_rgba_b64(mask_bool: np.ndarray) -> str:
    h, w = mask_bool.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask_bool] = [255, 255, 255, 255]
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


class CarBodyONNXSegmenter:
    """Motor de inferencia local SegFormer + SlimSAM sin dependencias de GPU."""
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.seg_sess = None
        self.sam_enc = None
        self.sam_dec = None
        self._load_models()

    def _load_models(self):
        if not HAVE_ORT:
            print("[CarBodyONNXSegmenter] ONNX Runtime no disponible.")
            return

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = 4

        if SEGFORMER_PATH.exists():
            try:
                self.seg_sess = ort.InferenceSession(str(SEGFORMER_PATH), sess_options=opts)
                print("[CarBodyONNXSegmenter] SegFormer B0 cargado.")
            except Exception as e:
                print(f"[CarBodyONNXSegmenter] Error cargando SegFormer: {e}")

        if SAM_ENC_PATH.exists() and SAM_DEC_PATH.exists():
            try:
                self.sam_enc = ort.InferenceSession(str(SAM_ENC_PATH), sess_options=opts)
                self.sam_dec = ort.InferenceSession(str(SAM_DEC_PATH), sess_options=opts)
                print("[CarBodyONNXSegmenter] SlimSAM Encoder + Decoder cargados.")
            except Exception as e:
                print(f"[CarBodyONNXSegmenter] Error cargando SlimSAM: {e}")

    def segment_car_body(self, image: Image.Image) -> tuple[Image.Image, dict]:
        """
        Analiza cualquier imagen de vehículo y devuelve:
        1. Máscara RGBA maestra (solo lámina pintable).
        2. Diccionario stats con métricas, bbox, y `parts` mapeadas lógicamente.
        """
        t0 = time.time()
        orig_w, orig_h = image.size
        rgb_img = image.convert("RGB")

        if self.seg_sess is None:
            mask_rgba, stats = self._adaptive_saliency_fallback(rgb_img)
            stats["inference_ms"] = round((time.time() - t0) * 1000, 1)
            return mask_rgba, stats

        # 1. SegFormer: Silueta exacta del vehículo
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        seg_in = rgb_img.resize((1024, 512), Image.Resampling.BILINEAR)
        s_arr = np.transpose((np.array(seg_in).astype(np.float32) / 255.0 - mean) / std, (2, 0, 1))[None, ...]
        logits = self.seg_sess.run(None, {"pixel_values": s_arr})[0][0]
        preds = np.argmax(logits, axis=0)
        veh_low = np.isin(preds, [13, 14, 15]).astype(np.uint8) * 255
        if np.sum(veh_low > 0) < 50:
            car_probs = 1.0 / (1.0 + np.exp(-logits[13]))
            veh_low = (car_probs > 0.35).astype(np.uint8) * 255

        car_mask = np.array(Image.fromarray(veh_low).resize((orig_w, orig_h), Image.Resampling.BILINEAR)) > 120
        car_pct = float(car_mask.mean() * 100)

        if car_pct < 3.0:
            rgba = np.zeros((orig_h, orig_w, 4), dtype=np.uint8)
            return Image.fromarray(rgba, mode="RGBA"), {
                "inference_ms": round((time.time() - t0) * 1000, 1),
                "method": "segformer_b0_onnx",
                "vehicle_detected": False,
                "car_coverage_pct": round(car_pct, 1),
                "body_coverage_pct": 0.0,
                "wheels_protected": 0,
                "parts": []
            }

        ys, xs = np.where(car_mask)
        y0, y1, x0, x1 = int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max())
        cw, ch = max(1, x1 - x0), max(1, y1 - y0)

        rgb_np = np.array(rgb_img).astype(np.float32)
        r, g, b = rgb_np[:, :, 0], rgb_np[:, :, 1], rgb_np[:, :, 2]
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        yy, xx = np.ogrid[:orig_h, :orig_w]

        # Color dominante de la lámina
        mid_band = car_mask & (yy >= y0 + 0.48 * ch) & (yy <= y0 + 0.74 * ch) & (xx >= x0 + 0.18 * cw) & (xx <= x0 + 0.82 * cw)
        sample_pts = mid_band if np.sum(mid_band) > 100 else car_mask
        med_r, med_g, med_b = float(np.median(r[sample_pts])), float(np.median(g[sample_pts])), float(np.median(b[sample_pts]))
        med_luma = 0.299 * med_r + 0.587 * med_g + 0.114 * med_b
        is_red = (med_r > 1.30 * med_g) and (med_r > 1.30 * med_b) and (med_r > 70)
        is_dark = med_luma < 52

        # 2. Detección de Llantas + Rines (elipses completas)
        tire_cand = car_mask & (yy >= y0 + 0.45 * ch) & (luma < (34 if is_dark else 52))
        col_counts = np.sum(tire_cand, axis=0)
        wheel_cols = np.where(col_counts > max(5, ch * 0.03))[0]
        wheel_mask = np.zeros((orig_h, orig_w), dtype=bool)
        wheel_centers = []

        if len(wheel_cols) > 0:
            groups, cur = [], [wheel_cols[0]]
            for c in wheel_cols[1:]:
                if c - cur[-1] < max(10, cw * 0.035):
                    cur.append(c)
                else:
                    groups.append(cur)
                    cur = [c]
            groups.append(cur)
            for grp in groups:
                wx0, wx1 = grp[0], grp[-1]
                if cw * 0.04 < (wx1 - wx0) < cw * 0.35:
                    wys = np.where(np.any(tire_cand[:, wx0:wx1 + 1], axis=1))[0]
                    if len(wys) > 0:
                        wy0, wy1 = int(wys.min()), int(wys.max())
                        if (wy1 - wy0) > ch * 0.12:
                            cx_w, cy_w = (wx0 + wx1) / 2.0, (wy0 + wy1) / 2.0
                            rx_w, ry_w = (wx1 - wx0) * 0.55, (wy1 - wy0) * 0.55
                            wheel_mask |= (((xx - cx_w) / max(1, rx_w)) ** 2 + ((yy - cy_w) / max(1, ry_w)) ** 2 <= 1.0)
                            wheel_centers.append([cx_w, cy_w])

        # 3. Puntos negativos inteligentes en cristales (zona superior de cabina)
        neg_pts = []
        for fx in [0.30, 0.42, 0.50, 0.62, 0.75]:
            for fy in [0.18, 0.26, 0.34]:
                gx = int(min(orig_w - 1, max(0, x0 + fx * cw)))
                gy = int(min(orig_h - 1, max(0, y0 + fy * ch)))
                if car_mask[gy, gx] and luma[gy, gx] < max(90.0, med_luma * 0.72):
                    neg_pts.append([float(gx), float(gy)])
        if not neg_pts:
            neg_pts = [[x0 + 0.42 * cw, y0 + 0.24 * ch], [x0 + 0.60 * cw, y0 + 0.24 * ch]]
        for wc in wheel_centers:
            neg_pts.append(wc)

        # 4. SlimSAM Multi-Panel si está disponible
        mapped_parts = []
        if self.sam_enc is not None and self.sam_dec is not None:
            scale = 1024.0 / max(orig_w, orig_h)
            nw, nh = int(round(orig_w * scale)), int(round(orig_h * scale))
            sam_arr = (np.array(rgb_img.resize((nw, nh), Image.Resampling.BILINEAR)).astype(np.float32) / 255.0 - mean) / std
            padded = np.zeros((1024, 1024, 3), dtype=np.float32)
            padded[:nh, :nw, :] = sam_arr
            img_emb, pos_emb = self.sam_enc.run(None, {"pixel_values": np.transpose(padded, (2, 0, 1))[None, ...]})

            mh, mw = int(round(nh / 4.0)), int(round(nw / 4.0))
            panel_probes = [
                ("cofre_frente", "Cofre / Frente", [x0 + 0.14 * cw, y0 + 0.50 * ch]),
                ("defensa_delantera", "Defensa Delantera", [x0 + 0.08 * cw, y0 + 0.64 * ch]),
                ("puerta_delantera", "Puerta Delantera", [x0 + 0.34 * cw, y0 + 0.60 * ch]),
                ("puerta_trasera", "Puerta Trasera", [x0 + 0.52 * cw, y0 + 0.58 * ch]),
                ("costado_trasero", "Costado / Salpicadera", [x0 + 0.72 * cw, y0 + 0.56 * ch]),
                ("cajuela_porton", "Cajuela / Portón", [x0 + 0.80 * cw, y0 + 0.50 * ch]),
                ("defensa_trasera", "Defensa Trasera", [x0 + 0.86 * cw, y0 + 0.68 * ch]),
                ("toldo", "Toldo / Techo", [x0 + 0.50 * cw, y0 + 0.06 * ch]),
            ]

            union_mask = np.zeros((orig_h, orig_w), dtype=bool)
            for pid, plabel, pt in panel_probes:
                px, py = int(min(orig_w - 1, max(0, pt[0]))), int(min(orig_h - 1, max(0, pt[1])))
                if not car_mask[py, px] or wheel_mask[py, px]:
                    continue
                if not is_red and r[py, px] > 85 and r[py, px] > 1.35 * g[py, px]:
                    continue

                pts = np.array([[[[p[0] * scale, p[1] * scale] for p in ([pt] + neg_pts)]]], dtype=np.float32)
                lbls = np.array([[[1] + [0] * len(neg_pts)]], dtype=np.int64)
                iou, masks = self.sam_dec.run(None, {
                    "input_points": pts,
                    "input_labels": lbls,
                    "image_embeddings": img_emb,
                    "image_positional_embeddings": pos_emb,
                })
                best = int(np.argmax(iou[0][0]))
                m_crop = masks[0, 0, best][:mh, :mw]
                m_bin = Image.fromarray(((m_crop > -0.25) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
                m_full = np.array(m_bin.resize((orig_w, orig_h), Image.Resampling.BILINEAR)) > 128
                m_full = m_full & car_mask & (~wheel_mask)

                if not is_red:
                    m_full &= ~((r > 80) & (r > 1.35 * g) & (r > 1.40 * b) & (b < 130))
                m_full &= ~((r > 155) & (g > 135) & (b < 75) & (yy > y0 + 0.55 * ch))

                area_pct = float(m_full.mean() * 100)
                if 0.6 < area_pct < 55.0:
                    union_mask |= m_full
                    mapped_parts.append({
                        "id": pid,
                        "label": plabel,
                        "area_pct": round(area_pct, 1),
                        "mask_b64": _mask_to_rgba_b64(m_full),
                    })
            body_mask = union_mask
            method_name = "segformer_slimsam_onnx"
        else:
            body_mask = car_mask & (~wheel_mask)
            if not is_red:
                body_mask &= ~((r > 80) & (r > 1.35 * g) & (r > 1.40 * b) & (b < 130))
            body_mask &= ~((r > 155) & (g > 135) & (b < 75) & (yy > y0 + 0.55 * ch))
            method_name = "segformer_b0_onnx"

        rgba = np.zeros((orig_h, orig_w, 4), dtype=np.uint8)
        rgba[body_mask] = [255, 255, 255, 255]
        mask_rgba = Image.fromarray(rgba, mode="RGBA")
        body_pct = float(body_mask.mean() * 100)
        elapsed_ms = round((time.time() - t0) * 1000, 1)

        return mask_rgba, {
            "inference_ms": elapsed_ms,
            "method": method_name,
            "vehicle_detected": True,
            "car_coverage_pct": round(car_pct, 1),
            "body_coverage_pct": round(body_pct, 1),
            "wheels_protected": len(wheel_centers),
            "bbox": [x0, y0, x1, y1],
            "car_color_detected": "red" if is_red else ("dark" if is_dark else "colored/neutral"),
            "parts": mapped_parts,
        }

    def _adaptive_saliency_fallback(self, rgb_img: Image.Image) -> tuple[Image.Image, dict]:
        w, h = rgb_img.size
        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        return Image.fromarray(rgba, mode="RGBA"), {
            "method": "no_model",
            "vehicle_detected": False,
            "car_coverage_pct": 0.0,
            "body_coverage_pct": 0.0,
            "wheels_protected": 0,
            "parts": [],
        }
