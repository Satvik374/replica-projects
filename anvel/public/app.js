/* Anvel — the app: routing, dashboard, workspace, chat, versions, publish.
   Agent logic lives in agent.js; the editor in editor.js; accounts in account.js. */

import * as account from "./account.js";
import { createEditor } from "./editor.js";
import { build, followUp, plan } from "./agent.js";
import { inlineDocument, slug as slugify } from "./gen-kit.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const initials = (value) => (String(value || "?").trim()[0] || "?").toUpperCase();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function timeAgo(ts) {
  const diff = Math.max(0, Date.now() - Number(ts || Date.now()));
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(Number(ts)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clock(ts) {
  return new Date(Number(ts || Date.now())).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

const state = {
  user: null,
  usage: null,
  settings: { theme: "system", showTokens: true, defaultMode: "website" },
  projects: [],
  project: null,
  files: [],
  messages: [],
  versions: [],
  deploy: null,
  versionFiles: null,
  previewVersion: null,
  mode: "website",
  planMode: false,
  busy: false,
  view: "landing",
  editor: null,
  composers: []
};

/* ---------------------------------------------------------------- toasts */

let toastTimer = 0;
function toast(message, kind = "") {
  const host = $("#toasts");
  if (!host) return;
  const node = document.createElement("div");
  node.className = `toast ${kind}`.trim();
  node.textContent = message;
  host.appendChild(node);
  clearTimeout(toastTimer);
  setTimeout(() => node.remove(), 3600);
  toastTimer = window.setTimeout(() => {}, 0);
}

/* -------------------------------------------------------------- composers */

function mountComposer(host, options = {}) {
  const { submitLabel = "Build now", onSubmit, placeholder } = options;
  const template = $("#tpl-composer");
  if (!host || !template) return null;
  const node = template.content.firstElementChild.cloneNode(true);
  host.appendChild(node);

  const textarea = $(".composer-input", node);
  const send = $('[data-composer="send"]', node);
  const sendLabel = $("[data-send-label]", node);
  const planToggle = $('[data-composer="plan"]', node);
  if (placeholder) textarea.placeholder = placeholder;
  sendLabel.textContent = submitLabel;

  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(180, textarea.scrollHeight)}px`;
  };
  const sync = () => {
    const wasDisabled = send.disabled;
    send.disabled = !textarea.value.trim() || state.busy;
    /* One shine the moment the button becomes usable, then never again until it
       is disabled and re-armed. Restart the animation by forcing a reflow. */
    if (wasDisabled && !send.disabled) {
      send.classList.remove("is-enabled");
      void send.offsetWidth;
      send.classList.add("is-enabled");
    }
    resize();
  };

  const fire = () => {
    const value = textarea.value.trim();
    if (!value || state.busy) return;
    textarea.value = "";
    sync();
    onSubmit?.(value);
  };

  textarea.addEventListener("input", sync);
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      fire();
    }
  });
  send.addEventListener("click", fire);
  $('[data-composer="attach"]', node).addEventListener("click", () => {
    toast("Uploads are not wired in this build — describe the content instead.", "");
  });
  planToggle.addEventListener("click", () => {
    state.planMode = !state.planMode;
    $$('[data-composer="plan"]').forEach((button) => button.setAttribute("aria-pressed", String(state.planMode)));
    toast(state.planMode ? "Plan mode: the next prompt only writes a plan." : "Plan mode off: prompts build.", "");
  });

  const api = {
    node,
    value: () => textarea.value,
    setValue: (value) => {
      textarea.value = value;
      sync();
      textarea.focus();
    },
    focus: () => textarea.focus(),
    setBusy: (busy) => {
      if (sendLabel) sendLabel.textContent = busy ? "Working…" : submitLabel;
      textarea.disabled = false;
      sync();
    }
  };
  state.composers.push(api);
  sync();
  return api;
}

/* ------------------------------------------------------------------ chrome */

function renderUserChrome() {
  const user = state.user;
  if (!user) return;
  $("#account-name").textContent = user.username;
  $("#account-avatar").textContent = initials(user.name || user.username);
  $("#account-plan").textContent = user.plan === "free" ? "Free" : user.plan;
  renderUsage();
}

function renderUsage() {
  const usage = state.usage;
  const dayTokens = usage?.dayTokens ?? 0;
  const dayLimit = usage?.dayLimit ?? 300000;
  const monthTokens = usage?.monthTokens ?? 0;
  const monthLimit = usage?.monthLimit ?? 1000000;
  const dayPct = Math.min(100, Math.round((dayTokens / dayLimit) * 100));
  const monthPct = Math.min(100, Math.round((monthTokens / monthLimit) * 100));

  const sideMeter = $("#side-meter-day");
  if (sideMeter) {
    sideMeter.style.width = `${dayPct}%`;
    sideMeter.className = dayPct >= 100 ? "full" : dayPct > 80 ? "warn" : "";
  }
  const sideCopy = $("#side-usage-copy");
  if (sideCopy) sideCopy.textContent = `${account.formatTokens(dayTokens)} of ${account.formatTokens(dayLimit)} tokens`;

  const dayMeter = $("#usage-day");
  if (dayMeter) {
    dayMeter.style.width = `${dayPct}%`;
    dayMeter.className = dayPct >= 100 ? "full" : dayPct > 80 ? "warn" : "";
  }
  const monthMeter = $("#usage-month");
  if (monthMeter) {
    monthMeter.style.width = `${monthPct}%`;
    monthMeter.className = monthPct >= 100 ? "full" : monthPct > 80 ? "warn" : "";
  }
  const dayCopy = $("#usage-day-copy");
  if (dayCopy) dayCopy.textContent = `${account.formatTokens(dayTokens)} of ${account.formatTokens(dayLimit)} tokens`;
  const monthCopy = $("#usage-month-copy");
  if (monthCopy) monthCopy.textContent = `${account.formatTokens(monthTokens)} of ${account.formatTokens(monthLimit)} tokens`;

  const settingsAccount = $("#settings-account");
  if (settingsAccount) {
    settingsAccount.textContent = state.user
      ? `${state.user.name} · ${state.user.email} · ${state.user.plan === "free" ? "Free plan" : state.user.plan}`
      : "Not signed in.";
  }
  state.composers.forEach((composer) => composer.setBusy(state.busy));
}

function showShell(show) {
  $("#marketing").hidden = show;
  $("#shell").hidden = !show;
  document.body.dataset.view = show ? "app" : "landing";
}

function setSidebarActive(view) {
  $$("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("data-nav") === view);
  });
}

function navigate(hash) {
  if (location.hash === hash) {
    route();
    return;
  }
  history.pushState(null, "", hash);
  route();
}

/* ----------------------------------------------------------------- routing */

async function route() {
  const hash = location.hash || "#/";
  const projectMatch = hash.match(/^#\/p\/([a-z0-9]+)/);

  if (!state.user) {
    showShell(false);
    if (projectMatch) state.pendingHash = hash;
    return;
  }

  showShell(true);

  if (projectMatch) {
    /* The workspace carries its own header, so the view bar would only repeat it. */
    $(".view-bar").hidden = true;
    $("#view-home").hidden = true;
    $("#view-projects").hidden = true;
    $("#view-workspace").hidden = false;
    setSidebarActive("");
    if (state.project?.id !== projectMatch[1] || !state.project) {
      await openWorkspace(projectMatch[1]);
    }
    return;
  }

  $(".view-bar").hidden = false;
  $("#view-workspace").hidden = true;
  $("#view-title").textContent = hash.startsWith("#/projects") || hash.startsWith("#/starred") || hash.startsWith("#/recent") ? "Projects" : "Home";

  if (hash.startsWith("#/")) {
    const filter = hash.includes("starred") ? "starred" : hash.includes("recent") ? "recent" : hash.includes("projects") ? "all" : "home";
    if (filter === "home") {
      $("#view-home").hidden = false;
      $("#view-projects").hidden = true;
      setSidebarActive("home");
      $("#new-project").hidden = false;
      await renderHome();
      return;
    }
    $("#view-home").hidden = true;
    $("#view-projects").hidden = false;
    setSidebarActive(filter === "starred" ? "starred" : filter === "recent" ? "recent" : "projects");
    $("#empty-title").textContent = filter === "starred" ? "No starred projects" : "No projects found";
    $("#empty-copy").textContent =
      filter === "starred" ? "Star a project and it will show up here." : "Create your first project to get started.";
    await renderProjects(filter);
  }
}

/* ---------------------------------------------------------------- projects */

async function fetchProjects(filter = "all", q = "", sort = "edited") {
  const actualFilter = filter === "starred" ? "starred" : "all";
  const data = await account.request(`/projects?filter=${actualFilter}&q=${encodeURIComponent(q)}&sort=${sort}`);
  return data.projects;
}

function cardMarkup(project) {
  const owner = state.user?.username || "you";
  return `<article class="project-card" data-id="${esc(project.id)}">
    <a class="card-thumb" href="#/p/${esc(project.id)}" aria-label="Open ${esc(project.name)}">
      <iframe src="/api/projects/${esc(project.id)}/preview" sandbox tabindex="-1" aria-hidden="true" loading="lazy" title=""></iframe>
      <button class="star-btn" type="button" data-star="${esc(project.id)}" aria-pressed="${project.starred}" aria-label="${
        project.starred ? "Unstar" : "Star"
      } ${esc(project.name)}"><svg class="ico"><use href="#i-star"></use></svg></button>
    </a>
    <div class="card-meta">
      <span class="avatar small" aria-hidden="true">${esc(initials(owner))}</span>
      <div class="card-copy">
        <p class="card-name">${esc(project.name)}</p>
        <p class="card-sub">${esc(owner)} · ${esc(timeAgo(project.updatedAt))}</p>
      </div>
      <div class="card-menu-wrap">
        <button class="icon-btn card-menu" type="button" data-menu="${esc(project.id)}" aria-haspopup="menu" aria-label="Project menu">
          <svg class="ico"><use href="#i-dots"></use></svg>
        </button>
        <div class="menu" role="menu" hidden>
          <button role="menuitem" data-act="open" data-id="${esc(project.id)}">Open</button>
          <button role="menuitem" data-act="rename" data-id="${esc(project.id)}">Rename</button>
          <button role="menuitem" data-act="duplicate" data-id="${esc(project.id)}">Duplicate</button>
          <button role="menuitem" data-act="star" data-id="${esc(project.id)}">${project.starred ? "Remove star" : "Star"}</button>
          <div class="menu-sep"></div>
          <button role="menuitem" class="danger" data-act="delete" data-id="${esc(project.id)}">Delete</button>
        </div>
      </div>
    </div>
  </article>`;
}

function wireGrid(container) {
  if (container.dataset.wired) return;
  container.dataset.wired = "1";

  container.addEventListener("click", async (event) => {
    const star = event.target.closest("[data-star]");
    if (star) {
      event.preventDefault();
      event.stopPropagation();
      const id = star.getAttribute("data-star");
      const next = star.getAttribute("aria-pressed") !== "true";
      try {
        await account.request(`/projects/${id}`, { method: "PATCH", body: { starred: next } });
        star.setAttribute("aria-pressed", String(next));
        toast(next ? "Starred" : "Star removed", "ok");
      } catch (error) {
        toast(error.message, "err");
      }
      return;
    }

    const menuButton = event.target.closest("[data-menu]");
    if (menuButton) {
      event.preventDefault();
      event.stopPropagation();
      const wrap = menuButton.closest(".card-menu-wrap");
      const menu = wrap.querySelector(".menu");
      const open = !menu.hidden;
      $$(".card-menu-wrap .menu").forEach((node) => (node.hidden = true));
      menu.hidden = open;
      return;
    }

    const action = event.target.closest("[data-act]");
    if (action) {
      event.preventDefault();
      const id = action.getAttribute("data-id");
      const project = state.projects.find((p) => p.id === id);
      const act = action.getAttribute("data-act");
      $$(".card-menu-wrap .menu").forEach((node) => (node.hidden = true));
      if (act === "open") navigate(`#/p/${id}`);
      if (act === "rename" && project) openRename(project);
      if (act === "duplicate") await duplicateProject(id);
      if (act === "star" && project) {
        await account.request(`/projects/${id}`, { method: "PATCH", body: { starred: !project.starred } });
        await refreshCurrentList();
      }
      if (act === "delete" && project) openConfirmDelete(project);
    }
  });

  document.addEventListener("click", () => {
    $$(".card-menu-wrap .menu").forEach((node) => (node.hidden = true));
    const pop = $("#publish-popover");
    if (pop && !pop.hidden && !pop.contains(event.target) && !event.target.closest("#ws-publish")) pop.hidden = true;
    const accountMenu = $("#account-menu");
    if (accountMenu && !accountMenu.hidden) accountMenu.hidden = true;
  });
}

