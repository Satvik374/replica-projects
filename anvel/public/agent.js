/* Anvel — the build agent.
   Reads a prompt, picks a blueprint, writes real files, then applies follow-up
   requests as transforms on those files. No model is involved: everything here
   is deterministic, which is why it works offline and why it can refuse.

   The agent is honest by design. When a prompt asks for something outside the
   set it can actually do, it says so instead of pretending. */

import { pages } from "./blueprints-pages.js";
import { apps } from "./blueprints-apps.js";
import { slug } from "./gen-kit.js";

export const BLUEPRINTS = [...apps, ...pages];

const COLORS = {
  red: "#d6453d",
  crimson: "#b32632",
  orange: "#e07a1f",
  amber: "#c98a10",
  yellow: "#c9a227",
  gold: "#b98a1a",
  lime: "#5f9e21",
  green: "#2f7d4f",
  emerald: "#128a6b",
  teal: "#0f7f82",
  cyan: "#0d7f9b",
  sky: "#2477a8",
  blue: "#3b6fd4",
  indigo: "#4b46c6",
  violet: "#6a3fc0",
  purple: "#7b2fa8",
  magenta: "#a52f83",
  pink: "#c02f72",
  rose: "#c2416b",
  brown: "#8a5a34",
  slate: "#4a5568",
  grey: "#5b6270",
  gray: "#5b6270",
  black: "#1b1b1b"
};

const FALLBACK_NAMES = {
  landing: "Northwind",
  dashboard: "Atlas",
  waitlist: "Early Doors",
  timer: "Focus Block",
  todo: "Three Things",
  kanban: "Flowline",
  quiz: "Six Questions",
  store: "Sundry Goods",
  expense: "Ledger",
  calculator: "Sum"
};

const STOPWORDS = new Set(
  ("a an the and or but for with without that this these those to of in on at by from into " +
    "build create make app application website site page landing dashboard tool simple " +
    "minimal clean nice modern beautiful small tiny little my our your it is are be " +
    "please can you me i want need would like called named using use use that has have")
    .split(" ")
    .filter(Boolean)
);

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

const titleCase = (value) =>
  clean(value)
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

function quoted(text) {
  const match =
    text.match(/["“”']([A-Za-z0-9][^"“”']{1,38})["“”']/) ||
    text.match(/\b(?:called|named)\s+([A-Za-z0-9][\w&'’.-]*(?:\s+[A-Za-z0-9][\w&'’.-]*){0,3})/i);
  return match ? clean(match[1]) : "";
}

/* The most useful noun phrase in the prompt: "a landing page for a coffee shop"
   gives "coffee shop"; "a kanban board for our design sprints" gives
   "design sprints". */
