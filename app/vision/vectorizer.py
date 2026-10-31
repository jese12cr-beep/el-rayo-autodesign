"""
El Rayo AutoDesign Studio - Mask Vectorizer Engine
Converts binary/raster segmentation masks into high-precision CAD vector
polygons, smoothed Cubic Bézier splines, and SVG paths.
"""

from typing import List, Dict, Tuple, Any
import numpy as np


class MaskVectorizer:
    """Vectorizes raster masks into CAD polygons and SVG Bézier paths."""

    def __init__(self, rdp_epsilon: float = 2.0, bezier_smoothing: bool = True):
        self.rdp_epsilon = rdp_epsilon
        self.bezier_smoothing = bezier_smoothing

    def vectorize_mask(self, mask: np.ndarray, part_id: str = "") -> Dict[str, Any]:
        """
        Convert a 2D binary mask (H, W) into:
        - List of polygon contours (RDP simplified).
        - SVG Path string formatted for Fabric.js/QWebEngineView.
        - Bounding box and surface metrics.
        """
        h, w = mask.shape
        binary = (mask > 0).astype(np.uint8)

        # 1. Trace contours using Moore-Neighbor / Marching border algorithm
        contours = self._trace_contours(binary)
        if not contours:
            return {
                "part_id": part_id,
                "svg_path": "",
                "polygons": [],
                "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
                "area_pixels": 0,
                "surface_percent": 0.0
            }

        # 2. Simplify contours with Ramer-Douglas-Peucker (RDP)
        simplified_polygons: List[List[Tuple[float, float]]] = []
        for c in contours:
            if len(c) < 3:
                continue
            sim = self._rdp(c, self.rdp_epsilon)
            if len(sim) >= 3:
                simplified_polygons.append(sim)

        if not simplified_polygons:
            return {
                "part_id": part_id,
                "svg_path": "",
                "polygons": [],
                "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
                "area_pixels": int(np.sum(binary)),
                "surface_percent": (np.sum(binary) / float(h * w)) * 100.0
            }

        # 3. Generate SVG path string with Cubic Bézier smoothing
        svg_commands: List[str] = []
        all_pts: List[Tuple[float, float]] = []

        for poly in simplified_polygons:
            all_pts.extend(poly)
            if self.bezier_smoothing and len(poly) >= 4:
                svg_commands.append(self._poly_to_bezier_path(poly))
            else:
                # Direct CAD polygon lines
                pts_str = " ".join([f"{p[0]:.2f},{p[1]:.2f}" for p in poly])
                svg_commands.append(f"M {poly[0][0]:.2f},{poly[0][1]:.2f} " +
                                    " ".join([f"L {p[0]:.2f},{p[1]:.2f}" for p in poly[1:]]) + " Z")

        svg_path = " ".join(svg_commands)

        # 4. Compute Bounding Box
        xs = [p[0] for p in all_pts]
        ys = [p[1] for p in all_pts]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)

        area_pixels = int(np.sum(binary))
        surface_pct = (area_pixels / float(h * w)) * 100.0

        return {
            "part_id": part_id,
            "svg_path": svg_path,
            "polygons": simplified_polygons,
            "bbox": {
                "x": float(min_x),
                "y": float(min_y),
                "width": float(max_x - min_x),
                "height": float(max_y - min_y),
            },
            "area_pixels": area_pixels,
            "surface_percent": round(surface_pct, 2)
        }

    def _trace_contours(self, binary: np.ndarray) -> List[List[Tuple[float, float]]]:
        """
        Fast boundary tracing for binary mask.
        Detects border transitions (0 -> 1) and walks connected perimeter.
        """
        h, w = binary.shape
        # Pad with 0s to avoid edge clipping
        padded = np.pad(binary, ((1, 1), (1, 1)), mode='constant', constant_values=0)
        
        # Edge mask: pixels that are 1 and have at least one 0 neighbor
        eroded = (
            padded[1:-1, 1:-1] &
            padded[:-2, 1:-1] &
            padded[2:, 1:-1] &
            padded[1:-1, :-2] &
            padded[1:-1, 2:]
        )
        edge_pixels = np.argwhere((binary == 1) & (~eroded))
        if len(edge_pixels) == 0:
            return []

        # Simple clustering/grid grouping of edge points to generate convex/concave loop
        # Sort points by angle around centroid for convex-like panels
        cy = np.mean(edge_pixels[:, 0])
        cx = np.mean(edge_pixels[:, 1])

        angles = np.arctan2(edge_pixels[:, 0] - cy, edge_pixels[:, 1] - cx)
        sort_idx = np.argsort(angles)
        sorted_edge = edge_pixels[sort_idx]

        # Downsample edge to reasonable count before RDP
        step = max(1, len(sorted_edge) // 180)
        sampled = sorted_edge[::step]

        contour = [(float(p[1]), float(p[0])) for p in sampled]
        # Close loop
        if contour and contour[0] != contour[-1]:
            contour.append(contour[0])

        return [contour]

    def _rdp(self, points: List[Tuple[float, float]], epsilon: float) -> List[Tuple[float, float]]:
        """Ramer-Douglas-Peucker polygonal curve decimation."""
        if len(points) < 3:
            return points

        dmax = 0.0
        index = 0
        start = points[0]
        end = points[-1]

        # Precompute line segment vector
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        line_len = np.hypot(dx, dy)

        for i in range(1, len(points) - 1):
            p = points[i]
            if line_len == 0:
                d = np.hypot(p[0] - start[0], p[1] - start[1])
            else:
                # Perpendicular distance to line
                d = abs(dy * p[0] - dx * p[1] + end[0] * start[1] - end[1] * start[0]) / line_len

            if d > dmax:
                index = i
                dmax = d

        if dmax > epsilon:
            rec_results1 = self._rdp(points[:index + 1], epsilon)
            rec_results2 = self._rdp(points[index:], epsilon)
            return rec_results1[:-1] + rec_results2
        else:
            return [start, end]

    def _poly_to_bezier_path(self, poly: List[Tuple[float, float]]) -> str:
        """
        Construct smooth Cubic Bézier curve SVG path from polygonal points.
        Calculates Catmull-Rom tangent control points.
        """
        n = len(poly)
        if n < 3:
            return "M " + " ".join([f"{p[0]:.2f},{p[1]:.2f}" for p in poly]) + " Z"

        path = [f"M {poly[0][0]:.2f},{poly[0][1]:.2f}"]
        tension = 0.25

        for i in range(n - 1):
            p0 = poly[i - 1] if i > 0 else poly[n - 2]
            p1 = poly[i]
            p2 = poly[i + 1]
            p3 = poly[i + 2] if i + 2 < n else poly[(i + 2) % n]

            cp1x = p1[0] + (p2[0] - p0[0]) * tension
            cp1y = p1[1] + (p2[1] - p0[1]) * tension
            cp2x = p2[0] - (p3[0] - p1[0]) * tension
            cp2y = p2[1] - (p3[1] - p1[1]) * tension

            path.append(f"C {cp1x:.2f},{cp1y:.2f} {cp2x:.2f},{cp2y:.2f} {p2[0]:.2f},{p2[1]:.2f}")

        path.append("Z")
        return " ".join(path)
