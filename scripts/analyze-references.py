"""Reproduce reference measurements, black previews and the corrected ship asset.

Run from anywhere with: python scripts/analyze-references.py
Requires Pillow; it is a development utility, never a runtime dependency.
All scan coordinates and reported distances use original 8192-pixel map space.
"""

import itertools
import hashlib
import json
import statistics
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "reference-analysis"
SHIP_CROP = (2807, 4670, 5266, 6601)
SHIP_ANCHOR = (4076, 4740)
# First preserve the original upper doorway without unrelated room extensions.
AIRLOCK_TOP_EXTENT = (3692, 4459)
# The original openings already share this center. Retain their positions and
# the left wall, then reflect that wall to widen the right half of the chamber.
# End before y5355, where the asymmetric ship hull begins; the rest is untouched.
AIRLOCK_REGION = (3670, 4670, 4511, 5355)
AIRLOCK_DOOR_GAP = (3903, 4278)
AIRLOCK_DOOR_PLANES = {"outer": 4700, "inner": 5308}


def runs(values, threshold=128):
    result = []
    cursor = 0
    for filled, group in itertools.groupby(value >= threshold for value in values):
        length = sum(1 for _ in group)
        if filled:
            result.append((cursor, cursor + length))
        cursor += length
    return result


def pixels(image):
    if hasattr(image, "get_flattened_data"):
        return image.get_flattened_data()
    return image.getdata()


def horizontal(alpha, y, x0=0, x1=8192):
    return [(left + x0, right + x0) for left, right in runs(pixels(alpha.crop((x0, y, x1, y + 1))))]


def vertical(alpha, x, y0=0, y1=8192):
    return [(top + y0, bottom + y0) for top, bottom in runs(pixels(alpha.crop((x, y0, x + 1, y1))))]


def black_preview(image, name, size=None):
    composite = Image.alpha_composite(Image.new("RGBA", image.size, "black"), image).convert("RGB")
    if size:
        composite = composite.resize(size, Image.Resampling.LANCZOS)
    composite.save(OUTPUT / name)


def original_ship_crop(source):
    ship = source.crop(SHIP_CROP)
    x0, y0, x1, _ = SHIP_CROP
    top_height = SHIP_ANCHOR[1] - y0
    ship.paste((255, 255, 255, 0), (0, 0, AIRLOCK_TOP_EXTENT[0] - x0, top_height))
    ship.paste((255, 255, 255, 0), (AIRLOCK_TOP_EXTENT[1] - x0, 0, x1 - x0, top_height))
    return ship


def extract_ship(source):
    ship = original_ship_crop(source)
    x0, y0, _, _ = SHIP_CROP
    left, top, right, bottom = AIRLOCK_REGION
    box = (left - x0, top - y0, right - x0, bottom - y0)
    chamber = ship.crop(box)
    # Odd width means the mirror axis passes through the center pixel. With
    # pixel centers at x+0.5 this is the doorway's exact source x4090.5 axis.
    half = (chamber.width + 1) // 2
    chamber.paste(ImageOps.mirror(chamber.crop((0, 0, half, chamber.height))), (half - 1, 0))
    chamber.paste((255, 255, 255, 0),
                  (AIRLOCK_DOOR_GAP[0] - left, 0, AIRLOCK_DOOR_GAP[1] - left, chamber.height))
    ship.paste(chamber, box)
    return ship