async function renderHome() {
  const grid = $("#recent-grid");
  try {
    const projects = await fetchProjects("all", "", "edited");
    state.projects = projects;
    const recent = projects.slice(0, 6);
    grid.innerHTML = recent.length
      ? recent.map(cardMarkup).join("")
      : `<div class="empty-state" style="grid-column:1/-1">
          <div class="empty-glyph"><svg class="ico"><use href="#i-folder"></use></svg></div>
          <h3>Nothing built yet</h3>
          <p>Describe an app above and it lands here.</p>
        </div>`;
    wireGrid(grid);
  } catch (error) {
    toast(error.message, "err");
  }
}

async function renderProjects(filter) {
  const grid = $("#project-grid");
  const empty = $("#projects-empty");
  $("#project-search").value = $("#project-search").value || "";
  try {
    const projects = await fetchProjects(filter, $("#project-search").value.trim(), $("#project-sort").value);
    state.projects = projects;
    grid.innerHTML = projects.map(cardMarkup).join("");
    grid.hidden = projects.length === 0;
    empty.hidden = projects.length !== 0;
    wireGrid(grid);
  } catch (error) {
    toast(error.message, "err");
  }
}

async function refreshCurrentList() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/projects") || hash.startsWith("#/starred") || hash.startsWith("#/recent")) await renderProjects(hash);
  else await renderHome();
}

