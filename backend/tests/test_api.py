"""Integration tests for Konchewa STL Converter API."""

import io
from PIL import Image
import pytest
from starlette.testclient import TestClient

from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "konchewa-backend"


def test_cors_headers(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:8100"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "*"


def test_convert_heightmap_png(client):
    # Create test 120x80 PNG image
    img = Image.new("RGB", (120, 80), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    response = client.post(
        "/api/convert/heightmap",
        files={"file": ("test_terrain.png", buf.getvalue(), "image/png")},
        data={"height": "6.5", "invert": "false"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "model/stl"
    assert "attachment; filename=\"test_terrain.stl\"" in response.headers["content-disposition"]
    # Verify binary STL: at least 84 bytes header + triangle records
    stl_bytes = response.content
    assert len(stl_bytes) > 84
    triangle_count = int.from_bytes(stl_bytes[80:84], byteorder="little")
    assert triangle_count > 0


def test_convert_heightmap_webp_invert(client):
    img = Image.new("L", (50, 50), color=128)
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    buf.seek(0)

    response = client.post(
        "/api/convert/heightmap",
        files={"file": ("relief.webp", buf.getvalue(), "image/webp")},
        data={"height": "10.0", "invert": "true"},
    )
    assert response.status_code == 200
    assert len(response.content) > 84


def test_convert_heightmap_downscale_over_800(client):
    # Test Protocol requirement: images > 800x800 downscaled
    img = Image.new("RGB", (1000, 900), color=(50, 100, 150))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    response = client.post(
        "/api/convert/heightmap",
        files={"file": ("huge_map.jpg", buf.getvalue(), "image/jpeg")},
        data={"height": "5.0"},
    )
    assert response.status_code == 200
    assert len(response.content) > 84


def test_convert_heightmap_invalid_height(client):
    img = Image.new("RGB", (50, 50), color=(100, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    response = client.post(
        "/api/convert/heightmap",
        files={"file": ("test.png", buf.getvalue(), "image/png")},
        data={"height": "-2.0"},
    )
    assert response.status_code == 400


def test_convert_svg_basic(client):
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect x="10" y="10" width="80" height="80" />
    </svg>"""

    response = client.post(
        "/api/convert/svg",
        files={"file": ("square.svg", svg_content.encode("utf-8"), "image/svg+xml")},
        data={"extrude_depth": "4.0"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "model/stl"
    assert "attachment; filename=\"square.stl\"" in response.headers["content-disposition"]
    stl_bytes = response.content
    assert len(stl_bytes) > 84
    triangle_count = int.from_bytes(stl_bytes[80:84], byteorder="little")
    assert triangle_count > 0


def test_convert_svg_complex_with_paths(client):
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <circle cx="50" cy="50" r="30" />
      <polygon points="100,20 140,20 120,60" />
      <path d="M 30 120 L 80 120 L 80 170 L 30 170 Z" />
    </svg>"""

    response = client.post(
        "/api/convert/svg",
        files={"file": ("shapes.svg", svg_content.encode("utf-8"), "image/svg+xml")},
        data={"extrude_depth": "5.0"},
    )
    assert response.status_code == 200
    assert len(response.content) > 84


def test_convert_svg_self_intersecting_repair(client):
    # Bowtie polygon that requires shapely orient and buffer(0) repair per protocol
    svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <polygon points="0,0 40,40 0,40 40,0" />
    </svg>"""

    response = client.post(
        "/api/convert/svg",
        files={"file": ("bowtie.svg", svg_content.encode("utf-8"), "image/svg+xml")},
        data={"extrude_depth": "2.5"},
    )
    assert response.status_code == 200
    assert len(response.content) > 84


def test_convert_svg_invalid_depth(client):
    svg_content = '<svg><rect x="0" y="0" width="10" height="10"/></svg>'
    response = client.post(
        "/api/convert/svg",
        files={"file": ("invalid.svg", svg_content.encode("utf-8"), "image/svg+xml")},
        data={"extrude_depth": "0"},
    )
    assert response.status_code == 400


def test_empty_file_upload(client):
    response = client.post(
        "/api/convert/heightmap",
        files={"file": ("empty.png", b"", "image/png")},
        data={"height": "5.0"},
    )
    assert response.status_code == 400
