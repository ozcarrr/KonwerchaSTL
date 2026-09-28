"""SVG Vector to STL 3D Mesh Extruder.

Converts vector SVG files into 3D printable STL meshes using deterministic
algebraic polygon validation (orient and buffer(0) via Shapely) and orthogonal extrusion.
"""

import io
import re
import xml.etree.ElementTree as ET
from typing import List, Tuple, Union
import numpy as np
from shapely.geometry import Polygon, MultiPolygon, GeometryCollection
from shapely.geometry.polygon import orient
import trimesh

try:
    from svg.path import parse_path, Line, Arc, CubicBezier, QuadraticBezier, Close, Move
    HAS_SVG_PATH = True
except ImportError:
    HAS_SVG_PATH = False


def _strip_ns(tag: str) -> str:
    """Remove XML namespace from a tag name."""
    return tag.split("}")[-1] if "}" in tag else tag


def _parse_polygon_points(points_str: str) -> List[Tuple[float, float]]:
    """Parse SVG points attribute string into coordinate pairs."""
    clean_str = points_str.replace(",", " ").strip()
    tokens = clean_str.split()
    coords = []
    for i in range(0, len(tokens) - 1, 2):
        try:
            x = float(tokens[i])
            y = float(tokens[i + 1])
            coords.append((x, y))
        except ValueError:
            continue
    return coords


def _parse_path_subpaths_with_svg_path(d_str: str, num_samples: int = 16) -> List[List[Tuple[float, float]]]:
    """Parse an SVG path into subpath point rings using svg.path library."""
    parsed = parse_path(d_str)
    subpaths: List[list] = []
    current_segment_list: list = []

    for seg in parsed:
        if isinstance(seg, Move) and current_segment_list:
            subpaths.append(current_segment_list)
            current_segment_list = []
        current_segment_list.append(seg)

    if current_segment_list:
        subpaths.append(current_segment_list)

    rings: List[List[Tuple[float, float]]] = []
    for sp in subpaths:
        pts: List[Tuple[float, float]] = []
        for seg in sp:
            if isinstance(seg, Move):
                pts.append((seg.end.real, seg.end.imag))
            elif isinstance(seg, Line):
                pts.append((seg.end.real, seg.end.imag))
            elif isinstance(seg, Close):
                if pts:
                    pts.append(pts[0])
            else:
                # Curves (Arc, CubicBezier, QuadraticBezier)
                ts = np.linspace(0.1, 1.0, num_samples)
                for t in ts:
                    pt = seg.point(t)
                    pts.append((pt.real, pt.imag))

        if len(pts) >= 3:
            # Ensure closed ring
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            rings.append(pts)

    return rings


def _parse_path_subpaths_fallback(d_str: str) -> List[List[Tuple[float, float]]]:
    """Fallback tokenizer/parser for SVG path d attribute when svg.path is not available."""
    token_pattern = re.compile(r"([a-zA-Z])|([-+]?(?:(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?))")
    tokens = []
    for m in token_pattern.finditer(d_str):
        if m.group(1):
            tokens.append(m.group(1))
        elif m.group(2):
            tokens.append(float(m.group(2)))

    rings: List[List[Tuple[float, float]]] = []
    current_ring: List[Tuple[float, float]] = []
    cur_x, cur_y = 0.0, 0.0
    start_x, start_y = 0.0, 0.0
    idx = 0
    cmd = ""

    while idx < len(tokens):
        item = tokens[idx]
        if isinstance(item, str):
            cmd = item
            idx += 1
        else:
            # Re-use previous command
            pass

        if not cmd:
            idx += 1
            continue

        c = cmd.upper()
        is_rel = cmd.islower()

        if c == "M":
            if current_ring and len(current_ring) >= 3:
                if current_ring[0] != current_ring[-1]:
                    current_ring.append(current_ring[0])
                rings.append(current_ring)
                current_ring = []
            x = float(tokens[idx])
            y = float(tokens[idx + 1])
            idx += 2
            cur_x = (cur_x + x) if is_rel else x
            cur_y = (cur_y + y) if is_rel else y
            start_x, start_y = cur_x, cur_y
            current_ring.append((cur_x, cur_y))
            cmd = "l" if is_rel else "L"

        elif c == "L":
            x = float(tokens[idx])
            y = float(tokens[idx + 1])
            idx += 2
            cur_x = (cur_x + x) if is_rel else x
            cur_y = (cur_y + y) if is_rel else y
            current_ring.append((cur_x, cur_y))

        elif c == "H":
            x = float(tokens[idx])
            idx += 1
            cur_x = (cur_x + x) if is_rel else x
            current_ring.append((cur_x, cur_y))

        elif c == "V":
            y = float(tokens[idx])
            idx += 1
            cur_y = (cur_y + y) if is_rel else y
            current_ring.append((cur_x, cur_y))

        elif c == "C":
            # Cubic bezier: 6 params: x1, y1, x2, y2, x, y
            coords = [float(tokens[idx + i]) for i in range(6)]
            idx += 6
            end_x = (cur_x + coords[4]) if is_rel else coords[4]
            end_y = (cur_y + coords[5]) if is_rel else coords[5]
            cur_x, cur_y = end_x, end_y
            current_ring.append((cur_x, cur_y))

        elif c == "S" or c == "Q":
            # 4 params
            coords = [float(tokens[idx + i]) for i in range(4)]
            idx += 4
            end_x = (cur_x + coords[2]) if is_rel else coords[2]
            end_y = (cur_y + coords[3]) if is_rel else coords[3]
            cur_x, cur_y = end_x, end_y
            current_ring.append((cur_x, cur_y))

        elif c == "Z":
            cur_x, cur_y = start_x, start_y
            if current_ring:
                current_ring.append((start_x, start_y))
                if len(current_ring) >= 3:
                    rings.append(current_ring)
                current_ring = []
        else:
            idx += 1

    if current_ring and len(current_ring) >= 3:
        if current_ring[0] != current_ring[-1]:
            current_ring.append(current_ring[0])
        rings.append(current_ring)

    return rings


