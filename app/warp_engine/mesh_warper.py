"""
El Rayo AutoDesign Studio - 2.5D Mesh Warping Engine (Python Core)
Module 4:
- Deforms 2D decals, stripes, and vinyl textures over automotive 3D curvature.
- Piecewise Affine Warping via Delaunay / Regular Quad Triangulation.
- Clips decal to segmented vehicle parts or spans across adjacent body panels.
"""

from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional
import numpy as np
from PIL import Image


@dataclass
class WarpControlPoint:
    id: int
    row: int
    col: int
    src_u: float   # Normalized UV in [0, 1]
    src_v: float
    dst_x: float   # Deformed pixel position X
    dst_y: float   # Deformed pixel position Y


class MeshWarpGrid:
    """Manages an NxM 2.5D deformation grid with control handles."""

    def __init__(self, rows: int = 4, cols: int = 4, width: float = 300, height: float = 150, origin_x: float = 100, origin_y: float = 100):
        self.rows = rows
        self.cols = cols
        self.width = width
        self.height = height
        self.origin_x = origin_x
        self.origin_y = origin_y
        self.points: List[WarpControlPoint] = []
        self._init_grid()

    def _init_grid(self):
        """Construct regular planar grid vertices."""
        self.points.clear()
        idx = 0
        for r in range(self.rows):
            v = r / float(self.rows - 1)
            y = self.origin_y + v * self.height
            for c in range(self.cols):
                u = c / float(self.cols - 1)
                x = self.origin_x + u * self.width
                self.points.append(
                    WarpControlPoint(
                        id=idx,
                        row=r,
                        col=c,
                        src_u=u,
                        src_v=v,
                        dst_x=x,
                        dst_y=y
                    )
                )
                idx += 1

    def move_control_point(self, point_id: int, new_x: float, new_y: float):
        """Update a single control handle."""
        if 0 <= point_id < len(self.points):
            self.points[point_id].dst_x = new_x
            self.points[point_id].dst_y = new_y

    def apply_curvature_preset(self, preset_type: str = "door_convex"):
        """
        Apply automated automotive curvature presets:
        - "door_convex": Bows center rows outward simulating car door sheet-metal relief.
        - "hood_bulge": Parabolic curve along central column simulating hood scoop/bulge.
        - "fender_arch": Circular displacement hugging the wheel well.
        """
        cx = self.origin_x + self.width * 0.5
        cy = self.origin_y + self.height * 0.5

        for p in self.points:
            u, v = p.src_u, p.src_v
            if preset_type == "door_convex":
                # Quadratic displacement outward in the middle
                displacement = 25.0 * np.sin(np.pi * v) * np.sin(np.pi * u)
                p.dst_y += displacement
            elif preset_type == "hood_bulge":
                # Symmetrical lateral expansion
                displacement = 30.0 * np.sin(np.pi * u)
                p.dst_y -= displacement * 0.5
            elif preset_type == "fender_arch":
                # Radial distortion
                dist_from_bottom = (1.0 - v)
                p.dst_x += 20.0 * np.sin(np.pi * u) * dist_from_bottom

    def to_dict(self) -> Dict[str, Any]:
        """Serialize grid structure for WebGL / Fabric.js communication."""
        return {
            "rows": self.rows,
            "cols": self.cols,
            "width": self.width,
            "height": self.height,
            "points": [
                {
                    "id": p.id,
                    "row": p.row,
                    "col": p.col,
                    "src_u": p.src_u,
                    "src_v": p.src_v,
                    "dst_x": p.dst_x,
                    "dst_y": p.dst_y
                }
                for p in self.points
            ]
        }


