"""
El Rayo AutoDesign Studio - Application Entrypoint
Industrial CAD Automotive Customization Suite
"""

import sys
import os
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from PyQt6.QtWidgets import QApplication
from PyQt6.QtCore import Qt

from app.ui.main_window import MainWindow


def main():
    # Windows Snapdragon / High-DPI optimizations
    os.environ["QT_ENABLE_HIGHDPI_SCALING"] = "1"
    os.environ["QT_AUTO_SCREEN_SCALE_FACTOR"] = "1"

    app = QApplication(sys.argv)
    app.setApplicationName("El Rayo AutoDesign Studio")
    app.setOrganizationName("El Rayo Motors")

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
