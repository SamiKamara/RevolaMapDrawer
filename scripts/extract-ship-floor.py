"""Derive the fixed ship's floor footprint and closure barrier from bundled artwork.

Run: python scripts/extract-ship-floor.py (requires Pillow only for development).
The source assets/ship.png is read-only. Runtime uses the generated JS points.
A temporary seal across the upper doorway permits exterior flood filling; the
closure barrier deliberately retains that opening and exact editable graph pins.
"""
from collections import defaultdict
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "ship.png"
OUTPUT = ROOT / "assets" / "ship-floor-contour.js"
ARTIFACTS = ROOT / "artifacts" / "floor-reference"
ANCHOR = (1269, 70)
DOOR = (1096, 1471, 30)
PINS = (-356.5, 356.5)
OUTLINE_TOLERANCE = 0.25
BARRIER_TOLERANCE = 1


def distance_squared(point, start, end):
    dx, dy = end[0] - start[0], end[1] - start[1]
    denominator = dx * dx + dy * dy
    t = max(0, min(1, ((point[0] - start[0]) * dx +
                       (point[1] - start[1]) * dy) / denominator)) if denominator else 0
    return (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2


def simplify(points, tolerance):
    keep = {0, len(points) - 1}
    pending = [(0, len(points) - 1)]
    while pending:
        start, end = pending.pop()
        if end - start < 2:
            continue
        farthest = max(range(start + 1, end),
                       key=lambda i: distance_squared(points[i], points[start], points[end]))
        if distance_squared(points[farthest], points[start], points[end]) > tolerance ** 2:
            keep.add(farthest)
            pending.extend([(start, farthest), (farthest, end)])
    return [points[i] for i in sorted(keep)]


def exterior_footprint(image):
    # Any visible pixel belongs to the footprint; preserve edge coverage too.
    walls = image.getchannel("A").point(lambda alpha: 255 if alpha else 0)
    padded = Image.new("L", (image.width + 2, image.height + 2))
    padded.paste(walls, (1, 1))
    ImageDraw.Draw(padded).line([(DOOR[0] + 1, DOOR[2] + 1),
                                (DOOR[1] + 1, DOOR[2] + 1)], fill=255)
    ImageDraw.floodfill(padded, (0, 0), 128)
    footprint = padded.point(lambda p: 0 if p == 128 else 255)
    return footprint.crop((1, 1, image.width + 1, image.height + 1))


def trace_boundary(footprint):
    data = footprint.tobytes()
    width, height = footprint.size
    edges = defaultdict(list)
    for y in range(height):
        for x in range(width):
            if not data[y * width + x]:
                continue
            if y == 0 or not data[(y - 1) * width + x]:
                edges[(x, y)].append((x + 1, y))
            if x == width - 1 or not data[y * width + x + 1]:
                edges[(x + 1, y)].append((x + 1, y + 1))
            if y == height - 1 or not data[(y + 1) * width + x]:
                edges[(x + 1, y + 1)].append((x, y + 1))
            if x == 0 or not data[y * width + x - 1]:
                edges[(x, y + 1)].append((x, y))
    assert all(len(ends) == 1 for ends in edges.values()), "Ambiguous ship boundary"
    start = min(edges, key=lambda p: (p[1], p[0]))
    current = start
    contour = []
    while True:
        contour.append(current)
        current = edges.pop(current)[0]
        if current == start:
            break
    assert not edges, "Expected one connected ship exterior without holes"
    return contour


def point_objects(points):
    return [{"x": x, "y": y} for x, y in points]


def main():
    image = Image.open(SOURCE).convert("RGBA")
    assert image.size == (2459, 1931), "Ship dimensions/anchor need review"
    footprint = exterior_footprint(image)
    contour = trace_boundary(footprint)
    # A closed ring needs two independently simplified arcs.
    split = max(range(1, len(contour)),
                key=lambda i: distance_squared(contour[i], contour[0], contour[0]))
    outline = simplify(contour[:split + 1], OUTLINE_TOLERANCE)[:-1]
    outline += simplify(contour[split:] + [contour[0]], OUTLINE_TOLERANCE)[:-1]

    # Replace only the upper airlock outline with nominal wall-center pieces.
    # The pixel perimeter crosses the pin line at x884 and x1683. Small seam
    # connectors overlap the actual uprights, preserving existing fixed pins.
    crossings = [(i, point) for i, point in enumerate(contour) if point[1] == ANCHOR[1]]
    left_index, left = min(crossings, key=lambda entry: entry[1][0])
    right_index, right = max(crossings, key=lambda entry: entry[1][0])
    assert left_index > right_index, "Contour orientation changed"
    lower_perimeter = list(reversed(contour[right_index:left_index + 1]))
    lower_perimeter = simplify(lower_perimeter, BARRIER_TOLERANCE)
    relative_perimeter = [(x - ANCHOR[0], y - ANCHOR[1]) for x, y in lower_perimeter]
    barrier = [(DOOR[0] - ANCHOR[0], DOOR[2] - ANCHOR[1]),
               (PINS[0], DOOR[2] - ANCHOR[1]), (PINS[0], 0)]
    barrier += relative_perimeter
    barrier += [(PINS[1], 0), (PINS[1], DOOR[2] - ANCHOR[1]),
                (DOOR[1] - ANCHOR[0], DOOR[2] - ANCHOR[1])]
    seed = (14.5, 830)
    assert footprint.getpixel((int(seed[0] + ANCHOR[0]), int(seed[1] + ANCHOR[1]))) == 255
    assert image.getchannel("A").getpixel((int(seed[0] + ANCHOR[0]), int(seed[1] + ANCHOR[1]))) == 0

    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    header = f"""/**
 * Fixed ship floor geometry derived from assets/ship.png without altering it.
 * Regenerate with python scripts/extract-ship-floor.py. Native asset size 2459x1931;
 * asset anchor (1269,70); source SHA-256 {digest}.
 * OUTLINE is asset-local and closed implicitly, covers every visible alpha pixel
 * plus enclosed interior, with the top doorway sealed only for floor coverage.
 * BARRIER is ship-anchor-relative and open at the exact 375px outer doorway;
 * it contains both unchanged pinned ports (+/-356.5,0). Mirror its x coordinates
 * around the doorway center, except synthetic port bridges stay at fixed pins.
 * Interior partitions never become exterior boundaries.
 * Outline simplification deviation <={OUTLINE_TOLERANCE}px; fixed hull barrier <=1px.
 */
"""
    js = header
    js += "export const SHIP_FLOOR_OUTLINE = Object.freeze(" + json.dumps(point_objects(outline), separators=(",", ":")) + ");\n"
    js += "export const SHIP_FLOOR_BARRIER = Object.freeze(" + json.dumps(point_objects(barrier), separators=(",", ":")) + ");\n"
    js += "export const SHIP_FLOOR_SEED = Object.freeze(" + json.dumps({"x": seed[0], "y": seed[1]}, separators=(",", ":")) + ");\n"
    OUTPUT.write_text(js, encoding="utf-8", newline="\n")
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    footprint.save(ARTIFACTS / "ship-footprint.png")
    evidence = {"sourceSHA256": digest, "rawBoundaryPoints": len(contour),
                "outlinePoints": len(outline), "barrierPoints": len(barrier),
                "outlineTolerance": OUTLINE_TOLERANCE, "barrierTolerance": BARRIER_TOLERANCE,
                "pinLineOuterCrossings": [left, right], "pins": [[x, 0] for x in PINS],
                "outerDoorEndpointsRelative": [barrier[0], barrier[-1]], "seedRelative": seed,
                "size": image.size, "anchor": ANCHOR}
    (ARTIFACTS / "ship-contour-measurements.json").write_text(json.dumps(evidence, indent=2))
    preview = Image.new("RGBA", image.size, (50, 50, 65, 255))
    floor = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(floor).polygon(outline, fill=(0, 0, 0, 255))
    preview.alpha_composite(floor)
    preview.alpha_composite(image)
    d = ImageDraw.Draw(preview)
    d.line([(x + ANCHOR[0], y + ANCHOR[1]) for x, y in barrier], fill=(255, 80, 70, 255), width=3)
    for pin in PINS:
        x, y = pin + ANCHOR[0], ANCHOR[1]
        d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=(80, 255, 140, 255))
    preview.thumbnail((1600, 1600))
    preview.convert("RGB").save(ARTIFACTS / "ship-contour-preview.png")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()