export function topicOf(prompt) {
  const text = clean(prompt).replace(/[.!?]+$/, "");
  const afterFor = text.match(/\b(?:for|about|that helps?|to help)\s+(?:a|an|the|my|our|their)?\s*([a-z0-9][a-z0-9\s'’-]{2,42})/i);
  if (afterFor) {
    const words = afterFor[1].split(" ").filter((w) => !STOPWORDS.has(w.toLowerCase()));
    if (words.length) return words.slice(0, 4).join(" ").toLowerCase();
  }
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (!words.length) return "";
  return words.slice(-2).join(" ");
}

function pickBlueprint(prompt) {
  const lower = " " + clean(prompt).toLowerCase() + " ";
  let best = null;
  let bestScore = 0;
  BLUEPRINTS.forEach((blueprint) => {
    const hits = lower.match(new RegExp(blueprint.key.replace(/[^a-z]/g, ""), "g"));
    let score = blueprint.test(lower.trim()) ? 10 : 0;
    if (hits) score += hits.length;
    if (blueprint.key === "landing" && /landing|website|homepage|marketing/.test(lower)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = blueprint;
    }
  });
  return best && bestScore >= 10 ? best : BLUEPRINTS.find((b) => b.key === "landing");
}

function accentOf(prompt, seed) {
  const hex = clean(prompt).match(/#[0-9a-f]{6}\b/i);
  if (hex) return hex[0].toLowerCase();
  const named = clean(prompt)
    .toLowerCase()
    .match(new RegExp("\\b(" + Object.keys(COLORS).join("|") + ")\\b"));
  if (named) return COLORS[named[1]];
  const rotated = ["#c98a10", "#0f7f82", "#b32632", "#4b46c6", "#2f7d4f", "#a52f83", "#e07a1f", "#2477a8"];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return rotated[hash % rotated.length];
}

export function readPrompt(prompt, options = {}) {
  const raw = clean(prompt);
  const blueprint = pickBlueprint(raw);
  const topic = topicOf(raw) || blueprint.label.toLowerCase();
  const quotedName = quoted(raw);
  const name = quotedName || FALLBACK_NAMES[blueprint.key] || "New Project";
  const accent = accentOf(raw, name + topic);
  const wantsDark = /\b(dark|night|midnight|black)\b/i.test(raw);
  const wantsLight = /\b(light|bright|white)\b/i.test(raw);
  const topicTitle = titleCase(topic);
  const headlines = {
    landing: [`Make ${topic} feel effortless`, "without the busywork"],
    dashboard: [`${topicTitle}, at a glance`, ""],
    waitlist: [`Something good is`, "almost ready"],
    store: [`${topicTitle}, made to last`, ""],
    quiz: [`${topicTitle}: how well do you know it?`, ""],
    todo: [`${topicTitle}, one line at a time`, ""],
    kanban: [`${topicTitle} board`, ""],
    timer: [`${topicTitle} timer`, ""],
    expense: [`Where the money went`, ""],
    calculator: [`${topicTitle} calculator`, ""]
  };
  const [headline, headlineAccent] = headlines[blueprint.key] || headlines.landing;
  const taglines = {
    landing: `One place for ${topic}: briefs, decisions and the small pieces in between, without a meeting to hold it together.`,
    dashboard: `Live numbers for ${topic}, and the few things that actually need you today.`,
    waitlist: `We are building a calmer way to handle ${topic}. Leave an address and we will send one email, not twelve.`,
    store: `A small range of ${topic}, made in short runs and built to be used every day.`,
    quiz: `Six questions about ${topic}. No timer, no leaderboard — just a decent excuse to think.`,
    todo: `A list for ${topic} that stays short on purpose.`,
    kanban: `Move ${topic} from idea to done in three columns.`,
    timer: `Work in blocks with ${topic}. Start the clock, ignore the rest.`,
    expense: `Log ${topic} as it happens, and see the shape of the month.`,
    calculator: `Quick arithmetic with ${topic}, keyboard included.`
  };
  return {
    raw,
    blueprint,
    name,
    mode: options.mode || (/prototype|mock|figma/i.test(raw) ? "prototype" : /slide|deck|presentation/i.test(raw) ? "slides" : /app\b/i.test(raw) ? "app" : "website"),
    topic,
    accent,
    accentInk: "#1a1206",
    dark: wantsLight ? false : wantsDark || options.dark === true,
    headline,
    headlineAccent,
    tagline: taglines[blueprint.key] || taglines.landing,
    cta: blueprint.key === "waitlist" ? "Join the list" : blueprint.key === "store" ? "Shop the range" : "Start free",
    badge: blueprint.key === "store" ? "New season · small batch" : "New · built for small teams",
    summary: "",
    font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  };
}

const countLines = (text) => text.split("\n").length;

export function estimateTokens(prompt, files) {
  const written = files.reduce((sum, file) => sum + file.content.length, 0);
  return Math.max(180, Math.round((clean(prompt).length + written) / 4));
}

/* ---------------------------------------------------------------- plan mode */

export function plan(prompt) {
  const ctx = readPrompt(prompt);
  const outline = {
    landing: ["a sticky header with four in-page links", "a hero with one clear action", "three feature cards", "a pricing block with a monthly/yearly toggle", "an FAQ accordion", "a footer"],
    dashboard: ["a sidebar with five sections", "four metric cards", "a revenue chart", "a recent-customers table", "a period filter that updates the numbers"],
    waitlist: ["a hero with one promise", "an email form with validation and a success state", "three supporting points", "a footer"],
    store: ["a product grid with six items", "price filters", "a cart drawer with quantities and a subtotal", "a demo checkout"],
    quiz: ["an intro screen", "six questions with one answer each", "progress and feedback", "a result screen with a review list", "retry"],
    todo: ["an add field", "a list with complete and delete", "filters for all/open/done", "counts and clear-completed"],
    kanban: ["three columns", "draggable cards", "per-column add", "delete on hover"],
    timer: ["a countdown ring", "four presets", "start, pause and reset", "session counters"],
    expense: ["a total card", "an add form with categories", "a recent list", "category bars"],
    calculator: ["a display with an expression line", "a full keypad", "keyboard support", "error handling for divide-by-zero"]
  };
  const items = outline[ctx.blueprint.key] || outline.landing;
  return {
    name: ctx.name,
    files: ["index.html", "styles.css", "app.js"],
    lines: [
      `Read the request as a ${ctx.blueprint.label.toLowerCase()} called ${ctx.name}.`,
      `Build ${items.length} parts:`,
      ...items.map((item, i) => `  ${i + 1}. ${item}`),
      "Write three files — index.html, styles.css, app.js — and nothing generated at runtime.",
      "Then load the preview and stop."
    ],
    estimate: 900
  };
}

/* -------------------------------------------------------------------- build */

export function build(prompt, options = {}) {
  const ctx = readPrompt(prompt, options);
  const label = ctx.blueprint.label.toLowerCase();
  const result = ctx.blueprint.build(ctx);
  ctx.summary = `Built a ${label} called ${ctx.name}: ${result.files.length} files, no dependencies.`;
  const files = result.files;
  const steps = [
    { kind: "read", text: `Read the request: a ${label} for ${ctx.topic}.` },
    { kind: "plan", text: `Planned ${files.length} files from the ${ctx.blueprint.label} blueprint.` },
    ...files.map((file) => ({ kind: "write", path: file.path, lines: countLines(file.content) })),
    { kind: "done", text: "Preview is live. Ask for a change whenever you like." }
  ];
  return {
    name: options.name || ctx.name,
    topic: ctx.topic,
    blueprint: ctx.blueprint.key,
    mode: ctx.mode,
    summary: ctx.summary,
    files,
    steps,
    tokens: estimateTokens(prompt, files)
  };
}

/* --------------------------------------------------------------- follow-ups */

const read = (files, path) => files.find((f) => f.path === path)?.content ?? "";
const write = (files, path, content) => files.map((f) => (f.path === path ? { ...f, content } : f));
const has = (files, path) => files.some((f) => f.path === path);

function setAccent(files, hex) {
  let next = files;
  const css = read(next, "styles.css");
  if (css) {
    next = write(next, "styles.css", css.replace(/--accent:\s*#[0-9a-fA-F]{3,8}/g, `--accent:${hex}`));
  }
  const html = read(next, "index.html");
  if (html && /theme-color/.test(html)) {
    next = write(next, "index.html", html.replace(/(<meta name="theme-color" content=")#[0-9a-fA-F]{3,8}"/, `$1${hex}"`));
  }
  return next;
}

/* Read the theme off the first `:root` background rather than hunting for a
   known hex anywhere in the file: a leftover declaration from an older edit once
   convinced the follow-up that a light project was already dark. */
function themeIsDark(css) {
  const root = String(css || "").match(/:root\s*\{([^}]*)\}/);
  const block = root ? root[1] : String(css || "");
  const value = (block.match(/--bg\s*:\s*([^;}]+)/i) || [])[1] || "";
  const hex = value.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return false;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4;
}

function setTheme(files, dark) {
  const css = read(files, "styles.css");
  const palette = dark
    ? { bg: "#0e1013", surface: "#16191f", "surface-2": "#1d2129", line: "#2a2f38", ink: "#eef1f5", muted: "#9aa4b2" }
    : { bg: "#fbfaf7", surface: "#ffffff", "surface-2": "#f5f2ea", line: "#e6e1d6", ink: "#171512", muted: "#5f594f" };

  /* Swap values only. A blind whole-block replacement once ate the `:root{`
     selector and every token between the ones it rewrote, which left the file
     with declarations outside a rule — valid-looking text, no styles at all. */
  const root = css.match(/:root\s*\{[^}]*\}/);
  let css2 = css;
  if (root) {
    const swapped = root[0].replace(/(--[a-z0-9-]+)\s*:\s*[^;}]+/gi, (decl, name) => {
      const key = name.replace(/^--/, "");
      return Object.prototype.hasOwnProperty.call(palette, key) ? `${name}:${palette[key]}` : decl;
    });
    css2 = css.replace(root[0], swapped);
  } else {
    css2 = `:root{${Object.entries(palette)
      .map(([name, value]) => `--${name}:${value}`)
      .join(";")}}\n${css}`;
  }
  let next = write(files, "styles.css", css2);
  const html = read(next, "index.html");
  if (html) {
    next = write(
      next,
      "index.html",
      dark ? html.replace('<html lang="en">', '<html lang="en" data-theme="dark">') : html.replace('<html lang="en" data-theme="dark">', '<html lang="en">')
    );
  }
  return next;
}

function rename(files, name) {
  let next = files;
  const html = read(next, "index.html");
  if (html) {
    next = write(
      next,
      "index.html",
      html
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${name}</title>`)
        .replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/i, (match, open, close) => `${open}${name}${close}`)
    );
  }
  return next;
}

function appendCss(files, snippet) {
  return write(files, "styles.css", read(files, "styles.css") + "\n/* follow-up */\n" + snippet + "\n");
}

const SECTIONS = {
  pricing: {
    html: `<section class="section extra" id="pricing">
        <div class="wrap">
          <h2>Pricing</h2>
          <p class="section-lede">One price, no seats to count.</p>
          <div class="extra-grid">
            <article class="card extra-card"><h3>Starter</h3><p class="extra-price">$0</p><p class="muted">One project, one person.</p><a class="btn btn-quiet" href="#start">Start</a></article>
            <article class="card extra-card"><h3>Team</h3><p class="extra-price">$19</p><p class="muted">Unlimited projects and people.</p><a class="btn" href="#start">Choose Team</a></article>
            <article class="card extra-card"><h3>Studio</h3><p class="extra-price">$49</p><p class="muted">Client spaces and exports.</p><a class="btn btn-quiet" href="#start">Choose Studio</a></article>
          </div>
        </div>
      </section>`,
    css: `.extra-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:28px}
.extra-card{padding:22px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.extra-price{font-size:32px;font-weight:650;letter-spacing:-.02em}
.extra-card .btn{height:38px;padding:0 16px;font-size:13px;margin-top:auto}
@media (max-width:820px){.extra-grid{grid-template-columns:1fr}}`
  },
  faq: {
    html: `<section class="section extra" id="faq">
        <div class="wrap narrow">
          <h2>Questions</h2>
          <div class="extra-faq">
            <details open><summary>Is there a free plan?</summary><p>Yes — one project, no card, no expiry.</p></details>
            <details><summary>Can I export my work?</summary><p>Every project downloads as plain files you can host anywhere.</p></details>
            <details><summary>Do you train on my data?</summary><p>No. Your projects stay yours.</p></details>
          </div>
        </div>
      </section>`,
    css: `.extra-faq{display:flex;flex-direction:column;gap:8px;margin-top:20px}
.extra-faq details{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:14px 16px}
.extra-faq summary{cursor:pointer;font-weight:600}
.extra-faq p{color:var(--muted);font-size:14px;margin-top:8px}`
  },
  testimonials: {
    html: `<section class="section extra" id="testimonials">
        <div class="wrap">
          <h2>What people say</h2>
          <div class="extra-grid">
            <blockquote class="card extra-card"><p>“Replaced three tools and one standing meeting.”</p><footer class="muted">— Dana R.</footer></blockquote>
            <blockquote class="card extra-card"><p>“Set up in an afternoon. Nobody asked me for a manual.”</p><footer class="muted">— Priya K.</footer></blockquote>
            <blockquote class="card extra-card"><p>“The only tool my team opens without being told to.”</p><footer class="muted">— Oli M.</footer></blockquote>
          </div>
        </div>
      </section>`,
    css: `.extra-card p{font-size:15px;line-height:1.5}
.extra-card footer{font-size:12px;margin-top:8px}`
  },
  contact: {
    html: `<section class="section extra" id="contact">
        <div class="wrap narrow">
          <h2>Get in touch</h2>
          <p class="section-lede">One field, one human reply.</p>
          <form class="extra-form" novalidate>
            <label class="sr" for="extra-email">Email</label>
            <input class="input" id="extra-email" type="email" placeholder="you@company.com" required />
            <button class="btn" type="submit">Send</button>
            <p class="extra-note" role="status" aria-live="polite"></p>
          </form>
        </div>
      </section>`,
    css: `.extra-form{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap}
.extra-form .input{flex:1 1 240px}
.extra-note{flex-basis:100%;font-size:13px;color:var(--success)}`
  },
  footer: {
    html: `<footer class="footer">
      <div class="wrap foot-row">
        <p>© 2026 · built with Anvel</p>
        <nav aria-label="Footer"><a href="#top">Top</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a></nav>
      </div>
    </footer>`,
    css: `.footer{border-top:1px solid var(--line);padding:24px 0;background:var(--surface);margin-top:48px}
.foot-row{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.foot-row nav{display:flex;gap:16px}
.foot-row a{text-decoration:none}`
  }
};

function addSection(files, kind) {
  const section = SECTIONS[kind];
  if (!section || !has(files, "index.html")) return files;
  let html = read(files, "index.html");
  if (html.includes(`id="${kind}"`)) return files;
  const anchor = kind === "footer" ? /<\/body>/i : /<\/main>/i;
  html = html.replace(anchor, (match) => section.html + "\n    " + match);
  let next = write(files, "index.html", html);
  if (section.css && has(next, "styles.css")) next = appendCss(next, section.css);
  if (kind === "contact" && has(next, "app.js")) {
    next = write(
      next,
      "app.js",
      read(next, "app.js") +
        `

var extraForm = document.querySelector(".extra-form");
if (extraForm) {
  extraForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var field = extraForm.querySelector("input");
    var note = extraForm.querySelector(".extra-note");
    if (!field.value || field.value.indexOf("@") < 0) {
      note.style.color = "var(--danger)";
      note.textContent = "That address looks incomplete.";
      field.focus();
      return;
    }
    note.style.color = "var(--success)";
    note.textContent = "Thanks — we will reply to " + field.value + ".";
    extraForm.reset();
  });
}
`
    );
  }
  return next;
}

function removeSection(files, kind) {
  let html = read(files, "index.html");
  if (!html) return files;
  const pattern = new RegExp(`<section[^>]*id="${kind}"[\\s\\S]*?<\\/section>\\s*`, "i");
  if (!pattern.test(html) && kind !== "footer") return files;
  const next = kind === "footer" ? html.replace(/<footer[\s\S]*?<\/footer>\s*/i, "") : html.replace(pattern, "");
  if (next === html) return files;
  return write(files, "index.html", next);
}

/* The follow-up entry point. Returns a result the UI can stream, including an
   honest `unmatched` flag when the request is outside what the agent can do. */
export function followUp(prompt, files) {
  const raw = clean(prompt);
  const lower = raw.toLowerCase();
  const before = files.map((f) => f.content).join("\n");
  let next = files;
  const did = [];
  const steps = [{ kind: "read", text: "Read the change against the current files." }];

  const colorWord = lower.match(new RegExp("\\b(" + Object.keys(COLORS).join("|") + ")\\b"));
  const hex = raw.match(/#[0-9a-f]{6}\b/i);
  const wantsColor = /colou?r|accent|theme|palette|brand/.test(lower) || (colorWord && /make it|change|use|switch/.test(lower));
  if (hex || (wantsColor && colorWord)) {
    const value = hex ? hex[0].toLowerCase() : COLORS[colorWord[1]];
    next = setAccent(next, value);
    did.push(`Switched the accent colour to ${hex ? value : colorWord[1]}.`);
  }

  if (/\bdark\b|night mode|darker/.test(lower) && !/light/.test(lower)) {
    if (themeIsDark(read(files, "styles.css"))) {
      did.push("It is already on the dark palette, so the files did not change.");
    } else {
      next = setTheme(next, true);
      did.push("Moved the palette to dark.");
    }
  } else if (/\blight\b|brighter|white background/.test(lower)) {
    next = setTheme(next, false);
    did.push("Moved the palette to light.");
  }

  const renameMatch =
    raw.match(/(?:rename|change|update|set)\s+(?:the\s+)?(?:title|heading|headline|name|brand)\s+(?:to\s+)?["“']?([^"”']{2,48})["”']?/i) ||
    raw.match(/(?:call it|call the (?:app|site|page))\s+["“']?([^"”']{2,40})["”']?/i) ||
    raw.match(/rename\s+(?:it|this|the (?:app|site|page|project))\s+to\s+["“']?([^"”']{2,48})["”']?/i) ||
    raw.match(/\bname\s+it\s+["“']?([^"”']{2,48})["”']?/i);
  if (renameMatch) {
    const name = clean(renameMatch[1]).replace(/\s+(to|please)$/i, "");
    next = rename(next, name);
    did.push(`Renamed the page title and headline to “${name}”.`);
  }

  const addMatch = lower.match(/\badd\s+(?:a\s+|an\s+|the\s+)?(pricing|faq|testimonials?|reviews?|contact|footer)\b/);
  if (addMatch) {
    const kind = addMatch[1] === "reviews" || addMatch[1] === "review" ? "testimonials" : addMatch[1];
    const beforeCount = read(next, "index.html").length;
    next = addSection(next, kind);
    if (read(next, "index.html").length > beforeCount) did.push(`Added a ${kind} section.`);
    else did.push(`The ${kind} section is already there, so nothing was duplicated.`);
  }

  const removeMatch = lower.match(/\b(?:remove|delete|drop|take out)\s+(?:the\s+)?(pricing|faq|testimonials?|contact|footer)\b/);
  if (removeMatch) {
    const kind = removeMatch[1] === "reviews" || removeMatch[1] === "review" ? "testimonials" : removeMatch[1];
    const beforeLength = read(next, "index.html").length;
    next = removeSection(next, kind);
    if (read(next, "index.html").length < beforeLength) did.push(`Removed the ${kind} section.`);
    else did.push(`There is no ${kind} section to remove.`);
  }

  if (/\b(bigger|larger|increase)\b.*\b(text|font|type|size)\b|\btext\b.*\b(bigger|larger)\b/.test(lower)) {
    next = appendCss(next, "html{font-size:112.5%}\nbody{line-height:1.65}");
    did.push("Scaled the type up by about 12%.");
  }
  if (/\b(smaller|tighter|compact|denser)\b/.test(lower) && !/remove/.test(lower)) {
    next = appendCss(next, "html{font-size:93.75%}\n.section{padding-block:56px}");
    did.push("Tightened the type and section spacing.");
  }
  if (/\b(round|rounded|softer corners|more radius)\b/.test(lower)) {
    next = appendCss(next, ":root{--radius:22px} .btn{border-radius:999px}");
    did.push("Rounded the corners further.");
  }
  if (/\b(contrast|accessible|readab)/.test(lower)) {
    next = appendCss(next, ":root{--muted:color-mix(in srgb, var(--ink) 72%, transparent)}");
    did.push("Raised the contrast on muted text.");
  }
  if (/\b(animation|animate|motion|transition)\b/.test(lower) && !/remove|stop/.test(lower)) {
    next = appendCss(next, ".card,.btn,.kcard,.product{transition:transform .18s ease, box-shadow .18s ease}\n.card:hover{transform:translateY(-2px)}");
    did.push("Added hover motion to cards and buttons.");
  }

  const changed = next.filter((file, i) => file.content !== files[i].content);
  const diff = next.map((f) => f.content).join("\n") !== before;
  const tokens = estimateTokens(raw, changed.length ? changed : []);
  const summary = did.length
    ? did.join(" ")
    : "";

  changed.forEach((file) => steps.push({ kind: "write", path: file.path, lines: countLines(file.content) }));
  if (did.length) steps.push({ kind: "done", text: "Preview refreshed." });

  return {
    files: diff ? next : files,
    changed,
    changedPaths: changed.map((f) => f.path),
    summary,
    steps,
    tokens: diff ? tokens : 0,
    unmatched: !diff,
    reply: diff
      ? summary
      : `I could not turn that into a change to these files. This build agent works from a fixed set of moves — layout and palette changes, titles, adding or removing a section, type scale, motion — and it writes plain HTML, CSS and JS. It is not a language model, so it will not guess: try one of those, or edit the file directly in Code view.`
  };
}
