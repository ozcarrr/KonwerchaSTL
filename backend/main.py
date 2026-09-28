"""FastAPI application for Konchewa STL 3D conversion backend.

Provides deterministic raster heightmap and SVG vector conversion to binary STL files,
with CORS enabled for Ionic and Angular client applications.
"""

import os
import sys
from pathlib import Path
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

# Ensure imports work whether executed from workspace root or from backend/ directory
backend_dir = Path(__file__).resolve().parent
parent_dir = backend_dir.parent
for p in [str(backend_dir), str(parent_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.converters.heightmap import convert_heightmap_to_stl
    from backend.converters.svg_extruder import convert_svg_to_stl
except ImportError:
    from converters.heightmap import convert_heightmap_to_stl
    from converters.svg_extruder import convert_svg_to_stl

app = FastAPI(
    title="Konchewa STL Converter API",
    description="Deterministic geometric conversion of raster images and SVG vectors to 3D STL meshes.",
    version="1.0.0",
)

# Enable CORS for Ionic / Angular / Capacitor origins and local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8100",
        "http://localhost:4200",
        "http://localhost:8000",
        "http://localhost",
        "capacitor://localhost",
        "ionic://localhost",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)


@app.get("/api/health", summary="Health Check")
async def health_check():
    """Service health check endpoint."""
    return {
        "status": "healthy",
        "service": "konchewa-backend",
        "version": "1.0.0",
    }


@app.post("/api/convert/heightmap", summary="Convert raster image to STL heightmap")
async def convert_heightmap(
    file: UploadFile = File(..., description="Raster image file (PNG, JPG, WebP)"),
    height: float = Form(..., description="Relief height in mm (Z axis)"),
    invert: bool = Form(False, description="Invert grayscale height values"),
):
    """Convert an uploaded raster image to a 3D printable STL heightmap.

    Image dimensions > 800x800 px are downscaled maintaining aspect ratio.
    The resulting mesh has a solid base and is watertight.
    """
    if height <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Height parameter must be greater than zero.",
        )

    try:
        image_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {exc}",
        ) from exc

    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        stl_bytes = convert_heightmap_to_stl(
            image_bytes=image_bytes,
            height=height,
            invert=invert,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Conversion error: {exc}",
        ) from exc

    base_name = os.path.splitext(file.filename or "model")[0]
    out_filename = f"{base_name}.stl"

    return Response(
        content=stl_bytes,
        media_type="model/stl",
        headers={
            "Content-Disposition": f'attachment; filename="{out_filename}"',
            "Content-Length": str(len(stl_bytes)),
        },
    )


@app.post("/api/convert/svg", summary="Convert SVG vector to extruded 3D STL")
async def convert_svg(
    file: UploadFile = File(..., description="SVG vector file (.svg)"),
    extrude_depth: float = Form(..., description="Extrusion depth in mm (Z axis)"),
):
    """Convert an uploaded SVG file to a 3D extruded STL mesh.

    Uses Shapely for topological repair (buffer(0) and orientation) and
    deterministic linear algebra for orthogonal extrusion and normal computation.
    """
    if extrude_depth <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Extrude depth parameter must be greater than zero.",
        )

    try:
        svg_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read uploaded file: {exc}",
        ) from exc

    if not svg_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        stl_bytes = convert_svg_to_stl(
            svg_bytes=svg_bytes,
            extrude_depth=extrude_depth,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"SVG conversion error: {exc}",
        ) from exc

    base_name = os.path.splitext(file.filename or "vector_model")[0]
    out_filename = f"{base_name}.stl"

    return Response(
        content=stl_bytes,
        media_type="model/stl",
        headers={
            "Content-Disposition": f'attachment; filename="{out_filename}"',
            "Content-Length": str(len(stl_bytes)),
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
