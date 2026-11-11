/* Alcove — the client app.
   One module, no framework. State lives in `state`; every render reads from it.
   Signed-in features (chats, projects, knowledge, sharing, settings) go through
   the Worker; nothing here trusts a client-side id. */

import { api, downloadFile, ApiError } from "./api.js";
import {
  $, $$, el, icon, mark, escapeHtml, initials, formatBytes, relativeTime, dateGroup,
  greeting, resetCountdown, toast, openDialog, closeDialog, confirmAction, copyText,
  debounce, closeAllMenus
} from "./ui.js";
import { renderMarkdown } from "./markdown.js";
import {
  MODELS, BUILTIN_STYLES, modelById, styleById, generateReply, streamReply,
  titleFromPrompt, ScriptedError
} from "./engine.js";

const PREFS_KEY = "alcove.prefs";
const SIDEBAR_KEY = "alcove.sidebar";
const DEFAULTS = {
  theme: "system",
  fontSize: "md",
  motion: "auto",
  suggestions: true,
  model: "sonnet",
  styleId: "normal",
  thinking: false,
  instructions: ""
};

const state = {
  user: null,
  prefs: readLocalPrefs(),
  chats: [],
  projects: [],
  styles: [],
  usage: null,
  chat: null,
  messages: [],
  project: null,
  attachments: [],
  incognito: false,
  stream: null,
  artifact: null,
  route: { name: "home", id: null, token: null },
  loading: false,
  authMode: "signin",
  paletteMode: "search",
  moveChatId: null
};

const dom = {
  app: $("#app"),
  sidebar: $("#sidebar"),
  history: $("#history"),
  view: $("#view"),
  composerDock: $("#composerDock"),
  composer: $("#composer"),
  prompt: $("#prompt"),
  sendBtn: $("#sendBtn"),
  sendIcon: $("#sendIcon"),
  attachmentChips: $("#attachmentChips"),
  fileInput: $("#fileInput"),
  topbar: $("#topbar"),
  title: $("#chatTitle"),
  topbarProject: $("#topbarProject"),
  topbarIncognito: $("#topbarIncognito"),
  shareBtn: $("#shareBtn"),
  chatMenuBtn: $("#chatMenuBtn"),
  chatMenu: $("#chatMenu"),
  artifactPanel: $("#artifactPanel")
};

/* ---------------------------------------------------------------- helpers */

function readLocalPrefs() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeLocalPrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
  } catch {
    /* private mode: prefs still apply for this page */
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function applyPrefs() {
  const dark = state.prefs.theme === "dark" || (state.prefs.theme === "system" && systemDark());
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.size = state.prefs.fontSize || "md";
  if (state.prefs.motion === "reduce") document.documentElement.dataset.motion = "reduce";
  else delete document.documentElement.dataset.motion;
  document.documentElement.dataset.chips = state.prefs.suggestions ? "on" : "off";
  syncSettingsUI();
}

function syncSettingsUI() {
  const theme = $(`input[name="theme"][value="${state.prefs.theme}"]`);
  if (theme) theme.checked = true;
  const size = $(`input[name="fontSize"][value="${state.prefs.fontSize}"]`);
  if (size) size.checked = true;
  const motion = $("#setMotion");
  if (motion) motion.setAttribute("aria-checked", String(state.prefs.motion === "reduce"));
  const suggestions = $("#setSuggestions");
  if (suggestions) suggestions.setAttribute("aria-checked", String(Boolean(state.prefs.suggestions)));
  const thinking = $("#thinkingBtn");
  if (thinking) thinking.setAttribute("aria-pressed", String(Boolean(state.prefs.thinking)));
  renderModelButton();
  renderStyleButton();
  const instructions = $("#accountInstructions");
  if (instructions && document.activeElement !== instructions) instructions.value = state.prefs.instructions || "";
}

let prefsTimer = null;
function changePrefs(patch, { quiet = false } = {}) {
  state.prefs = { ...state.prefs, ...patch };
  writeLocalPrefs();
  applyPrefs();
  if (state.chat && !state.incognito) {
    const fields = {};
    if (patch.model !== undefined) fields.model = patch.model;
    if (patch.styleId !== undefined) fields.styleId = patch.styleId;
    if (patch.thinking !== undefined) fields.thinking = patch.thinking;
    if (Object.keys(fields).length) {
      api(`/api/chats/${state.chat.id}`, { method: "PATCH", body: fields }).catch(() => {});
    }
  }
  if (!state.user) {
    if (!quiet) toast("Saved on this device");
    return;
  }
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(async () => {
    try {
      const { settings } = await api("/api/settings", { method: "PUT", body: state.prefs });
      state.prefs = { ...state.prefs, ...settings };
      writeLocalPrefs();
    } catch {
      if (!quiet) toast("Could not sync your settings");
    }
  }, 400);
}

async function adoptServerPrefs() {
  try {
    const { settings } = await api("/api/settings");
    if (!settings) return;
    const serverIsDefault = Object.keys(DEFAULTS).every((key) => settings[key] === DEFAULTS[key]);
    const localIsChanged = Object.keys(DEFAULTS).some((key) => state.prefs[key] !== DEFAULTS[key]);
    if (serverIsDefault && localIsChanged) {
      await api("/api/settings", { method: "PUT", body: state.prefs });
      return;
    }
    state.prefs = { ...state.prefs, ...settings };
    writeLocalPrefs();
    applyPrefs();
  } catch {
    /* offline: local prefs stay */
  }
}

function chatTitleOf(chat) {
  return chat && chat.title ? chat.title : state.incognito ? "Incognito chat" : "New chat";
}

function upsertChat(chat) {
  if (!chat) return;
  const index = state.chats.findIndex((item) => item.id === chat.id);
  if (index >= 0) state.chats[index] = { ...state.chats[index], ...chat };
  else state.chats.unshift(chat);
  state.chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  renderSidebar();
}

function removeChatFromList(id) {
  state.chats = state.chats.filter((chat) => chat.id !== id);
  renderSidebar();
}

function ensureSignedIn() {
  if (state.user) return true;
  openAuth("signin");
  return false;
}

function setBusy(busy) {
  dom.composer.setAttribute("aria-busy", busy ? "true" : "false");
}

function resizePrompt() {
  dom.prompt.style.height = "auto";
  const wanted = dom.prompt.scrollHeight;
  dom.prompt.style.height = `${Math.min(200, wanted)}px`;
  dom.prompt.style.overflowY = wanted > 200 ? "auto" : "hidden";
}

function renderModelButton() {
  const label = $("#modelLabel");
  if (label) label.textContent = modelById(state.prefs.model).name;
}

function renderStyleButton() {
  const label = $("#styleLabel");
  if (label) label.textContent = styleById(state.prefs.styleId, state.styles).name;
}

function allStyles() {
  return [...BUILTIN_STYLES, ...state.styles.map((style) => ({
    id: style.id,
    name: style.name,
    description: style.description,
    instructions: style.instructions,
    custom: true
  }))];
}

/* ---------------------------------------------------------------- routing */

function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  renderRoute();
}

function parseRoute() {
  const path = location.pathname;
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/projects") return { name: "projects" };
  const share = path.match(/^\/s\/([a-f0-9]{24,64})$/);
  if (share) return { name: "share", token: share[1] };
  const project = path.match(/^\/project\/([a-zA-Z0-9-]{8,64})$/);
  if (project) return { name: "project", id: project[1] };
  const chat = path.match(/^\/chat\/([a-zA-Z0-9-]{8,64})$/);
  if (chat) return { name: "chat", id: chat[1] };
  return { name: "home" };
}

async function renderRoute() {
  if (state.stream) {
    state.stream.stopped = true;
    state.stream.controller.abort();
  }
  state.route = parseRoute();
  closeArtifact({ silent: true });
  closeAllMenus();

  if (state.route.name === "share") {
    renderShell({ sidebar: false, composer: false, topbar: false });
    await renderSharePage(state.route.token);
    return;
  }

  if (state.route.name === "projects") {
    leaveIncognito({ silent: true });
    renderShell({ sidebar: true, composer: false, topbar: true });
    setTopbar("Projects", { project: false, chat: false });
    await renderProjectsPage();
    return;
  }

  if (state.route.name === "project") {
    leaveIncognito({ silent: true });
    renderShell({ sidebar: true, composer: true, topbar: true });
    await renderProjectPage(state.route.id);
    return;
  }

  if (state.route.name === "chat") {
    if (state.incognito) state.incognito = false;
    renderShell({ sidebar: true, composer: true, topbar: true });
    await renderChatPage(state.route.id);
    return;
  }

  renderShell({ sidebar: true, composer: true, topbar: true });
  renderHome();
}

function renderShell({ sidebar, composer, topbar }) {
  dom.sidebar.hidden = !sidebar;
  dom.topbar.hidden = !topbar;
  dom.composerDock.hidden = !composer;
  dom.app.classList.toggle("is-share", !sidebar);
  if (!sidebar) {
    state.project = null;
    state.chat = null;
  }
}

function setTopbar(title, { project = null, chat = true } = {}) {
  dom.title.textContent = title;
  dom.title.hidden = false;
  dom.topbarProject.hidden = !project;
  if (project) {
    dom.topbarProject.textContent = project.name;
    dom.topbarProject.title = `Project: ${project.name}`;
  }
  dom.topbarIncognito.hidden = !state.incognito;
  dom.shareBtn.hidden = !chat || !state.chat || state.incognito || !state.user;
  dom.chatMenuBtn.hidden = !chat || !state.chat || state.incognito;
}

/* ------------------------------------------------------------------- home */

function homeSuggestions() {
  return [
    { kicker: "Write", title: "Draft an honest update", body: "A short note for a project that is running late.", prompt: "Write a short, honest project update for something that is running a week late. No excuses, just the new date and what changes." },
    { kicker: "Learn", title: "How indexes actually work", body: "Explain database indexes without the hand-waving.", prompt: "Explain how a database index speeds up a query, and where the extra write cost comes from." },
    { kicker: "Build", title: "A board for today", body: "A small page with three things that matter.", prompt: "Build a small dashboard page for tracking what I am doing today." },
    { kicker: "Plan", title: "A week around one problem", body: "Cut the plan until it fits the time.", prompt: "Plan a focused week around one hard problem, with the riskiest work first." }
  ];
}