/* ------------------------------------------------------------- project ops */

function openRename(project) {
  $("#rename-input").value = project.name;
  account.openDialog("dlg-rename");
  $("#rename-input").select();
  $("#rename-form").onsubmit = async (event) => {
    event.preventDefault();
    const name = $("#rename-input").value.trim();
    if (!name) return;
    try {
      await account.request(`/projects/${project.id}`, { method: "PATCH", body: { name } });
      account.closeDialogs();
      toast("Renamed", "ok");
      if (state.project?.id === project.id) {
        state.project.name = name;
        renderWorkspaceHeader();
      }
      await refreshCurrentList();
    } catch (error) {
      toast(error.message, "err");
    }
  };
}

function openConfirmDelete(project) {
  $("#confirm-copy").textContent = `“${project.name}” will be removed with its files, chat history, versions and published site. This cannot be undone.`;
  account.openDialog("dlg-confirm");
  $("#confirm-delete").onclick = async () => {
    try {
      await account.request(`/projects/${project.id}`, { method: "DELETE" });
      account.closeDialogs();
      toast("Project deleted", "ok");
      if (state.project?.id === project.id) {
        state.project = null;
        navigate("#/projects");
      } else {
        await refreshCurrentList();
      }
    } catch (error) {
      toast(error.message, "err");
    }
  };
}

async function duplicateProject(id) {
  try {
    const data = await account.request(`/projects/${id}/duplicate`, { method: "POST" });
    toast("Duplicated", "ok");
    navigate(`#/p/${data.project.id}`);
  } catch (error) {
    toast(error.message, "err");
  }
}

/* --------------------------------------------------------------- workspace */

function chatScroll() {
  return $("#chat-scroll");
}

function scrollChat() {
  const node = chatScroll();
  if (node) node.scrollTop = node.scrollHeight;
}

function renderWorkspaceHeader() {
  if (!state.project) return;
  $("#ws-name").textContent = state.project.name;
  $("#ws-avatar").textContent = initials(state.project.name);
  $("#address-host").textContent = `anvel.app/${slugify(state.project.name)}`;
  $("#publish-label").textContent = state.deploy ? "Update" : "Publish";
  document.title = `${state.project.name} — Anvel`;
}

function userMessageNode(message) {
  const article = document.createElement("article");
  article.className = "msg msg-user";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = message.content;
  article.appendChild(bubble);
  return article;
}

function systemMessageNode(message) {
  const article = document.createElement("article");
  article.className = "msg";
  article.innerHTML = `<div class="msg-body"><p class="msg-text" style="color:var(--text-muted);font-size:12px">${esc(
    message.content
  )}</p></div>`;
  return article;
}

function agentMessageNode(message) {
  const meta = message.meta || {};
  const steps = Array.isArray(meta.steps) ? meta.steps : [];
  const files = Array.isArray(meta.files) ? meta.files : [];
  const article = document.createElement("article");
  article.className = "msg";
  article.innerHTML = `<div class="agent-avatar" aria-hidden="true">A</div>
    <div class="msg-body">
      <div class="msg-head"><span>Anvel</span><span class="msg-time">${esc(clock(message.createdAt))}</span></div>
      <p class="msg-text">${esc(message.content)}</p>
      ${
        steps.length
          ? `<ul class="steps">${steps
              .map(
                (step) =>
                  `<li class="step ${esc(step.kind || "")} done"><span class="step-dot" aria-hidden="true"></span><span class="step-text">${esc(
                    step.path ? `Wrote ${step.path} · ${step.lines} lines` : step.text || ""
                  )}</span></li>`
              )
              .join("")}</ul>`
          : ""
      }
      ${
        files.length
          ? `<div class="file-chips">${files
              .map((file) => `<span class="file-chip">${esc(file.path)} <span class="lines">· ${esc(file.lines)}</span></span>`)
              .join("")}</div>`
          : ""
      }
      ${
        meta.versionId
          ? `<div class="msg-actions"><button class="mini" type="button" data-restore-version="${esc(meta.versionId)}">Restore this version</button>
             <button class="mini" type="button" data-copy-message>Copy</button></div>`
          : `<div class="msg-actions"><button class="mini" type="button" data-copy-message>Copy</button></div>`
      }
    </div>`;
  article.querySelector("[data-copy-message]")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast("Copied", "ok");
    } catch {
      toast("Copy is blocked in this browser", "err");
    }
  });
  article.querySelector("[data-restore-version]")?.addEventListener("click", (event) => {
    restoreVersion(event.currentTarget.getAttribute("data-restore-version"));
  });
  return article;
}

function renderChat() {
  const host = chatScroll();
  host.innerHTML = "";
  if (!state.messages.length) {
    host.innerHTML = `<div class="chat-empty">
        <p>Describe what to build. The agent writes the files and the preview updates.</p>
        <div class="suggestions">
          <button class="suggestion" type="button" data-suggest="A countdown timer with 25-minute focus sessions and three presets">A focus timer with presets</button>
          <button class="suggestion" type="button" data-suggest="A kanban board for a small design team, dark theme, three columns">A three-column kanban board</button>
          <button class="suggestion" type="button" data-suggest="A landing page for a coffee subscription called Ember Roast, warm colours">A landing page, warm palette</button>
        </div>
      </div>`;
    $$("[data-suggest]", host).forEach((button) => {
      button.addEventListener("click", () => state.composers[2]?.setValue(button.getAttribute("data-suggest")));
    });
    return;
  }
  state.messages.forEach((message) => {
    if (message.role === "user") host.appendChild(userMessageNode(message));
    else if (message.role === "system") host.appendChild(systemMessageNode(message));
    else host.appendChild(agentMessageNode(message));
  });
  scrollChat();
}