class DecalWarpEngine:
    """Renders warped decals and anchors them to automotive piece masks."""

    def __init__(self):
        pass

    def warp_decal(
        self,
        decal_image: Image.Image,
        grid: MeshWarpGrid,
        output_size: Tuple[int, int],
        part_mask: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Bilinearly deforms the decal texture following the control mesh
        and clips the output to the target vehicle part mask.
        """
        out_w, out_h = output_size
        decal_rgba = decal_image.convert("RGBA")
        decal_np = np.array(decal_rgba, dtype=np.uint8)

        # Output canvas (RGBA)
        warped = np.zeros((out_h, out_w, 4), dtype=np.uint8)

        # Iterate grid quad cells
        for r in range(grid.rows - 1):
            for c in range(grid.cols - 1):
                # 4 vertices of quad
                p00 = grid.points[r * grid.cols + c]
                p10 = grid.points[r * grid.cols + (c + 1)]
                p01 = grid.points[(r + 1) * grid.cols + c]
                p11 = grid.points[(r + 1) * grid.cols + (c + 1)]

                # Warp triangles (p00, p10, p01) and (p10, p11, p01)
                self._warp_triangle(decal_np, warped, p00, p10, p01)
                self._warp_triangle(decal_np, warped, p10, p11, p01)

        # Anchor & clip to part mask if provided
        if part_mask is not None:
            # Mask has (H, W) bool
            clip_mask = part_mask.astype(bool)
            # Alpha channel clipped
            warped[..., 3] = np.where(clip_mask, warped[..., 3], 0)

        return warped

    def _warp_triangle(
        self,
        src: np.ndarray,
        dst: np.ndarray,
        p0: WarpControlPoint,
        p1: WarpControlPoint,
        p2: WarpControlPoint
    ):
        """Piecewise affine mapping between source texture and destination triangle."""
        src_h, src_w, _ = src.shape
        dst_h, dst_w, _ = dst.shape

        # Source coordinates in pixel space
        src_tri = np.array([
            [p0.src_u * src_w, p0.src_v * src_h],
            [p1.src_u * src_w, p1.src_v * src_h],
            [p2.src_u * src_w, p2.src_v * src_h]
        ], dtype=np.float32)

        # Destination coordinates
        dst_tri = np.array([
            [p0.dst_x, p0.dst_y],
            [p1.dst_x, p1.dst_y],
            [p2.dst_x, p2.dst_y]
        ], dtype=np.float32)

        # Compute bounding box of destination triangle
        min_x = max(0, int(np.floor(np.min(dst_tri[:, 0]))))
        max_x = min(dst_w - 1, int(np.ceil(np.max(dst_tri[:, 0]))))
        min_y = max(0, int(np.floor(np.min(dst_tri[:, 1]))))
        max_y = min(dst_h - 1, int(np.ceil(np.max(dst_tri[:, 1]))))

        if min_x >= max_x or min_y >= max_y:
            return

        # Affine matrix from dst to src
        A = np.vstack([dst_tri.T, [1, 1, 1]])
        try:
            inv_A = np.linalg.inv(A)
        except np.linalg.LinAlgError:
            return

        M = np.dot(src_tri.T, inv_A)

        # Grid of pixels inside destination bounding box
        grid_x, grid_y = np.meshgrid(np.arange(min_x, max_x + 1), np.arange(min_y, max_y + 1))
        coords = np.vstack([grid_x.ravel(), grid_y.ravel(), np.ones(grid_x.size)])

        # Barycentric test for triangle inclusion
        v0 = dst_tri[2] - dst_tri[0]
        v1 = dst_tri[1] - dst_tri[0]
        v2 = coords[:2].T - dst_tri[0]

        dot00 = np.dot(v0, v0)
        dot01 = np.dot(v0, v1)
        dot02 = np.dot(v2, v0)
        dot11 = np.dot(v1, v1)
        dot12 = np.dot(v2, v1)

        inv_denom = 1.0 / (dot00 * dot11 - dot01 * dot01 + 1e-6)
        u = (dot11 * dot02 - dot01 * dot12) * inv_denom
        v = (dot00 * dot12 - dot01 * dot02) * inv_denom

        inside = (u >= 0) & (v >= 0) & (u + v <= 1)
        if not np.any(inside):
            return

        # Map inside coordinates to source texture
        src_coords = np.dot(M, coords[:, inside])
        sx = np.clip(np.round(src_coords[0]).astype(int), 0, src_w - 1)
        sy = np.clip(np.round(src_coords[1]).astype(int), 0, src_h - 1)

        dx = grid_x.ravel()[inside]
        dy = grid_y.ravel()[inside]

        dst[dy, dx] = src[sy, sx]
