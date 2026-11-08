/* Anvel — shared kit for the build agent.
   Everything here writes *our* code: no original markup, CSS, fonts or copy.
   The generated apps are plain HTML/CSS/JS so they run inside the preview
   sandbox and on the published site with no build step. */

export const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const slug = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "app";

/* Storage that never throws: the preview runs in an opaque origin, where
   localStorage is unavailable. Generated apps must work in both places. */
export const storage = `function keep(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* preview sandbox: state lives for the session only */
  }
}`;

export const money = `function money(cents) {
  return "$" + (cents / 100).toFixed(2);
}`;

/* Design tokens + the primitives every generated app shares. One function so
   a follow-up like "make it dark" only has to rewrite this block. */
export function baseCss(ctx) {
  const a = ctx.accent;
  const ink = ctx.accentInk;
  if (ctx.dark) {
    return `:root{
  --bg:#0e1013; --surface:#16191f; --surface-2:#1d2129; --line:#2a2f38;
  --ink:#eef1f5; --muted:#9aa4b2; --accent:${a}; --accent-ink:${ink};
  --radius:14px; --radius-sm:8px; --shadow:0 20px 50px rgba(0,0,0,.45);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ${ctx.font};-webkit-font-smoothing:antialiased}
img,svg{display:block;max-width:100%}
h1,h2,h3,h4{margin:0;line-height:1.15;letter-spacing:-.02em;font-weight:650}
p{margin:0}
a{color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 24px}
.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 20px;border-radius:999px;border:1px solid transparent;background:var(--accent);color:var(--accent-ink);font-weight:600;text-decoration:none;cursor:pointer;transition:transform .15s ease,filter .15s ease}
.btn:hover{filter:brightness(1.06)}
.btn:active{transform:translateY(1px)}
.btn[disabled]{opacity:.5;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.btn-quiet{background:var(--surface-2);color:var(--ink);border-color:var(--line)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:13px;font-weight:600;color:var(--muted)}
.input{height:46px;padding:0 14px;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface-2);color:var(--ink);width:100%}
.input::placeholder{color:var(--muted);opacity:.8}
.pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);font-size:12px;font-weight:600;color:var(--muted)}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important;transition-duration:.001ms !important}}
`;
  }
  return `:root{
  --bg:#fbfaf7; --surface:#ffffff; --surface-2:#f5f2ea; --line:#e6e1d6;
  --ink:#171512; --muted:#5f594f; --accent:${a}; --accent-ink:${ink === "#1a1206" ? "#ffffff" : ink};
  --radius:14px; --radius-sm:8px; --shadow:0 20px 50px rgba(23,21,18,.10);
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ${ctx.font};-webkit-font-smoothing:antialiased}
img,svg{display:block;max-width:100%}
h1,h2,h3,h4{margin:0;line-height:1.15;letter-spacing:-.02em;font-weight:650}
p{margin:0}
a{color:inherit}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.wrap{width:100%;max-width:1120px;margin:0 auto;padding:0 24px}
.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 20px;border-radius:999px;border:1px solid transparent;background:var(--accent);color:#fff;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .15s ease,filter .15s ease}
.btn:hover{filter:brightness(1.08)}
.btn:active{transform:translateY(1px)}
.btn[disabled]{opacity:.5;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.btn-quiet{background:var(--surface);color:var(--ink);border-color:var(--line)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:13px;font-weight:600;color:var(--muted)}
.input{height:46px;padding:0 14px;border-radius:var(--radius-sm);border:1px solid var(--line);background:var(--surface);color:var(--ink);width:100%}
.input::placeholder{color:var(--muted);opacity:.8}
.pill{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);font-size:12px;font-weight:600;color:var(--muted)}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){*{animation-duration:.001ms !important;transition-duration:.001ms !important}}
`;
}

/* Assemble the three files every blueprint returns. */
export function site(ctx, { title, description, body, css, js, bodyAttrs = "" }) {
  const files = [
    {
      path: "index.html",
      content: `<!doctype html>
<html lang="en"${ctx.dark ? ' data-theme="dark"' : ""}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body${bodyAttrs}>
${body
  .trim()
  .split("\n")
  .map((line) => "    " + line)
  .join("\n")}
${js ? '    <script src="app.js"></script>\n' : ""}  </body>
</html>
`
    },
    { path: "styles.css", content: baseCss(ctx) + "\n" + css.trim() + "\n" }
  ];
  if (js) files.push({ path: "app.js", content: js.trim() + "\n" });
  return files;
}

/* Inline a project's files into one document. The preview iframe is a sandbox
   with an opaque origin, so relative CSS/JS requests would fail. */
export function inlineDocument(files) {
  const byPath = new Map(files.map((f) => [f.path.replace(/^\.?\//, ""), f.content]));
  let html = byPath.get("index.html") || "<!doctype html><p>This project has no index.html.</p>";
  html = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
    const key = String(href).replace(/^\.?\//, "");
    if (!/\.css$/i.test(key)) return tag;
    const css = byPath.get(key);
    return css === undefined ? tag : `<style>\n${css}\n</style>`;
  });
  html = html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    const key = String(src).replace(/^\.?\//, "");
    const js = byPath.get(key);
    if (js === undefined) return tag;
    return `<script>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`;
  });
  return html;
}
