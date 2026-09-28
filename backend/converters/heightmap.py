"""Heightmap to STL 3D Mesh Converter.

Converts raster images (PNG, JPG, WebP) into 3D printable STL meshes
using deterministic matrix calculations and cross-product linear algebra.
"""

import io
from typing import Tuple
import numpy as np
from PIL import Image
import trimesh


def convert_heightmap_to_stl(
    image_bytes: bytes,
    height: float = 10.0,
    invert: bool = False,
    base_thickness: float = 1.0,
    scale_xy_mm: float = 100.0,
) -> bytes:
    """Convert raster image bytes into an STL binary model.

    Args:
        image_bytes: Raw bytes of the input image (PNG, JPG, WebP, etc.).
        height: Maximum relief height in mm (Z axis).
        invert: If True, inverts the heightmap (darker pixels become higher).
        base_thickness: Thickness of the solid base plate in mm.
        scale_xy_mm: Physical size of the longest side in mm.

    Returns:
        Binary STL file contents as bytes.

    Raises:
        ValueError: If image data is invalid or dimensions are less than 2x2.
    """
    if height <= 0:
        raise ValueError("Height must be greater than zero.")
    if base_thickness < 0:
        raise ValueError("Base thickness cannot be negative.")

    try:
        image = Image.open(io.BytesIO(image_bytes))
    except Exception as exc:
        raise ValueError(f"Invalid image file: {exc}") from exc

    # Handle transparency / color modes deterministically
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba_image = image.convert("RGBA")
        # Composite against white background so transparent areas are considered background (zero height)
        background = Image.new("RGBA", rgba_image.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, rgba_image).convert("L")
    else:
        image = image.convert("L")

    # Downscale limit: Any incoming image > 800x800 px must be resized maintaining aspect ratio
    max_dimension = 800
    width, height_px = image.size

    if width < 2 or height_px < 2:
        raise ValueError("Image dimensions must be at least 2x2 pixels.")

    if width > max_dimension or height_px > max_dimension:
        image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
        width, height_px = image.size

    # Convert grayscale pixels to normalized height matrix [0.0, 1.0]
    # Matrix operations only (deterministic pure linear algebra)
    height_grid = np.asarray(image, dtype=np.float32) / 255.0

    if invert:
        height_grid = 1.0 - height_grid

    # Compute physical coordinates in mm
    aspect = height_px / width
    if width >= height_px:
        size_x = scale_xy_mm
        size_y = scale_xy_mm * aspect
    else:
        size_y = scale_xy_mm
        size_x = scale_xy_mm / aspect

    x_coords = np.linspace(0.0, size_x, width, dtype=np.float32)
    y_coords = np.linspace(0.0, size_y, height_px, dtype=np.float32)
    xv, yv = np.meshgrid(x_coords, y_coords)

    # Compute Z coordinates: base thickness + scaled relief
    zv = base_thickness + (height_grid * float(height))

    # Top surface vertices (shape: H*W, 3)
    top_verts = np.stack([xv, yv, zv], axis=-1).reshape(-1, 3)
    # Bottom surface vertices at Z=0 (shape: H*W, 3)
    bot_verts = np.stack([xv, yv, np.zeros_like(zv)], axis=-1).reshape(-1, 3)

    vertices = np.vstack([top_verts, bot_verts])
    n_top = len(top_verts)

    # Vectorized face construction for the grid
    r, c = np.meshgrid(np.arange(height_px - 1), np.arange(width - 1), indexing="ij")
    v00 = r * width + c
    v01 = r * width + (c + 1)
    v10 = (r + 1) * width + c
    v11 = (r + 1) * width + (c + 1)

    # Top faces (oriented counter-clockwise for +Z normals)
    top_f1 = np.stack([v00, v01, v10], axis=-1).reshape(-1, 3)
    top_f2 = np.stack([v01, v11, v10], axis=-1).reshape(-1, 3)

    # Bottom faces (reversed winding for -Z normals)
    bot_v00 = v00 + n_top
    bot_v01 = v01 + n_top
    bot_v10 = v10 + n_top
    bot_v11 = v11 + n_top
    bot_f1 = np.stack([bot_v00, bot_v10, bot_v01], axis=-1).reshape(-1, 3)
    bot_f2 = np.stack([bot_v01, bot_v10, bot_v11], axis=-1).reshape(-1, 3)

    # Watertight side walls connecting perimeter top edges to bottom edges:
    # 1. Row 0 (top boundary, Y=0, outward normal -Y)
    c_arr = np.arange(width - 1)
    t_p1 = c_arr
    t_p2 = c_arr + 1
    b_p1 = t_p1 + n_top
    b_p2 = t_p2 + n_top
    side_r0_1 = np.stack([t_p1, b_p1, t_p2], axis=-1)
    side_r0_2 = np.stack([t_p2, b_p1, b_p2], axis=-1)

    # 2. Row H-1 (bottom boundary, Y=size_y, outward normal +Y)
    t_p1 = (height_px - 1) * width + c_arr
    t_p2 = (height_px - 1) * width + c_arr + 1
    b_p1 = t_p1 + n_top
    b_p2 = t_p2 + n_top
    side_rh_1 = np.stack([t_p1, t_p2, b_p1], axis=-1)
    side_rh_2 = np.stack([t_p2, b_p2, b_p1], axis=-1)

    # 3. Col 0 (left boundary, X=0, outward normal -X)
    r_arr = np.arange(height_px - 1)
    t_p1 = r_arr * width
    t_p2 = (r_arr + 1) * width
    b_p1 = t_p1 + n_top
    b_p2 = t_p2 + n_top
    side_c0_1 = np.stack([t_p1, t_p2, b_p1], axis=-1)
    side_c0_2 = np.stack([t_p2, b_p2, b_p1], axis=-1)

    # 4. Col W-1 (right boundary, X=size_x, outward normal +X)
    t_p1 = r_arr * width + (width - 1)
    t_p2 = (r_arr + 1) * width + (width - 1)
    b_p1 = t_p1 + n_top
    b_p2 = t_p2 + n_top
    side_cw_1 = np.stack([t_p1, b_p1, t_p2], axis=-1)
    side_cw_2 = np.stack([t_p2, b_p1, b_p2], axis=-1)

    # Combine all faces into single contiguous array
    faces = np.vstack([
        top_f1, top_f2,
        bot_f1, bot_f2,
        side_r0_1, side_r0_2,
        side_rh_1, side_rh_2,
        side_c0_1, side_c0_2,
        side_cw_1, side_cw_2,
    ])

    # Construct watertight trimesh (normals calculated deterministically via cross product)
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    stl_bytes = mesh.export(file_type="stl")
    if isinstance(stl_bytes, str):
        stl_bytes = stl_bytes.encode("latin1")
    return stl_bytes