async function openWorkspace(id) {
  try {
    const data = await account.request(`/projects/${id}`);
    state.project = data.project;
    state.files = data.files;
    state.messages = data.messages;
    state.versions = data.versions;
    state.deploy = data.deploy;
    state.usage = data.usage;
    state.versionFiles = null;
    state.previewVersion = null;
    if (!location.hash.includes(id)) history.pushState(null, "", `#/p/${id}`);
    renderWorkspaceHeader();
    renderChat();
    renderVersions();
    renderPublish();
    refreshPreview();
    /* Reopening a project always lands on Preview, including the sliding thumb. */
    switchTab("preview");
    if (state.editor) state.editor.setFiles(state.files);
    $("#publish-label").textContent = state.deploy ? "Update" : "Publish";
    $("#view-workspace").hidden = false;
  } catch (error) {
    toast(error.message, "err");
    navigate("#/projects");
  }
}

/* --------------------------------------------------------------- the agent */

function planOutcome(prompt) {
  const outline = plan(prompt);
  const text = `Plan only — nothing written yet.\n\n${outline.lines.join("\n")}\n\nTurn Plan off in the composer to build it.`;
  return {
    files: state.files,
    changedPaths: [],
    steps: [{ kind: "plan", text: `Wrote a ${outline.files.length}-file plan; no code changed.` }],
    reply: text,
    summary: "Plan only — no files changed.",
    tokens: 0
  };
}

const aiReady = () => !!account.state.ai?.configured;

async function sendPrompt(prompt) {
  if (state.busy) {
    toast("The agent is still working on the last prompt.", "");
    return;
  }
  if (!state.user) {
    state.pendingPrompt = prompt;
    account.openAuth("signup");
    return;
  }
  if (state.usage?.blocked) {
    toast("Today's allowance is used. Prompts reset at midnight UTC; Code view edits stay free.", "err");
    openSettings();
    return;
  }

  if (!state.project) {
    /* The local blueprints still name the project and set its mode; with a
       provider configured the model writes the files instead. */
    let draft;
    try {
      draft = build(prompt, { mode: state.mode });
    } catch (error) {
      toast("That prompt could not be turned into a project.", "err");
      return;
    }
    try {
      const data = await account.request("/projects", { method: "POST", body: { name: draft.name, mode: draft.mode } });
      await openWorkspace(data.project.id);
      if (aiReady() && !state.planMode) await runAiTurn(prompt);
      else await runTurn(prompt, draft);
    } catch (error) {
      toast(error.message, "err");
    }
    return;
  }

  if (state.planMode) {
    await runTurn(prompt, planOutcome(prompt));
    return;
  }
  if (aiReady()) {
    await runAiTurn(prompt);
    return;
  }

  const outcome = followUp(prompt, state.files);
  if (outcome.unmatched && !state.files.length) {
    toast("Build something first, then ask for changes.", "");
    return;
  }
  await runTurn(prompt, outcome);
}

/* The model runs on the server, so the chat shows a waiting bubble while the
   request is open, then hands the finished files to the same turn renderer the
   local agent uses — one code path for versions, chips, previews and usage. */
async function runAiTurn(prompt) {
  const model = account.state.ai.model || "the model";
  state.busy = true;
  renderUsage();
  const thinking = showThinking(`Asking ${model}…`);
  let outcome = null;
  try {
    const data = await account.request("/ai/turns", {
      method: "POST",
      body: { prompt, mode: state.mode, files: state.files }
    });
    outcome = data.outcome;
  } catch (error) {
    thinking?.remove();
    state.busy = false;
    renderUsage();
    toast(error.message, "err");
    /* A missing key or a provider hiccup should not strand the prompt. */
    if ((error.status === 412 || error.status === 502) && state.files.length) {
      const fallback = followUp(prompt, state.files);
      if (fallback && !fallback.unmatched) {
        toast("Answered with the local agent instead.", "");
        await runTurn(prompt, fallback);
      }
    }
    return;
  }
  thinking?.remove();
  state.busy = false;
  await runTurn(prompt, outcome);
}

function showThinking(label) {
  const host = $("#chat-scroll") || chatScroll();
  if (!host) return null;
  const node = document.createElement("article");
  node.className = "msg";
  node.innerHTML = `<div class="agent-avatar" aria-hidden="true">A</div>
    <div class="msg-body">
      <div class="msg-head"><span>Anvel</span><span class="msg-time">working…</span></div>
      <p class="msg-text typing">${esc(label)}</p>
    </div>`;
  host.appendChild(node);
  scrollChat();
  return node;
}

async function runTurn(prompt, outcome) {
  state.busy = true;
  renderUsage();
  const host = chatScroll();
  if (host.querySelector(".chat-empty")) host.innerHTML = "";

  const userMessage = { id: `local-${Date.now()}`, role: "user", content: prompt, meta: {}, createdAt: Date.now() };
  host.appendChild(userMessageNode(userMessage));
  scrollChat();

  const pending = document.createElement("article");
  pending.className = "msg";
  pending.innerHTML = `<div class="agent-avatar" aria-hidden="true">A</div>
    <div class="msg-body">
      <div class="msg-head"><span>Anvel</span><span class="msg-time">working…</span></div>
      <p class="msg-text typing"></p>
      <ul class="steps" aria-live="polite"></ul>
    </div>`;
  host.appendChild(pending);
  scrollChat();

  const stepsList = pending.querySelector(".steps");
  const textNode = pending.querySelector(".msg-text");
  const steps = [];
  for (const step of outcome.steps || []) {
    stepsList.insertAdjacentHTML(
      "beforeend",
      `<li class="step ${esc(step.kind || "")}" style="--i:${steps.length}"><span class="step-dot" aria-hidden="true"></span><span class="step-text">${esc(
        step.path ? `Wrote ${step.path} · ${step.lines} lines` : step.text || ""
      )}</span></li>`
    );
    steps.push(step);
    scrollChat();
    await wait(110);
  }

  textNode.classList.remove("typing");
  textNode.textContent = outcome.reply || outcome.summary || "";
  scrollChat();

  const canPersist = state.files.length > 0 || (outcome.files && outcome.files.length > 0);
  if (!canPersist) {
    pending.querySelector(".msg-time").textContent = clock();
    state.busy = false;
    renderUsage();
    return;
  }

  try {
    const data = await account.request(`/projects/${state.project.id}/turns`, {
      method: "POST",
      body: {
        prompt,
        reply: outcome.reply || outcome.summary || "Done.",
        files: outcome.files,
        steps,
        tokens: outcome.tokens || 0,
        summary: outcome.summary || "",
        versionLabel: prompt.slice(0, 90)
      }
    });

    const assistant = data.messages.find((message) => message.role === "assistant");
    state.messages.push({ ...userMessage, id: data.messages[0].id });
    state.messages.push({ ...assistant, meta: { ...assistant.meta, versionId: data.version.id } });
    state.files = data.files;
    state.versions = [data.version, ...state.versions];
    state.usage = data.usage;
    if (data.project) state.project = data.project;

    pending.querySelector(".msg-time").textContent = clock();
    pending.querySelector(".file-chips")?.remove();
    const chips = document.createElement("div");
    chips.className = "file-chips";
    chips.innerHTML = (assistant.meta?.files || [])
      .map((file) => `<span class="file-chip">${esc(file.path)} <span class="lines">· ${esc(file.lines)}</span></span>`)
      .join("");
    pending.querySelector(".msg-body").appendChild(chips);

    const actions = document.createElement("div");
    actions.className = "msg-actions";
    actions.innerHTML = `<button class="mini" type="button" data-here-restore="${esc(data.version.id)}">Restore this version</button>`;
    actions.querySelector("[data-here-restore]").addEventListener("click", (event) => {
      restoreVersion(event.currentTarget.getAttribute("data-here-restore"));
    });
    pending.querySelector(".msg-body").appendChild(actions);

    state.versionFiles = null;
    state.previewVersion = null;
    $("#versions-banner").hidden = true;
    if (state.editor) state.editor.setFiles(state.files);
    refreshPreview();
    renderVersions();
    renderUsage();
    renderWorkspaceHeader();
    state.editor?.pushLog("build", `Build finished · ${outcome.changedPaths?.length || outcome.files.length} files · ${outcome.tokens || 0} tokens`, "ok");
  } catch (error) {
    const body = pending.querySelector(".msg-body");
    const note = document.createElement("div");
    note.className = "msg-error";
    note.textContent = error.message || "That turn could not be saved.";
    body.appendChild(note);
    pending.querySelector(".msg-time").textContent = clock();
    if (error.status === 429) {
      state.usage = { ...(state.usage || {}), blocked: true };
      renderUsage();
    }
  } finally {
    state.busy = false;
    renderUsage();
    scrollChat();
  }
}