function renderHome() {
  state.chat = null;
  state.messages = [];
  state.project = null;
  state.attachments = [];
  renderAttachmentChips();
  setTopbar("New chat", { chat: false });
  dom.shareBtn.hidden = true;
  dom.chatMenuBtn.hidden = true;
  dom.topbarProject.hidden = true;
  dom.topbarIncognito.hidden = !state.incognito;
  if (state.incognito) dom.title.textContent = "Incognito chat";

  const view = document.createElement("section");
  view.className = "home";

  const wrap = el("div", { class: "home__greeting" },
    el("div", { class: "home__mark", "aria-hidden": "true" }, mark(34)),
    el("h1", { class: "home__title" },
      state.user ? greeting(state.user.name) : "A quiet place to think out loud"
    ),
    el("p", { class: "home__sub" },
      state.incognito
        ? "Incognito is on. Nothing you type here is saved, indexed, exported or shared."
        : state.user
          ? "What are we working on? Chats, projects and everything you make stay in your account."
          : "Sign in to keep your chats, projects and knowledge. Nothing here is public by default."
    )
  );
  view.append(wrap);

  if (state.prefs.suggestions) {
    const grid = el("div", { class: "suggestions" });
    for (const item of homeSuggestions()) {
      grid.append(
        el("button", {
          class: "suggestion",
          type: "button",
          onclick: () => {
            if (!ensureSignedIn()) return;
            dom.prompt.value = item.prompt;
            resizePrompt();
            dom.prompt.focus();
          }
        },
          el("span", { class: "suggestion__kicker", text: item.kicker }),
          el("span", { class: "suggestion__title", text: item.title }),
          el("span", { class: "suggestion__body", text: item.body })
        )
      );
    }
    view.append(grid);
  }

  const recent = state.chats.slice(0, 4);
  if (recent.length) {
    const section = el("section", { class: "home__recent" }, el("h2", { text: "Pick up where you left off" }));
    const cards = el("div", { class: "recent-grid" });
    for (const chat of recent) {
      cards.append(
        el("button", {
          class: "recent-card",
          type: "button",
          onclick: () => navigate(`/chat/${chat.id}`)
        },
          el("strong", { text: chat.title }),
          el("span", { text: chat.preview || relativeTime(chat.updatedAt) })
        )
      );
    }
    section.append(cards);
    view.append(section);
  }

  dom.view.replaceChildren(view);
  dom.view.scrollTop = 0;
  if (window.innerWidth > 900) dom.prompt.focus();
}

/* ------------------------------------------------------------------- chat */

async function renderChatPage(id) {
  if (!state.user) {
    openAuth("signin");
    navigate("/", { replace: true });
    return;
  }
  dom.view.replaceChildren(el("div", { class: "thread" }, el("div", { class: "skeleton" }, el("span"), el("span"), el("span"))));
  setTopbar("Loading…", { chat: false });
  dom.shareBtn.hidden = true;
  dom.chatMenuBtn.hidden = true;

  try {
    const data = await api(`/api/chats/${id}`);
    state.chat = data.chat;
    state.messages = data.messages || [];
    state.project = data.project || null;
    state.attachments = [];
    state.prefs = { ...state.prefs, model: data.chat.model, styleId: data.chat.styleId, thinking: data.chat.thinking };
    renderAttachmentChips();
    renderModelButton();
    renderStyleButton();
    setTopbar(chatTitleOf(data.chat), { project: data.project });
    dom.shareBtn.hidden = false;
    dom.chatMenuBtn.hidden = false;
    renderThread();
    renderSidebar();
    dom.view.scrollTop = dom.view.scrollHeight;
    if (window.innerWidth > 900) dom.prompt.focus();
  } catch (error) {
    if (error.status === 401) {
      openAuth("signin");
      navigate("/", { replace: true });
      return;
    }
    dom.view.replaceChildren(
      el("div", { class: "thread" },
        el("div", { class: "empty" },
          el("p", { text: error.status === 404 ? "That chat is gone. It may have been deleted in another tab." : error.message }),
          el("div", { style: "margin-top:12px" },
            el("button", { class: "btn btn--secondary", type: "button", onclick: () => navigate("/") }, "Back to a new chat")
          )
        )
      )
    );
  }
}

function renderThread() {
  const thread = el("div", { class: "thread", role: "log", "aria-live": "polite", "aria-label": "Conversation" });

  if (state.project) {
    thread.append(
      el("div", { class: "thread__intro" },
        el("h1", { text: state.project.name }),
        el("p", { text: state.project.instructions ? state.project.instructions.slice(0, 160) : "This chat uses the project's knowledge and instructions." })
      )
    );
  }

  if (state.incognito) {
    thread.append(
      el("div", { class: "thread__notice" }, icon("ghost"),
        el("span", { text: "Incognito chat. Alcove keeps this thread in memory only; closing or reloading clears it, and it never reaches your history, search or export." })
      )
    );
  }

  if (!state.messages.length) {
    thread.append(
      el("div", { class: "empty" },
        el("p", { text: state.incognito ? "Say anything. It leaves with the tab." : "Nothing here yet. Write the messy version below." })
      )
    );
  }

  state.messages.forEach((message, index) => {
    thread.append(messageNode(message, index));
  });

  dom.view.replaceChildren(thread);
}

function messageNode(message, index) {
  if (message.role === "user") {
    const wrap = el("article", { class: "msg msg--user", dataset: { seq: message.seq } });
    if (message.attachments && message.attachments.length) {
      const files = el("div", { class: "msg__files" });
      for (const file of message.attachments) {
        files.append(el("span", { class: "msg__file" }, icon("file"), el("span", { text: file.name })));
      }
      wrap.append(files);
    }
    const bubble = el("div", { class: "msg__bubble", text: message.content });
    wrap.append(bubble);

    const actions = el("div", { class: "msg__actions" },
      el("button", {
        class: "icon-btn", type: "button", "aria-label": "Copy your message",
        onclick: async () => {
          const ok = await copyText(message.content);
          toast(ok ? "Copied" : "Could not copy");
        }
      }, icon("copy")),
      el("button", {
        class: "icon-btn", type: "button", "aria-label": "Edit and resend",
        onclick: () => startEditMessage(message, wrap)
      }, icon("pencil"))
    );
    wrap.append(actions);
    return wrap;
  }

  const wrap = el("article", { class: "msg msg--assistant", dataset: { seq: message.seq, id: message.id } });
  wrap.append(
    el("div", { class: "msg__head" },
      el("span", { class: "msg__mark", "aria-hidden": "true" }, mark(15)),
      el("span", { text: "Alcove" }),
      el("span", { class: "msg__model", text: modelById(message.model || (state.chat && state.chat.model) || "sonnet").name })
    )
  );

  if (message.thinking) {
    wrap.append(thinkingBlock(message.thinking, false));
  }

  const body = el("div", { class: "msg__body prose" });
  body.innerHTML = renderMarkdown(message.content);
  if (message.stopped) body.classList.add("msg__body--stopped");
  wrap.append(body);

  for (const artifact of message.artifacts || []) {
    wrap.append(artifactCard(artifact, message));
  }

  const actions = el("div", { class: "msg__actions" },
    el("button", {
      class: "icon-btn", type: "button", "aria-label": "Copy this reply",
      onclick: async () => {
        const ok = await copyText(message.content);
        toast(ok ? "Copied" : "Could not copy");
      }
    }, icon("copy")),
    index === state.messages.length - 1 && !state.incognito
      ? el("button", {
          class: "icon-btn", type: "button", "aria-label": "Regenerate this reply",
          onclick: () => regenerate()
        }, icon("refresh"))
      : null,
    el("button", {
      class: `icon-btn${message.feedback === "up" ? " is-on" : ""}`,
      type: "button",
      "aria-label": "Helpful",
      "aria-pressed": message.feedback === "up" ? "true" : "false",
      onclick: () => setFeedback(message, "up")
    }, icon("thumb-up")),
    el("button", {
      class: `icon-btn${message.feedback === "down" ? " is-down" : ""}`,
      type: "button",
      "aria-label": "Not helpful",
      "aria-pressed": message.feedback === "down" ? "true" : "false",
      onclick: () => setFeedback(message, "down")
    }, icon("thumb-down"))
  );
  wrap.append(actions);
  return wrap;
}

function thinkingBlock(text, open) {
  const details = el("details", { class: "msg__thinking" });
  if (open) details.open = true;
  details.append(
    el("summary", {}, icon("brain"), el("span", { text: "Thought process" }), el("span", { class: "msg__model", text: "extended thinking" })),
    el("div", { class: "msg__thinking-body", text })
  );
  return details;
}

function artifactCard(artifact, message) {
  return el("div", { class: "artifact-card" },
    el("span", { class: "artifact-card__icon" }, icon(artifact.kind === "svg" ? "eye" : artifact.kind === "markdown" ? "file" : "code")),
    el("div", { class: "artifact-card__text" },
      el("strong", { text: artifact.title }),
      el("span", { text: artifact.kind === "html" ? "HTML artifact" : artifact.kind === "svg" ? "SVG" : "Markdown" })
    ),
    el("button", {
      class: "btn btn--secondary btn--sm", type: "button",
      onclick: () => openArtifact(artifact)
    }, "View", icon("arrow-up-right"))
  );
}

function startEditMessage(message, wrap) {
  const original = message.content;
  const area = el("textarea", { class: "instructions-input", rows: "3" });
  area.value = original;
  const row = el("div", { class: "confirm__row", style: "margin-top:8px;justify-content:flex-end" },
    el("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => renderThread() }, "Cancel"),
    el("button", {
      class: "btn btn--primary btn--sm", type: "button",
      onclick: async () => {
        const next = area.value.trim();
        if (!next) return;
        const index = state.messages.findIndex((item) => item.id === message.id);
        if (index < 0) return;
        try {
          await api(`/api/chats/${state.chat.id}/truncate`, { method: "POST", body: { seq: message.seq - 1 } });
        } catch (error) {
          toast(error.message);
          return;
        }
        state.messages = state.messages.slice(0, index);
        renderThread();
        dom.prompt.value = next;
        resizePrompt();
        sendMessage(next);
      }
    }, "Save and resend")
  );
  wrap.replaceChildren(area, row);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);
}

async function setFeedback(message, value) {
  if (!state.user || state.incognito || !message.id) return;
  const next = message.feedback === value ? null : value;
  message.feedback = next;
  renderThread();
  try {
    await api(`/api/messages/${message.id}`, { method: "PATCH", body: { feedback: next } });
  } catch {
    toast("Feedback could not be saved");
  }
}

async function regenerate() {
  if (state.stream) return;
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== "assistant") return;
  const promptMessage = [...state.messages].reverse().find((message) => message.role === "user");
  if (!promptMessage) return;
  if (!state.incognito) {
    try {
      await api(`/api/chats/${state.chat.id}/truncate`, { method: "POST", body: { seq: last.seq - 1 } });
    } catch (error) {
      toast(error.message);
      return;
    }
  }
  state.messages = state.messages.filter((message) => message.seq < last.seq);
  renderThread();
  await beginReply(promptMessage.content, promptMessage.attachments || []);
}

/* ------------------------------------------------------------- sending */

