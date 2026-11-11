#!/usr/bin/env python3
"""Compare a clone's screenshot with the reference. Standard library only.

    python3 diff.py reference/desktop-full.png shots/desktop-full.png
    python3 diff.py ref.png shot.png --out diff.png --fail-under 90
    python3 diff.py ref.png shot.png --json > diffs/desktop.json

Reports, for the same viewport and state:

  score      share of pixels within tolerance, 0-100
  regions    where they differ, in the original's pixel coordinates
  height     how much taller or shorter the clone is
  colours    dominant colour of each image, plus background samples at nine
             points, so a wrong page background is caught immediately

This measures pixels, not intent: a cloned page with your own photography will
score lower while the structure is perfect. Read the regions before the score.
"""
import argparse
import json
import struct
import sys
import zlib

SIG = b"\x89PNG\r\n\x1a\n"


class PngError(Exception):
    pass


# ------------------------------------------------------------------ reading
def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path):
    """Return (width, height, rows) with rows[y][x] = (r, g, b), over white."""
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as exc:
        raise PngError("cannot read %s: %s" % (path, exc))
    if data[:8] != SIG:
        raise PngError("%s is not a PNG" % path)

    pos, ihdr, palette, trns, idat = 8, None, None, b"", []
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"PLTE":
            palette = [tuple(body[i:i + 3]) for i in range(0, len(body) - 2, 3)]
        elif kind == b"tRNS":
            trns = body
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    if ihdr is None:
        raise PngError("%s has no IHDR chunk" % path)

    width, height, depth, color, _comp, _filt, interlace = ihdr
    if interlace:
        raise PngError("%s is interlaced; re-save it without interlacing" % path)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color)
    if channels is None:
        raise PngError("unsupported PNG colour type %d" % color)
    if depth not in (1, 2, 4, 8, 16):
        raise PngError("unsupported bit depth %d" % depth)
    if color == 3 and not palette:
        raise PngError("palette PNG without a palette")

    bits = depth * channels
    bpp = max(1, bits // 8)
    stride = (width * bits + 7) // 8
    try:
        raw = zlib.decompress(b"".join(idat))
    except zlib.error as exc:
        raise PngError("corrupt image data in %s: %s" % (path, exc))

    rows = []
    prev = bytearray(stride)
    cur = 0
    for _ in range(height):
        if cur + 1 + stride > len(raw):
            raise PngError("%s image data is truncated" % path)
        ftype = raw[cur]
        line = bytearray(raw[cur + 1:cur + 1 + stride])
        cur += 1 + stride
        if ftype == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                up = prev[i]
                ul = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(left, up, ul)) & 0xFF
        elif ftype != 0:
            raise PngError("%s uses filter type %d" % (path, ftype))
        prev = line

        step = 8 // depth if depth < 8 else 1
        mask = (1 << depth) - 1
        scale = 255 // mask if depth < 8 else 1

        def samples(buf):
            if depth >= 8:
                if depth == 8:
                    return list(buf[:width * channels])
                return [buf[2 * i] for i in range(width * channels)]
            out = []
            for byte in buf:
                for k in range(step):
                    out.append(((byte >> (8 - depth * (k + 1))) & mask) * scale)
                    if len(out) == width * channels:
                        return out
            return out

        s = samples(line)
        row = []
        if color == 0:
            for v in s:
                row.append((v, v, v))
        elif color == 2:
            for i in range(0, len(s), 3):
                row.append((s[i], s[i + 1], s[i + 2]))
        elif color == 3:
            for idx in s:
                r, g, b = palette[idx] if idx < len(palette) else (0, 0, 0)
                a = trns[idx] if idx < len(trns) else 255
                row.append(_over(r, g, b, a))
        elif color == 4:
            for i in range(0, len(s), 2):
                row.append(_over(s[i], s[i], s[i], s[i + 1]))
        else:
            for i in range(0, len(s), 4):
                row.append(_over(s[i], s[i + 1], s[i + 2], s[i + 3]))
        rows.append(row)
    return width, height, rows


def _over(r, g, b, a):
    if a == 255:
        return (r, g, b)
    inv = 255 - a
    return ((r * a + 255 * inv) // 255,
            (g * a + 255 * inv) // 255,
            (b * a + 255 * inv) // 255)


# ------------------------------------------------------------------ writing
def write_png(path, width, height, rows):
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for r, g, b in row:
            raw.extend((r, g, b))

    def chunk(kind, body):
        crc = zlib.crc32(kind + body) & 0xFFFFFFFF
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", crc)

    with open(path, "wb") as fh:
        fh.write(SIG)
        fh.write(chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(raw), 6)))
        fh.write(chunk(b"IEND", b""))


