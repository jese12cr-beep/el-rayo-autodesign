# -*- coding: utf-8 -*-
"""
El Rayo AutoDesign Studio - Motor Especializado de Autopartes ONNX
Modelo 1: YOLO26-s Car Parts Segmentation (33 clases automotrices nativas):
  - Piezas pintables: hood, front-bumper, back-bumper, left/right fender,
    left/right front-door, left/right back-door, left/right quarter-panel,
    left/right rocker-panel, roof, trunk, left/right mirror.
  - Exclusiones quirúrgicas: windshield, back-windshield, ventanas laterales,
    llantas y rines, faros, calaveras, parrilla y placa.
Modelo 2: SegFormer B0 (Cityscapes):
  - Refina los postes A/C conectados al vehículo protagonista sin tocar fondo ni
    autos estacionados.
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
YOLO_PARTS_PATH = PROJECT_ROOT / "assets" / "models" / "carparts" / "parts_segmentation.onnx"
SEGFORMER_PATH = PROJECT_ROOT / "assets" / "models" / "segformer_b0_cityscapes_quant.onnx"
if not SEGFORMER_PATH.exists():
    SEGFORMER_PATH = Path(__file__).resolve().parent / "segformer_b0_cityscapes_quant.onnx"

CARPART_NAMES = {
    0: "back-bumper", 1: "back-windshield", 2: "front-bumper", 3: "grille", 4: "hood",
    5: "left_back-door", 6: "left_back-wheel", 7: "left_back-window", 8: "left_fender",
    9: "left_front-door", 10: "left_front-wheel", 11: "left_front-window",
    12: "left_headlight", 13: "left_mirror", 14: "left_quarter-panel",
    15: "left_rocker-panel", 16: "left_tail-light", 17: "license-plate",
    18: "right_back-door", 19: "right_back-wheel", 20: "right_back-window",
    21: "right_fender", 22: "right_front-door", 23: "right_front-wheel",
    24: "right_front-window", 25: "right_headlight", 26: "right_mirror",
    27: "right_quarter-panel", 28: "right_rocker-panel", 29: "right_tail-light",
    30: "roof", 31: "trunk", 32: "windshield",
}

EXCLUDE_CLASSES = {
    "windshield", "back-windshield",
    "left_front-window", "left_back-window", "right_front-window", "right_back-window",
    "left_front-wheel", "left_back-wheel", "right_front-wheel", "right_back-wheel",
    "left_headlight", "right_headlight", "left_tail-light", "right_tail-light",
    "grille", "license-plate",
}

PART_LABELS_ES = {
    "hood": ("Cofre", 1),
    "front-bumper": ("Defensa Delantera", 2),
    "left_fender": ("Salpicadera Delantera (Izq)", 3),
    "right_fender": ("Salpicadera Delantera (Der)", 4),
    "left_front-door": ("Puerta Delantera (Izq)", 5),
    "right_front-door": ("Puerta Delantera (Der)", 6),
    "left_back-door": ("Puerta Trasera (Izq)", 7),
    "right_back-door": ("Puerta Trasera (Der)", 8),
    "left_quarter-panel": ("Costado Trasero (Izq)", 9),
    "right_quarter-panel": ("Costado Trasero (Der)", 10),
    "left_rocker-panel": ("Estribo / Faldón (Izq)", 11),
    "right_rocker-panel": ("Estribo / Faldón (Der)", 12),
    "trunk": ("Cajuela / Portón", 13),
    "back-bumper": ("Defensa Trasera", 14),
    "roof": ("Toldo / Techo", 15),
    "left_mirror": ("Espejo Retrovisor (Izq)", 16),
    "right_mirror": ("Espejo Retrovisor (Der)", 17),
}


def _mask_to_rgba_b64(mask_bool: np.ndarray) -> str:
    h, w = mask_bool.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask_bool] = [255, 255, 255, 255]
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def _nms_boxes(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float = 0.50) -> list[int]:
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        order = order[1:][iou <= iou_thresh]
    return keep


class CarBodyONNXSegmenter:
    """Motor de inferencia local YOLO26 Car-Parts + SegFormer sin dependencias de GPU."""
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.yolo_sess = None
        self.seg_sess = None
        self._load_models()

    def _load_models(self):
        if not HAVE_ORT:
            print("[CarBodyONNXSegmenter] ONNX Runtime no disponible.")
            return

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.intra_op_num_threads = 4

        if YOLO_PARTS_PATH.exists():
            try:
                self.yolo_sess = ort.InferenceSession(str(YOLO_PARTS_PATH), sess_options=opts)
                print("[CarBodyONNXSegmenter] YOLO26 Car-Parts cargado.")
            except Exception as e:
                print(f"[CarBodyONNXSegmenter] Error cargando YOLO26 Car-Parts: {e}")

        if SEGFORMER_PATH.exists():
            try:
                self.seg_sess = ort.InferenceSession(str(SEGFORMER_PATH), sess_options=opts)
                print("[CarBodyONNXSegmenter] SegFormer B0 cargado.")
            except Exception as e:
                print(f"[CarBodyONNXSegmenter] Error cargando SegFormer: {e}")

    def _segformer_car_mask(self, rgb_img: Image.Image, ow: int, oh: int) -> np.ndarray | None:
        if self.seg_sess is None:
            return None
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        s_in = np.transpose(
            (np.array(rgb_img.resize((1024, 512), Image.Resampling.BILINEAR), dtype=np.float32) / 255.0 - mean) / std,
            (2, 0, 1),
        )[None, ...]
        logits = self.seg_sess.run(None, {"pixel_values": s_in})[0][0]
        preds = np.argmax(logits, axis=0)
        veh_128 = np.isin(preds, [13, 14, 15])
        if np.sum(veh_128) < 50:
            car_probs = 1.0 / (1.0 + np.exp(-logits[13]))
            veh_128 = car_probs > 0.35

        return np.array(
            Image.fromarray(veh_128.astype(np.uint8) * 255).resize((ow, oh), Image.Resampling.BILINEAR)
        ) > 120

    def segment_car_body(self, image: Image.Image) -> tuple[Image.Image, dict]:
        """
        Analiza cualquier imagen de vehículo y devuelve:
        1. Máscara RGBA maestra (solo lámina pintable).
        2. Diccionario stats con métricas, bbox y lista `parts` ordenada por pieza.
        """
        t0 = time.time()
        orig_w, orig_h = image.size
        rgb_img = image.convert("RGB")
        rgb_np = np.array(rgb_img, dtype=np.float32)
        luma = 0.299 * rgb_np[:, :, 0] + 0.587 * rgb_np[:, :, 1] + 0.114 * rgb_np[:, :, 2]

        car_mask = self._segformer_car_mask(rgb_img, orig_w, orig_h)

        if self.yolo_sess is None:
            rgba = np.zeros((orig_h, orig_w, 4), dtype=np.uint8)
            return Image.fromarray(rgba, mode="RGBA"), {
                "inference_ms": round((time.time() - t0) * 1000, 1),
                "method": "no_model",
                "vehicle_detected": False,
                "car_coverage_pct": 0.0,
                "body_coverage_pct": 0.0,
                "wheels_protected": 0,
                "parts": [],
            }

        # 1. Letterbox 768x768 para YOLO26 Car-Parts
        sz = 768
        scale = min(sz / orig_w, sz / orig_h)
        nw, nh = int(round(orig_w * scale)), int(round(orig_h * scale))
        pad_x, pad_y = (sz - nw) // 2, (sz - nh) // 2
        canvas = Image.new("RGB", (sz, sz), (114, 114, 114))
        canvas.paste(rgb_img.resize((nw, nh), Image.Resampling.BILINEAR), (pad_x, pad_y))
        arr = np.transpose(np.array(canvas, dtype=np.float32) / 255.0, (2, 0, 1))[None, ...]

        in_name = self.yolo_sess.get_inputs()[0].name
        out0, out1 = self.yolo_sess.run(None, {in_name: arr})
        preds = out0[0].T  # (12096, 69)
        protos = out1[0]   # (32, 192, 192)

        cls_scores = preds[:, 4:37]
        cls_ids = np.argmax(cls_scores, axis=1)
        confs = cls_scores[np.arange(len(preds)), cls_ids]
        keep = confs >= 0.24
        preds, cls_ids, confs = preds[keep], cls_ids[keep], confs[keep]

        if len(preds) == 0:
            rgba = np.zeros((orig_h, orig_w, 4), dtype=np.uint8)
            return Image.fromarray(rgba, mode="RGBA"), {
                "inference_ms": round((time.time() - t0) * 1000, 1),
                "method": "yolo26_carparts_onnx",
                "vehicle_detected": False,
                "car_coverage_pct": 0.0,
                "body_coverage_pct": 0.0,
                "wheels_protected": 0,
                "parts": [],
            }

        boxes = np.zeros((len(preds), 4), dtype=np.float32)
        boxes[:, 0] = preds[:, 0] - preds[:, 2] / 2.0
        boxes[:, 1] = preds[:, 1] - preds[:, 3] / 2.0
        boxes[:, 2] = preds[:, 0] + preds[:, 2] / 2.0
        boxes[:, 3] = preds[:, 1] + preds[:, 3] / 2.0

        final_idx = []
        for c in np.unique(cls_ids):
            cmask = np.where(cls_ids == c)[0]
            kept = _nms_boxes(boxes[cmask], confs[cmask], 0.50)
            final_idx.extend(cmask[kept])

        # Filtrar detecciones pequeñas lejanas de la masa del vehículo principal
        major_boxes = [
            boxes[i]
            for i in final_idx
            if CARPART_NAMES[int(cls_ids[i])] not in EXCLUDE_CLASSES and confs[i] >= 0.42
        ]
        if major_boxes:
            mb = np.array(major_boxes)
            vx0, vy0 = float(mb[:, 0].min()), float(mb[:, 1].min())
            vx1, vy1 = float(mb[:, 2].max()), float(mb[:, 3].max())
            margin_x = max(24.0, (vx1 - vx0) * 0.14)
            margin_y = max(24.0, (vy1 - vy0) * 0.14)
            filtered_idx = []
            for i in final_idx:
                cx = 0.5 * (boxes[i, 0] + boxes[i, 2])
                cy = 0.5 * (boxes[i, 1] + boxes[i, 3])
                if (vx0 - margin_x <= cx <= vx1 + margin_x) and (vy0 - margin_y <= cy <= vy1 + margin_y):
                    filtered_idx.append(i)
            final_idx = filtered_idx

        mh, mw = protos.shape[1], protos.shape[2]
        protos_flat = protos.reshape(32, -1)
        sx_m, sy_m = mw / sz, mh / sz
        px1 = int(round(pad_x * sx_m))
        py1 = int(round(pad_y * sy_m))
        px2 = int(round((pad_x + nw) * sx_m))
        py2 = int(round((pad_y + nh) * sy_m))

        exclude_full = np.zeros((orig_h, orig_w), dtype=bool)
        paint_parts: dict[str, np.ndarray] = {}
        part_confs: dict[str, float] = {}
        wheels_count = 0
        car_mask_region = None
        if car_mask is not None:
            car_mask_region = (
                np.array(Image.fromarray((car_mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(21))) > 128
            )

        for i in final_idx:
            cname = CARPART_NAMES[int(cls_ids[i])]
            conf = float(confs[i])
            coeffs = preds[i, 37:]
            logits_m = np.clip(-(coeffs @ protos_flat).reshape(mh, mw), -30.0, 30.0)
            prob192 = 1.0 / (1.0 + np.exp(logits_m))

            bx1, by1, bx2, by2 = boxes[i]
            mx1 = max(0, int(np.floor(bx1 * sx_m)))
            my1 = max(0, int(np.floor(by1 * sy_m)))
            mx2 = min(mw, int(np.ceil(bx2 * sx_m)))
            my2 = min(mh, int(np.ceil(by2 * sy_m)))

            crop_u8 = np.zeros((mh, mw), dtype=np.uint8)
            crop_u8[my1:my2, mx1:mx2] = np.clip(prob192[my1:my2, mx1:mx2] * 255.0, 0, 255).astype(np.uint8)
            unpadded = Image.fromarray(crop_u8[py1:py2, px1:px2]).resize((orig_w, orig_h), Image.Resampling.BILINEAR)
            m_full = np.array(unpadded) > 128

            if car_mask_region is not None and cname not in EXCLUDE_CLASSES:
                m_full &= car_mask_region

            area_pct = float(m_full.mean() * 100.0)
            if area_pct < 0.08:
                continue

            if cname in EXCLUDE_CLASSES:
                exclude_full |= m_full
                if "wheel" in cname:
                    wheels_count += 1
            else:
                if cname not in paint_parts:
                    paint_parts[cname] = m_full
                    part_confs[cname] = conf
                else:
                    paint_parts[cname] |= m_full
                    part_confs[cname] = max(part_confs[cname], conf)

        # Dilatar 2px las exclusiones para evitar halos en gomas de vidrios/faros/rines
        excl_dilated = (
            np.array(Image.fromarray((exclude_full * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 128
        )

        body_mask = np.zeros((orig_h, orig_w), dtype=bool)
        for k in list(paint_parts.keys()):
            paint_parts[k] &= ~excl_dilated
            if paint_parts[k].mean() * 100.0 < 0.15:
                del paint_parts[k]
            else:
                body_mask |= paint_parts[k]

        if not np.any(body_mask):
            rgba = np.zeros((orig_h, orig_w, 4), dtype=np.uint8)
            return Image.fromarray(rgba, mode="RGBA"), {
                "inference_ms": round((time.time() - t0) * 1000, 1),
                "method": "yolo26_carparts_onnx",
                "vehicle_detected": False,
                "car_coverage_pct": 0.0,
                "body_coverage_pct": 0.0,
                "wheels_protected": wheels_count,
                "parts": [],
            }

        # Limpiar hule negro del poste B en zona de ventanas superiores + rellenar postes A/C
        ys_b, xs_b = np.where(body_mask)
        by0, by1 = int(ys_b.min()), int(ys_b.max())
        bx0, bx1 = int(xs_b.min()), int(xs_b.max())
        bh, bw = max(1, by1 - by0), max(1, bx1 - bx0)
        yy, xx = np.ogrid[:orig_h, :orig_w]

        med_rgb = np.median(rgb_np[body_mask], axis=0)
        med_luma = float(0.299 * med_rgb[0] + 0.587 * med_rgb[1] + 0.114 * med_rgb[2])
        upper_zone = yy < (by0 + 0.48 * bh)
        dark_rubber = upper_zone & (luma < (30.0 if med_luma < 60.0 else 52.0))
        body_mask &= ~dark_rubber

        for k in paint_parts:
            if "door" in k or "roof" in k:
                paint_parts[k] &= ~dark_rubber

        if car_mask is not None:
            # Rellenar postes A/C conectados estrictamente alrededor de las piezas pintables del auto principal
            tight_box = (yy >= by0) & (yy <= by1) & (xx >= bx0) & (xx <= bx1)
            body_dilated = np.array(
                Image.fromarray((body_mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(35))
            ) > 128
            car_eroded = np.array(
                Image.fromarray((car_mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(5))
            ) > 128
            med_sat = float(med_rgb.max() - med_rgb.min())
            pix_sat = rgb_np.max(axis=2) - rgb_np.min(axis=2)
            chroma_close = (np.abs(pix_sat - med_sat) < 28.0) if med_sat < 30.0 else (np.linalg.norm(rgb_np - med_rgb, axis=2) < 85.0)
            pillar_fill = (
                car_eroded
                & tight_box
                & body_dilated
                & (~excl_dilated)
                & (~dark_rubber)
                & (luma > (38.0 if med_luma < 60.0 else 58.0))
                & chroma_close
                & (yy >= by0 + 0.04 * bh)
                & (yy <= by0 + 0.65 * bh)
            )
            body_mask |= pillar_fill

        mapped_parts = []
        sorted_keys = sorted(paint_parts.keys(), key=lambda x: PART_LABELS_ES.get(x, (x, 99))[1])
        for pid in sorted_keys:
            m = paint_parts[pid]
            apct = round(float(m.mean() * 100.0), 1)
            if apct < 0.2:
                continue
            label = PART_LABELS_ES.get(pid, (pid, 99))[0]
            mapped_parts.append({
                "id": pid,
                "label": label,
                "area_pct": apct,
                "confidence": round(part_confs.get(pid, 0.8), 2),
                "mask_b64": _mask_to_rgba_b64(m),
            })

        rgba = np.zeros((orig_h, orig_w, 4), dtype=np.uint8)
        rgba[body_mask] = [255, 255, 255, 255]
        car_cov = float(car_mask.mean() * 100.0) if car_mask is not None else float((body_mask | exclude_full).mean() * 100.0)

        return Image.fromarray(rgba, mode="RGBA"), {
            "inference_ms": round((time.time() - t0) * 1000, 1),
            "method": "yolo26_carparts_onnx",
            "vehicle_detected": True,
            "car_coverage_pct": round(car_cov, 1),
            "body_coverage_pct": round(float(body_mask.mean() * 100.0), 1),
            "wheels_protected": wheels_count,
            "bbox": [bx0, by0, bx1, by1],
            "parts": mapped_parts,
        }
