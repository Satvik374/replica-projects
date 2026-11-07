/* Marlowe — interface study.
   The transport is real; the replies are scripted. No network calls, no model. */

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  const el = (tag, props = {}, kids = []) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const kid of [].concat(kids)) if (kid) node.append(kid);
    return node;
  };

  const icon = (name, cls) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (cls) svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.append(use);
    return svg;
  };

  /* ------------------------------------------------------------- elements */

  const app = $("#app");
  const viewport = $("#viewport");
  const hero = $("#hero");
  const thread = $("#thread");
  const dock = $(".dock");
  const composerSlot = $("#composerSlot");
  const composer = $("#composer");
  const input = $("#prompt");
  const sendBtn = $("#send");
  const chips = $("#chips");
  const voiceBtn = $(".composer__voice");
  const status = $("#status");
  const scrim = $("#scrim");
  const collapseBtn = $("#collapse");
  const openBtn = $("#openSidebar");

  /* ---------------------------------------------------------------- state */

  const state = {
    messages: [],
    busy: false,
    timer: null,
    box: null,
    text: "",
    sidebar: localStorage.getItem("marlowe.sidebar") === "collapsed"
  };

  /* -------------------------------------------------------------- helpers */

  let statusTimer = null;
  const toast = (text) => {
    status.textContent = text;
    status.classList.add("is-visible");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => status.classList.remove("is-visible"), 2400);
  };

  const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

  const atBottom = () =>
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120;

  const scrollToEnd = (force = false) => {
    if (!force && !atBottom()) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  };

  /* ------------------------------------------------------------ markdown */

  const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

  function renderInline(text, parent) {
    for (const part of text.split(INLINE)) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**")) {
        parent.append(el("strong", { text: part.slice(2, -2) }));
      } else if (part.startsWith("`") && part.endsWith("`")) {
        parent.append(el("code", { text: part.slice(1, -1) }));
      } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        parent.append(el("em", { text: part.slice(1, -1) }));
      } else {
        parent.append(document.createTextNode(part));
      }
    }
  }

  function renderMarkdown(source, target) {
    target.replaceChildren();
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trimStart().startsWith("```")) {
        const lang = line.trim().slice(3).trim();
        const body = [];
        i += 1;
        while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
          body.push(lines[i]);
          i += 1;
        }
        i += 1;
        const code = el("code", { text: body.join("\n") });
        if (lang) code.dataset.lang = lang;
        const pre = el("pre", {}, [code]);
        target.append(pre);
        continue;
      }

      if (!line.trim()) { i += 1; continue; }

      if (/^\s*[-*]\s+/.test(line)) {
        const list = el("ul");
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
          const item = el("li");
          renderInline(lines[i].replace(/^\s*[-*]\s+/, ""), item);
          list.append(item);
          i += 1;
        }
        target.append(list);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const list = el("ol");
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          const item = el("li");
          renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""), item);
          list.append(item);
          i += 1;
        }
        target.append(list);
        continue;
      }

      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]) && !lines[i].trimStart().startsWith("```")) {
        para.push(lines[i].trim());
        i += 1;
      }
      const p = el("p");
      para.forEach((chunk, index) => {
        if (index) p.append(document.createTextNode(" "));
        renderInline(chunk, p);
      });
      target.append(p);
    }
  }

  /* --------------------------------------------------------- reply engine */

  const SCRIPTS = [
    {
      test: /^(hi|hey|hello|yo|good (morning|evening|afternoon))\b/i,
      reply: "Hello. Pick a direction and I'll take it from there — a question, a draft, or a half-formed idea you want help shaping."
    },
    {
      test: /(what can you (do|help)|what are you good at|your capabilities)/i,
      reply: [
        "I work in text only, which covers more than it sounds:",
        "",
        "- **Explain** something dense in plain language",
        "- **Draft** a message, a doc, or an outline you can react to",
        "- **Debug** a snippet and say why it fails",
        "- **Compare** options against constraints you name",
        "",
        "Ask for one of those and paste the context you already have — the answer gets useful in proportion to that."
      ].join("\n")
    },
    {
      test: /design token/i,
      reply: [
        "A design token is a named value — a colour, size, space or radius — declared once and referenced everywhere, so one edit lands on every surface at the same time.",
        "",
        "In practice it's `--bubble-radius: 22px` used by components instead of `border-radius` scattered through a stylesheet. The name states intent, the value stays swappable, and a dark theme becomes a block of new values rather than a second stylesheet."
      ].join("\n")
    },
    {
      test: /(javascript|typescript|python|code|function|regex|debug|refactor)/i,
      reply: [
        "Here's a helper I reach for constantly:",
        "",
        "```js",
        "function debounce(fn, wait = 200) {",
        "  let timer;",
        "  return (...args) => {",
        "    clearTimeout(timer);",
        "    timer = setTimeout(() => fn(...args), wait);",
        "  };",
        "}",
        "```",
        "",
        "Two details that matter: the timer is closed over per returned function, so two debounced handlers never cancel each other, and the arguments come from the **last** call rather than the first."
      ].join("\n")
    },
    {
      test: /(how do i|how to|steps|plan|process|approach)/i,
      reply: [
        "The order I'd work in:",
        "",
        "1. **Write down the constraint you cannot move** — a date, a budget, a hard requirement.",
        "2. **Sketch the smallest version** that satisfies it and skip polish entirely.",
        "3. **Test it against an awkward real case**, not a friendly one.",
        "4. **Cut whatever didn't earn its place**, then repeat once.",
        "",
        "Most of the value sits in step 3. Step 2 is where most people stop."
      ].join("\n")
    },
    {
      test: /^(thanks|thank you|cheers|nice|great)\b/i,
      reply: "Anytime. If you want to keep going, paste what you have and I'll work from that."
    },
    {
      test: /(who are you|are you (chatgpt|gpt|openai|real)|what model)/i,
      reply: "I'm Marlowe — a scripted demo standing in for an assistant. The interface is real, including the streaming; the replies are canned, so treat this as a tour rather than an answer."
    },
    {
      test: /(error|fail|broken|crash)/i,
      error: true
    }
  ];

  const tidy = (text) => text.replace(/`/g, "").replace(/\s+/g, " ").trim().slice(0, 96);

  function composeReply(prompt) {
    const match = SCRIPTS.find((s) => s.test.test(prompt));
    if (match) return match;
    if (prompt.length > 600) {
      return {
        reply: [
          "That's a lot to hold at once, so I'll split it.",
          "",
          "- **What's decided** — keep it, it's context.",
          "- **What's still open** — that's the work.",
          "- **What you're assuming** — say it out loud and half of it collapses.",
          "",
          "Point me at the part you're least sure about and I'll start there."
        ].join("\n")
      };
    }
    const topic = tidy(prompt) || "this";
    return {
      reply: [
        `Here's how I'd approach **${topic}**:`,
        "",
        "- **Frame it** — decide what a good answer would let you do, then work backwards.",
        "- **Collect the constraints** — limits usually pick the option for you.",
        "- **Draft something imperfect** — a rough version surfaces the real questions faster than planning does.",
        "- **Check the awkward case** — that's where the gaps hide.",
        "",
        "Tell me what you've already tried and I'll get more specific."
      ].join("\n")
    };
  }

  /* -------------------------------------------------------------- render */

  function syncStage() {
    const inConversation = state.messages.length > 0;
    viewport.classList.toggle("is-conversation", inConversation);
    hero.hidden = inConversation;
    thread.hidden = !inConversation;
    if (inConversation) dock.insertBefore(composerSlot, dock.firstChild);
    else viewport.insertBefore(composerSlot, thread);
  }

  function showHome() {
    thread.replaceChildren();
    syncStage();
  }

  function addUserMessage(text) {
    const bubble = el("div", { class: "bubble", text });
    const node = el("div", { class: "msg msg--user" }, [bubble]);
    thread.append(node);
    state.messages.push({ role: "user", text });
    syncStage();
    scrollToEnd(true);
    return node;
  }

  function assistantShell() {
    const prose = el("div", { class: "prose" });
    const actions = el("div", { class: "msg__actions" });
    const node = el("div", { class: "msg msg--assistant" }, [prose, actions]);
    thread.append(node);
    return { node, prose, actions };
  }

  function actionButton(name, label, handler) {
    const button = el("button", {
      class: "iconbtn iconbtn--sm",
      type: "button",
      "aria-label": label,
      title: label
    }, [icon(name)]);
    button.addEventListener("click", handler);
    return button;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through to the keyboard-free path below */
      }
    }
    try {
      const scratch = el("textarea", { class: "sr-only", readonly: "" });
      scratch.value = text;
      document.body.append(scratch);
      scratch.select();
      const ok = document.execCommand("copy");
      scratch.remove();
      return ok;
    } catch {
      return false;
    }
  }

  // A stop can land mid-token, leaving an unclosed `**` or fence on screen.
  const trimDangling = (text) => {
    let cut = text;
    if ((cut.match(/```/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf("```"));
    if ((cut.match(/\*\*/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf("**"));
    if ((cut.match(/`/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf("`"));
    return cut.trimEnd();
  };

  function attachActions(actions, text, node) {
    actions.replaceChildren();
    const copy = actionButton("copy", "Copy reply", async () => {
      if (await copyText(text)) {
        copy.dataset.copied = "true";
        toast("Copied to clipboard");
        setTimeout(() => delete copy.dataset.copied, 1600);
      } else {
        toast("Copy failed — select the text instead");
      }
    });
    const again = actionButton("reload", "Regenerate reply", () => regenerateFrom(node));
    actions.append(copy, again);
  }

  const typingDots = () => el("div", { class: "typing" }, [el("span"), el("span"), el("span")]);

  // OpenRouter
  let orKey = localStorage.getItem("marloweOrKey");

  async function orChat(prompt) {
  if (!orKey) return null;
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + orKey,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-OpenRouter-Title": "Marlowe"
      },
      body: JSON.stringify({
        model: "openrouter/free",
        input: prompt,
        stream: false
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      // 429 = rate limited; fall through to scripted
      if (resp.status === 429) return {fallback: true};
      throw new Error((data && data.error) || "OpenRouter error");
    }
    // data.output is array; find the assistant message text
    const message = [...data.output].reverse().find((item) => item.type === "message");
    const text = message && message.content
      ? message.content.find((part) => part.type === "output_text")?.text
      : null;
    if (!text) return {fallback: true};
    return {reply: text, model: data.model};
  } catch (e) {
    // network / auth error = fall through
    return {fallback: true};
  }
}

function errorCard(prompt, container) {
    const retry = el("button", {
      class: "btn btn--outline btn--sm",
      type: "button",
      onclick: () => {
        container.remove();
        startReply(prompt);
      }
    }, ["Try again"]);
    container.append(
      el("p", { class: "error__title", text: "Something interrupted that reply" }),
      el("p", { class: "error__body", text: "The demo fails on purpose when a message contains \u201cerror\u201d so you can see this state. Nothing was lost." }),
      retry
    );
  }

  /* ------------------------------------------------------------- playback */

  function endTurn() {
    state.busy = false;
    state.timer = null;
    state.box = null;
    state.text = "";
    updateComposer();
  }

  function finalize(box, text, { partial = false } = {}) {
    const body = partial ? trimDangling(text) : text;
    renderMarkdown(body, box.prose);
    attachActions(box.actions, body, box.node);
    state.messages.push({ role: "assistant", text: body });
  }

  function stopStreaming({ silent = false } = {}) {
    if (!state.busy) return;
    clearTimeout(state.timer);
    clearInterval(state.timer);
    const box = state.box;
    const text = state.text;
    endTurn();
    if (!box) return;
    if (text.trim()) finalize(box, text, { partial: true });
    else box.node.remove();
    if (!silent) {
      toast("Reply stopped");
      input.focus();
    }
  }

  function stream(text, box) {
    const tokens = text.split(/(\s+)/);
    let cursor = 0;

    state.timer = setInterval(() => {
      cursor += 2;
      const shown = tokens.slice(0, cursor).join("");
      state.text = shown;
      renderMarkdown(trimDangling(shown), box.prose);
      scrollToEnd();

      if (cursor >= tokens.length) {
        clearInterval(state.timer);
        finalize(box, text);
        endTurn();
        input.focus();
      }
    }, 18);
  }

  function startReply(prompt) {
    if (state.busy) return;
    const script = composeReply(prompt);
    const box = assistantShell();
    box.prose.append(typingDots());

    state.busy = true;
    state.box = box;
    state.text = "";
    updateComposer();
    scrollToEnd();

    state.timer = setTimeout(() => {
      if (!box.node.isConnected) { endTurn(); return; }
      if (script.error) {
        box.prose.replaceChildren();
        const card = el("div", { class: "error" });
        errorCard(prompt, card);
        box.prose.append(card);
        endTurn();
        return;
      }
      stream(script.reply, box);
    }, script.error ? 900 : 460);
  }

  /* ---------------------------------------------------------------- send */

  function submit() {
    const text = input.value.trim();
    if (!text || state.busy) return;
    addUserMessage(text);
    input.value = "";
    autoGrow();
    updateComposer();
    startReply(text);
    input.focus();
  }

  function regenerateFrom(node) {
    if (state.busy || !node) return;
    const assistants = [...thread.querySelectorAll(".msg--assistant")];
    const nth = assistants.indexOf(node);
    if (nth < 0) return;

    let seen = -1;
    let target = -1;
    state.messages.forEach((message, index) => {
      if (message.role !== "assistant" || target !== -1) return;
      seen += 1;
      if (seen === nth) target = index;
    });
    if (target < 0) return;

    let promptIndex = target - 1;
    while (promptIndex >= 0 && state.messages[promptIndex].role !== "user") promptIndex -= 1;
    if (promptIndex < 0) return;

    const prompt = state.messages[promptIndex].text;
    state.messages = state.messages.slice(0, target);
    while (node.nextSibling) node.nextSibling.remove();
    node.remove();
    startReply(prompt);
  }

  /* ------------------------------------------------------------ composer */

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
  }

  function updateComposer() {
    const hasText = input.value.trim().length > 0;
    const inConversation = state.messages.length > 0;

    sendBtn.disabled = !state.busy && !hasText;
    sendBtn.classList.toggle("is-stop", state.busy);
    sendBtn.setAttribute("aria-label", state.busy ? "Stop generating" : "Send message");
    sendBtn.replaceChildren(icon(state.busy ? "stop" : "arrow-up"));

    voiceBtn.hidden = state.busy || hasText || inConversation;
    sendBtn.hidden = !state.busy && !hasText && !inConversation;
    chips.hidden = inConversation || state.busy;
  }

  /* ------------------------------------------------------------- sidebar */

  function applySidebar() {
    const collapsed = state.sidebar && !isMobile();
    app.classList.toggle("is-collapsed", collapsed);
    collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    collapseBtn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    openBtn.setAttribute("aria-label", isMobile() ? "Open sidebar" : "Expand sidebar");
  }

  function setDrawer(open) {
    app.classList.toggle("is-drawer-open", open);
    scrim.hidden = !open;
    openBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      const first = $(".nav__row", app);
      if (first) first.focus();
    }
  }

  collapseBtn.addEventListener("click", () => {
    if (isMobile()) { setDrawer(false); input.focus(); return; }
    state.sidebar = true;
    localStorage.setItem("marlowe.sidebar", "collapsed");
    applySidebar();
    openBtn.focus();
  });

  openBtn.addEventListener("click", () => {
    if (isMobile()) { setDrawer(!app.classList.contains("is-drawer-open")); return; }
    state.sidebar = false;
    localStorage.setItem("marlowe.sidebar", "open");
    applySidebar();
    input.focus();
  });

  scrim.addEventListener("click", () => { setDrawer(false); input.focus(); });

  /* -------------------------------------------------------------- events */

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.busy) { stopStreaming(); return; }
    submit();
  });

  input.addEventListener("input", () => {
    autoGrow();
    updateComposer();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (state.busy) return;
      submit();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && app.classList.contains("is-drawer-open")) {
      setDrawer(false);
      input.focus();
    }
  });

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action='new']");
    if (action) {
      event.preventDefault();
      if (state.busy) stopStreaming({ silent: true });
      state.messages = [];
      showHome();
      updateComposer();
      input.value = "";
      autoGrow();
      input.focus();
      return;
    }
    const prompt = event.target.closest("[data-prompt]");
    if (prompt) {
      if (state.busy) return;
      input.value = prompt.dataset.prompt;
      autoGrow();
      updateComposer();
      submit();
      return;
    }
    const note = event.target.closest("[data-toast]");
    if (note) toast(note.dataset.toast);
  });

  window.addEventListener("resize", () => {
    applySidebar();
    if (!isMobile()) setDrawer(false);
  });

  /* ----------------------------------------------------------------- boot */

  applySidebar();
  syncStage();
  updateComposer();
  autoGrow();
  input.focus();
  scrollToEnd(true);
})();