def _extract_rings_from_svg(svg_content: str) -> List[List[Tuple[float, float]]]:
    """Parse all SVG geometric elements and return closed 2D point rings."""
    root = ET.fromstring(svg_content)
    rings: List[List[Tuple[float, float]]] = []

    for elem in root.iter():
        tag = _strip_ns(elem.tag).lower()

        if tag == "polygon" or tag == "polyline":
            pts = _parse_polygon_points(elem.attrib.get("points", ""))
            if len(pts) >= 3:
                if pts[0] != pts[-1]:
                    pts.append(pts[0])
                rings.append(pts)

        elif tag == "rect":
            try:
                x = float(elem.attrib.get("x", 0.0))
                y = float(elem.attrib.get("y", 0.0))
                w = float(elem.attrib.get("width", 0.0))
                h = float(elem.attrib.get("height", 0.0))
                if w > 0 and h > 0:
                    rings.append([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)])
            except ValueError:
                continue

        elif tag == "circle":
            try:
                cx = float(elem.attrib.get("cx", 0.0))
                cy = float(elem.attrib.get("cy", 0.0))
                r = float(elem.attrib.get("r", 0.0))
                if r > 0:
                    angles = np.linspace(0, 2 * np.pi, 64)
                    circle_pts = [(cx + r * np.cos(a), cy + r * np.sin(a)) for a in angles]
                    rings.append(circle_pts)
            except ValueError:
                continue

        elif tag == "ellipse":
            try:
                cx = float(elem.attrib.get("cx", 0.0))
                cy = float(elem.attrib.get("cy", 0.0))
                rx = float(elem.attrib.get("rx", 0.0))
                ry = float(elem.attrib.get("ry", 0.0))
                if rx > 0 and ry > 0:
                    angles = np.linspace(0, 2 * np.pi, 64)
                    ellipse_pts = [(cx + rx * np.cos(a), cy + ry * np.sin(a)) for a in angles]
                    rings.append(ellipse_pts)
            except ValueError:
                continue

        elif tag == "path":
            d = elem.attrib.get("d", "").strip()
            if not d:
                continue
            if HAS_SVG_PATH:
                try:
                    path_rings = _parse_path_subpaths_with_svg_path(d)
                except Exception:
                    path_rings = _parse_path_subpaths_fallback(d)
            else:
                path_rings = _parse_path_subpaths_fallback(d)
            rings.extend(path_rings)

    return rings


def _build_repaired_polygons(rings: List[List[Tuple[float, float]]]) -> List[Polygon]:
    """Convert point rings to Shapely polygons with topological repair and orientation.

    Applies Protocol 2 strictly:
    - shapely.geometry.polygon.orient()
    - .buffer(0) for topological repair of non-closed or self-intersecting geometries.
    """
    raw_polys: List[Polygon] = []
    for r in rings:
        if len(r) < 3:
            continue
        try:
            poly = Polygon(r)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty or poly.area < 1e-6:
                continue
            raw_polys.append(poly)
        except Exception:
            continue

    if not raw_polys:
        return []

    # Sort polygons by area descending to properly resolve nested holes
    sorted_polys = sorted(raw_polys, key=lambda p: p.area, reverse=True)

    # Reconstruct polygons resolving hole containment
    processed_polys: List[Polygon] = []
    used_as_hole = set()

    for i, outer in enumerate(sorted_polys):
        if i in used_as_hole:
            continue
        current_geom = outer
        for j, inner in enumerate(sorted_polys[i + 1:], start=i + 1):
            if j in used_as_hole:
                continue
            # If inner is strictly contained within outer, subtract it as a hole
            if current_geom.contains(inner) or current_geom.contains(inner.representative_point()):
                current_geom = current_geom.difference(inner)
                used_as_hole.add(j)

        # Apply Protocol 2 requirement: orient() and .buffer(0)
        repaired = orient(current_geom.buffer(0))

        # Unpack MultiPolygon or GeometryCollection if formed
        if hasattr(repaired, "geoms"):
            for g in repaired.geoms:
                if isinstance(g, Polygon) and not g.is_empty and g.area > 1e-6:
                    processed_polys.append(orient(g))
        elif isinstance(repaired, Polygon) and not repaired.is_empty and repaired.area > 1e-6:
            processed_polys.append(repaired)

    return processed_polys


