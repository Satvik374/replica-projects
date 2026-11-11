/* Alcove — the reply engine.
   This build has no model behind it. It ships a scripted engine so the states
   around a reply are real: streaming, stop, retry, thinking, artifacts, styles
   and model tiers. The copy says so, in the app and in the README. */

export const MODELS = [
  { id: "opus", name: "Opus 5.5", short: "Opus", blurb: "Deepest reasoning. Slower.", speed: 0.55, length: 1.35 },
  { id: "sonnet", name: "Sonnet 5.5", short: "Sonnet", blurb: "The balanced default.", speed: 1, length: 1 },
  { id: "haiku", name: "Haiku 4.5", short: "Haiku", blurb: "Fastest. Shortest answers.", speed: 1.9, length: 0.62 }
];

export const BUILTIN_STYLES = [
  { id: "normal", name: "Normal", description: "The default voice.", instructions: "" },
  { id: "concise", name: "Concise", description: "Shorter, more direct answers.", instructions: "Lead with the answer. Cut every sentence that does not carry information." },
  { id: "explanatory", name: "Explanatory", description: "Teaches the idea, not just the answer.", instructions: "Explain the reasoning, define terms, and add a worked example." },
  { id: "formal", name: "Formal", description: "Clear and polished.", instructions: "Professional register. No slang, no exclamation marks, no filler." },
  { id: "learning", name: "Learning", description: "Asks you a question at the end.", instructions: "End with one question that checks understanding." }
];

export const modelById = (id) => MODELS.find((model) => model.id === id) || MODELS[1];
export const styleById = (id, custom = []) =>
  BUILTIN_STYLES.find((style) => style.id === id) ||
  custom.find((style) => style.id === id) ||
  BUILTIN_STYLES[0];

const seedOf = (text) => {
  let seed = 7;
  for (let i = 0; i < text.length; i += 1) seed = (seed * 31 + text.charCodeAt(i)) % 100000;
  return seed;
};

const pick = (list, seed, offset = 0) => list[(seed + offset) % list.length];

const topicOf = (prompt) => {
  const clean = prompt
    .replace(/^(hey|hi|hello|please|can you|could you|would you|i want you to|i need you to)\s+/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
  const words = clean.split(/\s+/).slice(0, 12).join(" ");
  return words.length > 90 ? `${words.slice(0, 88)}…` : words || "that";
};

const wantsArtifact = (prompt) =>
  /\b(build|make|create|design|prototype|scaffold)\b.*\b(page|site|website|landing|dashboard|component|app|interface|ui|screen)\b/i.test(prompt) ||
  /\b(html|svg|logo|icon|artifact)\b/i.test(prompt);

const wantsLogoSvg = (prompt) => /\b(svg|logo|icon|mark|favicon)\b/i.test(prompt);
const wantsDoc = (prompt) => /\b(brief|spec|proposal|document|report|memo|one-pager)\b/i.test(prompt);

export class ScriptedError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScriptedError";
  }
}

/* --------------------------------------------------------------- thinking */

function thinkingTrace(prompt, model, style) {
  const topic = topicOf(prompt);
  const lines = [];
  lines.push(`Reading the request: ${topic}.`);
  if (style.id === "concise") lines.push("The asked-for shape is short. I will keep the frame and drop the hedging.");
  if (style.id === "formal") lines.push("Register: professional. No contractions, no jokes.");
  if (style.id === "explanatory") lines.push("They want the mechanism, not only the outcome, so the reasoning has to stay visible.");
  lines.push(
    pick(
      [
        "One useful answer beats three adjacent ones. I will pick a shape, say what it assumes, and stop.",
        "The risk here is sounding confident about a fact I cannot check. Keep claims to what the request itself contains.",
        "The first draft would be a list. A list hides the decision, so lead with the decision and let the list support it."
      ],
      seedOf(prompt),
      1
    )
  );
  lines.push(
    model.id === "opus"
      ? "Going one level deeper: what would change my mind, and which part is cheap to revise later. Drafting both before answering."
      : model.id === "haiku"
        ? "Keep the trace short; the answer is the deliverable."
        : "Draft the answer, then cut the parts that only restate the question."
  );
  return lines.join("\n");
}

/* --------------------------------------------------------------- artifacts */

