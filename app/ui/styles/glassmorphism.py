"""
El Rayo AutoDesign Studio - Glassmorphism QSS Design System
Advanced dark-mode stylesheet with translucent frosted-glass cards,
industrial CAD accents, and Snapdragon/Windows 11 optimized typography.
"""

GLASSMORPHISM_STYLESHEET = """
/* -------------------------------------------------------------
   GLOBAL & ROOT THEME
------------------------------------------------------------- */
QWidget {
    color: #E2E8F0;
    font-family: "Segoe UI Variable Display", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    font-size: 13px;
    outline: none;
}

/* Frameless Window Container */
#MainRootWidget {
    background-color: #07090E;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
}

/* -------------------------------------------------------------
   HEADER / TITLE BAR (CAD TOP BAR)
------------------------------------------------------------- */
#TitleBar {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 rgba(14, 18, 28, 0.95),
        stop:0.5 rgba(18, 23, 36, 0.92),
        stop:1 rgba(14, 18, 28, 0.95));
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    border-top-left-radius: 13px;
    border-top-right-radius: 13px;
}

#AppTitleLabel {
    color: #F8FAFC;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
}

#AppTaglineLabel {
    color: #00F2FE;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.2px;
}

/* Window Control Buttons (Minimize, Maximize, Close) */
QToolButton#WinBtn {
    background-color: transparent;
    color: #94A3B8;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    padding: 6px 10px;
}

QToolButton#WinBtn:hover {
    background-color: rgba(255, 255, 255, 0.08);
    color: #FFFFFF;
}

QToolButton#WinBtnClose:hover {
    background-color: #EF4444;
    color: #FFFFFF;
}

/* -------------------------------------------------------------
   GLASSMORPHIC CARDS & PANELS (FROSTED GLASS EFFECT)
------------------------------------------------------------- */
QFrame.GlassPanel {
    background: rgba(15, 20, 32, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
}

QFrame.GlassPanelInset {
    background: rgba(10, 14, 22, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
}

/* -------------------------------------------------------------
   CAD TOOLBAR (LEFT DOCK)
------------------------------------------------------------- */
#LeftDock {
    background: rgba(13, 17, 27, 0.82);
    border-right: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
}

QToolButton.ToolActionBtn {
    background: rgba(255, 255, 255, 0.03);
    color: #CBD5E1;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 10px;
    font-weight: 600;
    text-align: left;
}

QToolButton.ToolActionBtn:hover {
    background: rgba(0, 242, 254, 0.12);
    color: #FFFFFF;
    border: 1px solid rgba(0, 242, 254, 0.4);
}

QToolButton.ToolActionBtn:checked {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 rgba(0, 242, 254, 0.25),
        stop:1 rgba(79, 172, 254, 0.15));
    color: #00F2FE;
    border: 1px solid #00F2FE;
}

/* -------------------------------------------------------------
   INSPECTOR & LAYERS (RIGHT DOCK)
------------------------------------------------------------- */
#RightDock {
    background: rgba(13, 17, 27, 0.82);
    border-left: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
}

QLabel.SectionHeader {
    color: #00F2FE;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(0, 242, 254, 0.2);
}

/* Parts Tree / List */
QListWidget, QTreeWidget {
    background: rgba(10, 13, 20, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    padding: 4px;
    color: #E2E8F0;
}

QListWidget::item, QTreeWidget::item {
    background: transparent;
    border-radius: 6px;
    padding: 6px 8px;
    margin: 2px 0px;
}

QListWidget::item:hover, QTreeWidget::item:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #FFFFFF;
}

QListWidget::item:selected, QTreeWidget::item:selected {
    background: rgba(0, 242, 254, 0.18);
    border: 1px solid rgba(0, 242, 254, 0.45);
    color: #00F2FE;
}

/* -------------------------------------------------------------
   SLIDERS, COMBOBOX & CONTROLS
------------------------------------------------------------- */
QComboBox {
    background: rgba(20, 26, 40, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 6px 12px;
    color: #F1F5F9;
    font-weight: 500;
}

QComboBox:hover {
    border: 1px solid #00F2FE;
}

QComboBox::drop-down {
    border: none;
    padding-right: 8px;
}

QComboBox QAbstractItemView {
    background: #0E1320;
    border: 1px solid rgba(0, 242, 254, 0.3);
    border-radius: 6px;
    selection-background-color: rgba(0, 242, 254, 0.25);
    selection-color: #00F2FE;
}

QSlider::groove:horizontal {
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 2px;
}

QSlider::sub-page:horizontal {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 #00F2FE,
        stop:1 #4FACFE);
    border-radius: 2px;
}

QSlider::handle:horizontal {
    background: #FFFFFF;
    border: 2px solid #00F2FE;
    width: 14px;
    margin-top: -5px;
    margin-bottom: -5px;
    border-radius: 7px;
}

QSlider::handle:horizontal:hover {
    background: #00F2FE;
    border: 2px solid #FFFFFF;
}

/* -------------------------------------------------------------
   ACTION BUTTONS
------------------------------------------------------------- */
QPushButton.PrimaryBtn {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 #00F2FE,
        stop:1 #4FACFE);
    color: #07090E;
    font-weight: 700;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    letter-spacing: 0.3px;
}

QPushButton.PrimaryBtn:hover {
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 #38F9D7,
        stop:1 #43E97B);
}

QPushButton.SecondaryBtn {
    background: rgba(255, 255, 255, 0.05);
    color: #E2E8F0;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 8px 14px;
}

QPushButton.SecondaryBtn:hover {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #FFFFFF;
}

/* -------------------------------------------------------------
   SCROLLBARS
------------------------------------------------------------- */
QScrollBar:vertical {
    border: none;
    background: rgba(0, 0, 0, 0.2);
    width: 6px;
    margin: 0px;
    border-radius: 3px;
}

QScrollBar::handle:vertical {
    background: rgba(255, 255, 255, 0.15);
    min-height: 25px;
    border-radius: 3px;
}

QScrollBar::handle:vertical:hover {
    background: #00F2FE;
}

QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}

/* -------------------------------------------------------------
   STATUS BAR & BADGES
------------------------------------------------------------- */
#StatusBar {
    background: rgba(10, 13, 20, 0.95);
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    border-bottom-left-radius: 13px;
    border-bottom-right-radius: 13px;
    padding: 4px 14px;
}

QLabel.TelemetryBadge {
    background: rgba(0, 242, 254, 0.1);
    border: 1px solid rgba(0, 242, 254, 0.25);
    color: #00F2FE;
    font-family: "Consolas", monospace;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 4px;
}
"""
