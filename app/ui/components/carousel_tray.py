"""
El Rayo AutoDesign Studio - 360 Multi-Angle Carousel & Vehicle Recognition
Module 5:
- Multi-angle automotive photo repository (Front, Left Profile, Rear, Right Profile, 3/4 Perspective).
- Automatic Make/Model AI Identification badge.
- Dynamic angle switcher preserving layer and paint state.
"""

from PyQt6.QtWidgets import (
    QFrame, QHBoxLayout, QVBoxLayout, QLabel, QPushButton,
    QToolButton, QScrollArea, QWidget, QFileDialog
)
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QPixmap, QColor


class CarouselTray(QFrame):
    """Bottom 360 Multi-Angle Photo Repository with AI vehicle identification."""

    angle_changed = pyqtSignal(str)
    new_photo_added = pyqtSignal(str, str)  # angle_key, file_path

    DEFAULT_ANGLES = [
        {"id": "front", "name": "Frontal 0°", "icon": "🚘"},
        {"id": "side_left", "name": "Lateral Izq 90°", "icon": "🏎️"},
        {"id": "rear", "name": "Trasera 180°", "icon": "🚗"},
        {"id": "side_right", "name": "Lateral Der 270°", "icon": "🏎️"},
        {"id": "perspective", "name": "Perspectiva 3/4", "icon": "📐"},
    ]

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("CarouselTray")
        self.setProperty("class", "GlassPanel")
        self.setFixedHeight(120)
        self._current_angle_id = "side_left"
        self._angle_buttons = {}

        self._init_ui()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(12, 6, 12, 6)
        main_layout.setSpacing(6)

        # Top status bar inside tray: AI Model Detection Badge
        info_row = QHBoxLayout()
        info_row.setContentsMargins(0, 0, 0, 0)

        lbl_header = QLabel("REPOSITORIO MULTI-ÁNGULO 360 & FOTOGRAMETRÍA")
        lbl_header.setProperty("class", "SectionHeader")
        info_row.addWidget(lbl_header)

        info_row.addSpacing(16)

        # Detected Car Badge
        self.lbl_detection = QLabel("🔍 IA Detección: Escaneando rasgos de carrocería...")
        self.lbl_detection.setProperty("class", "TelemetryBadge")
        info_row.addWidget(self.lbl_detection)

        info_row.addStretch()

        self.btn_add_photo = QPushButton("+ Añadir Ángulo Fotográfico")
        self.btn_add_photo.setProperty("class", "SecondaryBtn")
        self.btn_add_photo.setFixedHeight(24)
        self.btn_add_photo.clicked.connect(self._add_angle_photo)
        info_row.addWidget(self.btn_add_photo)
        main_layout.addLayout(info_row)

        # Thumbnails row
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("background: transparent;")

        cards_widget = QWidget()
        self.cards_layout = QHBoxLayout(cards_widget)
        self.cards_layout.setContentsMargins(0, 0, 0, 0)
        self.cards_layout.setSpacing(10)

        for angle in self.DEFAULT_ANGLES:
            btn = QToolButton()
            btn.setText(f"{angle['icon']}\n{angle['name']}")
            btn.setCheckable(True)
            btn.setFixedSize(130, 60)
            btn.setStyleSheet("""
                QToolButton {
                    background: rgba(20, 26, 40, 0.75);
                    color: #CBD5E1;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 600;
                    padding: 4px;
                }
                QToolButton:hover {
                    background: rgba(0, 242, 254, 0.12);
                    border: 1px solid rgba(0, 242, 254, 0.35);
                    color: #FFFFFF;
                }
                QToolButton:checked {
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                        stop:0 rgba(0, 242, 254, 0.22),
                        stop:1 rgba(79, 172, 254, 0.15));
                    border: 1px solid #00F2FE;
                    color: #00F2FE;
                }
            """)
            btn.clicked.connect(lambda checked, aid=angle["id"]: self._select_angle(aid))
            self.cards_layout.addWidget(btn)
            self._angle_buttons[angle["id"]] = btn

        self.cards_layout.addStretch()
        scroll.setWidget(cards_widget)
        main_layout.addWidget(scroll)

        # Default select side_left
        self._select_angle("side_left")

    def _select_angle(self, angle_id: str):
        self._current_angle_id = angle_id
        for aid, btn in self._angle_buttons.items():
            btn.setChecked(aid == angle_id)
        self.angle_changed.emit(angle_id)

    def set_detected_vehicle(self, make_model: str, confidence: float):
        """Update detection label with AI identified make/model."""
        self.lbl_detection.setText(f"🚗 Reconocido: {make_model} • Confianza: {confidence*100:.1f}%")
        self.lbl_detection.setStyleSheet("""
            background: rgba(16, 185, 129, 0.12);
            border: 1px solid rgba(16, 185, 129, 0.4);
            color: #10B981;
            font-family: 'Consolas', monospace;
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
        """)

    def _add_angle_photo(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Seleccionar Fotografía de Taller (Ángulo 360)",
            "",
            "Imágenes (*.png *.jpg *.jpeg *.webp)"
        )
        if file_path:
            self.new_photo_added.emit(self._current_angle_id, file_path)