def _extrude_shapely_polygon(poly: Polygon, depth: float) -> trimesh.Trimesh:
    """Extrude a 2D Shapely polygon into a 3D trimesh manifold.

    Attempts trimesh.creation.extrude_polygon, and provides a deterministic
    linear algebra fallback with cross-product face normals.
    """
    try:
        mesh = trimesh.creation.extrude_polygon(poly, height=depth)
        if mesh is not None and len(mesh.faces) > 0:
            return mesh
    except Exception:
        pass

    # Deterministic linear algebra fallback
    # Triangulate top surface using Delaunay
    tris = shapely.constrained_delaunay_triangles(poly) if hasattr(shapely, "constrained_delaunay_triangles") else shapely.ops.triangulate(poly)
    valid_tris = [t for t in tris.geoms if poly.contains(t.representative_point()) and t.area > 1e-9]

    verts: List[List[float]] = []
    vert_map: dict = {}

    def get_or_add_vert(x: float, y: float, z: float) -> int:
        key = (round(float(x), 6), round(float(y), 6), round(float(z), 6))
        if key not in vert_map:
            vert_map[key] = len(verts)
            verts.append([key[0], key[1], key[2]])
        return vert_map[key]

    top_faces = []
    bot_faces = []

    for t in valid_tris:
        coords = list(t.exterior.coords)[:-1]
        p0, p1, p2 = coords[0], coords[1], coords[2]
        # Cross product in 2D to ensure CCW orientation for +Z normal
        if (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]) < 0:
            p1, p2 = p2, p1

        t0 = get_or_add_vert(p0[0], p0[1], depth)
        t1 = get_or_add_vert(p1[0], p1[1], depth)
        t2 = get_or_add_vert(p2[0], p2[1], depth)
        top_faces.append([t0, t1, t2])

        b0 = get_or_add_vert(p0[0], p0[1], 0.0)
        b1 = get_or_add_vert(p1[0], p1[1], 0.0)
        b2 = get_or_add_vert(p2[0], p2[1], 0.0)
        # Reversed winding for -Z normal
        bot_faces.append([b0, b2, b1])

    # Side walls along exterior ring and interior hole rings
    side_faces = []
    rings = [poly.exterior] + list(poly.interiors)
    for ring in rings:
        coords = list(ring.coords)
        for i in range(len(coords) - 1):
            p1, p2 = coords[i], coords[i + 1]
            if p1 == p2:
                continue
            b1 = get_or_add_vert(p1[0], p1[1], 0.0)
            b2 = get_or_add_vert(p2[0], p2[1], 0.0)
            t1 = get_or_add_vert(p1[0], p1[1], depth)
            t2 = get_or_add_vert(p2[0], p2[1], depth)

            side_faces.append([b1, b2, t2])
            side_faces.append([b1, t2, t1])

    all_faces = top_faces + bot_faces + side_faces
    mesh = trimesh.Trimesh(
        vertices=np.array(verts, dtype=np.float32),
        faces=np.array(all_faces, dtype=np.int32),
        process=True,
    )
    trimesh.repair.fix_normals(mesh)
    return mesh


def convert_svg_to_stl(svg_bytes: bytes, extrude_depth: float = 5.0) -> bytes:
    """Convert SVG vector file bytes into an STL binary model.

    Args:
        svg_bytes: Raw bytes of the .svg file.
        extrude_depth: Orthogonal extrusion thickness in mm.

    Returns:
        Binary STL file contents as bytes.

    Raises:
        ValueError: If SVG is empty, malformed, or yields no valid closed polygons.
    """
    if extrude_depth <= 0:
        raise ValueError("Extrude depth must be greater than zero.")

    try:
        svg_content = svg_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            svg_content = svg_bytes.decode("latin1")
        except Exception as exc:
            raise ValueError(f"Unable to decode SVG file: {exc}") from exc

    try:
        rings = _extract_rings_from_svg(svg_content)
    except Exception as exc:
        raise ValueError(f"Failed to parse SVG XML structure: {exc}") from exc

    if not rings:
        raise ValueError("No vector geometries found in SVG file.")

    polygons = _build_repaired_polygons(rings)
    if not polygons:
        raise ValueError("No valid closed polygons could be reconstructed from SVG.")

    # Extrude each polygon orthogonally
    meshes = []
    for poly in polygons:
        try:
            m = _extrude_shapely_polygon(poly, float(extrude_depth))
            if m is not None and len(m.faces) > 0:
                meshes.append(m)
        except Exception:
            continue

    if not meshes:
        raise ValueError("Failed to extrude polygons into 3D mesh.")

    if len(meshes) == 1:
        combined_mesh = meshes[0]
    else:
        combined_mesh = trimesh.util.concatenate(meshes)

    stl_bytes = combined_mesh.export(file_type="stl")
    if isinstance(stl_bytes, str):
        stl_bytes = stl_bytes.encode("latin1")
    return stl_bytes
