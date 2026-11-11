#!/usr/bin/env python3
"""Capture a public page for site-ui-clone. Observation only.

Renders the page in Chromium, scrolls it so entrance animations settle, and
saves the artifacts the skill measures from:

    reference/spec-<viewport>.json   computed styles, boxes, colours, type,
                                     sections, assets, motion, breakpoints
    reference/<name>-full.png        full-page screenshot
    reference/<name>-fold.png        first viewport, as a visitor sees it
    reference/states.json            hover deltas for interactive elements

    python3 capture.py https://example.com --out clones/example
    python3 capture.py https://stripe.com --out clones/stripe --states --settle 900

It never saves the page HTML, CSS or JS, and never downloads an asset. The
screenshots and the JSON are reference material for a human or agent rebuilding
the UI from measurement.

Requires playwright:  pip install playwright && playwright install chromium
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
COLLECTOR = os.path.join(HERE, "collect.js")

VIEWPORTS = {
    "desktop": (1440, 900),
    "tablet": (768, 1024),
    "mobile": (390, 844),
}

HOVER_JS = r"""
(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const props = ["color", "backgroundColor", "backgroundImage", "borderColor",
    "borderTopColor", "borderRadius", "boxShadow", "transform", "opacity",
    "textDecorationLine", "outline", "filter"];
  const out = {};
  for (const p of props) out[p] = cs[p];
  return out;
}
"""


def slugify(url):
    host = re.sub(r"^https?://", "", url).split("/")[0]
    path = url.split("//", 1)[-1].split("/", 1)[-1] if "//" in url else ""
    path = re.sub(r"[^a-z0-9]+", "-", path.lower()).strip("-")[:40]
    host = re.sub(r"[^a-z0-9.]+", "-", host.lower()).strip("-")
    return (host + ("-" + path if path else "")) or "site"


def parse_viewports(text):
    out = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        name, size = None, part
        if "=" in part:
            name, size = part.split("=", 1)
        dims = size.lower().split("x")
        if len(dims) != 2 or not all(d.isdigit() for d in dims):
            raise SystemExit("bad viewport %r, expected WxH or name=WxH" % part)
        w, h = int(dims[0]), int(dims[1])
        out.append((name or "vp%dx%d" % (w, h), w, h))
    return out


def settle_scroll(page, step, pause):
    """Scroll the whole page so IntersectionObserver reveals have fired."""
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(pause // 2)
    height = page.evaluate("document.documentElement.scrollHeight")
    viewport = page.viewport_size["height"]
    y = 0
    while y < height:
        y += step
        page.evaluate("window.scrollTo(0, %d)" % y)
        page.wait_for_timeout(pause)
        height = page.evaluate("document.documentElement.scrollHeight")
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(pause)


def collect(page):
    with open(COLLECTOR, encoding="utf-8") as fh:
        source = fh.read()
    return page.evaluate(source)


def hover_states(page, spec, limit):
    """Hover the most useful interactive elements and record the style delta."""
    wanted = []
    seen_text = set()
    for el in spec.get("elements", []):
        if el["tag"] not in ("a", "button", "input", "select", "textarea"):
            continue
        label = (el.get("text") or el.get("ariaLabel") or el["path"]).strip()
        if label in seen_text:
            continue
        seen_text.add(label)
        wanted.append(el)
        if len(wanted) >= limit:
            break

    result = []
    for el in wanted:
        path = el["path"]
        try:
            base = page.evaluate(HOVER_JS, path)
            if base is None:
                continue
            page.hover(path, timeout=1500)
            page.wait_for_timeout(220)
            hover = page.evaluate(HOVER_JS, path)
            page.mouse.move(2, 2)
            page.wait_for_timeout(120)
        except Exception as exc:  # element detached, covered, not hoverable
            result.append({"path": path, "text": el.get("text"), "error": str(exc)[:120]})
            continue
        delta = {}
        for prop, value in hover.items():
            if base.get(prop) != value:
                delta[prop] = {"from": base.get(prop), "to": value}
        if delta:
            result.append({
                "path": path,
                "tag": el["tag"],
                "text": el.get("text"),
                "area": el["box"],
                "delta": delta,
            })
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("url", help="public page URL")
    ap.add_argument("--out", required=True, help="artifact folder, e.g. clones/example")
    ap.add_argument("--viewports", default="desktop=1440x900,tablet=768x1024,mobile=390x844",
                    help="comma list of name=WxH")
    ap.add_argument("--settle", type=int, default=700,
                    help="ms to wait after each scroll step (default 700)")
    ap.add_argument("--scroll-step", type=int, default=800,
                    help="px per scroll step while settling (default 800)")
    ap.add_argument("--timeout", type=int, default=45000,
                    help="navigation timeout in ms (default 45000)")
    ap.add_argument("--states", action="store_true",
                    help="also record hover deltas (slower, desktop only)")
    ap.add_argument("--state-limit", type=int, default=12,
                    help="max elements to hover (default 12)")
    ap.add_argument("--headed", action="store_true", help="show the browser")
    ap.add_argument("--device-scale", type=float, default=1.0,
                    help="device pixel ratio for screenshots (default 1.0)")
    ap.add_argument("--keep-open", action="store_true",
                    help="leave the browser open for manual inspection (Ctrl+C to stop)")
    args = ap.parse_args(argv)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("capture.py: playwright is not installed.\n"
              "  pip install playwright && playwright install chromium\n"
              "Or use the manual path: paste scripts/collect.js into DevTools.",
              file=sys.stderr)
        return 2

    reference = os.path.join(args.out, "reference")
    os.makedirs(reference, exist_ok=True)
    slug = slugify(args.url)
    viewports = parse_viewports(args.viewports)
    manifest = {"url": args.url, "slug": slug, "viewports": {}, "states": None,
                "artifacts": reference}

    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(headless=not args.headed)
        except Exception as exc:
            print("capture.py: could not launch Chromium: %s\n"
                  "  run: playwright install chromium" % exc, file=sys.stderr)
            return 2
        try:
            for name, width, height in viewports:
                print("capturing %s (%dx%d)…" % (name, width, height))
                context = browser.new_context(
                    viewport={"width": width, "height": height},
                    device_scale_factor=args.device_scale,
                    is_mobile=width < 500,
                    has_touch=width < 500,
                    reduced_motion="no-preference",
                )
                page = context.new_page()
                page.goto(args.url, wait_until="domcontentloaded",
                          timeout=args.timeout)
                try:
                    page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass
                page.wait_for_timeout(1200)
                settle_scroll(page, args.scroll_step, args.settle)

                spec = collect(page)
                spec_path = os.path.join(reference, "spec-%dx%d.json" % (width, height))
                with open(spec_path, "w", encoding="utf-8") as fh:
                    json.dump(spec, fh, indent=2)

                full = os.path.join(reference, "%s-full.png" % name)
                fold = os.path.join(reference, "%s-fold.png" % name)
                page.screenshot(path=full, full_page=True, animations="disabled")
                page.screenshot(path=fold, full_page=False, animations="disabled")

                entry = {
                    "spec": spec_path,
                    "full": full,
                    "fold": fold,
                    "pageHeight": spec["meta"]["pageHeight"],
                    "horizontalOverflow": spec["meta"]["horizontalOverflow"],
                    "sections": len(spec["sections"]),
                    "elements": len(spec["elements"]),
                    "assets": len(spec["assets"]),
                    "fonts": sorted({f["family"] for f in spec["fonts"]}),
                }

                if args.states and name == "desktop":
                    page.evaluate("window.scrollTo(0, 0)")
                    page.wait_for_timeout(400)
                    states = hover_states(page, spec, args.state_limit)
                    states_path = os.path.join(reference, "states.json")
                    with open(states_path, "w", encoding="utf-8") as fh:
                        json.dump(states, fh, indent=2)
                    manifest["states"] = states_path
                    entry["hoverStates"] = len(states)

                manifest["viewports"][name] = entry
                print("  %d sections, %d elements, %d assets, page %dpx tall"
                      % (len(spec["sections"]), len(spec["elements"]),
                         len(spec["assets"]), spec["meta"]["pageHeight"]))
                print("  wrote %s" % spec_path)
                print("  wrote %s" % full)
                context.close()

            if args.keep_open:
                print("browser left open; Ctrl+C to stop")
                input()
        finally:
            browser.close()

    manifest_path = os.path.join(reference, "capture.json")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    print("\nreference folder: %s" % reference)
    print("next: read references/analysis.md, then write %s/DESIGN.md"
          % args.out)
    print("note: captured pages are other people's work. Keep reference/ out of")
    print("      version control and out of the delivered build.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