/* ----------------------------------------------------------------- preview */

function currentDocument() {
  return inlineDocument(state.versionFiles || state.files);
}

function refreshPreview() {
  const frame = $("#preview");
  const loading = $("#preview-loading");
  if (!frame) return;
  if (!state.files.length && !state.versionFiles) {
    frame.srcdoc = `<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center;font:14px system-ui;background:#0d0f12;color:#9aa4b2">Nothing built yet.</body></html>`;
    return;
  }
  loading.hidden = false;
  frame.onload = () => {
    loading.hidden = true;
  };
  frame.srcdoc = currentDocument();
}

/* ---------------------------------------------------------------- versions */

function renderVersions() {
  const host = $("#versions-body");
  if (!host) return;
  const query = ($("#versions-search")?.value || "").toLowerCase();
  const versions = state.versions.filter((version) => !query || version.label.toLowerCase().includes(query));
  const bookmarked = versions.filter((version) => version.bookmarked);

  const row = (version) => `<div class="version-row${state.previewVersion === version.id ? " active" : ""}" data-version="${esc(
    version.id
  )}">
      <button class="version-main" type="button" data-open-version="${esc(version.id)}">
        <span class="version-name">${esc(version.label)}</span>
        <span class="version-date">${esc(clock(version.createdAt))}</span>
      </button>
      <div class="version-tools">
        <button type="button" data-bookmark="${esc(version.id)}" aria-pressed="${version.bookmarked}" aria-label="Bookmark version">
          <svg class="ico"><use href="#i-bookmark"></use></svg>
        </button>
        <button type="button" data-rename-version="${esc(version.id)}" aria-label="Rename version">Aa</button>
      </div>
    </div>`;

  host.innerHTML = versions.length
    ? `${bookmarked.length ? `<p class="vp-section">Bookmarked versions (${bookmarked.length})</p>${bookmarked.map(row).join("")}` : ""}
       <p class="vp-section">All versions (${versions.length})</p>
       ${versions.map(row).join("")}`
    : `<p class="vp-empty">No versions match.</p>`;
}

async function openVersionPreview(id) {
  try {
    const data = await account.request(`/projects/${state.project.id}/versions/${id}`);
    state.versionFiles = data.version.files;
    state.previewVersion = id;
    state.versionLabel = data.version.label;
    $("#versions-banner").hidden = false;
    $("#versions-banner p").textContent = `Viewing “${data.version.label}”.`;
    renderVersions();
    switchTab("preview");
    refreshPreview();
  } catch (error) {
    toast(error.message, "err");
  }
}

function leaveVersionPreview() {
  state.versionFiles = null;
  state.previewVersion = null;
  $("#versions-banner").hidden = true;
  renderVersions();
  refreshPreview();
}

async function restoreVersion(id) {
  try {
    const data = await account.request(`/projects/${state.project.id}/versions/${id}/restore`, { method: "POST" });
    state.files = data.files;
    state.versions = [data.version, ...state.versions];
    state.messages.push(data.message);
    leaveVersionPreview();
    if (state.editor) state.editor.setFiles(state.files);
    renderChat();
    renderVersions();
    toast("Version restored — it is a new version, nothing was lost.", "ok");
    state.editor?.pushLog("build", `Restored version ${data.version.label}`, "ok");
  } catch (error) {
    toast(error.message, "err");
  }
}

/* ----------------------------------------------------------------- publish */

function publishUrl(deploy) {
  if (!deploy) return "";
  const base = `${location.origin}/s/${deploy.slug}`;
  return deploy.visibility === "private" && deploy.accessKey ? `${base}?k=${deploy.accessKey}` : base;
}

function renderPublish() {
  const pop = $("#publish-popover");
  if (!pop) return;
  const deploy = state.deploy;
  pop.innerHTML = `<div class="pop-head">
      <h3>Publish your project</h3>
      <button class="icon-btn" type="button" data-pop="close" aria-label="Close publish menu"><svg class="ico"><use href="#i-close"></use></svg></button>
    </div>
    <p class="pop-state">${deploy ? "Published. Edits stay private until you update." : "App is not published yet."}</p>
    <div class="pop-row">
      <svg class="ico" style="width:14px;height:14px"><use href="#i-eye"></use></svg>
      <select class="select" id="pop-visibility" aria-label="Site visibility">
        <option value="public"${deploy?.visibility !== "private" ? " selected" : ""}>Public</option>
        <option value="private"${deploy?.visibility === "private" ? " selected" : ""}>Private</option>
      </select>
    </div>
    <p class="pop-note"><span class="dot" aria-hidden="true"></span>No security issues found</p>
    ${
      deploy
        ? `<div class="pop-url">
             <input class="input" id="pop-url" readonly value="${esc(publishUrl(deploy))}" aria-label="Published URL" />
             <button class="btn ghost small" type="button" data-pop="copy">Copy</button>
           </div>
           <div class="pop-url">
             <input class="input" id="pop-slug" value="${esc(deploy.slug)}" aria-label="Site address" />
             <button class="btn ghost small" type="button" data-pop="slug">Save</button>
           </div>`
        : `<p class="pop-hint">Think of this as a copy, not a live pointer: the site changes when you press Update.</p>`
    }
    <div class="pop-actions">
      <button class="btn primary wide" type="button" data-pop="publish">${deploy ? "Update published site" : "Publish"}</button>
      ${deploy ? '<button class="btn ghost wide" type="button" data-pop="unpublish">Unpublish</button>' : ""}
    </div>`;

  pop.querySelector('[data-pop="close"]').addEventListener("click", () => {
    pop.hidden = true;
  });
  pop.querySelector('[data-pop="publish"]').addEventListener("click", publishSite);
  pop.querySelector('[data-pop="copy"]')?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(publishUrl(state.deploy));
      toast("Link copied", "ok");
    } catch {
      toast("Copy is blocked — select the field instead.", "err");
    }
  });
  pop.querySelector('[data-pop="slug"]')?.addEventListener("click", changeSlug);
  pop.querySelector('[data-pop="unpublish"]')?.addEventListener("click", unpublishSite);
}