const COLOR_WORDS = {
  blue: "#1f5fbf",
  green: "#17614f",
  teal: "#0f6f6a",
  purple: "#5b3fa8",
  violet: "#5b3fa8",
  orange: "#b45a1e",
  red: "#a4302a",
  amber: "#8a5a12",
  pink: "#a8386b",
  slate: "#3d4a52"
};

function accentFrom(prompt) {
  const lower = prompt.toLowerCase();
  for (const [word, hex] of Object.entries(COLOR_WORDS)) {
    if (lower.includes(word)) return hex;
  }
  return "#17614f";
}

function landingArtifact(prompt, revision) {
  const accent = accentFrom(prompt);
  const dark = /\bdark\b/i.test(prompt);
  const name = topicOf(prompt).replace(/^(a|an|the)\s+/i, "").slice(0, 32) || "Fieldwork";
  const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
  const bg = dark ? "#101614" : "#f7f6f2";
  const ink = dark ? "#eef2ef" : "#1b2321";
  const muted = dark ? "#a9b5b0" : "#55605c";
  const surface = dark ? "#1a2320" : "#ffffff";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { --bg:${bg}; --ink:${ink}; --muted:${muted}; --accent:${accent}; --surface:${surface}; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 24px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:8px 0 40px; }
  .mark { display:flex; align-items:center; gap:10px; font-weight:600; letter-spacing:-0.01em; }
  .mark span { display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:var(--accent); color:var(--bg); }
  nav a { color:var(--muted); text-decoration:none; margin-left:18px; font-size:14px; }
  nav a:hover { color:var(--ink); }
  h1 { font-family: ui-serif, Georgia, serif; font-size: clamp(32px, 5vw, 52px); line-height:1.12; font-weight:400; letter-spacing:-0.02em; margin:0 0 16px; max-width:18ch; }
  .lede { color:var(--muted); font-size:18px; max-width:52ch; margin:0 0 28px; }
  .cta { display:inline-flex; align-items:center; gap:8px; background:var(--accent); color:#fff; padding:12px 20px; border-radius:999px; text-decoration:none; font-weight:600; font-size:15px; }
  .cta:hover { filter:brightness(1.08); }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); margin-top:56px; }
  .card { background:var(--surface); border:1px solid ${dark ? "#2b3733" : "#e2e0d6"}; border-radius:14px; padding:20px; }
  .card h2 { font-size:15px; margin:0 0 6px; }
  .card p { margin:0; color:var(--muted); font-size:14px; }
  .kicker { display:inline-block; font-size:11px; letter-spacing:.09em; text-transform:uppercase; color:var(--accent); font-weight:700; margin-bottom:14px; }
  footer { margin-top:64px; padding-top:20px; border-top:1px solid ${dark ? "#2b3733" : "#e2e0d6"}; color:var(--muted); font-size:13px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  @media (max-width: 560px) { nav { display:none; } .wrap { padding:18px; } }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="mark"><span>◗</span>${title}</div>
      <nav><a href="#how">How it works</a><a href="#notes">Notes</a><a href="#start">Start</a></nav>
    </header>
    <main>
      <p class="kicker">${revision ? "Revision " + revision : "A first draft"}</p>
      <h1>${title}, without the busywork.</h1>
      <p class="lede">A quieter place to keep the work that matters: one list, one decision at a time, and nothing that asks for your attention twice.</p>
      <a class="cta" href="#start">Open the workspace →</a>
      <section class="grid" id="how">
        <article class="card"><h2>One surface</h2><p>Notes, decisions and open questions live together, so context never has to be reassembled.</p></article>
        <article class="card"><h2>Small defaults</h2><p>Sensible spacing, readable type and a palette that does not shout. Change it once, not per screen.</p></article>
        <article class="card"><h2>Yours to leave</h2><p>Everything exports as plain files. No lock-in, no migration project, no exit interview.</p></article>
      </section>
      <section class="grid" id="notes">
        <article class="card"><h2>Built for one person</h2><p>Not a team suite wearing a solo-plan badge. The first screen is your work, not an onboarding tour.</p></article>
        <article class="card"><h2>Fast where it counts</h2><p>Keyboard first, no spinners, no modal chains. The common path is two clicks and a keystroke.</p></article>
      </section>
    </main>
    <footer id="start"><span>${title} — a demo page made inside an artifact.</span><span>Self-contained. No network requests.</span></footer>
  </div>
</body>
</html>`;
}

function boardArtifact(prompt, revision) {
  const accent = accentFrom(prompt);
  const dark = /\bdark\b/i.test(prompt);
  const bg = dark ? "#101614" : "#f7f6f2";
  const ink = dark ? "#eef2ef" : "#1b2321";
  const muted = dark ? "#a9b5b0" : "#55605c";
  const surface = dark ? "#1a2320" : "#ffffff";
  const border = dark ? "#2b3733" : "#e2e0d6";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Board</title>
<style>
  :root { --bg:${bg}; --ink:${ink}; --muted:${muted}; --accent:${accent}; --surface:${surface}; --border:${border}; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width:820px; margin:0 auto; padding:28px 20px 60px; }
  h1 { font-family:ui-serif, Georgia, serif; font-weight:400; font-size:28px; margin:0 0 4px; }
  p.sub { color:var(--muted); margin:0 0 24px; font-size:14px; }
  .stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:24px; }
  .stat { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:14px 16px; }
  .stat b { display:block; font-size:24px; font-weight:500; font-family:ui-serif, Georgia, serif; }
  .stat span { color:var(--muted); font-size:12px; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
  li { display:flex; gap:12px; align-items:flex-start; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:12px 14px; }
  li.done span { text-decoration:line-through; color:var(--muted); }
  button.box { width:18px; height:18px; margin-top:2px; border:1px solid ${dark ? "#55635e" : "#b9b6a8"}; border-radius:5px; background:transparent; cursor:pointer; flex:none; display:grid; place-items:center; padding:0; color:var(--accent); font-size:12px; }
  button.box[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:#fff; }
  li span { flex:1; }
  li small { color:var(--muted); font-size:12px; }
  .add { display:flex; gap:8px; margin-top:16px; }
  .add input { flex:1; padding:9px 11px; border:1px solid ${dark ? "#55635e" : "#b9b6a8"}; border-radius:9px; background:var(--surface); color:var(--ink); font:inherit; }
  .add button { padding:9px 16px; border:0; border-radius:9px; background:var(--accent); color:#fff; font-weight:600; cursor:pointer; }
  .hint { margin-top:20px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<main>
  <h1>Today, in one place</h1>
  <p class="sub">${revision ? "Revision " + revision + " — a change landed." : "Three things that matter. Everything else waits."}</p>
  <div class="stats">
    <div class="stat"><b id="left">3</b><span>Still open</span></div>
    <div class="stat"><b id="done">1</b><span>Done today</span></div>
    <div class="stat"><b>20m</b><span>Focus block</span></div>
  </div>
  <ul id="list">
    <li class="done"><button class="box" aria-pressed="true" aria-label="Mark not done">✓</button><span>Write the question before the answer</span><small>9:10</small></li>
    <li><button class="box" aria-pressed="false" aria-label="Mark done"></button><span>Draft the short version, then the long one</span><small>10:00</small></li>
    <li><button class="box" aria-pressed="false" aria-label="Mark done"></button><span>Send the note, not the thread</span><small>11:30</small></li>
    <li><button class="box" aria-pressed="false" aria-label="Mark done"></button><span>Close the laptop on time</span><small>17:00</small></li>
  </ul>
  <div class="add">
    <label class="visually-hidden" for="new" style="position:absolute;left:-9999px">New item</label>
    <input id="new" placeholder="Add something small…" />
    <button id="addBtn" type="button">Add</button>
  </div>
  <p class="hint">This demo lives inside the artifact frame. It cannot read your account.</p>
</main>
<script>
  const list = document.getElementById("list");
  const left = document.getElementById("left");
  const done = document.getElementById("done");
  function count() {
    const boxes = [...list.querySelectorAll("button.box")];
    done.textContent = String(boxes.filter((b) => b.getAttribute("aria-pressed") === "true").length);
    left.textContent = String(boxes.filter((b) => b.getAttribute("aria-pressed") !== "true").length);
  }
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button.box");
    if (!button) return;
    const on = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!on));
    button.textContent = on ? "" : "✓";
    button.closest("li").classList.toggle("done", !on);
    count();
  });
  function add() {
    const input = document.getElementById("new");
    const text = input.value.trim();
    if (!text) return;
    const li = document.createElement("li");
    li.innerHTML = '<button class="box" aria-pressed="false" aria-label="Mark done"></button><span></span><small>now</small>';
    li.querySelector("span").textContent = text;
    list.append(li);
    input.value = "";
    count();
  }
  document.getElementById("addBtn").addEventListener("click", add);
  document.getElementById("new").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); add(); } });
  count();
</script>
</body>
</html>`;
}

