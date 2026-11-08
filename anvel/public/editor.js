/* Anvel — code view: file tree, tabs, editor and the three-tab terminal.
   Kept separate from app.js so the workspace logic stays readable. */

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function createEditor({ mount, notify, persist, remove }) {
  let files = [];
  let active = "index.html";
  let dirty = new Map();
  let element = null;
  let termTab = "build";
  let collapsed = false;
  const logs = { build: [], publish: [], shell: [] };

  const activeFile = () => files.find((file) => file.path === active);

  const gutterFor = (content) =>
    content
      .split("\n")
      .map((_, i) => i + 1)
      .join("\n");

  function paintGutter() {
    if (!element) return;
    const input = element.querySelector("#code-input");
    const gutter = element.querySelector("#gutter");
    if (!input || !gutter) return;
    gutter.textContent = gutterFor(input.value);
    gutter.scrollTop = input.scrollTop;
  }

  function markup() {
    const tree = files
      .map(
        (file) => `<div class="tree-row${file.path === active ? " active" : ""}" data-path="${esc(file.path)}" role="button" tabindex="0">
            <svg class="ico"><use href="#i-file"></use></svg>
            <span class="name">${esc(file.path)}</span>
            <button class="tree-del" type="button" data-remove="${esc(file.path)}" aria-label="Delete ${esc(file.path)}">×</button>
          </div>`
      )
      .join("");

    const tabs = files
      .map(
        (file) =>
          `<button class="tab" role="tab" type="button" data-tab="${esc(file.path)}" aria-selected="${file.path === active}">${esc(
            file.path.split("/").pop()
          )}${dirty.get(file.path) ? '<span class="dirty" aria-label="Unsaved changes"></span>' : ""}</button>`
      )
      .join("");

    const content = activeFile()?.content ?? "";

    return `<div class="code-layout">
      <aside class="file-tree" aria-label="Files">
        <div class="tree-head"><span>Files</span><button class="icon-btn" type="button" id="new-file" aria-label="New file" title="New file"><svg class="ico"><use href="#i-plus"></use></svg></button></div>
        <div class="tree-list" id="tree-list">${tree || '<p class="vp-empty">No files yet.</p>'}</div>
      </aside>
      <div class="editor">
        <div class="editor-bar">
          <div class="tabs" role="tablist" aria-label="Open files">${tabs}</div>
          <div class="editor-actions">
            <span class="dirty-note" id="dirty-note" ${dirty.get(active) ? "" : "hidden"}>Unsaved</span>
            <button class="btn small primary" type="button" id="save-file"><svg class="ico"><use href="#i-save"></use></svg>Save</button>
          </div>
        </div>
        <div class="editor-body">
          <pre class="gutter" id="gutter" aria-hidden="true">${gutterFor(content)}</pre>
          <textarea class="code-input" id="code-input" spellcheck="false" aria-label="Contents of ${esc(active)}">${esc(content)}</textarea>
        </div>
        <div class="terminal" id="terminal" data-collapsed="${collapsed}">
          <div class="term-tabs" role="tablist" aria-label="Terminal">
            <button type="button" role="tab" data-term="build" aria-selected="${termTab === "build"}">Build</button>
            <button type="button" role="tab" data-term="publish" aria-selected="${termTab === "publish"}">Publish log</button>
            <button type="button" role="tab" data-term="shell" aria-selected="${termTab === "shell"}">Shell</button>
            <button class="term-toggle" type="button" data-term="toggle" aria-label="Collapse terminal">⌄</button>
          </div>
          <div class="term-body" id="term-body"></div>
          <form class="term-form" id="term-form" ${termTab === "shell" ? "" : "hidden"}><span>$</span><input id="term-input" autocomplete="off" spellcheck="false" aria-label="Command" placeholder="help" /></form>
        </div>
      </div>
    </div>`;
  }

  function paintTerm() {
    if (!element) return;
    const body = element.querySelector("#term-body");
    if (!body) return;
    const lines = logs[termTab] || [];
    body.innerHTML = lines.map((line) => `<div class="term-line ${line.kind || ""}">${esc(line.text)}</div>`).join("") ||
      `<div class="term-line">${termTab === "shell" ? "Type help for the handful of commands this shell knows." : "Nothing yet."}</div>`;
    body.scrollTop = body.scrollHeight;
    const form = element.querySelector("#term-form");
    if (form) form.hidden = termTab !== "shell";
    element.querySelectorAll("[data-term]").forEach((button) => {
      const key = button.getAttribute("data-term");
      if (key === "toggle") return;
      button.setAttribute("aria-selected", String(key === termTab));
    });
  }

  function runCommand(raw) {
    const line = raw.trim();
    if (!line) return;
    logs.shell.push({ text: `$ ${line}`, kind: "cmd" });
    const [command, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ");
    const say = (text, kind = "") => logs.shell.push({ text, kind });
    switch (command) {
      case "help":
        say("ls · cat <file> · open <file> · pwd · date · clear · echo <text>");
        say("This shell is a demo: files are listed and read from the project, nothing runs on a server.");
        break;
      case "ls":
        files.forEach((file) => say(file.path));
        break;
      case "cat": {
        const file = files.find((f) => f.path === arg);
        if (!file) {
          say(`cat: ${arg || "?"}: no such file`, "err");
          break;
        }
        file.content.split("\n").slice(0, 60).forEach((text) => say(text));
        if (file.content.split("\n").length > 60) say("… (truncated)");
        break;
      }
      case "open": {
        const file = files.find((f) => f.path === arg);
        if (!file) say(`open: ${arg || "?"}: no such file`, "err");
        else {
          setActive(file.path);
          say(`opened ${file.path}`, "ok");
        }
        break;
      }
      case "pwd":
        say("/home/project");
        break;
      case "date":
        say(new Date().toString());
        break;
      case "echo":
        say(arg);
        break;
      case "clear":
        logs.shell = [];
        break;
      case "npm":
      case "node":
      case "bun":
        say(`${command}: there is no package runtime here. Anvel projects are plain HTML, CSS and JS served as static files.`, "err");
        break;
      default:
        say(`${command}: command not found. Try help.`, "err");
    }
    paintTerm();
  }

  function wire() {
    if (!element) return;
    element.querySelectorAll("[data-path]").forEach((row) => {
      const open = () => setActive(row.getAttribute("data-path"));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });

    element.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const path = button.getAttribute("data-remove");
        if (!window.confirm(`Delete ${path}? This can be undone from version history.`)) return;
        try {
          const next = await remove(path);
          files = next;
          dirty.delete(path);
          if (active === path) active = files[0]?.path || "";
          paint(true);
          notify(`Deleted ${path}`, "ok");
        } catch (error) {
          notify(error.message || "Could not delete that file.", "err");
        }
      });
    });

    element.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => setActive(button.getAttribute("data-tab")));
    });

    const input = element.querySelector("#code-input");
    if (input) {
      input.addEventListener("input", () => {
        dirty.set(active, true);
        const note = element.querySelector("#dirty-note");
        if (note) note.hidden = false;
        paintGutter();
        const tab = element.querySelector(`[data-tab="${CSS.escape(active)}"]`);
        if (tab && !tab.querySelector(".dirty")) tab.insertAdjacentHTML("beforeend", '<span class="dirty" aria-label="Unsaved changes"></span>');
      });
      input.addEventListener("scroll", () => {
        const gutter = element.querySelector("#gutter");
        if (gutter) gutter.scrollTop = input.scrollTop;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          const { selectionStart, selectionEnd, value } = input;
          input.value = value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
          input.selectionStart = input.selectionEnd = selectionStart + 2;
          dirty.set(active, true);
          paintGutter();
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          save();
        }
      });
    }

    element.querySelector("#save-file")?.addEventListener("click", save);

    element.querySelector("#new-file")?.addEventListener("click", async () => {
      const path = window.prompt("New file path (for example pages/about.html)", "notes.md");
      if (!path) return;
      try {
        const next = await persist(path.trim(), "", null);
        files = next;
        active = path.trim();
        paint(true);
        notify(`Created ${active}`, "ok");
      } catch (error) {
        notify(error.message || "Could not create that file.", "err");
      }
    });

    element.querySelectorAll("[data-term]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-term");
        if (key === "toggle") {
          collapsed = !collapsed;
          element.querySelector("#terminal").dataset.collapsed = String(collapsed);
          button.textContent = collapsed ? "⌃" : "⌄";
          button.setAttribute("aria-label", collapsed ? "Expand terminal" : "Collapse terminal");
          return;
        }
        termTab = key;
        paintTerm();
      });
    });

    const form = element.querySelector("#term-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input2 = form.querySelector("#term-input");
      runCommand(input2.value);
      input2.value = "";
    });
  }

  async function save() {
    const file = activeFile();
    if (!file || !element) return;
    const input = element.querySelector("#code-input");
    const content = input ? input.value : file.content;
    try {
      const next = await persist(active, content, null);
      files = next.map((f) => ({ ...f }));
      dirty.delete(active);
      paint(true);
      notify(`Saved ${active}`, "ok");
    } catch (error) {
      notify(error.message || "Could not save that file.", "err");
    }
  }

  function paint(rebuild) {
    if (!element) return;
    if (rebuild) {
      element.innerHTML = markup();
      wire();
    }
    paintGutter();
    paintTerm();
  }

  function setActive(path) {
    const file = files.find((f) => f.path === path);
    if (!file) return;
    active = path;
    element.innerHTML = markup();
    wire();
    paintTerm();
    element.querySelector("#code-input")?.focus();
  }

  const api = {
    mount(host) {
      host.innerHTML = '<div class="code-host" id="code-host-inner"></div>';
      element = host.querySelector("#code-host-inner");
      paint(true);
    },
    setFiles(next, { keepActive = true } = {}) {
      files = next.map((f) => ({ ...f }));
      if (!keepActive || !files.some((f) => f.path === active)) active = files[0]?.path || "";
      paint(true);
    },
    getFiles() {
      return files;
    },
    getActive() {
      return active;
    },
    pushLog(tab, text, kind = "") {
      (logs[tab] || logs.build).push({ text, kind });
      if (tab === termTab) paintTerm();
    },
    clearLog(tab) {
      logs[tab] = [];
      if (tab === termTab) paintTerm();
    },
    focus() {
      element?.querySelector("#code-input")?.focus();
    },
    save
  };

  /* Callers pass a host at construction; the factory mounts itself so a
     forgotten .mount() cannot leave an empty code view. */
  if (mount) api.mount(mount);
  return api;
}
