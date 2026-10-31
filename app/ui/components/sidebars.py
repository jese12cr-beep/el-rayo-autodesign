"""
El Rayo AutoDesign Studio - Collapsible Glassmorphic Sidebars
Left Sidebar: CAD Interactive Tool Palette.
Right Sidebar: Segmented Body Parts Inspector, Realistic Paint Shaders & 2.5D Mesh Warper.
"""

from PyQt6.QtWidgets import (
    QFrame, QVBoxLayout, QHBoxLayout, QLabel, QToolButton,
    QPushButton, QListWidget, QListWidgetItem, QSlider, QComboBox,
    QButtonGroup, QWidget, QScrollArea, QColorDialog, QFileDialog
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor

from app.config import CAR_PARTS, PAINT_FINISHES


class LeftToolSidebar(QFrame):
    """Collapsible Left Dock with CAD vector and editing tools."""

    tool_changed = pyqtSignal(str)
    collapsed_toggled = pyqtSignal(bool)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("LeftDock")
        self.setProperty("class", "GlassPanel")
        self.setFixedWidth(200)
        self._is_collapsed = False

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 12, 8, 12)
        layout.setSpacing(8)

        # Header with Collapse Toggle
        header_row = QHBoxLayout()
        self.lbl_title = QLabel("HERRAMIENTAS")
        self.lbl_title.setProperty("class", "SectionHeader")
        header_row.addWidget(self.lbl_title)

        header_row.addStretch()

        self.btn_toggle = QToolButton()
        self.btn_toggle.setObjectName("WinBtn")
        self.btn_toggle.setText("◀")
        self.btn_toggle.setToolTip("Colapsar / Expandir panel de herramientas")
        self.btn_toggle.clicked.connect(self.toggle_collapse)
        header_row.addWidget(self.btn_toggle)
        layout.addLayout(header_row)

        # Tool buttons group
        self.btn_group = QButtonGroup(self)
        self.btn_group.setExclusive(True)

        tools = [
            ("select", "🎯  Seleccionar CAD", "Selección y transformación de elementos"),
            ("sam_segment", "✂️  Segmentar SAM", "Detección automática de piezas automotrices con IA"),
            ("paint_brush", "🎨  Pintura & Shaders", "Aplicador de acabados y pinturas"),
            ("mesh_warp", "📐  Malla 2.5D Warp", "Deformación de vinilos y calcomanías sobre curvas"),
            ("decal_add", "🏷️  Cargar Calca/Logo", "Insertar gráficos vectoriales o PNGs"),
            ("cad_ruler", "📏  Cotas & Medición", "Medición milimétrica de paneles y tolerancias"),
            ("pan_zoom", "🔍  Navegación / Pan", "Mover y zoom en el lienzo 2D/3D"),
        ]

        self.tool_buttons = {}
        for tool_id, label, tooltip in tools:
            btn = QToolButton()
            btn.setText(label)
            btn.setToolTip(tooltip)
            btn.setCheckable(True)
            btn.setProperty("class", "ToolActionBtn")
            btn.setMinimumHeight(38)
            btn.setSizePolicy(
                btn.sizePolicy().horizontalPolicy(),
                btn.sizePolicy().verticalPolicy()
            )
            btn.clicked.connect(lambda checked, tid=tool_id: self.tool_changed.emit(tid))
            self.btn_group.addButton(btn)
            layout.addWidget(btn)
            self.tool_buttons[tool_id] = btn

        # Default select
        self.tool_buttons["select"].setChecked(True)

        layout.addStretch()

        # Telemetry / Snapdragon indicator
        self.lbl_npu = QLabel("⚡ NPU ACEL: ON")
        self.lbl_npu.setProperty("class", "TelemetryBadge")
        self.lbl_npu.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.lbl_npu)

    def toggle_collapse(self):
        self._is_collapsed = not self._is_collapsed
        if self._is_collapsed:
            self.setFixedWidth(54)
            self.lbl_title.setVisible(False)
            self.lbl_npu.setVisible(False)
            self.btn_toggle.setText("▶")
            for btn in self.tool_buttons.values():
                btn.setText(btn.text()[:2])
        else:
            self.setFixedWidth(200)
            self.lbl_title.setVisible(True)
            self.lbl_npu.setVisible(True)
            self.btn_toggle.setText("◀")
            tools_text = [
                ("select", "🎯  Seleccionar CAD"),
                ("sam_segment", "✂️  Segmentar SAM"),
                ("paint_brush", "🎨  Pintura & Shaders"),
                ("mesh_warp", "📐  Malla 2.5D Warp"),
                ("decal_add", "🏷️  Cargar Calca/Logo"),
                ("cad_ruler", "📏  Cotas & Medición"),
                ("pan_zoom", "🔍  Navegación / Pan"),
            ]
            for tid, label in tools_text:
                self.tool_buttons[tid].setText(label)

        self.collapsed_toggled.emit(self._is_collapsed)