function logoArtifact(prompt) {
  const accent = accentFrom(prompt);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img" aria-label="An arch inside a rounded square">
  <rect width="240" height="240" rx="56" fill="${accent}" />
  <path d="M62 190V112a58 58 0 0 1 116 0v78h-30v-76a28 28 0 0 0-56 0v76z" fill="#f7f6f2" />
  <circle cx="120" cy="184" r="9" fill="${accent}" />
</svg>`;
}

function docArtifact(prompt, revision) {
  const title = topicOf(prompt).replace(/^(a|an|the)\s+/i, "").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 48) || "Working brief";
  return `# ${title}

${revision ? `_Revision ${revision}. The shape changed; the open questions did not._` : "_A first draft, written to be argued with._"}

## The point

One paragraph that someone could repeat out loud after reading it once. If it needs a second paragraph, the point is not ready.

## What we know

- The constraint that is not moving.
- The number that decides whether this worked.
- The person who has to say yes.

## What we are choosing

| Option | Cost | Reversibility | Call |
| --- | --- | --- | --- |
| Do the narrow thing | low | easy | **yes** |
| Do the ambitious thing | high | hard | not yet |

## What happens next

1. Write the smallest version that can be tested.
2. Put it in front of three people who would actually use it.
3. Decide on Friday, not in the abstract.

## Open questions

- What would make us stop?
- Which part is expensive to change later?
- Who is not in the room and should be?
`;
}

function buildArtifact(prompt, previous) {
  const revision = previous ? (previous.versions ? previous.versions.length + 2 : 2) : 0;
  const keep = (kind, language, title, code) => ({
    id: previous ? previous.id : `art-${seedOf(prompt)}`,
    title: previous ? previous.title : title,
    kind,
    language,
    code,
    versions: previous
      ? [...(previous.versions || []), { code: previous.code, at: Date.now() }].slice(-12)
      : []
  });
  if (wantsLogoSvg(prompt)) return keep("svg", "svg", "Arch mark", logoArtifact(prompt));
  if (wantsDoc(prompt) && !/\b(landing|dashboard|component|ui)\b/i.test(prompt)) {
    return keep("markdown", "markdown", "Working brief", docArtifact(prompt, revision));
  }
  const board = /\b(dashboard|board|tracker|todo|task|list)\b/i.test(prompt);
  return keep(
    "html",
    "html",
    board ? "Today board" : "Landing page",
    board ? boardArtifact(prompt, revision) : landingArtifact(prompt, revision)
  );
}

/* ---------------------------------------------------------------- replies */

function attachmentSummary(attachments) {
  if (!attachments || !attachments.length) return "";
  const named = attachments.slice(0, 3).map((file) => `**${file.name}**`).join(", ");
  const more = attachments.length > 3 ? ` and ${attachments.length - 3} more` : "";
  return `${named}${more}`;
}

function readAttachment(attachments, prompt) {
  const file = (attachments || []).find((item) => item.text && item.text.trim());
  if (!file) return null;
  const text = file.text.replace(/\s+/g, " ").trim();
  const words = text.split(" ").filter(Boolean);
  const sentences = text.split(/(?<=[.!?])\s+/).filter((line) => line.length > 30);
  const key = sentences.slice(0, 3).join(" ");
  const headings = (file.text.match(/^#{1,3}\s+(.+)$/gm) || []).slice(0, 5).map((line) => line.replace(/^#+\s+/, ""));
  return {
    name: file.name,
    words: words.length,
    excerpt: key.length > 420 ? `${key.slice(0, 420)}…` : key,
    headings,
    question: prompt
  };
}

function replyGreeting(prompt, model, style) {
  const name = prompt.match(/\b(i'?m|my name is|call me)\s+([A-Z][a-z]+)/i);
  const who = name ? name[2] : "";
  const content = [
    who ? `Hello, ${who}.` : "Hello.",
    "I am Alcove: a workspace for thinking in threads, with projects that keep their own context. Ask me to explain something, draft something, or build a small page and I will show it in the artifact panel.",
    "A good first move: paste the messy version of what you are working on. We can shape it from there."
  ].join("\n\n");
  return { content };
}

function replyArtifact(prompt, model, style, previous) {
  const artifact = buildArtifact(prompt, previous);
  const kindLine =
    artifact.kind === "html"
      ? "It is a single self-contained HTML file: inline CSS, no network requests, and it runs inside a sandboxed frame that cannot read your session."
      : artifact.kind === "svg"
        ? "It is a clean SVG: one shape, two colours, no text baked into the artwork, so it holds up at 16px and at 1024px."
        : "It is plain markdown, so it stays useful after it leaves this app.";
  const content = [
    previous
      ? "I revised the same artifact rather than starting a new one."
      : artifact.kind === "svg"
        ? "Here is a first pass at the mark."
        : artifact.kind === "markdown"
          ? "Here is a first pass at the brief."
          : "Here is a first pass at the page.",
    kindLine,
    "### What I chose",
    "- One clear job per screen, and the primary action stated once.",
    "- Type and spacing from a small scale, so the layout survives a narrow screen.",
    "- Your accent colour carried through a single token rather than sprinkled on components.",
    "Open **Preview** to try it, then switch to **Code** if you want to change it by hand. Tell me what to adjust — colour, density, the second section — and I will revise the same artifact."
  ].join("\n\n");
  return { content, artifacts: [artifact] };
}

function replyDebug(prompt, model, style) {
  const content = [
    "Let us make the failure small instead of guessing.",
    "### 1. Make the failure small",
    "Reproduce it with the least code that still fails. If you cannot, the bug lives in the part you removed, which is information too.",
    "### 2. Write down the expected and the actual",
    "Exact values, not “does not work”. The gap between them usually names the layer: parse, state, render, or permission.",
    "### 3. Check the boundary first",
    "Most of the time the value is fine until it crosses a boundary — a serialisation step, a different timezone, a second tab, an expired session. Log once on each side of that line.",
    "### 4. Keep the test",
    "When it passes, keep the reproduction as a test. A fix without a test is a rumour.",
    "If you paste the error text and the smallest input that triggers it, I will take the next step with you."
  ].join("\n\n");
  return { content };
}

function replyExplain(prompt, model, style) {
  const content = [
    "The useful way to hold this is to separate the *mechanism* from the *interface*.",
    "### The mechanism",
    "Something changes state, something else observes that change, and a rule decides what happens next. Every description that skips one of those three is a description of the interface, not the thing.",
    "### A worked comparison",
    "Think of a library hold desk. The catalogue records *what exists*; the hold list records *who is waiting*; the desk only decides *who gets the copy next*. Merge the last two and you cannot answer “how long is the queue” without opening every book.",
    "### Where people get stuck",
    "- Naming the parts after their current implementation instead of their job.",
    "- Letting two places own the same fact, then choosing a winner at read time.",
    "- Treating an error state as an edge case; it is a state with the same standing as the happy one.",
    "If you tell me the specific system you are looking at, I will redo this with its nouns instead of the analogy."
  ].join("\n\n");
  return { content };
}

function replyWrite(prompt, model, style) {
  const content = [
    "Draft first, polish second. Here is the shape I would use.",
    "> The short version goes here: one sentence that states the request, one sentence that states what you will do, and a line that makes replying easy.",
    "### Why this shape",
    "- The first line is the whole ask, so it survives being skimmed on a phone.",
    "- The middle is a decision, not a history of the decision.",
    "- The close names the next action, so silence is not ambiguous.",
    "### What I would cut",
    "Openers that describe the email (“I am writing to…”), two adjectives where one is doing the work, and any sentence that only protects the writer.",
    "Give me the audience and the outcome you want, and I will write the full draft in their register rather than mine."
  ].join("\n\n");
  return { content };
}

function replyPlan(prompt, model, style) {
  const content = [
    "A plan sized to a week rather than a quarter.",
    "### The shape",
    "1. **Name the finish line.** One sentence, checkable by someone else.",
    "2. **Pick the thinnest slice.** The smallest end-to-end version that a real person can use badly.",
    "3. **List the unknowns, not the tasks.** Tasks are easy to write and easy to fake progress on.",
    "4. **Put the risky one first.** If it fails, you want the week back, not the last hour.",
    "### The week",
    "- **Mon:** thin slice working end to end, ugly allowed.",
    "- **Tue–Wed:** the unknown with the worst failure mode.",
    "- **Thu:** the second user's data, because one user hides every scoping bug.",
    "- **Fri:** cut one thing, then show it to someone who did not build it.",
    "### What I would not do",
    "No parallel tracks before the slice works. No design polish on a screen that might not survive Wednesday.",
    "Tell me the constraint — time, people, or a fixed date — and I will re-cut the week to fit it."
  ].join("\n\n");
  return { content };
}

function replyFile(file, prompt, model, style) {
  const headings = file.headings.length ? `\n\nIt has ${file.headings.length} section${file.headings.length === 1 ? "" : "s"}: ${file.headings.slice(0, 4).join(", ")}.` : "";
  const content = [
    `I read **${file.name}** — about ${file.words.toLocaleString()} words.${headings}`,
    `The most load-bearing passage for your question (${topicOf(prompt)}) is:`,
    `> ${file.excerpt || "The file is mostly short lines, so there is no single passage that carries the argument."}`,
    "### What I would do with it",
    "- **Keep:** the part that states a decision. That is the spine.",
    "- **Move up:** anything that explains *why* before the reader hits the detail.",
    "- **Cut:** restatements of the heading. A section that begins by naming itself is using its first sentence for furniture.",
    "If you want, I can turn this into a one-page brief artifact, or answer against one specific section. Which section matters most?"
  ].join("\n\n");
  return { content };
}

function replyProject(project, prompt, model, style) {
  const docs = project.docs || [];
  const docLine = docs.length
    ? `I have ${docs.length} knowledge file${docs.length === 1 ? "" : "s"} in **${project.name}**: ${docs.map((doc) => doc.name).slice(0, 4).join(", ")}.`
    : `**${project.name}** has no knowledge files yet, so I am working from the project instructions only.`;
  const content = [
    `Working inside **${project.name}**.`,
    docLine,
    project.instructions
      ? `Your project instructions are in force for this whole thread, and they win over the account-wide ones when the two disagree.`
      : `There are no project instructions yet. They are worth writing once: the shape of the answer, the audience, and the things you never want suggested.`,
    "### One caution about project context",
    "More knowledge is not automatically better context. If the files are large, name the section you want me to reason from — otherwise the useful line and the boilerplate compete for the same attention.",
    "Ask against a named file or section and I will stay inside it."
  ].join("\n\n");
  return { content };
}

function replyDefault(prompt, model, style) {
  const content = [
    "Here is how I would take that on.",
    "### First, the frame",
    "Decide what “done” looks like before adding anything. A sentence you could show someone else is enough; a mood board is not.",
    "### Then the work",
    "- Start with the version that is small enough to finish this week.",
    "- Keep one source of truth for each fact, even if it is a plain file.",
    "- Write down the assumption you are least sure of, and the cheapest way to test it.",
    "### What usually goes wrong",
    "The plan grows because the first version was never actually finished. Finishing something narrow is what buys the right to widen it.",
    "I can take any of those three further — the frame, the first version, or the assumption worth testing. Which one is blocking you?"
  ].join("\n\n");
  return { content };
}

function shapeForStyle(content, style, model) {
  if (style.id === "concise") {
    const kept = content.split("\n\n").filter((block) => !block.startsWith("###")).slice(0, 4);
    return kept.join("\n\n");
  }
  if (style.id === "formal") {
    return content
      .replace(/\bdon't\b/gi, "do not")
      .replace(/\bcan't\b/gi, "cannot")
      .replace(/\bwon't\b/gi, "will not")
      .replace(/\bI'll\b/g, "I will")
      .replace(/!+/g, ".");
  }
  if (style.id === "learning" && !/question/i.test(content)) {
    return `${content}\n\nBefore I go further: which part of this is already clear to you, and which part would you like to test first?`;
  }
  if (style.id === "explanatory") {
    return `${content}\n\n### The underlying idea\nEvery version of this is a trade between how much you decide now and how much you leave open. Early decisions are cheap to make and expensive to reverse; late ones are the opposite.`;
  }
  if (model.id === "haiku" && content.length > 900) {
    return content.split("\n\n").slice(0, 5).join("\n\n");
  }
  return content;
}