# --------------------------------------------------------------- comparing
def scale_to_width(img, target):
    w, h, rows = img
    if w == target:
        return w, h, rows
    new_h = max(1, int(round(h * target / float(w))))
    xs = [min(w - 1, int(x * w / float(target))) for x in range(target)]
    ys = [min(h - 1, int(y * h / float(new_h))) for y in range(new_h)]
    return target, new_h, [[rows[y][x] for x in xs] for y in ys]


def hexcolor(rgb):
    return "#%02x%02x%02x" % rgb


def dominant(rows, step=7, top=3):
    counts = {}
    total = 0
    for y in range(0, len(rows), step):
        row = rows[y]
        for x in range(0, len(row), step):
            r, g, b = row[x]
            key = (r >> 3, g >> 3, b >> 3)
            counts[key] = counts.get(key, 0) + 1
            total += 1
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:top]
    return [{"color": hexcolor((k[0] * 8 + 4, k[1] * 8 + 4, k[2] * 8 + 4)),
             "share": round(100.0 * v / max(1, total), 1)} for k, v in ranked]


POINTS = [(0.02, 0.02), (0.5, 0.02), (0.98, 0.02),
          (0.02, 0.5), (0.5, 0.5), (0.98, 0.5),
          (0.02, 0.98), (0.5, 0.98), (0.98, 0.98)]


def sample_points(rows):
    h = len(rows)
    w = len(rows[0]) if h else 0
    out = []
    for fx, fy in POINTS:
        x = min(w - 1, max(0, int(fx * (w - 1))))
        y = min(h - 1, max(0, int(fy * (h - 1))))
        out.append({"at": "%d%%,%d%%" % (fx * 100, fy * 100),
                    "color": hexcolor(rows[y][x])})
    return out