async function publishSite() {
  if (!state.project) return;
  const visibility = $("#pop-visibility")?.value || "public";
  const button = $('[data-pop="publish"]');
  if (button) {
    button.disabled = true;
    button.textContent = "Publishing…";
  }
  state.editor?.pushLog("publish", "Uploading the current files…", "cmd");
  try {
    const data = await account.request(`/projects/${state.project.id}/publish`, { method: "POST", body: { visibility } });
    state.deploy = data.deploy;
    renderPublish();
    renderWorkspaceHeader();
    $("#publish-label").textContent = "Update";
    toast("Published", "ok");
    state.editor?.pushLog("publish", `Live at ${data.deploy.url}`, "ok");
    chatScroll().appendChild(
      systemMessageNode({ content: `Published your site. You can view it at ${publishUrl(data.deploy)}` })
    );
    scrollChat();
  } catch (error) {
    toast(error.message, "err");
    state.editor?.pushLog("publish", error.message, "err");
    renderPublish();
  }
}

async function unpublishSite() {
  if (!window.confirm("Take this site offline? The project stays, the URL stops working.")) return;
  try {
    await account.request(`/projects/${state.project.id}/publish`, { method: "DELETE" });
    state.deploy = null;
    renderPublish();
    renderWorkspaceHeader();
    $("#publish-label").textContent = "Publish";
    toast("Unpublished", "ok");
    state.editor?.pushLog("publish", "Site unpublished; the address no longer resolves.", "");
  } catch (error) {
    toast(error.message, "err");
  }
}

async function changeSlug() {
  const input = $("#pop-slug");
  const value = input?.value.trim();
  if (!value) return;
  try {
    const data = await account.request(`/projects/${state.project.id}/publish`, {
      method: "POST",
      body: { slug: value, visibility: state.deploy?.visibility || "public" }
    });
    state.deploy = data.deploy;
    renderPublish();
    toast("Address updated", "ok");
  } catch (error) {
    toast(error.message, "err");
  }
}

/* ------------------------------------------------------------------ editor */

function ensureEditor() {
  if (state.editor) return state.editor;
  state.editor = createEditor({
    mount: $("#code-host"),
    notify: toast,
    persist: async (path, content, previousPath) => {
      const data = await account.request(`/projects/${state.project.id}/files`, {
        method: "PUT",
        body: { path, content, previousPath }
      });
      state.files = data.files;
      refreshPreview();
      state.editor.pushLog("build", `Saved ${path} by hand — no usage charged.`, "ok");
      return data.files;
    },
    remove: async (path) => {
      const data = await account.request(`/projects/${state.project.id}/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      state.files = data.files;
      refreshPreview();
      return data.files;
    }
  });
  return state.editor;
}

function switchTab(tab) {
  const preview = tab === "preview";
  $("#tab-preview").setAttribute("aria-selected", String(preview));
  $("#tab-code").setAttribute("aria-selected", String(!preview));
  $("#tab-preview").closest(".seg")?.setAttribute("data-active", preview ? "preview" : "code");
  $("#preview-host").hidden = !preview;
  $("#code-host").hidden = preview;
  $("#preview-tools")?.setAttribute("hidden", String(!preview));
  if (!preview) {
    const editor = ensureEditor();
    editor.setFiles(state.versionFiles || state.files);
  }
}

/* ---------------------------------------------------------------- settings */

function openSettings() {
  paintAiSettings();
  $$("[data-theme-set]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-set") === state.settings.theme));
  });
  const showTokens = $("#setting-show-tokens");
  if (showTokens) showTokens.checked = state.settings.showTokens;
  const defaultMode = $("#setting-default-mode");
  if (defaultMode) defaultMode.value = state.settings.defaultMode;
  renderUsage();
  account.openDialog("dlg-settings");
}

/* ------------------------------------------------------- settings: provider */

function renderEngineTag() {
  const ai = account.state.ai;
  const label = ai?.configured ? `AI · ${ai.model}` : "Local agent";
  $$(".agent-tag").forEach((node) => {
    node.innerHTML = `<svg class="ico tiny"><use href="#i-spark"></use></svg>${esc(label)}`;
    node.title = ai?.configured
      ? `Prompts go to ${ai.model} at ${ai.baseUrl} with your key`
      : "Built-in deterministic agent: ten blueprints, no model, no key";
  });
}

function paintAiSettings() {
  const ai = account.state.ai;
  const baseUrl = $("#ai-base-url");
  if (!baseUrl) return;
  baseUrl.value = ai.baseUrl || "";
  $("#ai-model").value = ai.model || "";
  const key = $("#ai-api-key");
  key.value = "";
  key.placeholder = ai.hasKey ? `Saved (${ai.keyHint}) — leave blank to keep it` : "sk-…";
  $("#ai-clear").hidden = !ai.hasKey;
  const status = $("#ai-status");
  status.dataset.kind = ai.configured ? "ok" : "";
  status.textContent = ai.configured
    ? `Prompts go to ${ai.model} at ${ai.baseUrl} with your key. Turn this off any time to go back to the local agent.`
    : "Not configured. Prompts are answered by the built-in local agent.";
}

function wireAiSettings() {
  const save = $("#ai-save");
  if (!save) return;

  save.addEventListener("click", async () => {
    const status = $("#ai-status");
    save.disabled = true;
    save.textContent = "Saving…";
    try {
      const ai = await account.saveAi({
        baseUrl: $("#ai-base-url").value.trim(),
        apiKey: $("#ai-api-key").value.trim(),
        model: $("#ai-model").value.trim()
      });
      paintAiSettings();
      renderEngineTag();
      toast(`Using ${ai.model}`, "ok");
    } catch (error) {
      status.dataset.kind = "err";
      status.textContent = error.message;
      if (error.field) $(`#ai-${error.field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)?.focus();
    } finally {
      save.disabled = false;
      save.textContent = "Save provider";
    }
  });

  $("#ai-test").addEventListener("click", async () => {
    const button = $("#ai-test");
    const status = $("#ai-status");
    button.disabled = true;
    button.textContent = "Testing…";
    try {
      const data = await account.testAi();
      status.dataset.kind = "ok";
      status.textContent = `${data.model} answered in ${data.latency} ms with ${data.tokens} tokens.`;
    } catch (error) {
      status.dataset.kind = "err";
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Test connection";
    }
  });

  $("#ai-clear").addEventListener("click", async () => {
    try {
      await account.removeAi();
      paintAiSettings();
      renderEngineTag();
      toast("Provider removed — back to the local agent", "ok");
    } catch (error) {
      toast(error.message, "err");
    }
  });
}

/* ----------------------------------------------------------------- palette */

async function openPalette() {
  if (!state.user) return;
  account.openDialog("dlg-search");
  const input = $("#palette-input");
  input.value = "";
  const render = (projects) => {
    const host = $("#palette-results");
    host.innerHTML = projects.length
      ? projects
          .map(
            (project) =>
              `<button class="palette-item" type="button" data-go="${esc(project.id)}"><span class="name">${esc(
                project.name
              )}</span><span class="when">${esc(timeAgo(project.updatedAt))}</span></button>`
          )
          .join("")
      : `<p class="palette-empty">No projects match.</p>`;
    $$("[data-go]", host).forEach((button) => {
      button.addEventListener("click", () => {
        account.closeDialogs();
        navigate(`#/p/${button.getAttribute("data-go")}`);
      });
    });
  };
  try {
    const projects = await fetchProjects("all", "", "edited");
    state.projects = projects;
    render(projects.slice(0, 8));
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      render(projects.filter((project) => project.name.toLowerCase().includes(q)).slice(0, 8));
    });
  } catch (error) {
    toast(error.message, "err");
  }
}