/* ------------------------------------------------------------------ reply */

export function generateReply({ prompt, attachments = [], model = "sonnet", style = "normal", thinking = false, project = null, customStyles = [], previousArtifact = null }) {
  if (/\b(simulate|trigger|raise)\s+(an?\s+)?error\b/i.test(prompt) || /__error__/.test(prompt)) {
    throw new ScriptedError("The connection dropped before the reply finished.");
  }

  const modelInfo = modelById(model);
  const styleInfo = styleById(style, customStyles);
  const seed = seedOf(prompt);
  const lower = prompt.toLowerCase();
  const file = readAttachment(attachments, prompt);

  let result;
  if (/^(hi|hey|hello|yo|good (morning|afternoon|evening))\b[!. ]*$/i.test(prompt.trim())) {
    result = replyGreeting(prompt, modelInfo, styleInfo);
  } else if (attachments.length && /\b(this|the|my)\b.*\b(file|doc|document|attachment|notes|pdf|csv)\b|\bsummari[sz]e\b|\bread\b/i.test(prompt) && file) {
    result = replyFile(file, prompt, modelInfo, styleInfo);
  } else if (wantsArtifact(prompt) || (previousArtifact && /\b(change|update|revise|adjust|instead|add|remove|darker|lighter|bigger|smaller|blue|green|purple|orange|red|dark)\b/i.test(prompt))) {
    result = replyArtifact(prompt, modelInfo, styleInfo, previousArtifact);
  } else if (/\b(error|bug|broken|not working|fails?|failing|exception|traceback|debug|crash)\b/i.test(lower)) {
    result = replyDebug(prompt, modelInfo, styleInfo);
  } else if (/\b(explain|what is|what's|how does|how do|why does|difference between|teach|understand)\b/i.test(lower)) {
    result = replyExplain(prompt, modelInfo, styleInfo);
  } else if (/\b(write|draft|email|message|copy|post|letter|announcement)\b/i.test(lower)) {
    result = replyWrite(prompt, modelInfo, styleInfo);
  } else if (/\b(plan|roadmap|steps|checklist|strategy|outline|schedule|week)\b/i.test(lower)) {
    result = replyPlan(prompt, modelInfo, styleInfo);
  } else if (project && project.docs && project.docs.length && /\b(project|know|context|file|notes|according|based on)\b/i.test(lower)) {
    result = replyProject(project, prompt, modelInfo, styleInfo);
  } else if (project && /\b(project|where|context)\b/i.test(lower)) {
    result = replyProject(project, prompt, modelInfo, styleInfo);
  } else {
    result = replyDefault(prompt, modelInfo, styleInfo);
    result.content = `${pick(
      [
        "There are two ways to read that, and the useful one depends on what you want next.",
        "Short answer first, then the part that is easy to get wrong.",
        "I would resist the tidy version of this. The messy version is where the decision is."
      ],
      seed
    )}\n\n${result.content}`;
  }

  let content = result.content;
  if (modelInfo.id === "opus") {
    content += `\n\n### One more consideration\nThe version above optimises for {clarity, speed of change}. If {reversal cost} matters more, invert the order: build the throwaway first, then decide.`;
  }
  content = shapeForStyle(content, styleInfo, modelInfo).trim();

  const prettyModel = modelInfo.name;
  const header = styleInfo.id === "normal" ? "" : `_${styleInfo.name} · ${prettyModel}_\n\n`;
  content = `${header}${content}`;

  const trace = thinking || modelInfo.id === "opus" ? thinkingTrace(prompt, modelInfo, styleInfo) : "";
  return { content, thinking: trace, artifacts: result.artifacts || [] };
}

/* --------------------------------------------------------------- streaming */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function streamReply({ reply, onThinking, onText, onDone, signal, speed = 1 }) {
  const tokens = reply.content.match(/\S+\s*/g) || [reply.content];
  let built = "";
  let trace = "";

  if (reply.thinking) {
    const chunks = reply.thinking.match(/\S+\s*/g) || [reply.thinking];
    for (const chunk of chunks) {
      if (signal && signal.aborted) break;
      trace += chunk;
      if (onThinking) onThinking(trace);
      await sleep(14 / speed);
    }
  }

  for (const token of tokens) {
    if (signal && signal.aborted) break;
    built += token;
    if (onText) onText(built);
    // Longer words take slightly longer, punctuation adds a beat.
    const delay = (18 + Math.min(28, token.length * 2)) / speed + (/[.!?:]\s*$/.test(token) ? 55 / speed : 0);
    await sleep(delay);
  }

  if (onDone) onDone(built);
  return built;
}

export function titleFromPrompt(prompt) {
  const clean = prompt.replace(/\s+/g, " ").replace(/^\W+/, "").trim();
  if (!clean) return "New chat";
  const words = clean.split(" ").slice(0, 8).join(" ");
  return words.length > 58 ? `${words.slice(0, 58)}…` : words;
}