function renderAttachmentChips() {
  if (!state.attachments.length) {
    dom.attachmentChips.hidden = true;
    dom.attachmentChips.replaceChildren();
    return;
  }
  dom.attachmentChips.hidden = false;
  dom.attachmentChips.replaceChildren(
    ...state.attachments.map((file, index) =>
      el("span", { class: "file-chip" },
        icon("file"),
        el("span", { text: `${file.name} · ${formatBytes(file.size)}` }),
        el("button", {
          type: "button", "aria-label": `Remove ${file.name}`,
          onclick: () => {
            state.attachments.splice(index, 1);
            renderAttachmentChips();
          }
        }, icon("x"))
      )
    )
  );
}

async function readFiles(fileList) {
  const files = [...fileList].slice(0, 10 - state.attachments.length);
  for (const file of files) {
    if (file.size > 400_000) {
      toast(`${file.name} is over 400 KB. Attach the relevant part instead.`);
      continue;
    }
    const kind = file.type.startsWith("image/") ? "image" : "text";
    let text = "";
    if (kind === "text") {
      try {
        text = (await file.text()).slice(0, 200_000);
      } catch {
        toast(`${file.name} could not be read.`);
        continue;
      }
    }
    state.attachments.push({ name: file.name, size: file.size, kind, text });
  }
  renderAttachmentChips();
}

async function ensureChatForSend() {
  if (state.incognito) {
    if (!state.chat) {
      state.chat = { id: "incognito", title: "Incognito chat", model: state.prefs.model, styleId: state.prefs.styleId, thinking: state.prefs.thinking, incognito: true };
      state.messages = [];
    }
    return state.chat;
  }
  if (state.chat) return state.chat;
  const body = { model: state.prefs.model, styleId: state.prefs.styleId, thinking: state.prefs.thinking };
  if (state.project) body.projectId = state.project.id;
  const { chat } = await api("/api/chats", { method: "POST", body });
  state.chat = chat;
  upsertChat(chat);
  history.replaceState({}, "", `/chat/${chat.id}`);
  state.route = { name: "chat", id: chat.id };
  setTopbar(chatTitleOf(chat), { project: state.project });
  dom.shareBtn.hidden = false;
  dom.chatMenuBtn.hidden = false;
  return chat;
}

async function sendMessage(text) {
  const prompt = String(text ?? dom.prompt.value).trim();
  if (!prompt && !state.attachments.length) return;
  if (state.stream) {
    stopStream();
    return;
  }
  if (!ensureSignedIn()) return;
  if (state.usage && state.usage.blocked) {
    openSettings("usage");
    toast("This window's messages are used up. The reset time is in Usage.");
    return;
  }

  dom.prompt.value = "";
  resizePrompt();
  const attachments = state.attachments.slice();
  state.attachments = [];
  renderAttachmentChips();
  dom.sendBtn.disabled = true;

  try {
    const chat = await ensureChatForSend();
    const temp = {
      id: `local-${Date.now()}`,
      role: "user",
      content: prompt || "(see attached file)",
      attachments,
      seq: (state.messages[state.messages.length - 1]?.seq || 0) + 1,
      createdAt: Date.now()
    };

    if (!state.incognito) {
      const data = await api(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        body: { role: "user", content: prompt || "See attached file.", attachments }
      });
      Object.assign(temp, data.message);
      if (data.chat) {
        state.chat = { ...state.chat, ...data.chat };
        setTopbar(chatTitleOf(state.chat), { project: state.project });
        upsertChat(state.chat);
      }
      if (data.usage) {
        state.usage = data.usage;
        renderUsage();
      }
    }

    state.messages.push(temp);
    renderThread();
    dom.view.scrollTop = dom.view.scrollHeight;
    await beginReply(prompt, attachments);
  } catch (error) {
    if (error.status === 429) {
      state.usage = error.usage || state.usage;
      renderUsage();
      openSettings("usage");
      toast(error.message);
    } else if (error.status === 401) {
      openAuth("signin");
    } else {
      toast(error.message);
    }
  } finally {
    dom.sendBtn.disabled = false;
  }
}

