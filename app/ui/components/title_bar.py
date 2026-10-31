"""
El Rayo AutoDesign Studio - Custom Frameless CAD Title Bar
Features:
- Windows frameless window dragging & double-click maximize/restore.
- Dynamic custom shop logo support (SVG/PNG) with fallback glowing badge.
- CAD workspace quick-actions (Import Image, SAM Segment, Render Export).
- Minimalist window control buttons (Min, Max, Close).
"""

from PyQt6.QtWidgets import (
    QFrame, QHBoxLayout, QLabel, QToolButton, QPushButton,
    QWidget, QFileDialog, QSizePolicy
)
from PyQt6.QtCore import Qt, QPoint, pyqtSignal, QSize
from PyQt6.QtGui import QIcon, QPixmap, QPainter, QColor, QFont
from pathlib import Path


class TitleBar(QFrame):
    """Custom CAD Glassmorphic Title Bar with drag & window state handling."""

    # Signals for parent window communication
    import_requested = pyqtSignal()
    segment_requested = pyqtSignal()
    export_requested = pyqtSignal()
    logo_changed = pyqtSignal(str)

    def __init__(self, parent=None, title="El Rayo AutoDesign Studio"):
        super().__init__(parent)
        self.parent_window = parent
        self.setObjectName("TitleBar")
        self.setFixedHeight(54)
        self.setMouseTracking(True)

        self._drag_pos = QPoint()
        self._is_dragging = False

        self._init_ui(title)

    def _init_ui(self, title: str):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(16, 0, 16, 0)
        layout.setSpacing(12)

        # 1. Custom Brand Logo / Insignia Container
        self.logo_label = QLabel()
        self.logo_label.setFixedSize(36, 36)
        self.logo_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.logo_label.setStyleSheet("""
            QLabel {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 rgba(0, 242, 254, 0.25),
                    stop:1 rgba(127, 0, 255, 0.35));
                border: 1px solid rgba(0, 242, 254, 0.5);
                border-radius: 8px;
                font-size: 18px;
            }
        """)
        self.logo_label.setText("⚡")
        self.logo_label.setToolTip("Click derecho para cargar logotipo personalizado de tu taller")
        layout.addWidget(self.logo_label)

        # 2. Brand & App Title
        title_box = QWidget()
        title_layout = QHBoxLayout(title_box)
        title_layout.setContentsMargins(0, 8, 0, 8)
        title_layout.setSpacing(8)

        self.lbl_title = QLabel(title)
        self.lbl_title.setObjectName("AppTitleLabel")
        title_layout.addWidget(self.lbl_title)

        self.lbl_tag = QLabel("CAD // SNAPDRAGON NPU")
        self.lbl_tag.setObjectName("AppTaglineLabel")
        title_layout.addWidget(self.lbl_tag)
        layout.addWidget(title_box)

        # 3. Logo Upload Button (Compact)
        self.btn_load_logo = QPushButton("Cargar Logo")
        self.btn_load_logo.setProperty("class", "SecondaryBtn")
        self.btn_load_logo.setToolTip("Subir logo personalizado del taller (PNG/SVG)")
        self.btn_load_logo.setFixedHeight(28)
        self.btn_load_logo.clicked.connect(self._choose_custom_logo)
        layout.addWidget(self.btn_load_logo)

        layout.addStretch()

        # 4. Central CAD Workflow Actions
        self.btn_import = QPushButton("📂 Ingestar Foto")
        self.btn_import.setProperty("class", "SecondaryBtn")
        self.btn_import.setFixedHeight(30)
        self.btn_import.clicked.connect(self.import_requested.emit)
        layout.addWidget(self.btn_import)

        self.btn_segment = QPushButton("🎯 Segmentación SAM")
        self.btn_segment.setProperty("class", "PrimaryBtn")
        self.btn_segment.setFixedHeight(30)
        self.btn_segment.clicked.connect(self.segment_requested.emit)
        layout.addWidget(self.btn_segment)

        self.btn_export = QPushButton("💾 Exportar Render")
        self.btn_export.setProperty("class", "SecondaryBtn")
        self.btn_export.setFixedHeight(30)
        self.btn_export.clicked.connect(self.export_requested.emit)
        layout.addWidget(self.btn_export)

        layout.addSpacing(16)

        # 5. Frameless Window State Buttons
        self.btn_min = QToolButton()
        self.btn_min.setObjectName("WinBtn")
        self.btn_min.setText("—")
        self.btn_min.setToolTip("Minimizar")
        self.btn_min.clicked.connect(self._minimize_window)
        layout.addWidget(self.btn_min)

        self.btn_max = QToolButton()
        self.btn_max.setObjectName("WinBtn")
        self.btn_max.setText("□")
        self.btn_max.setToolTip("Maximizar / Restaurar")
        self.btn_max.clicked.connect(self._toggle_maximize)
        layout.addWidget(self.btn_max)

        self.btn_close = QToolButton()
        self.btn_close.setObjectName("WinBtnClose")
        self.btn_close.setText("✕")
        self.btn_close.setToolTip("Cerrar")
        self.btn_close.clicked.connect(self._close_window)
        layout.addWidget(self.btn_close)

    def _choose_custom_logo(self):
        """Open file dialog to set a custom shop logo."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Seleccionar Logotipo del Taller",
            "",
            "Imágenes (*.png *.jpg *.jpeg *.svg *.webp)"
        )
        if file_path:
            pixmap = QPixmap(file_path)
            if not pixmap.isNull():
                scaled_pixmap = pixmap.scaled(
                    32, 32,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
                self.logo_label.setPixmap(scaled_pixmap)
                self.logo_changed.emit(file_path)

    def _minimize_window(self):
        if self.parent_window:
            self.parent_window.showMinimized()

    def _toggle_maximize(self):
        if not self.parent_window:
            return
        if self.parent_window.isMaximized():
            self.parent_window.showNormal()
            self.btn_max.setText("□")
        else:
            self.parent_window.showMaximized()
            self.btn_max.setText("❐")

    def _close_window(self):
        if self.parent_window:
            self.parent_window.close()

    # Window Dragging implementation for Frameless Window
    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton and self.parent_window:
            self._is_dragging = True
            self._drag_pos = event.globalPosition().toPoint() - self.parent_window.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if self._is_dragging and self.parent_window and not self.parent_window.isMaximized():
            self.parent_window.move(event.globalPosition().toPoint() - self._drag_pos)
            event.accept()

    def mouseReleaseEvent(self, event):
        self._is_dragging = False

    def mouseDoubleClickEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self._toggle_maximize()
            event.accept()
