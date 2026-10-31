"""
El Rayo AutoDesign Studio - Central CAD Canvas Container
Hosts the QWebEngineView (Fabric.js & WebGL 2D/3D Engine) with smooth
communication bridge for shaders and 2.5D mesh warping.
"""

from PyQt6.QtWidgets import (
    QFrame, QVBoxLayout, QLabel, QWidget, QSizePolicy
)
from PyQt6.QtCore import Qt, QUrl, pyqtSlot, pyqtSignal
from PyQt6.QtGui import QPainter, QColor, QPen, QFont
from pathlib import Path
import json

try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEngineSettings
    WEB_ENGINE_AVAILABLE = True
except ImportError:
    WEB_ENGINE_AVAILABLE = False


class CanvasView(QFrame):
    """Central 80% CAD Viewport hosting WebGL / Fabric.js / Native Render."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("CanvasView")
        self.setProperty("class", "GlassPanel")
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        self._web_view = None
        self._fallback_view = None
        self._html_path = Path(__file__).resolve().parent.parent.parent / "web_canvas" / "index.html"

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(0)

        if WEB_ENGINE_AVAILABLE:
            self._web_view = QWebEngineView(self)
            self._web_view.setStyleSheet("background-color: transparent; border-radius: 10px;")

            # Enable WebGL, local file access, and JavaScript
            settings = self._web_view.settings()
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
            settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)

            # Load local WebGL / Fabric.js canvas
            file_url = QUrl.fromLocalFile(str(self._html_path))
            self._web_view.load(file_url)
            layout.addWidget(self._web_view)
        else:
            # High-performance Native CAD Canvas Fallback
            self._fallback_view = NativeCADCanvasFallback(self)
            layout.addWidget(self._fallback_view)

    def load_vehicle_image(self, file_path: str):
        """Pass workshop car photograph to Fabric.js background."""
        url = QUrl.fromLocalFile(file_path).toString()
        if self._web_view:
            script = f"if (window.RayoEngine) {{ window.RayoEngine.loadVehicleImage('{url}'); }}"
            self._web_view.page().runJavaScript(script)

    def render_segmented_masks(self, masks_dict: dict):
        """Inject vector polygons & SVG masks from SAM into Fabric.js."""
        if self._web_view:
            payload = json.dumps(masks_dict)
            script = f"if (window.RayoEngine) {{ window.RayoEngine.renderSegmentedMasks({payload}); }}"
            self._web_view.page().runJavaScript(script)

    def apply_paint(self, settings: dict):
        """Pass paint shader parameters to the WebGL/Fabric.js canvas."""
        if self._web_view:
            json_payload = json.dumps(settings)
            script = f"if (window.RayoEngine) {{ window.RayoEngine.setPaintShader({json_payload}); }}"
            self._web_view.page().runJavaScript(script)
        elif self._fallback_view:
            self._fallback_view.update_color(settings.get("color", "#FF1744"))

    def load_decal_graphic(self, file_path: str):
        """Module 4: Load decal PNG/SVG graphic onto the 2.5D mesh warper."""
        url = QUrl.fromLocalFile(file_path).toString()
        if self._web_view:
            script = f"if (window.RayoEngine) {{ window.RayoEngine.loadDecalGraphic('{url}'); }}"
            self._web_view.page().runJavaScript(script)

    def apply_mesh_preset(self, preset_name: str):
        """Apply curvature deformation preset (door_convex, hood_scoop, fender_curve)."""
        if self._web_view:
            script = f"if (window.RayoEngine) {{ window.RayoEngine.applyMeshWarpPreset('{preset_name}'); }}"
            self._web_view.page().runJavaScript(script)

    def highlight_part(self, part_id: str):
        """Highlight segment on canvas."""
        if self._web_view:
            script = f"if (window.RayoEngine) {{ window.RayoEngine.highlightPart('{part_id}'); }}"
            self._web_view.page().runJavaScript(script)

    def set_mesh_resolution(self, res_idx: int):
        """Set grid resolution for 2.5D mesh warping (3x3, 4x4, 6x6)."""
        if self._web_view:
            script = f"if (window.RayoEngine) {{ window.RayoEngine.setMeshGridResolution({res_idx}); }}"
            self._web_view.page().runJavaScript(script)

    def set_view_angle(self, angle_id: str):
        """Switch angle representation in canvas."""
        if self._web_view:
            script = f"if (window.RayoEngine) {{ window.RayoEngine.setAngle('{angle_id}'); }}"
            self._web_view.page().runJavaScript(script)


class NativeCADCanvasFallback(QWidget):
    """Fallback interactive CAD canvas with grid, vehicle silhouette and HUD."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMouseTracking(True)
        self._current_color = QColor("#FF1744")
        self._mouse_pos = "X: 0.00 mm | Y: 0.00 mm"

    def update_color(self, hex_color: str):
        self._current_color = QColor(hex_color)
        self.update()

    def mouseMoveEvent(self, event):
        x = event.position().x()
        y = event.position().y()
        self._mouse_pos = f"X: {x*0.5:.2f} mm | Y: {y*0.5:.2f} mm"
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()
        h = self.height()

        painter.fillRect(0, 0, w, h, QColor("#070A10"))

        pen_minor = QPen(QColor(0, 242, 254, 15))
        pen_minor.setWidth(1)
        painter.setPen(pen_minor)

        grid_spacing = 30
        for x in range(0, w, grid_spacing):
            painter.drawLine(x, 0, x, h)
        for y in range(0, h, grid_spacing):
            painter.drawLine(0, y, w, y)

        pen_major = QPen(QColor(0, 242, 254, 35))
        pen_major.setWidth(1)
        painter.setPen(pen_major)
        for x in range(0, w, grid_spacing * 5):
            painter.drawLine(x, 0, x, h)
        for y in range(0, h, grid_spacing * 5):
            painter.drawLine(0, y, w, y)

        cx, cy = w // 2, h // 2
        painter.setPen(QPen(QColor("#00F2FE"), 2))
        painter.setBrush(QColor("#10141E"))
        painter.drawEllipse(cx - 200, cy + 40, 70, 70)
        painter.drawEllipse(cx + 130, cy + 40, 70, 70)

        painter.setBrush(self._current_color)
        painter.setPen(QPen(QColor("#FFFFFF"), 2))
        painter.drawRoundedRect(cx - 270, cy - 30, 540, 80, 20, 20)

        painter.setBrush(QColor(15, 23, 42, 220))
        painter.drawRoundedRect(cx - 140, cy - 85, 260, 60, 15, 15)

        painter.setPen(QColor("#00F2FE"))
        painter.setFont(QFont("Consolas", 10))
        painter.drawText(20, h - 25, f"CAD LIENZO VECTORIAL // {self._mouse_pos} // ESCALA 1:1")
