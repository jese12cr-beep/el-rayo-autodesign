"""
El Rayo AutoDesign Studio - Asynchronous Segmentation Worker (QThread)
Ensures non-blocking, responsive 60 FPS UI while executing vision models.
"""

from PyQt6.QtCore import QThread, pyqtSignal, QObject
from typing import Dict, Any

from app.vision.preprocessor import VehicleImagePreprocessor, ProcessedVehicleImage
from app.vision.segmenter import CarPartSegmenter, SegmentedPart


class SegmentationWorker(QThread):
    """Background worker thread for vehicle photo ingestion & SAM segmentation."""

    # Signals
    progress_changed = pyqtSignal(int, str)       # (percentage, current_stage_description)
    part_isolated = pyqtSignal(str, dict)         # (part_id, part_metadata_dict)
    segmentation_finished = pyqtSignal(dict)      # (all_parts_dict)
    error_occurred = pyqtSignal(str)              # (error_message)

    def __init__(self, image_path: str, onnx_model_path: str = None, parent=None):
        super().__init__(parent)
        self.image_path = image_path
        self.onnx_model_path = onnx_model_path
        self._is_cancelled = False

    def cancel(self):
        self._is_cancelled = True

    def run(self):
        try:
            self.progress_changed.emit(5, "Iniciando ingesta y preprocesamiento de fotografía...")
            preprocessor = VehicleImagePreprocessor(target_max_dimension=1280)
            processed_img = preprocessor.process(self.image_path)

            if self._is_cancelled:
                return

            self.progress_changed.emit(20, "Cargando modelo de segmentación semántica (SAM)...")
            segmenter = CarPartSegmenter(onnx_model_path=self.onnx_model_path)

            def on_progress(pct: int, label: str):
                scaled_pct = 20 + int(pct * 0.75)
                self.progress_changed.emit(scaled_pct, f"Segmentando: {label}")

            results: Dict[str, SegmentedPart] = segmenter.segment_vehicle(
                processed_img,
                progress_callback=on_progress
            )

            if self._is_cancelled:
                return

            # Format for UI and WebEngine Canvas
            serialized_results = {}
            for part_id, part in results.items():
                data = {
                    "part_id": part.part_id,
                    "label": part.label,
                    "color_hint": part.color_hint,
                    "confidence": part.confidence,
                    "svg_path": part.svg_path,
                    "bbox": part.bbox,
                    "area_pixels": part.area_pixels,
                    "surface_percent": part.surface_percent,
                    "num_polygons": len(part.polygons)
                }
                serialized_results[part_id] = data
                self.part_isolated.emit(part_id, data)

            self.progress_changed.emit(100, "Segmentación completada exitosamente.")
            self.segmentation_finished.emit(serialized_results)

        except Exception as e:
            self.error_occurred.emit(str(e))