async function beginReply(prompt, attachments) {
  if (!state.chat) return;
  const targetChatId = state.chat.id;
  const targetIncognito = state.incognito;
  const previousArtifact = [...state.messages].reverse()
    .flatMap((message) => message.artifacts || [])
    .find(Boolean) || null;

  const article = el("article", { class: "msg msg--assistant" });
  article.append(
    el("div", { class: "msg__head" },
      el("span", { class: "msg__mark", "aria-hidden": "true" }, mark(15)),
      el("span", { text: "Alcove" }),
      el("span", { class: "msg__model", text: modelById(state.prefs.model).name })
    )
  );
  const activity = el("div", { class: "msg__body" },
    el("span", { class: "typing", "aria-label": "Alcove is writing" }, el("span"), el("span"), el("span"))
  );
  article.append(activity);
  const thread = $(".thread", dom.view);
  if (thread) thread.append(article);
  dom.view.scrollTop = dom.view.scrollHeight;

  const retry = () => {
    article.remove();
    beginReply(prompt, attachments);
  };

  let reply;
  try {
    reply = generateReply({
      prompt,
      attachments,
      model: state.prefs.model,
      style: state.prefs.styleId,
      thinking: state.prefs.thinking,
      project: state.project,
      customStyles: state.styles,
      previousArtifact: /(change|update|revise|adjust|instead|add|remove|darker|lighter|bigger|smaller|blue|green|purple|orange|red|dark)\b/i.test(prompt) ? previousArtifact : null
    });
  } catch (error) {
    if (error instanceof ScriptedError) {
      article.replaceChildren(errorNode(error.message, retry));
      return;
    }
    throw error;
  }

  const controller = new AbortController();
  state.stream = { controller, article, chatId: state.chat.id, partial: "", stopped: false };
  setStreaming(true);

  let body = el("div", { class: "msg__body prose" });
  let thinking = null;
  article.replaceChildren(
    el("div", { class: "msg__head" },
      el("span", { class: "msg__mark", "aria-hidden": "true" }, mark(15)),
      el("span", { text: "Alcove" }),
      el("span", { class: "msg__model", text: modelById(state.prefs.model).name })
    )
  );
  if (reply.thinking) {
    thinking = thinkingBlock("", true);
    article.append(thinking);
  }
  article.append(body);

  const paint = (text) => {
    body.innerHTML = renderMarkdown(text) + (state.stream && !state.stream.stopped ? '<span class="caret"></span>' : "");
    dom.view.scrollTop = dom.view.scrollHeight;
  };

  try {
    await streamReply({
      reply,
      signal: controller.signal,
      speed: modelById(state.prefs.model).speed,
      onThinking: (text) => {
        if (thinking) {
          const node = $(".msg__thinking-body", thinking);
          if (node) node.textContent = text;
        }
      },
      onText: (text) => {
        if (state.stream) state.stream.partial = text;
        paint(text);
      }
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      article.replaceChildren(errorNode("The reply stopped unexpectedly. Try again.", retry));
      state.stream = null;
      setStreaming(false);
      return;
    }
  }

  const stream = state.stream;
  state.stream = null;
  setStreaming(false);
  const content = (stream && stream.partial) || reply.content;
  const stopped = Boolean(stream && stream.stopped);

  const assistant = {
    id: `local-${Date.now()}`,
    role: "assistant",
    content,
    thinking: reply.thinking || "",
    artifacts: reply.artifacts || [],
    feedback: null,
    seq: (state.messages[state.messages.length - 1]?.seq || 0) + 1,
    createdAt: Date.now(),
    stopped,
    model: state.prefs.model
  };

  if (!stopped || content.trim()) {
    if (!targetIncognito) {
      try {
        const data = await api(`/api/chats/${targetChatId}/messages`, {
          method: "POST",
          body: {
            role: "assistant",
            content,
            thinking: reply.thinking || "",
            artifacts: reply.artifacts || []
          }
        });
        Object.assign(assistant, data.message);
        if (data.chat) upsertChat(data.chat);
      } catch (error) {
        toast("The reply could not be saved");
      }
    }
    state.messages.push(assistant);
  } else {
    article.remove();
    return;
  }

  const fresh = messageNode(assistant, state.messages.length - 1);
  article.replaceWith(fresh);
  dom.view.scrollTop = dom.view.scrollHeight;
}

function errorNode(message, retry) {
  return el("div", { class: "msg__error" }, icon("alert"),
    el("span", { text: message }),
    el("button", {
      class: "btn btn--secondary btn--sm", type: "button",
      onclick: () => (retry ? retry() : regenerate())
    }, "Try again")
  );
}

function setStreaming(streaming) {
  dom.sendIcon.innerHTML = `<use href="#i-${streaming ? "stop" : "send"}"/>`;
  dom.sendBtn.setAttribute("aria-label", streaming ? "Stop generating" : "Send message");
  dom.sendBtn.classList.toggle("is-stop", streaming);
  dom.composer.classList.toggle("is-streaming", streaming);
}

function stopStream() {
  if (!state.stream) return;
  state.stream.stopped = true;
  state.stream.controller.abort();
  toast("Stopped");
}

/* --------------------------------------------------------------- artifacts */

function artifactVersions(artifact) {
  const older = Array.isArray(artifact.versions) ? artifact.versions.filter((version) => version && version.code) : [];
  const list = older.map((version, index) => ({ label: `v${index + 1}`, code: version.code }));
  list.push({ label: `v${list.length + 1}`, code: artifact.code });
  return list;
}

function openArtifact(artifact) {
  state.artifact = { artifact, index: artifactVersions(artifact).length - 1, tab: "preview" };
  dom.artifactPanel.hidden = false;
  dom.app.classList.add("is-artifact");
  renderArtifact();
  $("#artifactClose").focus();
}

function closeArtifact({ silent = false } = {}) {
  if (!state.artifact && dom.artifactPanel.hidden) return;
  state.artifact = null;
  dom.artifactPanel.hidden = true;
  dom.app.classList.remove("is-artifact");
  dom.artifactFrame.removeAttribute("srcdoc");
  if (!silent) {
    const card = $(".artifact-card .btn");
    if (card) card.focus();
  }
}

function renderArtifact() {
  if (!state.artifact) return;
  const { artifact, index, tab } = state.artifact;
  const versions = artifactVersions(artifact);
  const current = versions[Math.min(index, versions.length - 1)];
  $("#artifactTitle").textContent = artifact.title;
  const select = $("#artifactVersions");
  select.replaceChildren(...versions.map((version, i) =>
    el("option", { value: String(i), text: version.label, selected: i === index ? true : null })
  ));
  $("#artifactCodeBody").textContent = current.code;
  $("#artifactFrame").hidden = tab !== "preview";
  $("#artifactCode").hidden = tab !== "code";
  $("#artifactPreviewTab").classList.toggle("is-active", tab === "preview");
  $("#artifactCodeTab").classList.toggle("is-active", tab === "code");
  $("#artifactPreviewTab").setAttribute("aria-selected", String(tab === "preview"));
  $("#artifactCodeTab").setAttribute("aria-selected", String(tab === "code"));

  if (tab === "preview") {
    const frame = $("#artifactFrame");
    if (artifact.kind === "markdown") {
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>
        :root{color-scheme:light}body{margin:0;padding:28px;background:#fff;color:#1b2321;
        font:15px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
        h1,h2,h3{font-family:ui-serif,Georgia,serif;font-weight:500}
        h1{font-size:26px}h2{font-size:19px;margin-top:1.4em}h3{font-size:16px}
        pre{background:#f1efe8;padding:12px;border-radius:8px;overflow:auto}
        code{font-family:ui-monospace,Menlo,monospace;font-size:13px}
        table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dedcd1;padding:6px 9px;text-align:left}
        th{background:#efeee7}blockquote{border-left:2px solid #8f8f80;margin:0;padding-left:14px;color:#55605c}
        a{color:#17614f}
      </style><body>${renderMarkdown(current.code)}</body>`;
    } else if (artifact.kind === "svg") {
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff}svg{max-width:70%;height:auto}</style>${current.code}`;
    } else {
      frame.srcdoc = current.code;
    }
  }
}

async function downloadArtifact() {
  if (!state.artifact) return;
  const { artifact, index } = state.artifact;
  const code = artifactVersions(artifact)[index].code;
  const name = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "artifact";
  const ext = artifact.kind === "html" ? "html" : artifact.kind === "svg" ? "svg" : "md";
  const blob = new Blob([code], { type: artifact.kind === "html" ? "text/html" : "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.${ext}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Downloaded");
}

/* ----------------------------------------------------------------- sidebar */

function renderSidebar() {
  renderUsage();
  if (!state.user) {
    dom.history.replaceChildren(
      el("p", { class: "sidebar__note", text: "Sign in to keep your chats, projects and settings in one place." }),
      el("button", { class: "btn btn--secondary btn--sm", type: "button", style: "margin:0 8px", onclick: () => openAuth("signup") }, "Create an account")
    );
    return;
  }

  const fragment = document.createDocumentFragment();
  const starred = state.chats.filter((chat) => chat.starred);
  if (starred.length) {
    fragment.append(sectionHeading("Starred"));
    for (const chat of starred) fragment.append(chatRow(chat));
  }

  const rest = state.chats.filter((chat) => !chat.starred);
  if (rest.length) {
    const groups = new Map();
    for (const chat of rest) {
      const label = dateGroup(chat.updatedAt);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(chat);
    }
    for (const [label, chats] of groups) {
      fragment.append(sectionHeading(label));
      for (const chat of chats) fragment.append(chatRow(chat));
    }
  }

  if (!state.chats.length) {
    fragment.append(
      el("div", { class: "hist" },
        el("p", { class: "hist__empty", text: "No chats yet. Ask something below and it will appear here." })
      )
    );
  }

  if (state.projects.length) {
    fragment.append(sectionHeading("Projects"));
    for (const project of state.projects.filter((item) => !item.archived).slice(0, 5)) {
      fragment.append(
        el("a", {
          class: "chat-row__link",
          href: `/project/${project.id}`,
          onclick: (event) => { event.preventDefault(); navigate(`/project/${project.id}`); }
        },
          icon("folder"),
          el("span", { class: "chat-row__name", text: project.name })
        )
      );
    }
  }

  dom.history.replaceChildren(fragment);
}

function sectionHeading(label) {
  return el("div", { class: "hist__heading", text: label });
}

function chatRow(chat) {
  const row = el("div", { class: "chat-row", dataset: { id: chat.id } });
  const link = el("a", {
    class: `chat-row__link${state.chat && state.chat.id === chat.id ? " is-active" : ""}`,
    href: `/chat/${chat.id}`,
    dataset: { starred: chat.starred ? "1" : "0" },
    onclick: (event) => {
      event.preventDefault();
      if (state.stream) stopStream();
      navigate(`/chat/${chat.id}`);
    }
  },
    el("span", { class: "chat-row__name", text: chat.title }),
    icon("star", "chat-row__star")
  );
  const more = el("button", {
    class: "chat-row__more", type: "button", "aria-label": `Options for ${chat.title}`,
    "aria-haspopup": "menu", "aria-expanded": "false",
    onclick: (event) => {
      event.stopPropagation();
      openRowMenu(row, chat);
    }
  }, icon("more"));
  row.append(link, more);
  return row;
}

function openRowMenu(row, chat) {
  const existing = $(".row-menu", row);
  if (existing) {
    existing.remove();
    $(".chat-row__more", row).setAttribute("aria-expanded", "false");
    return;
  }
  closeAllMenus();
  for (const menu of $$(".row-menu")) menu.remove();
  const menu = el("div", { class: "row-menu", role: "menu" },
    el("button", { type: "button", role: "menuitem", onclick: () => { menu.remove(); startRenameChat(chat); } }, icon("pencil"), "Rename"),
    el("button", { type: "button", role: "menuitem", onclick: async () => {
      menu.remove();
      try {
        const { chat: fresh } = await api(`/api/chats/${chat.id}`, { method: "PATCH", body: { starred: !chat.starred } });
        upsertChat(fresh);
        if (state.chat && state.chat.id === chat.id) state.chat = fresh;
        toast(fresh.starred ? "Starred" : "Unstarred");
      } catch (error) { toast(error.message); }
    } }, icon("star"), chat.starred ? "Unstar" : "Star"),
    el("button", { type: "button", role: "menuitem", onclick: () => { menu.remove(); moveChat(chat); } }, icon("folder"), "Move to project…"),
    el("button", { class: "is-danger", type: "button", role: "menuitem", onclick: async () => {
      menu.remove();
      const ok = await confirmAction({
        title: "Delete this chat?",
        body: `“${chat.title}” and its messages will be removed from your account. This cannot be undone.`,
        confirmLabel: "Delete chat"
      });
      if (!ok) return;
      try {
        await api(`/api/chats/${chat.id}`, { method: "DELETE" });
        removeChatFromList(chat.id);
        if (state.chat && state.chat.id === chat.id) navigate("/");
        toast("Chat deleted");
      } catch (error) { toast(error.message); }
    } }, icon("trash"), "Delete")
  );
  row.append(menu);
  $(".chat-row__more", row).setAttribute("aria-expanded", "true");
}

function startRenameChat(chat) {
  const row = $(`.chat-row[data-id="${chat.id}"]`);
  if (!row) return;
  const input = el("input", { class: "rename-input", type: "text", maxlength: "120", value: chat.title, "aria-label": "Chat title" });
  row.replaceChildren(input);
  input.focus();
  input.select();
  const finish = async (save) => {
    if (!input.isConnected) return;
    const next = input.value.trim();
    if (!save || !next) {
      renderSidebar();
      return;
    }
    try {
      const { chat: fresh } = await api(`/api/chats/${chat.id}`, { method: "PATCH", body: { title: next } });
      upsertChat(fresh);
      if (state.chat && state.chat.id === chat.id) {
        state.chat = { ...state.chat, title: fresh.title };
        setTopbar(fresh.title, { project: state.project });
      }
      renderSidebar();
      toast("Renamed");
    } catch (error) {
      toast(error.message);
      renderSidebar();
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
}

function moveChat(chat) {
  if (!state.projects.length) {
    toast("Create a project first, then move a chat into it.");
    return;
  }
  openPalette({ mode: "move", chatId: chat.id });
}

function renderUsage() {
  const usage = state.usage;
  const fill = $("#sideUsageFill");
  const text = $("#sideUsageText");
  if (!usage) {
    if (text) text.textContent = state.user ? "Usage unavailable" : "Sign in to start";
    return;
  }
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.classList.toggle("is-warning", pct >= 70 && pct < 100);
    fill.classList.toggle("is-full", pct >= 100);
  }
  if (text) {
    text.textContent = usage.blocked
      ? `Limit reached · ${resetCountdown(usage.resetsAt)}`
      : `${usage.remaining} of ${usage.limit} messages left`;
  }
  if (state.route.name === "chat" || state.route.name === "home") {
    dom.composer.classList.toggle("is-blocked", Boolean(usage.blocked));
  }
}

/* ------------------------------------------------------------------ search */

function openPalette({ mode = "search", chatId = null } = {}) {
  state.paletteMode = mode;
  state.moveChatId = chatId;
  const dialog = $("#palette");
  const input = $("#paletteInput");
  input.value = "";
  input.focus();
  openDialog(dialog);
  renderPalette("");
  if (mode === "search") setTimeout(() => input.select(), 40);
}

const searchRemote = debounce(async (query) => {
  if (!query.trim()) {
    renderPalette("");
    return;
  }
  try {
    const { chats } = await api(`/api/chats?q=${encodeURIComponent(query)}`);
    state.lastSearch = chats;
    renderPalette(query);
  } catch {
    /* offline: local results still show */
  }
}, 220);

function renderPalette(query) {
  const results = $("#paletteResults");
  const q = query.trim().toLowerCase();
  const items = [];

  if (state.paletteMode === "move") {
    const chatId = state.moveChatId;
    for (const project of state.projects) {
      items.push({
        group: "Move to",
        icon: "folder",
        label: project.name,
        hint: `${project.chatCount || 0} chats`,
        run: async () => {
          try {
            await api(`/api/chats/${chatId}`, { method: "PATCH", body: { projectId: project.id } });
            const fresh = await api(`/api/chats/${chatId}`);
            state.chat = fresh.chat;
            state.project = fresh.project || null;
            upsertChat(fresh.chat);
            setTopbar(chatTitleOf(fresh.chat), { project: fresh.project });
            toast(`Moved to ${project.name}`);
            closeDialog($("#palette"));
            renderThread();
          } catch (error) { toast(error.message); }
        }
      });
    }
    items.push({
      group: "Move to",
      icon: "x",
      label: "Remove from project",
      hint: "keep it in Recents",
      run: async () => {
        try {
          await api(`/api/chats/${state.moveChatId}`, { method: "PATCH", body: { projectId: null } });
          toast("Moved out of the project");
          closeDialog($("#palette"));
          if (state.chat && state.chat.id === state.moveChatId) {
            state.project = null;
            setTopbar(chatTitleOf(state.chat), { project: null });
          }
        } catch (error) { toast(error.message); }
      }
    });
  } else {
    const actions = [
      { icon: "plus", label: "New chat", hint: "start fresh", run: () => { closeDialog($("#palette")); navigate("/"); dom.prompt.focus(); } },
      { icon: "folder", label: "Projects", hint: "workspaces", run: () => { closeDialog($("#palette")); navigate("/projects"); } },
      { icon: "settings", label: "Settings", hint: "appearance, usage, privacy", run: () => { closeDialog($("#palette")); openSettings("general"); } }
    ].filter((action) => !q || action.label.toLowerCase().includes(q));
    for (const action of actions) items.push({ group: "Actions", ...action });

    for (const project of state.projects.filter((project) => !q || project.name.toLowerCase().includes(q))) {
      items.push({
        group: "Projects",
        icon: "folder",
        label: project.name,
        hint: project.description || `${project.chatCount || 0} chats`,
        run: () => { closeDialog($("#palette")); navigate(`/project/${project.id}`); }
      });
    }

    const source = q ? (state.lastSearch || state.chats) : state.chats;
    const chats = source
      .filter((chat) => !q || chat.title.toLowerCase().includes(q) || (chat.preview || "").toLowerCase().includes(q))
      .slice(0, 12);
    for (const chat of chats) {
      items.push({
        group: "Chats",
        icon: "book",
        label: chat.title,
        hint: relativeTime(chat.updatedAt),
        run: () => { closeDialog($("#palette")); navigate(`/chat/${chat.id}`); }
      });
    }
  }

  results.replaceChildren();
  if (!items.length) {
    results.append(el("div", { class: "palette__empty", text: q ? `Nothing matches “${query}”.` : "Nothing here yet." }));
    state.paletteItems = [];
    return;
  }

  let lastGroup = "";
  for (const item of items) {
    if (item.group !== lastGroup) {
      results.append(el("div", { class: "palette__group", text: item.group }));
      lastGroup = item.group;
    }
    results.append(
      el("button", {
        class: "palette__item", type: "button", role: "option",
        onclick: () => item.run()
      }, icon(item.icon), el("span", { text: item.label }), el("small", { text: item.hint || "" }))
    );
  }
  state.paletteItems = items;
  state.paletteIndex = 0;
  const first = $(".palette__item", results);
  if (first) first.classList.add("is-active");
}

function paletteKeydown(event) {
  const items = $$(".palette__item", $("#paletteResults"));
  if (!items.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const current = items.findIndex((item) => item.classList.contains("is-active"));
    const next = (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((item, index) => item.classList.toggle("is-active", index === next));
    items[next].scrollIntoView({ block: "nearest" });
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const active = items.find((item) => item.classList.contains("is-active")) || items[0];
    if (active) active.click();
  }
}

/* ----------------------------------------------------------------- projects */

async function renderProjectsPage() {
  const wrap = el("div", { class: "page" });
  wrap.append(
    el("div", { class: "page__head" },
      el("div", {},
        el("h1", { text: "Projects" }),
        el("p", { text: "Self-contained workspaces with their own instructions, knowledge and chats. Context stays inside a project." })
      ),
      el("div", { class: "page__actions" },
        el("button", { class: "btn btn--primary", type: "button", onclick: () => openProjectDialog() }, icon("plus"), "New project")
      )
    )
  );

  if (!state.user) {
    wrap.append(el("div", { class: "empty" }, "Sign in to create a project."));
    dom.view.replaceChildren(wrap);
    return;
  }

  wrap.append(el("div", { class: "skeleton" }, el("span"), el("span"), el("span")));
  dom.view.replaceChildren(wrap);

  try {
    const { projects } = await api("/api/projects");
    state.projects = projects;
    renderSidebar();
    const grid = el("div", { class: "page__grid" });
    for (const project of projects.filter((item) => !item.archived)) {
      const card = el("div", { class: "project-card" },
        el("div", { class: "project-card__top" },
          el("span", { class: "project-card__icon" }, icon("folder")),
          el("h3", { text: project.name }),
          el("button", {
            class: "icon-btn", type: "button", style: "margin-left:auto;width:28px;height:28px",
            "aria-label": project.starred ? `Unstar ${project.name}` : `Star ${project.name}`,
            "aria-pressed": String(project.starred),
            onclick: async (event) => {
              event.stopPropagation();
              try {
                const { project: fresh } = await api(`/api/projects/${project.id}`, { method: "PATCH", body: { starred: !project.starred } });
                Object.assign(project, fresh);
                renderProjectsPage();
              } catch (error) { toast(error.message); }
            }
          }, icon("star", project.starred ? "is-on" : ""))
        ),
        el("p", { text: project.description || "No description yet." }),
        el("div", { class: "project-card__meta" },
          el("span", { text: `${project.chatCount} chats` }),
          el("span", { text: `${project.docCount} knowledge` })
        )
      );
      card.addEventListener("click", () => navigate(`/project/${project.id}`));
      card.style.cursor = "pointer";
      grid.append(card);
    }
    const add = el("button", { class: "project-card project-card--new", type: "button", onclick: () => openProjectDialog() },
      icon("plus"), el("span", { text: "Start a project" })
    );
    grid.append(add);

    wrap.replaceChildren(
      el("div", { class: "page__head" },
        el("div", {},
          el("h1", { text: "Projects" }),
          el("p", { text: "Self-contained workspaces with their own instructions, knowledge and chats. Context stays inside a project." })
        ),
        el("div", { class: "page__actions" },
          el("button", { class: "btn btn--primary", type: "button", onclick: () => openProjectDialog() }, icon("plus"), "New project")
        )
      ),
      grid
    );
    if (!projects.length) {
      wrap.append(el("div", { class: "empty", style: "margin-top:24px" },
        "A project is where a long-running thread lives: a brief, the files it refers to, and the chats that use them."
      ));
    }
  } catch (error) {
    wrap.replaceChildren(el("div", { class: "empty", text: error.message }));
  }
  dom.view.replaceChildren(wrap);
}

async function renderProjectPage(id) {
  if (!state.user) {
    openAuth("signin");
    navigate("/", { replace: true });
    return;
  }
  dom.view.replaceChildren(el("div", { class: "page" }, el("div", { class: "skeleton" }, el("span"), el("span"), el("span"))));
  try {
    const data = await api(`/api/projects/${id}`);
    state.project = data.project;
    state.chat = null;
    state.messages = [];
    setTopbar(data.project.name, { project: data.project, chat: false });
    dom.shareBtn.hidden = true;
    dom.chatMenuBtn.hidden = true;

    const page = el("div", { class: "page" });
    page.append(
      el("div", { class: "page__head" },
        el("div", {},
          el("h1", { text: data.project.name }),
          el("p", { text: data.project.description || "No description. Add one so a future you knows what belongs here." })
        ),
        el("div", { class: "page__actions" },
          el("button", { class: "btn btn--secondary btn--sm", type: "button", onclick: () => archiveProject(data.project) }, icon("archive"), data.project.archived ? "Unarchive" : "Archive"),
          el("button", { class: "btn btn--danger btn--sm", type: "button", onclick: () => deleteProject(data.project) }, icon("trash"), "Delete")
        )
      )
    );

    const layout = el("div", { class: "project-layout" });
    const left = el("div", {});
    const right = el("div", {});

    const instructions = el("textarea", { class: "instructions-input", maxlength: "4000", placeholder: "How should Alcove behave in this project? Audience, tone, the things never to suggest." });
    instructions.value = data.project.instructions || "";
    left.append(
      el("section", { class: "card" },
        el("div", { class: "card__row" }, el("h2", { text: "Project instructions" }),
          el("button", {
            class: "btn btn--secondary btn--sm", type: "button",
            onclick: async (event) => {
              const button = event.currentTarget;
              button.disabled = true;
              try {
                const { project } = await api(`/api/projects/${id}`, { method: "PATCH", body: { instructions: instructions.value } });
                state.project = project;
                toast("Instructions saved");
              } catch (error) { toast(error.message); } finally { button.disabled = false; }
            }
          }, "Save")
        ),
        el("p", { text: "Applies to every chat in this project. Project instructions win over your account-wide ones." }),
        el("div", { style: "margin-top:12px" }, instructions)
      )
    );

    const chatsCard = el("section", { class: "card" },
      el("div", { class: "card__row" },
        el("h2", { text: "Chats in this project" }),
        el("button", { class: "btn btn--primary btn--sm", type: "button", onclick: () => startProjectChat(data.project) }, icon("plus"), "New chat")
      )
    );
    if (!data.chats.length) {
      chatsCard.append(el("p", { text: "No chats yet. Start one and it will use the instructions and knowledge here." }));
    } else {
      for (const chat of data.chats) {
        chatsCard.append(
          el("button", { class: "project-chat-row", type: "button", onclick: () => navigate(`/chat/${chat.id}`) },
            icon("book"),
            el("span", { text: chat.title }),
            el("small", { text: relativeTime(chat.updatedAt) })
          )
        );
      }
    }
    left.append(chatsCard);

    const docs = el("section", { class: "card" });
    const docInput = el("input", { type: "file", hidden: true, multiple: true, accept: ".txt,.md,.csv,.json,.html,.css,.js,.ts,.py,.sql,.yaml,.yml,.xml" });
    docInput.addEventListener("change", async () => {
      for (const file of [...docInput.files]) {
        if (file.size > 200_000) { toast(`${file.name} is over 200 KB.`); continue; }
        const content = await file.text();
        try {
          await api(`/api/projects/${id}/docs`, { method: "POST", body: { name: file.name, content } });
          toast(`${file.name} added`);
        } catch (error) { toast(error.message); }
      }
      renderProjectPage(id);
    });
    docs.append(
      el("div", { class: "card__row" },
        el("h2", { text: "Knowledge" }),
        el("button", { class: "btn btn--secondary btn--sm", type: "button", onclick: () => docInput.click() }, icon("plus"), "Add file")
      ),
      el("p", { text: "Text files only, up to 200 KB each. These travel with every chat in this project and never with a public share." }),
      docInput
    );
    if (!data.docs.length) {
      docs.append(el("div", { class: "empty", style: "margin-top:12px" }, "Empty. Add the brief, the notes, or the style guide."));
    } else {
      for (const doc of data.docs) {
        docs.append(
          el("div", { class: "doc-row" },
            icon("file"),
            el("span", { text: doc.name }),
            el("small", { text: formatBytes(doc.size) }),
            el("button", {
              type: "button", "aria-label": `Remove ${doc.name}`,
              onclick: async () => {
                try {
                  await api(`/api/projects/${id}/docs/${doc.id}`, { method: "DELETE" });
                  renderProjectPage(id);
                  toast("Removed");
                } catch (error) { toast(error.message); }
              }
            }, icon("x"))
          )
        );
      }
    }
    right.append(docs);

    layout.append(left, right);
    page.append(layout);
    dom.view.replaceChildren(page);
    renderSidebar();
  } catch (error) {
    dom.view.replaceChildren(el("div", { class: "page" }, el("div", { class: "empty", text: error.message })));
  }
}

async function startProjectChat(project) {
  try {
    const { chat } = await api("/api/chats", { method: "POST", body: { projectId: project.id, model: state.prefs.model, styleId: state.prefs.styleId, thinking: state.prefs.thinking } });
    upsertChat(chat);
    navigate(`/chat/${chat.id}`);
  } catch (error) {
    toast(error.message);
  }
}

async function archiveProject(project) {
  try {
    await api(`/api/projects/${project.id}`, { method: "PATCH", body: { archived: !project.archived } });
    toast(project.archived ? "Project restored" : "Project archived");
    state.projects = state.projects.map((item) => item.id === project.id ? { ...item, archived: !project.archived } : item);
    renderSidebar();
    navigate("/projects");
  } catch (error) { toast(error.message); }
}

async function deleteProject(project) {
  const ok = await confirmAction({
    title: `Delete “${project.name}”?`,
    body: "The project, its instructions and its knowledge files are removed. Its chats move back to Recents.",
    confirmLabel: "Delete project"
  });
  if (!ok) return;
  try {
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    state.projects = state.projects.filter((item) => item.id !== project.id);
    if (state.project && state.project.id === project.id) state.project = null;
    renderSidebar();
    navigate("/projects");
    toast("Project deleted");
  } catch (error) { toast(error.message); }
}

function openProjectDialog() {
  if (!ensureSignedIn()) return;
  const form = $("#projectForm");
  form.reset();
  $("#projectNameError").hidden = true;
  $("#projectError").hidden = true;
  openDialog($("#projectDialog"));
  setTimeout(() => $("#projectName").focus(), 40);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const name = $("#projectName").value.trim();
    if (!name) {
      $("#projectNameError").textContent = "Give the project a name.";
      $("#projectNameError").hidden = false;
      $("#projectName").focus();
      return;
    }
    const button = $("#projectSubmit");
    button.disabled = true;
    try {
      const { project } = await api("/api/projects", {
        method: "POST",
        body: { name, description: $("#projectDesc").value.trim() }
      });
      state.projects.unshift(project);
      closeDialog($("#projectDialog"));
      toast("Project created");
      navigate(`/project/${project.id}`);
    } catch (error) {
      if (error.field === "name") {
        $("#projectNameError").textContent = error.message;
        $("#projectNameError").hidden = false;
      } else {
        $("#projectError").textContent = error.message;
        $("#projectError").hidden = false;
      }
    } finally {
      button.disabled = false;
    }
  };
}

/* ------------------------------------------------------------------- share */

function openShareDialog() {
  if (!state.chat || state.incognito) return;
  const dialog = $("#shareDialog");
  const row = $("#shareLinkRow");
  const input = $("#shareLink");
  const status = $("#shareStatus");
  status.textContent = "";
  const shared = Boolean(state.chat.shared);
  $("#shareSwitch").setAttribute("aria-checked", String(shared));
  $("#shareState").textContent = shared ? "On — anyone with the link can read a snapshot." : "Off — only you can open this chat.";
  row.hidden = !shared;
  if (shared && state.chat.shareToken) input.value = `${location.origin}/s/${state.chat.shareToken}`;
  else if (shared) input.value = "Use Share again to refresh the link.";
  openDialog(dialog);
}

async function toggleShare(on) {
  if (!state.chat) return;
  const status = $("#shareStatus");
  const toggle = $("#shareSwitch");
  toggle.disabled = true;
  try {
    if (on) {
      const data = await api(`/api/chats/${state.chat.id}/share`, { method: "POST" });
      state.chat = { ...state.chat, shared: true, sharedAt: data.sharedAt };
      $("#shareLink").value = `${location.origin}/s/${data.token}`;
      $("#shareLinkRow").hidden = false;
      $("#shareState").textContent = "On — anyone with the link can read a snapshot.";
      toggle.setAttribute("aria-checked", "true");
      status.textContent = "Link created. Copy it before you close this.";
      upsertChat(state.chat);
    } else {
      await api(`/api/chats/${state.chat.id}/share`, { method: "DELETE" });
      state.chat = { ...state.chat, shared: false, sharedAt: null, shareToken: null };
      $("#shareLinkRow").hidden = true;
      $("#shareState").textContent = "Off — only you can open this chat.";
      toggle.setAttribute("aria-checked", "false");
      status.textContent = "Link revoked. It no longer opens.";
      upsertChat(state.chat);
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    toggle.disabled = false;
  }
}

async function renderSharePage(token) {
  const view = el("div", { class: "share-page" });
  view.append(el("div", { class: "skeleton" }, el("span"), el("span"), el("span")));
  dom.view.replaceChildren(view);

  try {
    const data = await api(`/api/share/${token}`);
    const thread = el("div", { class: "share-page__thread" });
    for (const message of data.messages) {
      if (message.role === "user") {
        thread.append(el("article", { class: "msg msg--user" }, el("div", { class: "msg__bubble", text: message.content })));
      } else {
        const body = el("div", { class: "msg__body prose" });
        body.innerHTML = renderMarkdown(message.content);
        const article = el("article", { class: "msg msg--assistant" },
          el("div", { class: "msg__head" },
            el("span", { class: "msg__mark" }, mark(15)),
            el("span", { text: "Alcove" }),
            el("span", { class: "msg__model", text: modelById(data.chat.model).name })
          )
        );
        if (message.thinking) article.append(thinkingBlock(message.thinking, false));
        article.append(body);
        for (const artifact of message.artifacts || []) {
          article.append(
            el("div", { class: "artifact-card" },
              el("span", { class: "artifact-card__icon" }, icon("code")),
              el("div", { class: "artifact-card__text" }, el("strong", { text: artifact.title }), el("span", { text: `${artifact.kind} · ${artifact.language}` })),
              el("button", { class: "btn btn--secondary btn--sm", type: "button", onclick: () => openArtifact(artifact) }, "View")
            )
          );
        }
        thread.append(article);
      }
    }

    view.replaceChildren(
      el("div", { class: "share-page__banner" },
        el("span", { class: "brand__mark" }, mark(14)),
        el("span", { text: "A read-only snapshot shared from Alcove. Messages sent after sharing stay private." })
      ),
      el("h1", { text: data.chat.title }),
      el("p", { class: "share-page__meta", text: `Shared ${new Date(data.chat.sharedAt).toLocaleString()} · ${data.messages.length} messages` }),
      thread,
      el("div", { class: "share-page__foot" },
        el("span", { text: "Alcove is a clean-room study of a chat workspace." }),
        el("a", { class: "link", href: "/" }, "Open Alcove →")
      )
    );
  } catch (error) {
    view.replaceChildren(
      el("div", { class: "signed-out-main" },
        el("h1", { text: "This link is not available" }),
        el("p", { text: error.status === 404 ? "It may have been revoked, or the chat it pointed at was deleted. Ask the person who shared it for a fresh link." : error.message }),
        el("a", { class: "btn btn--primary", href: "/" }, "Go to Alcove")
      )
    );
  }
}

/* -------------------------------------------------------------------- auth */

function setAuthMode(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  $("#authTitle").textContent = signup ? "Create your account" : "Welcome back";
  $("#authSub").textContent = signup
    ? "An email and a password is all this build stores. Your chats stay yours."
    : "Sign in to keep your chats, projects and settings.";
  $("#nameField").hidden = !signup;
  $("#authPassword").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  $("#passwordHint").hidden = !signup;
  $("#authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("#authSwitchText").textContent = signup ? "Already have an account?" : "New here?";
  $("#authToggle").textContent = signup ? "Sign in instead" : "Create an account";
  clearAuthErrors();
}

function clearAuthErrors() {
  for (const selector of ["#emailError", "#passwordError", "#authError"]) {
    const node = $(selector);
    if (!node) continue;
    node.textContent = "";
    node.hidden = true;
  }
  $("#authEmail").removeAttribute("aria-invalid");
  $("#authPassword").removeAttribute("aria-invalid");
}

function fieldError(selector, message) {
  const node = $(selector);
  node.textContent = message;
  node.hidden = false;
  if (selector === "#emailError") $("#authEmail").setAttribute("aria-invalid", "true");
  if (selector === "#passwordError") $("#authPassword").setAttribute("aria-invalid", "true");
}

function openAuth(mode = "signin") {
  setAuthMode(mode);
  $("#authForm").reset();
  clearAuthErrors();
  openDialog($("#authDialog"));
  setTimeout(() => (mode === "signup" ? $("#authName") : $("#authEmail")).focus(), 40);
}

async function submitAuth(event) {
  event.preventDefault();
  clearAuthErrors();
  const signup = state.authMode === "signup";
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  let ok = true;
  if (!email) { fieldError("#emailError", "Enter your email."); ok = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fieldError("#emailError", "That does not look like an email address."); ok = false; }
  if (!password) { fieldError("#passwordError", "Enter your password."); ok = false; }
  else if (signup && password.length < 8) { fieldError("#passwordError", "Use at least 8 characters."); ok = false; }
  if (!ok) {
    const first = $("[aria-invalid='true']");
    if (first) first.focus();
    return;
  }

  const button = $("#authSubmit");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = signup ? "Creating account…" : "Signing in…";
  $("#authForm").setAttribute("aria-busy", "true");
  try {
    const data = await api(signup ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      body: signup ? { email, password, name: $("#authName").value.trim() } : { email, password }
    });
    state.user = data.user;
    closeDialog($("#authDialog"));
    await loadWorkspace();
    await adoptServerPrefs();
    renderAccount();
    toast(signup ? `Welcome, ${state.user.name}` : `Signed in as ${state.user.name}`);
    await renderRoute();
  } catch (error) {
    if (error.field === "email") { fieldError("#emailError", error.message); $("#authEmail").focus(); }
    else if (error.field === "password") { fieldError("#passwordError", error.message); $("#authPassword").focus(); }
    else {
      $("#authError").textContent = error.message;
      $("#authError").hidden = false;
    }
  } finally {
    button.disabled = false;
    button.textContent = label;
    $("#authForm").removeAttribute("aria-busy");
  }
}

async function signOut({ all = false } = {}) {
  try {
    await api(all ? "/api/auth/logout-all" : "/api/auth/logout", { method: "POST" });
  } catch {
    /* the cookie may already be gone */
  }
  state.user = null;
  state.chats = [];
  state.projects = [];
  state.styles = [];
  state.usage = null;
  state.chat = null;
  state.messages = [];
  state.project = null;
  renderAccount();
  renderSidebar();
  closeDialog($("#settingsDialog"));
  navigate("/");
  toast(all ? "Signed out everywhere" : "Signed out");
}

function renderAccount() {
  const signedIn = Boolean(state.user);
  $("#acctOut").hidden = signedIn;
  $("#acctIn").hidden = !signedIn;
  $("#menuSignOut").hidden = !signedIn;
  $("#menuSignIn").hidden = signedIn;
  $("#userName").textContent = signedIn ? state.user.name : "Signed out";
  $("#userPlan").textContent = signedIn ? `${state.user.plan === "free" ? "Free" : state.user.plan} plan` : "No account";
  $("#userAvatar").textContent = initials(signedIn ? state.user.name : "");
  $("#menuHead").textContent = signedIn ? `${state.user.name} · ${state.user.email}` : "Not signed in";
  if (signedIn) {
    $("#acctEmail").textContent = state.user.email;
    $("#acctSince").textContent = new Date(state.user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    $("#acctPlan").textContent = state.user.plan === "free" ? "Free" : state.user.plan;
    $("#setName").value = state.user.name;
    $("#usagePlan").textContent = state.user.plan === "free" ? "Free" : state.user.plan;
    $("#accountStatus").textContent = "";
    $("#deleteConfirm").hidden = true;
  }
}

/* ---------------------------------------------------------------- settings */

function openSettings(tab = "general") {
  renderAccount();
  renderSettings(tab);
  if (state.user) renderSharedList();
  openDialog($("#settingsDialog"));
}

function setSettingsTab(name) {
  for (const tab of $$(".settings__tab")) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "true");
    else tab.removeAttribute("aria-current");
  }
  for (const pane of $$(".settings__pane")) pane.hidden = pane.dataset.pane !== name;
}

function renderSettings(tab) {
  setSettingsTab(tab);
  if (tab === "customize") renderStyleList();
  if (tab === "usage") renderUsagePanel();
  if (tab === "privacy") renderSharedList();
  if (tab === "account") renderAccount();
}

function renderUsagePanel() {
  const usage = state.usage;
  if (!usage) return;
  $("#usageCount").textContent = `${usage.used} of ${usage.limit}`;
  $("#usageMeterFill").style.width = `${Math.min(100, Math.round((usage.used / usage.limit) * 100))}%`;
  $("#usageMeterFill").className = usage.used >= usage.limit ? "is-full" : usage.used / usage.limit >= 0.7 ? "is-warning" : "";
  $("#usageReset").textContent = `Window started ${new Date(usage.windowStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${resetCountdown(usage.resetsAt)}`;
  $("#usageChats").textContent = String(state.chats.length);
  $("#usageProjects").textContent = String(state.projects.length);
}

function renderStyleList() {
  const list = $("#styleList");
  if (!list) return;
  list.replaceChildren();
  for (const style of BUILTIN_STYLES) {
    list.append(
      el("div", { class: "style-card" },
        el("div", { class: "style-card__text" },
          el("strong", { text: style.name }),
          el("span", { text: style.description })
        ),
        el("span", { class: "style-card__tag", text: "Preset" })
      )
    );
  }
  for (const style of state.styles) {
    list.append(
      el("div", { class: "style-card" },
        el("div", { class: "style-card__text" },
          el("strong", { text: style.name }),
          el("span", { text: style.description || style.instructions.slice(0, 90) })
        ),
        el("div", { class: "style-card__actions" },
          el("button", {
            class: "icon-btn", type: "button", "aria-label": `Edit ${style.name}`,
            onclick: () => openStyleDialog(style)
          }, icon("pencil")),
          el("button", {
            class: "icon-btn", type: "button", "aria-label": `Delete ${style.name}`,
            onclick: async () => {
              const ok = await confirmAction({ title: `Delete “${style.name}”?`, body: "Chats using it fall back to Normal.", confirmLabel: "Delete style" });
              if (!ok) return;
              try {
                await api(`/api/styles/${style.id}`, { method: "DELETE" });
                state.styles = state.styles.filter((item) => item.id !== style.id);
                if (state.prefs.styleId === style.id) changePrefs({ styleId: "normal" });
                renderStyleList();
                renderStyleButton();
                toast("Style deleted");
              } catch (error) { toast(error.message); }
            }
          }, icon("trash"))
        )
      )
    );
  }
}

function openStyleDialog(style) {
  const form = $("#styleForm");
  form.reset();
  $("#styleNameError").hidden = true;
  $("#styleError").hidden = true;
  $("#styleFormError").hidden = true;
  $("#styleDialogTitle").textContent = style ? "Edit style" : "Create a style";
  $("#styleSubmit").textContent = style ? "Save style" : "Create style";
  if (style) {
    $("#styleName").value = style.name;
    $("#styleDesc").value = style.description;
    $("#styleInstructions").value = style.instructions;
  }
  openDialog($("#styleDialog"));
  setTimeout(() => $("#styleName").focus(), 40);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const name = $("#styleName").value.trim();
    const instructions = $("#styleInstructions").value.trim();
    let ok = true;
    if (!name) { $("#styleNameError").textContent = "Name the style."; $("#styleNameError").hidden = false; ok = false; }
    if (instructions.length < 10) { $("#styleError").textContent = "Add a sentence or two."; $("#styleError").hidden = false; ok = false; }
    if (!ok) return;
    const button = $("#styleSubmit");
    button.disabled = true;
    try {
      const body = { name, description: $("#styleDesc").value.trim(), instructions };
      const data = style
        ? await api(`/api/styles/${style.id}`, { method: "PATCH", body })
        : await api("/api/styles", { method: "POST", body });
      if (style) state.styles = state.styles.map((item) => item.id === style.id ? data.style : item);
      else state.styles.push(data.style);
      if (!style) changePrefs({ styleId: data.style.id });
      closeDialog($("#styleDialog"));
      renderStyleList();
      renderStyleButton();
      toast(style ? "Style saved" : "Style created");
    } catch (error) {
      if (error.field === "name") { $("#styleNameError").textContent = error.message; $("#styleNameError").hidden = false; }
      else { $("#styleFormError").textContent = error.message; $("#styleFormError").hidden = false; }
    } finally {
      button.disabled = false;
    }
  };
}

function renderSharedList() {
  const list = $("#sharedList");
  if (!list) return;
  const shared = state.chats.filter((chat) => chat.shared);
  list.replaceChildren();
  if (!shared.length) {
    list.append(el("p", { class: "settings__note", text: "No public links. Sharing is off for every chat." }));
    return;
  }
  for (const chat of shared) {
    list.append(
      el("div", { class: "share-row" },
        icon("share"),
        el("span", { text: chat.title }),
        el("button", {
          class: "btn btn--secondary btn--sm", type: "button",
          onclick: async () => {
            try {
              await api(`/api/chats/${chat.id}/share`, { method: "DELETE" });
              upsertChat({ ...chat, shared: false });
              if (state.chat && state.chat.id === chat.id) state.chat = { ...state.chat, shared: false };
              renderSharedList();
              toast("Link revoked");
            } catch (error) { toast(error.message); }
          }
        }, "Unshare")
      )
    );
  }
}

/* ------------------------------------------------------------------ menus */

function toggleMenu(menu, trigger) {
  const willOpen = menu.hidden;
  closeAllMenus(menu);
  menu.hidden = !willOpen;
  if (trigger) trigger.setAttribute("aria-expanded", String(willOpen));
  if (willOpen && menu.id === "modelMenu") renderModelMenu();
  if (willOpen && menu.id === "styleMenu") renderStyleMenu();
  if (willOpen && menu.id === "userMenu") renderAccount();
  return willOpen;
}

function renderModelMenu() {
  const menu = $("#modelMenu");
  menu.replaceChildren(
    ...MODELS.map((model) =>
      el("button", {
        class: "menu__item", type: "button", role: "menuitemradio",
        "aria-checked": String(state.prefs.model === model.id),
        onclick: () => {
          changePrefs({ model: model.id });
          menu.hidden = true;
          $("#modelBtn").setAttribute("aria-expanded", "false");
        }
      }, icon(state.prefs.model === model.id ? "check" : "spark"),
        el("span", {}, el("strong", { text: model.name }), el("small", { text: model.blurb })))
    )
  );
}

function renderStyleMenu() {
  const menu = $("#styleMenu");
  menu.replaceChildren(
    ...allStyles().map((style) =>
      el("button", {
        class: "menu__item", type: "button", role: "menuitemradio",
        "aria-checked": String(state.prefs.styleId === style.id),
        onclick: () => {
          changePrefs({ styleId: style.id });
          menu.hidden = true;
          $("#styleBtn").setAttribute("aria-expanded", "false");
        }
      }, icon(state.prefs.styleId === style.id ? "check" : "spark"),
        el("span", {}, el("strong", { text: style.name }), el("small", { text: style.description || "Custom style" })))
    ),
    el("div", { class: "menu__sep" }),
    el("button", {
      class: "menu__item", type: "button", role: "menuitem",
      onclick: () => {
        menu.hidden = true;
        openSettings("customize");
      }
    }, icon("pencil"), "Create & edit styles")
  );
}

/* ------------------------------------------------------------------- boot */

function loadRepresentativeState() {
  renderSidebar();
  renderUsage();
}

async function loadWorkspace() {
  try {
    const data = await api("/api/overview");
    state.chats = data.chats || [];
    state.projects = data.projects || [];
    state.styles = data.styles || [];
    state.usage = data.usage || null;
    renderSidebar();
    renderUsage();
  } catch (error) {
    if (error.status !== 401) toast("Could not load your workspace");
    state.chats = [];
    state.projects = [];
    state.styles = [];
    renderSidebar();
  }
}

function leaveIncognito({ silent = false } = {}) {
  if (!state.incognito) return;
  state.incognito = false;
  state.chat = null;
  state.messages = [];
  dom.title.textContent = "New chat";
  dom.topbarIncognito.hidden = true;
  $("#incognitoToggle").setAttribute("aria-pressed", "false");
  if (!silent) toast("Incognito off. That thread is gone.");
}

function toggleIncognito() {
  if (state.incognito) {
    leaveIncognito();
    navigate("/");
    return;
  }
  if (!ensureSignedIn()) return;
  state.incognito = true;
  state.chat = null;
  state.messages = [];
  state.project = null;
  $("#incognitoToggle").setAttribute("aria-pressed", "true");
  navigate("/");
  renderHome();
  toast("Incognito on. Nothing here is saved.");
}

function bind() {
  /* composer */
  dom.prompt.addEventListener("input", resizePrompt);
  dom.prompt.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (state.stream) stopStream();
      else sendMessage();
    }
  });
  dom.composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.stream) stopStream();
    else sendMessage();
  });
  dom.sendBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (state.stream) stopStream();
    else sendMessage();
  });

  dom.composer.addEventListener("dragover", (event) => {
    event.preventDefault();
    dom.composer.classList.add("is-dragging");
  });
  dom.composer.addEventListener("dragleave", () => dom.composer.classList.remove("is-dragging"));
  dom.composer.addEventListener("drop", async (event) => {
    event.preventDefault();
    dom.composer.classList.remove("is-dragging");
    if (event.dataTransfer && event.dataTransfer.files.length) await readFiles(event.dataTransfer.files);
  });

  $("#attachBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu($("#plusMenu"), $("#attachBtn"));
  });
  $("#attachFile").addEventListener("click", () => {
    $("#plusMenu").hidden = true;
    dom.fileInput.click();
  });
  $("#useProjectContext").addEventListener("click", () => {
    $("#plusMenu").hidden = true;
    if (state.project) toast(`${state.project.name} knowledge is already in this thread.`);
    else toast("Open a chat inside a project to use its knowledge.");
  });
  dom.fileInput.addEventListener("change", async () => {
    await readFiles(dom.fileInput.files);
    dom.fileInput.value = "";
  });

  $("#modelBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu($("#modelMenu"), $("#modelBtn"));
  });
  $("#styleBtn").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu($("#styleMenu"), $("#styleBtn"));
  });
  $("#thinkingBtn").addEventListener("click", () => {
    changePrefs({ thinking: !state.prefs.thinking });
    toast(state.prefs.thinking ? "Extended thinking on" : "Extended thinking off");
  });

  /* account */
  $("#userPill").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu($("#userMenu"), $("#userPill"));
  });
  $("#menuSignOut").addEventListener("click", () => { $("#userMenu").hidden = true; signOut(); });
  $("#settingsSignOut").addEventListener("click", () => signOut());
  $("#signOutAll").addEventListener("click", () => signOut({ all: true }));

  /* nav */
  $("#newChat").addEventListener("click", () => {
    if (state.stream) stopStream();
    if (state.incognito) toast("Incognito is on. Close it to start a saved chat.");
    navigate("/");
    dom.prompt.focus();
  });
  $("#incognitoToggle").addEventListener("click", toggleIncognito);
  $("#openSearch").addEventListener("click", () => openPalette());
  $("#sideUsage").addEventListener("click", () => {
    if (state.user) openSettings("usage");
    else openAuth("signup");
  });
  $("#brandHome").addEventListener("click", (event) => {
    event.preventDefault();
    navigate("/");
  });
  $("#openProjects").addEventListener("click", (event) => {
    event.preventDefault();
    navigate("/projects");
  });
  $("#openSettings").addEventListener("click", () => openSettings("general"));
  $("#collapseSidebar").addEventListener("click", () => {
    const collapsed = dom.app.classList.toggle("is-collapsed");
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch {}
  });
  $("#mobileMenu").addEventListener("click", () => {
    dom.app.classList.add("is-drawer-open");
    $("#scrim").hidden = false;
  });
  $("#scrim").addEventListener("click", () => {
    dom.app.classList.remove("is-drawer-open");
    $("#scrim").hidden = true;
  });

  /* topbar */
  dom.title.addEventListener("click", () => {
    if (!state.chat || state.incognito) return;
    startRenameChat(state.chat);
  });
  $("#shareBtn").addEventListener("click", openShareDialog);
  dom.chatMenuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu(dom.chatMenu, dom.chatMenuBtn);
  });
  $("#renameChat").addEventListener("click", () => {
    dom.chatMenu.hidden = true;
    if (state.chat) startRenameChat(state.chat);
  });
  $("#starChat").addEventListener("click", async () => {
    dom.chatMenu.hidden = true;
    if (!state.chat) return;
    try {
      const { chat } = await api(`/api/chats/${state.chat.id}`, { method: "PATCH", body: { starred: !state.chat.starred } });
      state.chat = chat;
      upsertChat(chat);
      toast(chat.starred ? "Starred" : "Unstarred");
    } catch (error) { toast(error.message); }
  });
  $("#moveChat").addEventListener("click", () => {
    dom.chatMenu.hidden = true;
    if (state.chat) moveChat(state.chat);
  });
  $("#deleteChat").addEventListener("click", async () => {
    dom.chatMenu.hidden = true;
    if (!state.chat) return;
    const ok = await confirmAction({
      title: "Delete this chat?",
      body: `“${state.chat.title}” will be removed from your account. This cannot be undone.`,
      confirmLabel: "Delete chat"
    });
    if (!ok) return;
    try {
      await api(`/api/chats/${state.chat.id}`, { method: "DELETE" });
      removeChatFromList(state.chat.id);
      state.chat = null;
      navigate("/");
      toast("Chat deleted");
    } catch (error) { toast(error.message); }
  });

  /* artifacts */
  $("#artifactClose").addEventListener("click", () => closeArtifact());
  $("#artifactPreviewTab").addEventListener("click", () => { state.artifact.tab = "preview"; renderArtifact(); });
  $("#artifactCodeTab").addEventListener("click", () => { state.artifact.tab = "code"; renderArtifact(); });
  $("#artifactVersions").addEventListener("change", (event) => {
    state.artifact.index = Number(event.target.value);
    renderArtifact();
  });
  $("#artifactCopy").addEventListener("click", async () => {
    const { artifact, index } = state.artifact;
    const ok = await copyText(artifactVersions(artifact)[index].code);
    toast(ok ? "Code copied" : "Could not copy");
  });
  $("#artifactDownload").addEventListener("click", downloadArtifact);

  /* auth */
  $("#authForm").addEventListener("submit", submitAuth);
  $("#authToggle").addEventListener("click", () => setAuthMode(state.authMode === "signup" ? "signin" : "signup"));

  /* dialogs */
  for (const closer of $$("[data-close]")) {
    closer.addEventListener("click", () => closeDialog(closer.closest("dialog")));
  }
  for (const dialog of $$("dialog")) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (outside) closeDialog(dialog);
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu") && !event.target.closest('[aria-haspopup="menu"]') && !event.target.closest(".chat-row__more")) {
      closeAllMenus();
      for (const menu of $$(".row-menu")) menu.remove();
    }
    const opener = event.target.closest("[data-open]");
    if (!opener) return;
    event.preventDefault();
    if (opener.dataset.open === "auth") {
      closeDialog($("#settingsDialog"));
      openAuth(opener.dataset.mode || "signin");
    }
    if (opener.dataset.open === "settings") openSettings(opener.dataset.tab || "general");
    if ($("#userMenu")) $("#userMenu").hidden = true;
  });

  /* settings */
  for (const tab of $$(".settings__tab")) {
    tab.addEventListener("click", () => renderSettings(tab.dataset.tab));
  }
  for (const radio of $$('input[name="theme"]')) {
    radio.addEventListener("change", () => { if (radio.checked) changePrefs({ theme: radio.value }); });
  }
  for (const radio of $$('input[name="fontSize"]')) {
    radio.addEventListener("change", () => { if (radio.checked) changePrefs({ fontSize: radio.value }); });
  }
  $("#setMotion").addEventListener("click", () => {
    const next = state.prefs.motion === "reduce" ? "auto" : "reduce";
    changePrefs({ motion: next });
  });
  $("#setSuggestions").addEventListener("click", () => {
    changePrefs({ suggestions: !state.prefs.suggestions });
    if (state.route.name === "home") renderHome();
  });
  $("#saveName").addEventListener("click", async () => {
    const name = $("#setName").value.trim();
    const error = $("#nameError");
    error.hidden = true;
    if (!name) { error.textContent = "Enter a display name."; error.hidden = false; $("#setName").focus(); return; }
    try {
      const { user } = await api("/api/account", { method: "PATCH", body: { name } });
      state.user = user;
      renderAccount();
      $("#accountStatus").textContent = "Name updated.";
      if (state.route.name === "home") renderHome();
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    }
  });
  $("#passwordForm").addEventListener("submit", (event) => {
    event.preventDefault();
    $("#changePassword").click();
  });
  $("#changePassword").addEventListener("click", async () => {
    const current = $("#currentPassword").value;
    const next = $("#nextPassword").value;
    const error = $("#passwordChangeError");
    error.hidden = true;
    try {
      await api("/api/account/password", { method: "PATCH", body: { current, next } });
      $("#currentPassword").value = "";
      $("#nextPassword").value = "";
      $("#accountStatus").textContent = "Password changed. Other devices are signed out.";
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    }
  });
  $("#saveInstructions").addEventListener("click", async () => {
    const value = $("#accountInstructions").value;
    changePrefs({ instructions: value }, { quiet: true });
    $("#instructionsStatus").textContent = state.user ? "Saved to your account." : "Saved on this device.";
    setTimeout(() => { $("#instructionsStatus").textContent = ""; }, 2200);
  });
  $("#newStyle").addEventListener("click", () => openStyleDialog(null));
  $("#upgradeBtn").addEventListener("click", () => {
    $("#upgradeStatus").textContent = "Payments are not part of this build. The message window resets on its own.";
  });
  $("#exportData").addEventListener("click", async () => {
    try {
      $("#dataStatus").textContent = "Building your export…";
      await downloadFile("/api/export", `alcove-export-${new Date().toISOString().slice(0, 10)}.json`);
      $("#dataStatus").textContent = "Export downloaded.";
    } catch (error) {
      $("#dataStatus").textContent = error.message;
    }
  });
  $("#deleteAccount").addEventListener("click", () => {
    $("#deleteConfirm").hidden = false;
    $("#deleteConfirmYes").focus();
  });
  $("#deleteConfirmNo").addEventListener("click", () => {
    $("#deleteConfirm").hidden = true;
    $("#deleteAccount").focus();
  });
  $("#deleteConfirmYes").addEventListener("click", async () => {
    const button = $("#deleteConfirmYes");
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
      await api("/api/account", { method: "DELETE" });
      state.user = null;
      state.chats = [];
      state.projects = [];
      state.styles = [];
      state.usage = null;
      renderAccount();
      closeDialog($("#settingsDialog"));
      navigate("/");
      renderSidebar();
      toast("Account deleted");
    } catch (error) {
      $("#dataStatus").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Delete everything";
    }
  });

  $("#shareSwitch").addEventListener("click", () => {
    const on = $("#shareSwitch").getAttribute("aria-checked") !== "true";
    toggleShare(on);
  });
  $("#copyShare").addEventListener("click", async () => {
    const value = $("#shareLink").value;
    const ok = await copyText(value);
    $("#shareStatus").textContent = ok ? "Link copied." : "Select the link and copy it.";
  });

  /* palette */
  $("#paletteInput").addEventListener("input", (event) => {
    const value = event.target.value;
    if (state.paletteMode === "move") renderPalette(value);
    else searchRemote(value);
  });
  $("#paletteInput").addEventListener("keydown", paletteKeydown);

  /* keyboard */
  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if ($("#palette").open) closeDialog($("#palette"));
      else openPalette();
      return;
    }
    if (mod && event.key.toLowerCase() === "j") {
      event.preventDefault();
      dom.prompt.focus();
      return;
    }
    if (event.key === "Escape" && state.stream) {
      event.preventDefault();
      stopStream();
    }
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemTheme = () => { if (state.prefs.theme === "system") applyPrefs(); };
  if (media.addEventListener) media.addEventListener("change", onSystemTheme);
  else if (media.addListener) media.addListener(onSystemTheme);

  window.addEventListener("popstate", () => renderRoute());
}

async function boot() {
  applyPrefs();
  bind();
  try {
    localStorage.getItem(SIDEBAR_KEY) === "1" && dom.app.classList.add("is-collapsed");
  } catch {}

  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch {
    state.user = null;
  }

  if (state.user) {
    await adoptServerPrefs();
    await loadWorkspace();
  } else {
    loadRepresentativeState();
  }
  renderAccount();
  await renderRoute();
}

boot().catch((error) => {
  console.error(error);
  dom.view.replaceChildren(
    el("div", { class: "signed-out-main" },
      el("h1", { text: "Alcove could not start" }),
      el("p", { text: "Reload the page. If it keeps happening, the Worker or its database is unavailable." }),
      el("button", { class: "btn btn--primary", type: "button", onclick: () => location.reload() }, "Reload")
    )
  );
});