def compare(ref, shot, tolerance=18, cols=12, threshold=0.18):
    target = min(ref[0], shot[0])
    a = scale_to_width(ref, target)
    b = scale_to_width(shot, target)
    w = target
    h = min(a[1], b[1])
    ra = a[2][:h]
    rb = b[2][:h]

    changed = 0
    flags = []
    dim = []
    for y in range(h):
        row_a, row_b = ra[y], rb[y]
        flag_row = []
        dim_row = []
        for x in range(w):
            pa, pb = row_a[x], row_b[x]
            diff = max(abs(pa[0] - pb[0]), abs(pa[1] - pb[1]), abs(pa[2] - pb[2]))
            hit = diff > tolerance
            if hit:
                changed += 1
            flag_row.append(hit)
            if hit:
                dim_row.append((min(255, 90 + diff), 60, 60))
            else:
                grey = (pa[0] * 30 + pa[1] * 59 + pa[2] * 11) // 100
                tint = 200 + grey // 5
                dim_row.append((tint, tint, tint))
        flags.append(flag_row)
        dim.append(dim_row)

    cell = max(1, w // cols)
    rows_n = max(1, (h + cell - 1) // cell)
    cells = [[False] * cols for _ in range(rows_n)]
    for r in range(rows_n):
        for c in range(cols):
            y0, y1 = r * cell, min(h, (r + 1) * cell)
            x0, x1 = c * cell, min(w, (c + 1) * cell)
            area = (y1 - y0) * (x1 - x0)
            if area <= 0:
                continue
            hits = 0
            for y in range(y0, y1):
                row = flags[y]
                hits += sum(1 for x in range(x0, x1) if row[x])
            cells[r][c] = hits / float(area) > threshold

    regions = []
    seen = set()
    for r in range(rows_n):
        for c in range(cols):
            if not cells[r][c] or (r, c) in seen:
                continue
            stack = [(r, c)]
            seen.add((r, c))
            group = []
            while stack:
                cr, cc = stack.pop()
                group.append((cr, cc))
                for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                    if 0 <= nr < rows_n and 0 <= nc < cols and cells[nr][nc] \
                            and (nr, nc) not in seen:
                        seen.add((nr, nc))
                        stack.append((nr, nc))
            rr = [g[0] for g in group]
            cc_ = [g[1] for g in group]
            x = int(min(cc_) * cell * ref[0] / float(w))
            y = int(min(rr) * cell * ref[0] / float(w))
            regions.append({
                "x": x, "y": y,
                "w": int((max(cc_) - min(cc_) + 1) * cell * ref[0] / float(w)),
                "h": int((max(rr) - min(rr) + 1) * cell * ref[0] / float(w)),
                "cells": len(group),
                "where": _where(min(rr), min(cc_), max(rr), max(cc_), rows_n, cols),
            })
    regions.sort(key=lambda reg: -reg["cells"])

    score = 100.0 * (1 - changed / float(w * h or 1))
    height_delta = (shot[1] - ref[1]) / float(ref[1]) * 100.0 if ref[1] else 0.0
    report = {
        "reference": {"width": ref[0], "height": ref[1], "path": None},
        "clone": {"width": shot[0], "height": shot[1], "path": None},
        "compared": {"width": w, "height": h},
        "tolerance": tolerance,
        "score": round(score, 1),
        "changed_pixels_pct": round(100.0 - score, 1),
        "height_delta_pct": round(height_delta, 1),
        "regions": regions[:12],
        "colors": {
            "reference_dominant": dominant(ra),
            "clone_dominant": dominant(rb),
            "reference_points": sample_points(ra),
            "clone_points": sample_points(rb),
        },
    }
    return report, dim


def _where(r0, c0, r1, c1, rows_n, cols):
    mr = (r0 + r1) / 2.0 / max(1, rows_n - 1) if rows_n > 1 else 0.5
    mc = (c0 + c1) / 2.0 / max(1, cols - 1) if cols > 1 else 0.5
    v = "top" if mr < 0.34 else ("bottom" if mr > 0.66 else "middle")
    hz = "left" if mc < 0.34 else ("right" if mc > 0.66 else "centre")
    return "%s %s" % (v, hz)


def verdict(score):
    if score >= 96:
        return "near-identical"
    if score >= 90:
        return "matches"
    if score >= 75:
        return "close"
    if score >= 50:
        return "partly"
    return "different"


def render(report, ref_name, shot_name):
    lines = ["  %s  vs  %s" % (ref_name, shot_name)]
    bar = int(round(report["score"] / 100.0 * 28))
    lines.append("  SCORE %s%s %5.1f  %s" % ("#" * bar, "." * (28 - bar),
                                             report["score"], verdict(report["score"]).upper()))
    hd = report["height_delta_pct"]
    if abs(hd) >= 2:
        lines.append("  height: clone is %.1f%% %s than reference"
                     % (abs(hd), "taller" if hd > 0 else "shorter"))
    ref_dom = report["colors"]["reference_dominant"]
    shot_dom = report["colors"]["clone_dominant"]
    if ref_dom and shot_dom:
        same = ref_dom[0]["color"] == shot_dom[0]["color"]
        lines.append("  dominant colour: %s (ref) vs %s (clone)%s"
                     % (ref_dom[0]["color"], shot_dom[0]["color"],
                        "" if same else "   <-- check the page background"))
    ref_bg = report["colors"]["reference_points"][0]["color"]
    shot_bg = report["colors"]["clone_points"][0]["color"]
    if ref_bg != shot_bg:
        lines.append("  top-left pixel: %s (ref) vs %s (clone)" % (ref_bg, shot_bg))
    if report["regions"]:
        lines.append("  differing regions (reference pixels, biggest first):")
        for reg in report["regions"][:10]:
            lines.append("    %-13s x=%d y=%d w=%d h=%d"
                         % (reg["where"], reg["x"], reg["y"], reg["w"], reg["h"]))
    else:
        lines.append("  no differing region above threshold")
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("reference", help="screenshot of the original page")
    ap.add_argument("clone", help="the clone at the same viewport and state")
    ap.add_argument("--tolerance", type=int, default=18,
                    help="per-channel difference ignored, 0-255 (default 18)")
    ap.add_argument("--cols", type=int, default=12, help="region grid columns")
    ap.add_argument("--threshold", type=float, default=0.18,
                    help="share of changed pixels that flags a cell (default 0.18)")
    ap.add_argument("--out", help="write a diff PNG here")
    ap.add_argument("--json", action="store_true", help="print JSON")
    ap.add_argument("--fail-under", type=float, help="exit 1 below this score")
    args = ap.parse_args(argv)

    try:
        ref = read_png(args.reference)
        shot = read_png(args.clone)
    except PngError as exc:
        print("diff: %s" % exc, file=sys.stderr)
        return 2

    report, dim = compare(ref, shot, args.tolerance, args.cols, args.threshold)
    report["reference"]["path"] = args.reference
    report["clone"]["path"] = args.clone
    if args.out:
        write_png(args.out, report["compared"]["width"], report["compared"]["height"], dim)
        report["diff_image"] = args.out
    print(json.dumps(report, indent=2) if args.json else render(report, args.reference, args.clone))
    if args.out and not args.json:
        print("  diff image: %s" % args.out)
    if args.fail_under is not None and report["score"] < args.fail_under:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
