/*
 * site-ui-clone — in-page collector.
 *
 * Reads only what a browser renders: computed styles, bounding boxes, loaded
 * font faces, media queries and an asset inventory. It never reads source
 * files, never fetches bundles, never downloads assets.
 *
 *   Playwright: capture.py injects this file and reads window.__siteUISpec.
 *   DevTools:   paste the whole file into the console on the target page, then
 *                 copy(JSON.stringify(__siteUISpec))
 *               and save it as reference/spec-<viewport>.json
 *
 * Coordinates are page coordinates (viewport rect + scroll offset), so they
 * compare directly against a full-page screenshot. Elements scrolled out of
 * view are still measured.
 */
(() => {
  "use strict";

  const MAX_RECORDS = 3000;
  const MAX_TEXT = 200;
  const TEXT_TAGS = new Set([
    "H1", "H2", "H3", "H4", "H5", "H6", "P", "SPAN", "A", "BUTTON", "LI",
    "LABEL", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "INPUT", "TEXTAREA",
    "SELECT", "STRONG", "EM", "SMALL", "CODE", "PRE", "DT", "DD", "SUMMARY",
  ]);
  const LANDMARK_TAGS = new Set(["HEADER", "NAV", "MAIN", "SECTION", "ARTICLE",
    "ASIDE", "FOOTER", "FORM", "DIALOG"]);
  const CONTROL_TAGS = new Set(["BUTTON", "INPUT", "TEXTAREA", "SELECT", "A"]);
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT",
    "TEMPLATE", "BR", "HEAD", "TITLE"]);

  const STYLE_PROPS = [
    "display", "position", "top", "right", "bottom", "left", "zIndex",
    "flexDirection", "flexWrap", "justifyContent", "alignItems", "alignContent",
    "gap", "rowGap", "columnGap", "gridTemplateColumns", "gridTemplateRows",
    "gridAutoFlow", "gridColumn", "gridRow", "padding", "margin", "width",
    "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "boxSizing",
    "color", "backgroundColor", "backgroundImage", "backgroundSize",
    "backgroundPosition", "backgroundRepeat", "borderRadius", "borderTopWidth",
    "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopColor", "borderTopStyle", "boxShadow", "fontFamily", "fontSize",
    "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing",
    "textTransform", "textAlign", "textDecorationLine", "textShadow",
    "opacity", "overflow", "overflowX", "overflowY", "transform",
    "transformOrigin", "transition", "animation", "objectFit", "objectPosition",
    "filter", "backdropFilter", "cursor", "whiteSpace", "textOverflow",
  ];

  const round = (n) => Math.round(n * 10) / 10;
  const clip = (s, n) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  };

  function visible(el, cs) {
    if (!cs) cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" ||
        cs.visibility === "collapse") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }

  function boxOf(el) {
    const r = el.getBoundingClientRect();
    return {
      x: round(r.left + window.scrollX),
      y: round(r.top + window.scrollY),
      w: round(r.width),
      h: round(r.height),
    };
  }

  function cssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        let id = node.id;
        try { id = CSS.escape(id); } catch (e) { /* older browsers */ }
        parts.unshift(part + "#" + id);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const same = Array.prototype.filter.call(
          parent.children, (c) => c.tagName === node.tagName);
        if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      if (part === "body") break;
      node = parent;
    }
    return parts.join(" > ");
  }

  function directText(el) {
    let text = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) text += " " + n.textContent;
    }
    if (!text.trim() && TEXT_TAGS.has(el.tagName) && el.children.length === 0) {
      text = el.innerText || el.textContent || "";
    }
    return clip(text, MAX_TEXT);
  }

  function styleSubset(cs) {
    const out = {};
    for (const p of STYLE_PROPS) {
      const v = cs[p];
      if (v === undefined || v === null || v === "" || v === "none" ||
          v === "normal" || v === "auto" || v === "0px" || v === "rgba(0, 0, 0, 0)") {
        continue;
      }
      out[p] = v;
    }
    return out;
  }

  const spec = {
    meta: {
      url: location.href,
      title: document.title,
      lang: document.documentElement.lang || null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      pageHeight: round(document.documentElement.scrollHeight),
      pageWidth: round(document.documentElement.scrollWidth),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      capturedAt: new Date().toISOString(),
      collector: "site-ui-clone/1",
    },
    tokens: [],
    colors: [],
    gradients: [],
    type: [],
    sections: [],
    elements: [],
    assets: [],
    motion: [],
    breakpoints: [],
    fonts: [],
    notes: [],
  };

  // ---------------------------------------------------------------- fonts
  try {
    const seenFonts = new Set();
    document.fonts.forEach((f) => {
      const key = f.family + "|" + f.weight + "|" + f.style;
      if (seenFonts.has(key)) return;
      seenFonts.add(key);
      spec.fonts.push({
        family: f.family,
        weight: f.weight,
        style: f.style,
        status: f.status,
        unicodeRange: f.unicodeRange || null,
      });
    });
  } catch (e) {
    spec.notes.push("document.fonts unavailable: " + e.message);
  }

  // ------------------------------------------------------- colour counters
  const colorCounts = new Map();   // "text|rgb(...)" -> {kind,value,count,samples[]}
  const gradientCounts = new Map();
  const typeCounts = new Map();
  const tokenCounts = new Map();

  const allElements = [document.documentElement, document.body]
    .concat(Array.prototype.slice.call(document.querySelectorAll("body *")));

  let records = 0;
  const elements = [];

  for (const el of allElements) {
    if (!el || el.nodeType !== 1) continue;
    if (SKIP_TAGS.has(el.tagName)) continue;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;

    const box = boxOf(el);
    const isRoot = el === document.documentElement || el === document.body;
    const text = directText(el);
    const hasSurface = cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      (cs.backgroundImage && cs.backgroundImage !== "none") ||
      cs.boxShadow !== "none" ||
      parseFloat(cs.borderTopWidth) > 0 ||
      parseFloat(cs.borderBottomWidth) > 0 ||
      parseFloat(cs.borderLeftWidth) > 0;
    const positioned = cs.position === "fixed" || cs.position === "sticky" ||
      cs.position === "absolute";

    // ---- custom properties actually resolved on this element
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      if (prop.slice(0, 2) !== "--") continue;
      const value = cs.getPropertyValue(prop).trim();
      if (!value) continue;
      const key = prop + "|" + value;
      const rec = tokenCounts.get(key) || { name: prop, value: value, count: 0 };
      rec.count++;
      tokenCounts.set(key, rec);
    }

    // ---- colours
    const colorDecls = [
      ["text", cs.color],
      ["bg", cs.backgroundColor],
      ["border", cs.borderTopColor],
      ["border", cs.borderBottomColor],
      ["shadow", cs.boxShadow],
      ["text-shadow", cs.textShadow],
    ];
    for (const pair of colorDecls) {
      const kind = pair[0];
      const value = pair[1];
      if (!value || value === "none" || value === "rgba(0, 0, 0, 0)" ||
          /^0px/.test(value)) continue;
      if (kind === "shadow" || kind === "text-shadow") {
        // Extract the colours out of the shadow list; offsets are not colours.
        const found = value.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g) || [];
        for (const c of found) {
          const key = kind + "|" + c;
          const rec = colorCounts.get(key) || { kind: kind, value: c, count: 0, samples: [] };
          rec.count++;
          if (rec.samples.length < 4) rec.samples.push(cssPath(el));
          colorCounts.set(key, rec);
        }
        continue;
      }
      const key = kind + "|" + value;
      const rec = colorCounts.get(key) || { kind: kind, value: value, count: 0, samples: [] };
      rec.count++;
      if (rec.samples.length < 4) rec.samples.push(cssPath(el));
      colorCounts.set(key, rec);
    }

    if (cs.backgroundImage && cs.backgroundImage.indexOf("gradient") !== -1) {
      const key = cs.backgroundImage;
      const rec = gradientCounts.get(key) || {
        value: key, count: 0, box: box, samples: [],
      };
      rec.count++;
      rec.box = box;
      if (rec.samples.length < 3) rec.samples.push(cssPath(el));
      gradientCounts.set(key, rec);
    }

    // ---- typography tuples
    if (text) {
      const key = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle,
        cs.lineHeight, cs.letterSpacing, cs.textTransform, cs.textAlign,
        cs.color].join("|");
      const rec = typeCounts.get(key) || {
        family: cs.fontFamily,
        size: cs.fontSize,
        weight: cs.fontWeight,
        style: cs.fontStyle,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        textTransform: cs.textTransform,
        textAlign: cs.textAlign,
        color: cs.color,
        count: 0,
        samples: [],
        paths: [],
        box: box,
      };
      rec.count++;
      if (rec.samples.length < 4) rec.samples.push(clip(text, 80));
      if (rec.paths.length < 3) rec.paths.push(cssPath(el));
      typeCounts.set(key, rec);
    }

    // ---- element records: content, controls, landmarks, surfaces, positioned
    const interesting = !!text || CONTROL_TAGS.has(el.tagName) ||
      LANDMARK_TAGS.has(el.tagName) || hasSurface || positioned ||
      ["IMG", "VIDEO", "CANVAS", "SVG", "PICTURE", "HR"].indexOf(el.tagName) !== -1;

    if (interesting && records < MAX_RECORDS) {
      records++;
      elements.push({
        tag: el.tagName.toLowerCase(),
        path: cssPath(el),
        box: box,
        text: text || null,
        role: el.getAttribute("role") || null,
        href: el.tagName === "A" ? clip(el.getAttribute("href") || "", 120) : null,
        alt: el.getAttribute("alt") || null,
        ariaLabel: el.getAttribute("aria-label") || null,
        inputType: el.tagName === "INPUT" ? el.getAttribute("type") : null,
        styles: styleSubset(cs),
      });
    }
  }

  spec.elements = elements;
  spec.type = Array.from(typeCounts.values()).sort((a, b) => b.count - a.count);
  spec.colors = Array.from(colorCounts.values()).sort((a, b) => b.count - a.count);
  spec.gradients = Array.from(gradientCounts.values()).sort((a, b) => b.count - a.count);
  spec.tokens = Array.from(tokenCounts.values()).sort((a, b) => b.count - a.count);

  // ------------------------------------------------------------- sections
  const rootCandidates = [
    document.querySelector("main"),
    document.body,
  ].filter(Boolean);

  const sectionSeen = new Set();
  for (const root of rootCandidates) {
    for (const el of Array.prototype.slice.call(root.children)) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const path = cssPath(el);
      if (sectionSeen.has(path)) continue;
      sectionSeen.add(path);
      const box = boxOf(el);
      if (box.h < 24) continue;
      spec.sections.push({
        path: path,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: clip(typeof el.className === "string" ? el.className : "", 120),
        box: box,
        background: cs.backgroundColor,
        backgroundImage: cs.backgroundImage === "none" ? null : clip(cs.backgroundImage, 160),
        padding: cs.padding,
        maxWidth: cs.maxWidth,
        display: cs.display,
        gridTemplateColumns: cs.gridTemplateColumns,
        gap: cs.gap,
        position: cs.position,
        heading: clip(
          (el.querySelector("h1,h2,h3") || {}).innerText || "", 90) || null,
      });
    }
    if (spec.sections.length > 40) break;
  }

  // --------------------------------------------------------------- assets
  const assetEls = document.querySelectorAll("img,video,canvas,picture,svg,object,embed");
  let assetIndex = 0;
  for (const el of assetEls) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const box = boxOf(el);
    const area = box.w * box.h;
    let role = "decorative";
    const alt = (el.getAttribute("alt") || "").toLowerCase();
    const label = (el.getAttribute("aria-label") || "").toLowerCase();
    const parentTag = (el.parentElement && el.parentElement.tagName || "").toLowerCase();
    if (el.tagName === "IMG" || el.tagName === "PICTURE") {
      role = area > 200000 ? "photo-or-hero" : area > 12000 ? "image" : "icon";
      if (/logo|wordmark|brand/.test(alt + " " + label + " " +
          (el.getAttribute("src") || ""))) role = "mark";
      if (/avatar|profile|portrait/.test(alt + " " + label)) role = "avatar";
    } else if (el.tagName === "VIDEO") {
      role = "video";
    } else if (el.tagName === "CANVAS") {
      role = "canvas-visual";
    } else if (el.tagName === "SVG") {
      const shapes = el.querySelectorAll("path,circle,rect,line,polygon,polyline,ellipse").length;
      role = area < 4000 ? "icon" : "illustration-or-mark";
      if (parentTag === "a" && area < 12000) role = "mark";
      spec.assets.push({
        index: assetIndex++,
        kind: "svg",
        path: cssPath(el),
        box: box,
        role: role,
        shapes: shapes,
        viewBox: el.getAttribute("viewBox") || null,
        fill: cs.fill,
        stroke: cs.stroke,
        strokeWidth: cs.strokeWidth,
        ariaLabel: el.getAttribute("aria-label") || null,
        title: (el.querySelector("title") || {}).textContent || null,
        note: "inline vector: recreate the shape, do not copy the paths",
      });
      continue;
    } else {
      role = "decorative";
    }
    spec.assets.push({
      index: assetIndex++,
      kind: el.tagName.toLowerCase(),
      path: cssPath(el),
      box: box,
      role: role,
      naturalWidth: el.naturalWidth || null,
      naturalHeight: el.naturalHeight || null,
      alt: el.getAttribute("alt") || null,
      ariaLabel: el.getAttribute("aria-label") || null,
      borderRadius: cs.borderRadius,
      objectFit: cs.objectFit,
      note: "reference only: author a replacement, never download this file",
    });
  }

  // CSS background images that are not gradients
  for (const el of allElements) {
    if (!el || el.nodeType !== 1) continue;
    const cs = getComputedStyle(el);
    if (!cs.backgroundImage || cs.backgroundImage === "none") continue;
    if (cs.backgroundImage.indexOf("gradient") !== -1) continue;
    if (!visible(el, cs)) continue;
    spec.assets.push({
      index: assetIndex++,
      kind: "background-image",
      path: cssPath(el),
      box: boxOf(el),
      role: "texture-or-photo",
      backgroundSize: cs.backgroundSize,
      backgroundPosition: cs.backgroundPosition,
      backgroundRepeat: cs.backgroundRepeat,
      note: "reference only: rebuild as CSS gradient/texture or an authored image",
    });
  }

  // --------------------------------------------------------------- motion
  const motionSeen = new Set();
  for (const el of allElements) {
    if (!el || el.nodeType !== 1) continue;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) continue;
    const trans = cs.transition && cs.transition !== "all 0s ease 0s" ? cs.transition : null;
    const anim = cs.animationName && cs.animationName !== "none"
      ? cs.animationName + " " + cs.animationDuration + " " + cs.animationTimingFunction
      : null;
    if (!trans && !anim) continue;
    const key = (trans || "") + "||" + (anim || "");
    if (motionSeen.has(key)) continue;
    motionSeen.add(key);
    motionSeen.add(key + "|count");
    spec.motion.push({
      path: cssPath(el),
      tag: el.tagName.toLowerCase(),
      transition: trans,
      animation: anim,
      transform: cs.transform === "none" ? null : cs.transform,
      willChange: cs.willChange,
    });
    if (spec.motion.length >= 60) break;
  }

  // ----------------------------------------------------------- breakpoints
  const bp = new Set();
  function walkRules(rules) {
    if (!rules) return;
    for (const rule of rules) {
      try {
        if (rule.type === 4 && rule.conditionText) {
          const found = rule.conditionText.match(/-?\d+(?:\.\d+)?px/g);
          if (found) found.forEach((f) => bp.add(f));
          if (rule.cssRules) walkRules(rule.cssRules);
        } else if (rule.cssRules) {
          walkRules(rule.cssRules);
        }
      } catch (e) { /* cross-origin or unsupported rule */ }
    }
  }
  let blockedSheets = 0;
  for (const sheet of Array.prototype.slice.call(document.styleSheets)) {
    try {
      walkRules(sheet.cssRules);
    } catch (e) {
      blockedSheets++;
    }
  }
  spec.breakpoints = Array.from(bp).sort((a, b) => parseFloat(a) - parseFloat(b));
  if (blockedSheets) {
    spec.notes.push(blockedSheets + " stylesheet(s) blocked by CORS: declared " +
      "media queries and custom properties may be incomplete; computed styles " +
      "and boxes are unaffected");
  }

  // Page-background candidates: biggest painted areas among root, body and
  // full-bleed sections. The screenshot still decides the final value.
  const bgCandidates = [];
  for (const el of [document.documentElement, document.body].concat(spec.sections
    .map((s) => (s.path ? document.querySelector(s.path) : null))
    .filter(Boolean))) {
    const cs = getComputedStyle(el);
    const box = boxOf(el);
    bgCandidates.push({
      path: cssPath(el),
      background: cs.backgroundColor,
      backgroundImage: cs.backgroundImage === "none" ? null : clip(cs.backgroundImage, 160),
      area: round(box.w * box.h),
      coversViewportWidth: box.w >= window.innerWidth - 2,
    });
  }
  spec.backgrounds = bgCandidates.sort((a, b) => b.area - a.area).slice(0, 12);

  window.__siteUISpec = spec;
  return spec;
})();
