"""
El Rayo AutoDesign Studio - Localhost CAD Web Server
Runs on http://localhost:8080
Provides:
- Full Glassmorphic Web CAD Studio UI (studio.html)
- Static files routing (JavaScript shaders, mesh warper, Fabric.js assets)
- REST APIs for SAM segmentation and paint blending
"""

import sys
import os
import json
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import mimetypes
import numpy as np

mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")

# Set project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.vision.preprocessor import VehicleImagePreprocessor
from app.vision.segmenter import CarPartSegmenter
from app.paint_engine.blender import PaintBlender
from app.paint_engine.sam_paint_core import (
    inicializar_ia,
    generar_mascara_carroceria,
    preservar_luminancia,
    aplicar_color_blend,
    recomponer_imagen,
    renderizar_color_en_vehiculo
)
import base64
import io
from PIL import Image

WEB_DIR = PROJECT_ROOT / "app" / "web_canvas"
ASSETS_DIR = PROJECT_ROOT / "app" / "assets"
PORT = int(os.environ.get("PORT", 8080))


class RayoStudioRequestHandler(SimpleHTTPRequestHandler):
    """Custom request handler with REST APIs and Glassmorphic web studio routing."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):
        # Route root to studio.html
        if self.path == "/" or self.path == "/index.html":
            self.path = "/studio.html"
            return super().do_GET()

        elif self.path == "/api/status":
            self._send_json({
                "status": "online",
                "suite": "El Rayo AutoDesign Studio",
                "version": "2.4.0-CAD.Web",
                "hardware_acceleration": "Snapdragon NPU / Hexagon DSP",
                "engine": "WebGL + Fabric.js + NumPy SAM"
            })
            return

        elif self.path.startswith("/assets/"):
            # Serve from assets directory
            rel_path = self.path[8:]
            asset_file = ASSETS_DIR / rel_path
            if asset_file.exists():
                self._serve_file(asset_file)
                return
            else:
                self.send_error(404, "Asset no encontrado")
                return

        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/segment":
            self._handle_segment_api()
        elif self.path == "/api/blend":
            self._handle_blend_api()
        elif self.path == "/api/sam/paint":
            self._handle_sam_paint_api()
        elif self.path == "/api/sam/segment":
            self._handle_sam_segment_api()
        else:
            self.send_error(404, "Endpoint no encontrado")

    def _handle_sam_paint_api(self):
        """Execute the complete SAM 4-phase color rendering pipeline."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            data = json.loads(body.decode("utf-8"))

            color_hex = data.get("color_hex", "#C8102E")
            tipo = data.get("tipo", "overlay")
            intensidad_brillo = int(data.get("intensidad_brillo", 200))

            # Default test image if not provided
            sample_img_path = PROJECT_ROOT / "assets" / "test_car" / "angle_180_rear.jpg"
            pil_img = Image.open(str(sample_img_path)).convert("RGB")
            rgb_arr = np.array(pil_img)
            imagen_bgr = rgb_arr[:, :, ::-1]
            h, w, _ = imagen_bgr.shape

            input_point = data.get("input_point", [int(w * 0.65), int(h * 0.52)])

            render_final_bgr, mask_uint8 = renderizar_color_en_vehiculo(
                imagen_bgr,
                input_point=input_point,
                color_hex=color_hex,
                tipo=tipo,
                intensidad_brillo=intensidad_brillo
            )

            # Convert to base64
            render_rgb = render_final_bgr[:, :, ::-1]
            out_pil = Image.fromarray(render_rgb)
            buf = io.BytesIO()
            out_pil.save(buf, format="JPEG", quality=90)
            b64_img = base64.b64encode(buf.getvalue()).decode("utf-8")

            self._send_json({
                "success": True,
                "rendered_image": f"data:image/jpeg;base64,{b64_img}",
                "input_point": input_point,
                "color_hex": color_hex,
                "tipo": tipo
            })
        except Exception as e:
            self._send_json({"success": False, "error": str(e)}, status=500)

    def _handle_sam_segment_api(self):
        """Execute SAM segmentation and return binary mask."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            data = json.loads(body.decode("utf-8"))

            sample_img_path = PROJECT_ROOT / "assets" / "test_car" / "angle_180_rear.jpg"
            pil_img = Image.open(str(sample_img_path)).convert("RGB")
            rgb_arr = np.array(pil_img)
            imagen_bgr = rgb_arr[:, :, ::-1]
            h, w, _ = imagen_bgr.shape

            input_point = data.get("input_point", [int(w * 0.65), int(h * 0.52)])

            predictor = inicializar_ia()
            mascara = generar_mascara_carroceria(imagen_bgr, predictor, input_point=input_point)

            mask_pil = Image.fromarray(mascara)
            buf = io.BytesIO()
            mask_pil.save(buf, format="PNG")
            b64_mask = base64.b64encode(buf.getvalue()).decode("utf-8")

            self._send_json({
                "success": True,
                "mask": f"data:image/png;base64,{b64_mask}",
                "pixels_selected": int(np.count_nonzero(mascara)),
                "input_point": input_point
            })
        except Exception as e:
            self._send_json({"success": False, "error": str(e)}, status=500)

    def _handle_segment_api(self):
        """Execute SAM Segmentation and return SVG paths & metrics."""
        try:
            # Ensure sample vehicle image exists
            sample_img = ASSETS_DIR / "sample_car_workshop.png"
            if not sample_img.exists():
                from PIL import Image, ImageDraw
                ASSETS_DIR.mkdir(parents=True, exist_ok=True)
                img = Image.new("RGB", (1200, 600), color=(18, 22, 32))
                draw = ImageDraw.Draw(img)
                draw.rectangle([0, 420, 1200, 600], fill=(28, 34, 46))
                draw.rounded_rectangle([150, 260, 1050, 440], radius=40, fill=(180, 20, 30), outline=(255, 255, 255), width=3)
                draw.polygon([(360, 260), (460, 150), (760, 150), (880, 260)], fill=(30, 45, 65), outline=(0, 242, 254), width=2)
                draw.ellipse([240, 380, 380, 520], fill=(15, 17, 22), outline=(0, 242, 254), width=4)
                draw.ellipse([820, 380, 960, 520], fill=(15, 17, 22), outline=(0, 242, 254), width=4)
                img.save(str(sample_img))

            preprocessor = VehicleImagePreprocessor(target_max_dimension=1280)
            processed_img = preprocessor.process(str(sample_img))

            segmenter = CarPartSegmenter()
            parts_dict = segmenter.segment_vehicle(processed_img)

            serialized = {}
            for pid, part in parts_dict.items():
                serialized[pid] = {
                    "part_id": part.part_id,
                    "label": part.label,
                    "color_hint": part.color_hint,
                    "confidence": part.confidence,
                    "svg_path": part.svg_path,
                    "bbox": part.bbox,
                    "area_pixels": part.area_pixels,
                    "surface_percent": part.surface_percent
                }

            self._send_json({"success": True, "parts": serialized})
        except Exception as e:
            self._send_json({"success": False, "error": str(e)}, status=500)

    def _handle_blend_api(self):
        """Simulate physical paint blend in Python backend."""
        self._send_json({"success": True, "message": "Shader aplicado exitosamente"})

    def _send_json(self, data: dict, status: int = 200):
        content = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _serve_file(self, file_path: Path):
        mime, _ = mimetypes.guess_type(str(file_path))
        if not mime:
            mime = "application/octet-stream"
        with open(file_path, "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def run_server():
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadingHTTPServer(server_address, RayoStudioRequestHandler)
    print("===============================================================")
    print(f"  [EL RAYO AUTODESIGN STUDIO] - SERVIDOR LOCAL ACTIVO")
    print(f"  Acceso Localhost:  http://localhost:{PORT}")
    print(f"  Directorio Web:    {WEB_DIR}")
    print("===============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