/* ------------------------------------------------------------------- wiring */

function wireStatic() {
  $("#marketing").addEventListener("click", (event) => {
    const opener = event.target.closest("[data-open]");
    if (opener) {
      account.openAuth(opener.getAttribute("data-mode") || "signin");
      return;
    }
    if (event.target.closest("[data-template]")) {
      state.composers[0]?.setValue("A three-column kanban board for a design team, dark theme");
      toast("Template prompts are just examples — this one is filled in.", "");
      return;
    }
    const needs = event.target.closest("[data-needs]");
    if (needs) {
      const name = needs.getAttribute("data-needs");
      toast(`${name === "figma" ? "Figma import" : "GitHub import"} needs that provider's OAuth app — out of scope here.`, "");
    }
  });

  $$("[data-mode-chip]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.mode = chip.getAttribute("data-mode-chip");
      $$("[data-mode-chip]").forEach((other) => other.setAttribute("aria-pressed", String(other === chip)));
    });
  });

  $$("[data-open]").forEach((button) => {
    if (button.closest("#marketing")) return;
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-open");
      if (target === "about") account.openDialog("dlg-about");
      else if (target === "auth") account.openAuth("signin");
    });
  });

  $("#collapse-side").addEventListener("click", () => {
    $("#shell").classList.toggle("collapsed");
  });
  $("#open-side").addEventListener("click", () => {
    $("#shell").classList.toggle("side-open");
  });
  $("#open-search").addEventListener("click", openPalette);

  $("#account-chip").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("#account-menu");
    menu.hidden = !menu.hidden;
    $("#account-chip").setAttribute("aria-expanded", String(!menu.hidden));
  });
  $$("#account-menu [data-account]").forEach((button) => {
    button.addEventListener("click", async () => {
      $("#account-menu").hidden = true;
      const action = button.getAttribute("data-account");
      if (action === "settings" || action === "usage") openSettings();
      if (action === "signout") {
        try {
          await account.signOut();
          state.user = null;
          state.project = null;
          showShell(false);
          renderEngineTag();
          toast("Signed out", "ok");
          navigate("#/");
        } catch (error) {
          toast(error.message, "err");
        }
      }
    });
  });

  $("#new-project").addEventListener("click", () => navigate("#/"));
  $$("[data-new-project]").forEach((button) => button.addEventListener("click", () => navigate("#/")));

  $("#project-search").addEventListener("input", () => renderProjects(location.hash));
  $("#project-sort").addEventListener("change", () => renderProjects(location.hash));

  $("#ws-back").addEventListener("click", () => navigate("#/projects"));
  $("#ws-title").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = $("#ws-menu");
    menu.hidden = !menu.hidden;
    $("#ws-title").setAttribute("aria-expanded", String(!menu.hidden));
  });
  $$("#ws-menu [data-project]").forEach((button) => {
    button.addEventListener("click", async () => {
      $("#ws-menu").hidden = true;
      const action = button.getAttribute("data-project");
      if (!state.project) return;
      if (action === "rename") openRename(state.project);
      if (action === "versions") {
        $("#versions-panel").hidden = false;
        renderVersions();
      }
      if (action === "duplicate") await duplicateProject(state.project.id);
      if (action === "delete") openConfirmDelete(state.project);
      if (action === "download") {
        const blob = new Blob([currentDocument()], { type: "text/html" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${slugify(state.project.name)}.html`;
        link.click();
        URL.revokeObjectURL(link.href);
        toast("Downloaded as one self-contained HTML file.", "ok");
      }
    });
  });

  $("#tab-preview").addEventListener("click", () => switchTab("preview"));
  $("#tab-code").addEventListener("click", () => switchTab("code"));

  $("#btn-reload").addEventListener("click", () => {
    refreshPreview();
    toast("Preview reloaded", "");
  });
  $("#btn-open").addEventListener("click", () => {
    const blob = new Blob([currentDocument()], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  });
  $("#btn-device").addEventListener("click", () => {
    const pane = $(".stage-pane");
    const order = ["full", "mobile", "tablet"];
    const current = pane.dataset.size || "full";
    const next = order[(order.indexOf(current) + 1) % order.length];
    pane.dataset.size = next;
    toast(next === "full" ? "Full width" : next === "mobile" ? "390px preview" : "768px preview", "");
  });
  $("#btn-full").addEventListener("click", () => {
    const pane = $(".stage-pane");
    pane.classList.add("fullscreen");
    const exit = document.createElement("button");
    exit.className = "btn ghost fullscreen-exit";
    exit.type = "button";
    exit.textContent = "Exit full screen";
    exit.addEventListener("click", () => {
      pane.classList.remove("fullscreen");
      exit.remove();
    });
    pane.appendChild(exit);
  });

  $("#ws-share").addEventListener("click", () => {
    const link = state.deploy ? publishUrl(state.deploy) : "";
    $("#share-input").value = link;
    $("#share-copy").textContent = link
      ? "Anyone with this link can view the published copy. Editing stays with you."
      : "Nothing is published yet. Publish from the button beside this one, then the link appears here.";
    account.openDialog("dlg-share");
  });
  $("#share-copy-btn").addEventListener("click", async () => {
    const value = $("#share-input").value;
    if (!value) {
      account.closeDialogs();
      $("#publish-popover").hidden = false;
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast("Link copied", "ok");
    } catch {
      toast("Copy is blocked — select the field instead.", "err");
    }
  });

  $("#ws-publish").addEventListener("click", (event) => {
    event.stopPropagation();
    const pop = $("#publish-popover");
    pop.hidden = !pop.hidden;
    if (!pop.hidden) renderPublish();
  });

  $("#close-versions").addEventListener("click", () => {
    $("#versions-panel").hidden = true;
  });
  $("#versions-search").addEventListener("input", renderVersions);
  $("#versions-body").addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-version]");
    if (open) {
      openVersionPreview(open.getAttribute("data-open-version"));
      return;
    }
    const bookmark = event.target.closest("[data-bookmark]");
    if (bookmark) {
      const id = bookmark.getAttribute("data-bookmark");
      const version = state.versions.find((v) => v.id === id);
      if (!version) return;
      account
        .request(`/projects/${state.project.id}/versions/${id}`, { method: "PATCH", body: { bookmarked: !version.bookmarked } })
        .then((data) => {
          state.versions = state.versions.map((v) => (v.id === id ? data.version : v));
          renderVersions();
        })
        .catch((error) => toast(error.message, "err"));
      return;
    }
    const rename = event.target.closest("[data-rename-version]");
    if (rename) {
      const id = rename.getAttribute("data-rename-version");
      const version = state.versions.find((v) => v.id === id);
      const label = window.prompt("Name this version", version?.label || "");
      if (!label) return;
      account
        .request(`/projects/${state.project.id}/versions/${id}`, { method: "PATCH", body: { label } })
        .then((data) => {
          state.versions = state.versions.map((v) => (v.id === id ? data.version : v));
          renderVersions();
        })
        .catch((error) => toast(error.message, "err"));
    }
  });
  $("#restore-version").addEventListener("click", () => {
    if (state.previewVersion) restoreVersion(state.previewVersion);
  });
  $("#leave-version").addEventListener("click", leaveVersionPreview);

  $$("[data-theme-set]").forEach((button) => {
    button.addEventListener("click", async () => {
      const theme = button.getAttribute("data-theme-set");
      state.settings = { ...state.settings, theme };
      account.applyTheme(theme);
      $$("[data-theme-set]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
      if (state.user) {
        try {
          await account.saveSettings({ theme });
        } catch (error) {
          toast(error.message, "err");
        }
      }
    });
  });
  $("#setting-show-tokens").addEventListener("change", async (event) => {
    const showTokens = event.target.checked;
    state.settings = { ...state.settings, showTokens };
    try {
      await account.saveSettings({ showTokens });
      toast(showTokens ? "Usage shown above the composer" : "Usage hidden", "");
    } catch (error) {
      toast(error.message, "err");
    }
  });
  $("#setting-default-mode").addEventListener("change", async (event) => {
    const defaultMode = event.target.value;
    state.settings = { ...state.settings, defaultMode };
    state.mode = defaultMode;
    $$("[data-mode-chip]").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.getAttribute("data-mode-chip") === defaultMode)));
    try {
      await account.saveSettings({ defaultMode });
    } catch (error) {
      toast(error.message, "err");
    }
  });

  $("#dialog-backdrop").addEventListener("click", (event) => {
    if (event.target.id === "dialog-backdrop") account.closeDialogs();
  });
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => account.closeDialogs()));

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".card-menu-wrap")) $$(".card-menu-wrap .menu").forEach((node) => (node.hidden = true));
    if (!event.target.closest("#publish-popover") && !event.target.closest("#ws-publish")) {
      $("#publish-popover").hidden = true;
    }
    if (!event.target.closest("#account-menu") && !event.target.closest("#account-chip")) {
      $("#account-menu").hidden = true;
    }
    if (!event.target.closest("#ws-menu") && !event.target.closest("#ws-title")) {
      $("#ws-menu").hidden = true;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      account.closeDialogs();
      $("#publish-popover").hidden = true;
      $("#ws-menu").hidden = true;
      $("#account-menu").hidden = true;
      $("#shell").classList.remove("side-open");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      const composer = state.project ? state.composers[2] : state.composers[0];
      composer?.node.querySelector('[data-composer="send"]')?.click();
    }
  });

  window.addEventListener("hashchange", () => route());
}

/* --------------------------------------------------------------------- boot */

async function boot() {
  account.wireAuth({
    notify: toast,
    onSignedIn: async (user) => {
      state.user = user;
      state.usage = account.state.usage;
      state.settings = account.state.settings;
      state.mode = state.settings.defaultMode || "website";
      await account.loadAi();
      renderEngineTag();
      $$("[data-mode-chip]").forEach((chip) =>
        chip.setAttribute("aria-pressed", String(chip.getAttribute("data-mode-chip") === state.mode))
      );
      renderUserChrome();
      await route();
      if (state.pendingPrompt) {
        const prompt = state.pendingPrompt;
        state.pendingPrompt = null;
        await sendPrompt(prompt);
      } else if (state.pendingHash) {
        navigate(state.pendingHash);
        state.pendingHash = null;
      }
    }
  });

  mountComposer($("#hero-composer"), { submitLabel: "Build now", onSubmit: sendPrompt });
  mountComposer($("#home-composer"), { submitLabel: "Build now", onSubmit: sendPrompt });
  mountComposer($("#workspace-composer"), {
    submitLabel: "Send",
    onSubmit: sendPrompt,
    placeholder: "Ask for a change: “make it dark”, “add a pricing section”, “rename it to Harbour”"
  });

  wireStatic();
  wireAiSettings();

  const user = await account.loadSession();
  if (user) {
    await account.loadAi();
    renderEngineTag();
    state.user = user;
    state.usage = account.state.usage;
    state.settings = account.state.settings;
    state.mode = state.settings.defaultMode || "website";
    $$("[data-mode-chip]").forEach((chip) => chip.setAttribute("aria-pressed", String(chip.getAttribute("data-mode-chip") === state.mode)));
    renderUserChrome();
  }
  account.applyTheme();
  await route();
}

boot();