def ship_evidence(source, ship):
    anchor = [SHIP_ANCHOR[0] - SHIP_CROP[0], SHIP_ANCHOR[1] - SHIP_CROP[1]]
    x0, y0, _, _ = SHIP_CROP
    left, top, right, bottom = AIRLOCK_REGION
    box = (left - x0, top - y0, right - x0, bottom - y0)
    original = original_ship_crop(source)
    difference = ImageChops.difference(original, ship)
    # Excluding the deliberately corrected chamber leaves the exact old crop.
    difference.paste((0, 0, 0, 0), box)
    assert difference.getbbox() is None, "Pixels outside the airlock correction changed"
    hull_crop = (x0, bottom, SHIP_CROP[2], SHIP_CROP[3])
    hull_pixels = source.crop(hull_crop).tobytes()
    assert ship.crop((0, bottom - y0, ship.width, ship.height)).tobytes() == hull_pixels
    chamber = ship.crop(box)
    assert chamber.tobytes() == ImageOps.mirror(chamber).tobytes(), "Airlock must be exactly symmetric"
    assert all(extrema == (255, 255) for extrema in ship.getextrema()[:3]), "Asset RGB must stay white"
    scans = {}
    for mirrored, candidate in [(False, ship), (True, ImageOps.mirror(ship))]:
        scans["mirrored" if mirrored else "normal"] = {}
        for name, plane in AIRLOCK_DOOR_PLANES.items():
            y = plane - y0
            scan_left, scan_right = (candidate.width - box[2], candidate.width - box[0]) if mirrored else (box[0], box[2])
            occupied = horizontal(candidate.getchannel("A"), y, scan_left, scan_right)
            assert len(occupied) == 2
            gap = occupied[1][0] - occupied[0][1]
            assert gap == 375, "Both airlock doors must have exactly 375 clear pixels"
            scans["mirrored" if mirrored else "normal"][name] = {
                "asset_y": y, "occupied_intervals": occupied, "clear_gap": gap,
            }
    # A new 50 px wall on each old pinned port still intersects its upright.
    wall_runs = horizontal(ship.getchannel("A"), anchor[1], 0, ship.width)
    pin_overlaps = []
    for offset, (a, b) in zip([-356.5, 356.5], wall_runs):
        pin = anchor[0] + offset
        overlap = max(0, min(pin + 25, b) - max(pin - 25, a))
        assert overlap > 0, "Pinned wall must remain attached to the corrected upright"
        pin_overlaps.append(overlap)
    return {
        "source": "RevolaCandiMapASample.png", "crop": SHIP_CROP,
        "size": ship.size, "anchor_in_crop": anchor, "port_offsets": [-356.5, 356.5],
        "upper_band_source_x_extent": AIRLOCK_TOP_EXTENT,
        "upper_band_source_y_extent": [SHIP_CROP[1], SHIP_ANCHOR[1]],
        "airlock_correction_source_box": AIRLOCK_REGION,
        "airlock_mirror_axis_source_x": sum(AIRLOCK_DOOR_GAP) / 2,
        "airlock_mirror_axis_asset_x": sum(AIRLOCK_DOOR_GAP) / 2 - x0,
        "airlock_symmetric_exactly": True,
        "airlock_door_gap_source_x": AIRLOCK_DOOR_GAP,
        "airlock_door_planes_source_y": AIRLOCK_DOOR_PLANES,
        "outside_airlock_correction_preserved_exactly": True,
        "hull_crop": hull_crop, "hull_crop_preserved_exactly": True,
        "hull_crop_rgba_sha256": hashlib.sha256(hull_pixels).hexdigest(),
        "fixed_port_wall_overlap_pixels": pin_overlaps,
        "door_scans": scans, "channel_extrema": ship.getextrema(),
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (ROOT / "assets").mkdir(exist_ok=True)
    images = [Image.open(ROOT / f"RevolaCandiMap{letter}Sample.png").convert("RGBA") for letter in "AB"]
    report = {"threshold": 128, "coordinate_convention": "zero-based, intervals exclude right/bottom", "images": []}
    for letter, image in zip("AB", images):
        report["images"].append({
            "name": f"RevolaCandiMap{letter}Sample.png", "size": image.size,
            "mode": image.mode, "channel_extrema": image.getextrema(), "alpha_bbox": image.getbbox(),
        })
        black_preview(image, f"RevolaCandiMap{letter}Sample-black.png", (1600, 1600))

    alpha = images[0].getchannel("A")
    widths = []
    centers = []
    clear = []
    for y in range(2700, 3401, 25):
        walls = horizontal(alpha, y, 2150, 2900)
        if len(walls) == 2:
            widths.extend(right - left for left, right in walls)
            centers.append(sum(walls[1]) / 2 - sum(walls[0]) / 2)
            clear.append(walls[1][0] - walls[0][1])
    report["corridor_A_left"] = {
        "sample_window": [2150, 2700, 2900, 3401], "row_step": 25,
        "wall_width_min_median_max": [min(widths), statistics.median(widths), max(widths)],
        "center_separation_min_median_max": [min(centers), statistics.median(centers), max(centers)],
        "clear_width_min_median_max": [min(clear), statistics.median(clear), max(clear)],
    }
    report["door_scans_A"] = {
        "horizontal_y1400": horizontal(alpha, 1400, 3500, 4650),
        "horizontal_y2995": horizontal(alpha, 2995, 3500, 4650),
        "horizontal_y4700": horizontal(alpha, 4700, 3300, 4850),
        "vertical_x3355": vertical(alpha, 3355, 1500, 3000),
        "vertical_x4750": vertical(alpha, 4750, 3300, 4800),
    }
    report["chamfer_A_top_left"] = {
        "diagonal_midpoints": [[sum(horizontal(alpha, y, 3250, 3670)[0]) / 2, y] for y in [1450, 1500, 1550, 1600]],
        "vertical_wall_x_at_y1650": sum(horizontal(alpha, 1650, 3250, 3670)[0]) / 2,
        "horizontal_wall_y_at_x3800": sum(vertical(alpha, 3800, 1300, 1500)[0]) / 2,
    }
    report["reference_difference_bbox"] = ImageChops.difference(*images).getbbox()
    ship = extract_ship(images[0])
    report["ship"] = ship_evidence(images[0], ship)
    ship.save(ROOT / "assets" / "ship.png", optimize=True)
    report["ship"]["asset_png_sha256"] = hashlib.sha256((ROOT / "assets" / "ship.png").read_bytes()).hexdigest()
    black_preview(ship, "ship-prefab-detail.png", (1230, 966))
    black_preview(ship.crop((843, 0, 1724, 800)), "ship-prefab-airlock-detail.png")
    for crop, name, size in [
        ((2700, 4600, 5400, 6700), "ship-airlock-detail.png", (1350, 1050)),
        ((3260, 1300, 4650, 1650), "door-chamfer-detail.png", None),
        ((2130, 2800, 2890, 3100), "corridor-wall-detail.png", None),
    ]:
        black_preview(images[0].crop(crop), name, size)
    (OUTPUT / "measurements.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