class RightInspectorSidebar(QFrame):
    """Collapsible Right Dock with Parts List, Mask Layers, Paint Shaders & 2.5D Mesh Warper."""

    part_selected = pyqtSignal(str)
    paint_changed = pyqtSignal(dict)
    warp_grid_changed = pyqtSignal(int)
    warp_preset_selected = pyqtSignal(str)
    decal_load_requested = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("RightDock")
        self.setProperty("class", "GlassPanel")
        self.setFixedWidth(290)
        self._is_collapsed = False
        self._current_color = "#FF1744"

        self._init_ui()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(10, 12, 10, 12)
        main_layout.setSpacing(10)

        # Header with Collapse Toggle
        header_row = QHBoxLayout()
        self.btn_toggle = QToolButton()
        self.btn_toggle.setObjectName("WinBtn")
        self.btn_toggle.setText("▶")
        self.btn_toggle.setToolTip("Colapsar / Expandir Inspector")
        self.btn_toggle.clicked.connect(self.toggle_collapse)
        header_row.addWidget(self.btn_toggle)

        self.lbl_title = QLabel("INSPECTOR Y ACABADOS")
        self.lbl_title.setProperty("class", "SectionHeader")
        header_row.addWidget(self.lbl_title)
        header_row.addStretch()
        main_layout.addLayout(header_row)

        # Scrollable container for Inspector modules
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll_area.setStyleSheet("background: transparent;")

        container = QWidget()
        container_layout = QVBoxLayout(container)
        container_layout.setContentsMargins(2, 2, 2, 2)
        container_layout.setSpacing(14)

        # ---------------------------------------------------------
        # MODULE 1: AI Segmented Parts & Vector Masks
        # ---------------------------------------------------------
        lbl_parts = QLabel("PIEZAS SEGMENTADAS (SAM)")
        lbl_parts.setProperty("class", "SectionHeader")
        container_layout.addWidget(lbl_parts)

        self.parts_list = QListWidget()
        self.parts_list.setFixedHeight(180)
        for part_id, meta in CAR_PARTS.items():
            item = QListWidgetItem(f"{meta['icon']}  {meta['label']}")
            item.setData(Qt.ItemDataRole.UserRole, part_id)
            self.parts_list.addItem(item)
        self.parts_list.itemClicked.connect(self._on_part_clicked)
        container_layout.addWidget(self.parts_list)

        # ---------------------------------------------------------
        # MODULE 3: Realistic Paint Simulator (Shaders & Blends)
        # ---------------------------------------------------------
        lbl_paint = QLabel("SIMULADOR DE PINTURA (SHADERS)")
        lbl_paint.setProperty("class", "SectionHeader")
        container_layout.addWidget(lbl_paint)

        # Finish Selector Dropdown
        finish_row = QHBoxLayout()
        finish_lbl = QLabel("Acabado:")
        self.combo_finish = QComboBox()
        for f in PAINT_FINISHES:
            self.combo_finish.addItem(f["name"], f["id"])
        self.combo_finish.currentIndexChanged.connect(self._emit_paint_settings)
        finish_row.addWidget(finish_lbl)
        finish_row.addWidget(self.combo_finish)
        container_layout.addLayout(finish_row)

        # Color Selector Button
        color_row = QHBoxLayout()
        self.btn_pick_color = QPushButton("🎨 Seleccionar Color...")
        self.btn_pick_color.setProperty("class", "SecondaryBtn")
        self.btn_pick_color.clicked.connect(self._choose_color)

        self.color_swatch = QLabel()
        self.color_swatch.setFixedSize(28, 28)
        self.color_swatch.setStyleSheet(f"background-color: {self._current_color}; border-radius: 6px; border: 1px solid white;")
        color_row.addWidget(self.btn_pick_color)
        color_row.addWidget(self.color_swatch)
        container_layout.addLayout(color_row)

        # Blend Mode Dropdown
        blend_row = QHBoxLayout()
        blend_lbl = QLabel("Modo Blend:")
        self.combo_blend = QComboBox()
        self.combo_blend.addItems(["Overlay (Metálico)", "Multiply (OEM)", "Color Burn (Gloss)", "Screen (Neón)", "Soft Light (Perla)"])
        self.combo_blend.currentIndexChanged.connect(self._emit_paint_settings)
        blend_row.addWidget(blend_lbl)
        blend_row.addWidget(self.combo_blend)
        container_layout.addLayout(blend_row)

        # Sliders: Brillos (Highlights) and Sombras (Shadows) preservation
        container_layout.addWidget(QLabel("Preservación de Brillos / Especular:"))
        self.slider_highlights = QSlider(Qt.Orientation.Horizontal)
        self.slider_highlights.setRange(0, 250)
        self.slider_highlights.setValue(145)
        self.slider_highlights.valueChanged.connect(self._emit_paint_settings)
        container_layout.addWidget(self.slider_highlights)

        container_layout.addWidget(QLabel("Densidad de Flakes / Metálico:"))
        self.slider_flakes = QSlider(Qt.Orientation.Horizontal)
        self.slider_flakes.setRange(0, 100)
        self.slider_flakes.setValue(85)
        self.slider_flakes.valueChanged.connect(self._emit_paint_settings)
        container_layout.addWidget(self.slider_flakes)

        # ---------------------------------------------------------
        # MODULE 4: 2.5D Mesh Warping Decal Control
        # ---------------------------------------------------------
        lbl_warp = QLabel("MOTOR DE MALLA 2.5D (WARPING)")
        lbl_warp.setProperty("class", "SectionHeader")
        container_layout.addWidget(lbl_warp)

        # Decal Loader Button
        self.btn_load_decal = QPushButton("🏷️  Cargar Vinil / Gráfico (PNG)")
        self.btn_load_decal.setProperty("class", "PrimaryBtn")
        self.btn_load_decal.clicked.connect(self._choose_decal_file)
        container_layout.addWidget(self.btn_load_decal)

        # Grid Resolution
        warp_row = QHBoxLayout()
        warp_lbl = QLabel("Resolución Malla:")
        self.combo_grid = QComboBox()
        self.combo_grid.addItems(["3 x 3 (Básico)", "4 x 4 (Bézier Óptimo)", "6 x 6 (Relieve Complejo)"])
        self.combo_grid.setCurrentIndex(1)
        self.combo_grid.currentIndexChanged.connect(lambda idx: self.warp_grid_changed.emit(idx))
        warp_row.addWidget(warp_lbl)
        warp_row.addWidget(self.combo_grid)
        container_layout.addLayout(warp_row)

        # Automated Curvature Presets
        preset_row = QHBoxLayout()
        preset_lbl = QLabel("Curvatura 3D:")
        self.combo_preset = QComboBox()
        self.combo_preset.addItem("Puerta Convexa (Door)", "door_convex")
        self.combo_preset.addItem("Toma de Cofre (Hood)", "hood_scoop")
        self.combo_preset.addItem("Arco Salpicadera (Fender)", "fender_curve")
        preset_row.addWidget(preset_lbl)
        preset_row.addWidget(self.combo_preset)
        container_layout.addLayout(preset_row)

        self.btn_apply_preset = QPushButton("📐 Abrazar Contorno de Carrocería")
        self.btn_apply_preset.setProperty("class", "SecondaryBtn")
        self.btn_apply_preset.clicked.connect(self._apply_preset_curvature)
        container_layout.addWidget(self.btn_apply_preset)

        container_layout.addStretch()
        self.scroll_area.setWidget(container)
        main_layout.addWidget(self.scroll_area)

    def populate_segmented_parts(self, parts_data: dict):
        """Update parts list with real SAM confidence scores."""
        self.parts_list.clear()
        for part_id, data in parts_data.items():
            icon = CAR_PARTS.get(part_id, {}).get("icon", "🔹")
            label = data.get("label", part_id)
            conf = data.get("confidence", 0.95) * 100.0
            area_pct = data.get("surface_percent", 0.0)

            item = QListWidgetItem(f"{icon} {label}  [{conf:.1f}%] ({area_pct}%)")
            item.setData(Qt.ItemDataRole.UserRole, part_id)
            self.parts_list.addItem(item)

    def _choose_decal_file(self):
        path, _ = QFileDialog.getOpenFileName(
            self,
            "Seleccionar Calcomanía o Franja Deportiva",
            "",
            "Gráficos (*.png *.svg *.webp *.jpg)"
        )
        if path:
            self.decal_load_requested.emit(path)

    def _apply_preset_curvature(self):
        preset_id = self.combo_preset.currentData()
        self.warp_preset_selected.emit(preset_id)

    def _on_part_clicked(self, item: QListWidgetItem):
        part_id = item.data(Qt.ItemDataRole.UserRole)
        self.part_selected.emit(part_id)

    def _choose_color(self):
        col = QColorDialog.getColor(QColor(self._current_color), self, "Seleccionar Tono de Pintura")
        if col.isValid():
            self._current_color = col.name()
            self.color_swatch.setStyleSheet(f"background-color: {self._current_color}; border-radius: 6px; border: 1px solid white;")
            self._emit_paint_settings()

    def _emit_paint_settings(self):
        settings = {
            "finish_id": self.combo_finish.currentData(),
            "color": self._current_color,
            "blend_mode": self.combo_blend.currentText().split()[0].lower(),
            "specular": self.slider_highlights.value() / 100.0,
            "flakes": self.slider_flakes.value() / 100.0,
        }
        self.paint_changed.emit(settings)

    def toggle_collapse(self):
        self._is_collapsed = not self._is_collapsed
        if self._is_collapsed:
            self.setFixedWidth(44)
            self.scroll_area.setVisible(False)
            self.lbl_title.setVisible(False)
            self.btn_toggle.setText("◀")
        else:
            self.setFixedWidth(290)
            self.scroll_area.setVisible(True)
            self.lbl_title.setVisible(True)
            self.btn_toggle.setText("▶")
