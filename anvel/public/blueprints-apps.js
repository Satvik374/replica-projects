/* Anvel — app-shaped blueprints: things with real state and interaction. */

import { site, esc, storage, money } from "./gen-kit.js";

export const timer = {
  key: "timer",
  label: "Timer app",
  test: (p) => /timer|pomodoro|countdown|stopwatch|focus session|break reminder/.test(p),
  build(ctx) {
    const name = ctx.name;
    const body = `<main class="stage">
      <header class="top">
        <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
        <p class="pill" id="session">Session 0</p>
      </header>
      <section class="dial-card card">
        <div class="dial">
          <svg viewBox="0 0 240 240" role="img" aria-label="Time remaining">
            <circle class="track" cx="120" cy="120" r="104"></circle>
            <circle class="progress" id="ring" cx="120" cy="120" r="104"></circle>
          </svg>
          <div class="dial-inner">
            <p class="time" id="time" aria-live="off">25:00</p>
            <p class="label" id="state">Ready when you are</p>
          </div>
        </div>
        <div class="presets" role="group" aria-label="Presets">
          ${[
            ["Focus 25", 25],
            ["Short 5", 5],
            ["Long 15", 15],
            ["Sprint 45", 45]
          ]
            .map(
              ([label, mins], i) =>
                `<button type="button" class="chip" data-minutes="${mins}" aria-pressed="${i === 0 ? "true" : "false"}">${label}</button>`
            )
            .join("\n          ")}
        </div>
        <div class="controls">
          <button class="btn" type="button" id="toggle">Start</button>
          <button class="btn btn-quiet" type="button" id="reset">Reset</button>
        </div>
        <p class="hint">Space starts and pauses. The tab title follows the clock.</p>
      </section>
      <section class="stats">
        <div class="card stat"><p class="stat-label">Sessions today</p><p class="stat-value" id="count">0</p></div>
        <div class="card stat"><p class="stat-label">Minutes focused</p><p class="stat-value" id="minutes">0</p></div>
        <div class="card stat"><p class="stat-label">Longest streak</p><p class="stat-value" id="streak">0</p></div>
      </section>
      <p class="foot">One thing at a time. Everything else can wait 25 minutes.</p>
    </main>`;

    const css = `
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px clamp(16px,4vw,40px) 40px;gap:22px}
.top{width:100%;max-width:720px;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none}
.mark{width:20px;height:20px;border-radius:6px;background:var(--accent)}
.dial-card{width:100%;max-width:460px;padding:32px 28px 26px;display:flex;flex-direction:column;align-items:center;gap:22px;margin-top:clamp(8px,4vh,40px)}
.dial{position:relative;width:240px;height:240px}
.dial svg{width:100%;height:100%;transform:rotate(-90deg)}
.track{fill:none;stroke:var(--surface-2);stroke-width:10}
.progress{fill:none;stroke:var(--accent);stroke-width:10;stroke-linecap:round;stroke-dasharray:653.45;stroke-dashoffset:0;transition:stroke-dashoffset .35s linear,stroke .3s ease}
.dial-inner{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.time{font-size:52px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.label{font-size:13px;color:var(--muted)}
.dial-card.done .progress{stroke:var(--success)}
.dial-card.done .time{color:var(--success)}
.presets{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.chip{height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer}
.chip:hover{color:var(--ink);border-color:var(--muted)}
.chip[aria-pressed="true"]{background:var(--surface-2);color:var(--ink);border-color:var(--accent)}
.controls{display:flex;gap:10px;width:100%}
.controls .btn{flex:1}
.btn-quiet{background:var(--surface-2);border-color:var(--line);color:var(--ink)}
.hint{font-size:12px;color:var(--muted);text-align:center}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;max-width:460px}
.stat{padding:14px 16px;text-align:center}
.stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.stat-value{font-size:24px;font-weight:650;margin-top:4px;font-variant-numeric:tabular-nums}
.foot{font-size:13px;color:var(--muted);margin-top:auto;text-align:center}
@media (max-width:520px){.dial{width:200px;height:200px}.time{font-size:44px}.stats{grid-template-columns:1fr 1fr 1fr;gap:8px}.stat{padding:10px}.stat-value{font-size:20px}}
`;

    const js = `var card = document.querySelector(".dial-card");
var ring = document.getElementById("ring");
var timeEl = document.getElementById("time");
var stateEl = document.getElementById("state");
var toggleBtn = document.getElementById("toggle");
var resetBtn = document.getElementById("reset");
var countEl = document.getElementById("count");
var minutesEl = document.getElementById("minutes");
var streakEl = document.getElementById("streak");
var sessionEl = document.getElementById("session");

var CIRCUMFERENCE = 653.45;
var total = 25 * 60;
var left = total;
var running = false;
var ticker = null;
var sessions = 0;
var minutesDone = 0;
var streak = 0;

function paint() {
  var mins = Math.floor(left / 60);
  var secs = left % 60;
  var text = String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  timeEl.textContent = text;
  document.title = running ? text + " — " + ${JSON.stringify(name)} : ${JSON.stringify(name)};
  var ratio = total === 0 ? 0 : left / total;
  ring.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - ratio));
}

function stop() {
  running = false;
  clearInterval(ticker);
  ticker = null;
  toggleBtn.textContent = "Start";
  stateEl.textContent = "Paused";
  paint();
}

function start() {
  if (left === 0) return;
  running = true;
  toggleBtn.textContent = "Pause";
  stateEl.textContent = "In focus";
  card.classList.remove("done");
  clearInterval(ticker);
  ticker = setInterval(function () {
    left -= 1;
    if (left <= 0) {
      left = 0;
      finish();
      return;
    }
    paint();
  }, 1000);
  paint();
}

function finish() {
  clearInterval(ticker);
  ticker = null;
  running = false;
  toggleBtn.textContent = "Start again";
  stateEl.textContent = "Done — nice work";
  card.classList.add("done");
  minutesDone += Math.round(total / 60);
  sessions += 1;
  streak = Math.max(streak, sessions);
  countEl.textContent = String(sessions);
  minutesEl.textContent = String(minutesDone);
  streakEl.textContent = String(streak);
  sessionEl.textContent = "Session " + sessions;
  paint();
  document.title = "Time — " + ${JSON.stringify(name)};
}

toggleBtn.addEventListener("click", function () {
  if (running) {
    stop();
  } else if (left === 0) {
    left = total;
    card.classList.remove("done");
    start();
  } else {
    start();
  }
});

resetBtn.addEventListener("click", function () {
  clearInterval(ticker);
  ticker = null;
  running = false;
  left = total;
  toggleBtn.textContent = "Start";
  stateEl.textContent = "Ready when you are";
  card.classList.remove("done");
  paint();
});

document.querySelectorAll(".chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    document.querySelectorAll(".chip").forEach(function (other) {
      other.setAttribute("aria-pressed", String(other === chip));
    });
    clearInterval(ticker);
    ticker = null;
    running = false;
    total = Number(chip.getAttribute("data-minutes")) * 60;
    left = total;
    toggleBtn.textContent = "Start";
    stateEl.textContent = "Ready when you are";
    card.classList.remove("done");
    paint();
  });
});

document.addEventListener("keydown", function (event) {
  if (event.code !== "Space") return;
  if (event.target.matches("input, textarea")) return;
  event.preventDefault();
  toggleBtn.click();
});

paint();
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — focus timer", description: "A focus timer", body, css, js }) };
  }
};

export const todo = {
  key: "todo",
  label: "Task list",
  test: (p) => /todo|to-do|task list|checklist|tasks app|shopping list|chores/.test(p),
  build(ctx) {
    const name = ctx.name;
    const body = `<main class="stage">
      <section class="card panel">
        <header class="panel-head">
          <div>
            <h1>${esc(ctx.headline)}</h1>
            <p class="sub" id="summary">Nothing on the list yet.</p>
          </div>
          <p class="pill" id="left-pill">0 open</p>
        </header>
        <form class="add" id="add-form">
          <label class="sr" for="new-task">New task</label>
          <input class="input" id="new-task" placeholder="What needs doing?" autocomplete="off" maxlength="120" />
          <button class="btn" type="submit">Add</button>
        </form>
        <div class="filters" role="group" aria-label="Filter tasks">
          <button type="button" class="chip" data-filter="all" aria-pressed="true">All</button>
          <button type="button" class="chip" data-filter="open" aria-pressed="false">Open</button>
          <button type="button" class="chip" data-filter="done" aria-pressed="false">Done</button>
        </div>
        <ul class="list" id="list" aria-live="polite"></ul>
        <p class="empty" id="empty">Add the first thing. One line is enough.</p>
        <footer class="panel-foot">
          <button class="linkbtn" type="button" id="clear-done">Clear completed</button>
          <span class="muted" id="counts"></span>
        </footer>
      </section>
      <p class="foot">Your list stays in this browser.</p>
    </main>`;

    const css = `
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;gap:18px}
.panel{width:100%;max-width:560px;padding:26px}
.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
h1{font-size:24px;letter-spacing:-.02em}
.sub{font-size:13px;color:var(--muted);margin-top:6px}
.add{display:flex;gap:8px}
.add .btn{height:46px;flex:0 0 auto}
.filters{display:flex;gap:6px;margin:16px 0 8px}
.chip{height:30px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--surface-2);color:var(--ink);border-color:var(--accent)}
.list{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column}
.item{display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid var(--line);animation:in .18s ease}
@keyframes in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.item:last-child{border-bottom:0}
.check{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--border-strong,#3a3f48);background:transparent;cursor:pointer;display:grid;place-items:center;flex:0 0 auto;padding:0}
.check svg{width:12px;height:12px;opacity:0}
.item.done .check{background:var(--accent);border-color:var(--accent)}
.item.done .check svg{opacity:1}
.item.done .text{color:var(--muted);text-decoration:line-through}
.text{flex:1;font-size:15px;overflow-wrap:anywhere}
.remove{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:18px;line-height:1;padding:6px;border-radius:6px}
.remove:hover{color:var(--danger);background:var(--surface-2)}
.empty{color:var(--muted);font-size:14px;text-align:center;padding:26px 0}
.panel-foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-size:12px}
.linkbtn{border:0;background:transparent;color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;padding:0}
.linkbtn[disabled]{color:var(--muted);cursor:not-allowed}
.foot{font-size:12px;color:var(--muted)}
@media (max-width:520px){.panel{padding:20px}.add{flex-wrap:wrap}.add .input{flex:1 1 100%}.add .btn{width:100%}}
`;

    const js = `${storage}

var KEY = "tasks-v1";
var tasks = keep(KEY, [
  { id: 1, text: "Write the first draft", done: true },
  { id: 2, text: "Send it to two people who will be honest", done: false },
  { id: 3, text: "Book the room for Thursday", done: false }
]);
var filter = "all";
var list = document.getElementById("list");
var empty = document.getElementById("empty");
var form = document.getElementById("add-form");
var input = document.getElementById("new-task");
var summary = document.getElementById("summary");
var leftPill = document.getElementById("left-pill");
var counts = document.getElementById("counts");
var clearDone = document.getElementById("clear-done");

function persist() {
  save(KEY, tasks);
}

function visible() {
  if (filter === "open") return tasks.filter(function (t) { return !t.done; });
  if (filter === "done") return tasks.filter(function (t) { return t.done; });
  return tasks;
}

function render() {
  var open = tasks.filter(function (t) { return !t.done; }).length;
  var done = tasks.length - open;
  leftPill.textContent = open + (open === 1 ? " open" : " open");
  summary.textContent = tasks.length === 0
    ? "Nothing on the list yet."
    : open === 0
      ? "Everything is done. Take the win."
      : open + " to go" + (done ? ", " + done + " finished" : "");
  counts.textContent = tasks.length + " total";
  clearDone.disabled = done === 0;

  list.innerHTML = "";
  visible().forEach(function (task) {
    var li = document.createElement("li");
    li.className = "item" + (task.done ? " done" : "");
    var check = document.createElement("button");
    check.className = "check";
    check.type = "button";
    check.setAttribute("role", "checkbox");
    check.setAttribute("aria-checked", String(task.done));
    check.setAttribute("aria-label", (task.done ? "Mark open: " : "Mark done: ") + task.text);
    check.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6l3.2 3.4L11 2.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    check.addEventListener("click", function () {
      task.done = !task.done;
      persist();
      render();
    });

    var span = document.createElement("span");
    span.className = "text";
    span.textContent = task.text;

    var remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Delete " + task.text);
    remove.addEventListener("click", function () {
      tasks = tasks.filter(function (t) { return t.id !== task.id; });
      persist();
      render();
    });

    li.appendChild(check);
    li.appendChild(span);
    li.appendChild(remove);
    list.appendChild(li);
  });

  empty.hidden = visible().length !== 0;
  empty.textContent = tasks.length === 0 ? "Add the first thing. One line is enough." : "Nothing matches this filter.";
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  var text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  tasks.unshift({ id: Date.now(), text: text, done: false });
  input.value = "";
  persist();
  render();
  input.focus();
});

document.querySelectorAll(".chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    filter = chip.getAttribute("data-filter");
    document.querySelectorAll(".chip").forEach(function (other) {
      other.setAttribute("aria-pressed", String(other === chip));
    });
    render();
  });
});

clearDone.addEventListener("click", function () {
  tasks = tasks.filter(function (t) { return !t.done; });
  persist();
  render();
});

addEventListener("keydown", function (event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    input.focus();
  }
});

render();
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — tasks", description: "A task list", body, css, js }) };
  }
};

export const kanban = {
  key: "kanban",
  label: "Kanban board",
  test: (p) => /kanban|board|sprint|project tracker|trello|workflow board|backlog/.test(p),
  build(ctx) {
    const name = ctx.name;
    const columns = [
      ["backlog", "Backlog", ["Draft the onboarding email", "Audit the pricing page copy"]],
      ["progress", "In progress", ["Rebuild the settings screen", "Wire the export job"]],
      ["done", "Done", ["Ship the new icon set", "Fix the double-charge bug"]]
    ];
    const body = `<main class="stage">
      <header class="top">
        <div>
          <h1>${esc(ctx.headline)}</h1>
          <p class="sub">Drag a card to move it between columns.</p>
        </div>
        <button class="btn" type="button" id="add-top">New card</button>
      </header>
      <section class="board" id="board">
        ${columns
          .map(
            ([key, label, cards]) => `<div class="col card" data-col="${key}">
          <div class="col-head">
            <h2>${label}</h2>
            <span class="count" data-count="${key}">${cards.length}</span>
          </div>
          <ul class="cards" data-list="${key}">
            ${cards
              .map(
                (text, i) => `<li class="kcard" draggable="true" tabindex="0">
              <p>${esc(text)}</p>
              <span class="meta"><span class="avatar" aria-hidden="true">${["A", "K", "M"][i % 3]}</span>${i === 0 ? "Today" : "This week"}</span>
              <button class="del" type="button" aria-label="Delete card">×</button>
            </li>`
              )
              .join("\n            ")}
          </ul>
          <form class="add-card" data-add="${key}">
            <label class="sr" for="add-${key}">Add to ${label}</label>
            <input id="add-${key}" placeholder="Add a card" autocomplete="off" maxlength="90" />
            <button type="submit" aria-label="Add card">+</button>
          </form>
        </div>`
          )
          .join("\n        ")}
      </section>
      <p class="foot">Everything here lives in this browser for now.</p>
    </main>`;

    const css = `
.stage{min-height:100vh;padding:26px clamp(16px,3vw,36px) 40px;display:flex;flex-direction:column;gap:20px}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
h1{font-size:26px}
.sub{color:var(--muted);font-size:13px;margin-top:6px}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:start}
.col{padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:10px;min-height:220px}
.col-head{display:flex;justify-content:space-between;align-items:center}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.count{font-size:11px;font-weight:700;background:var(--surface-2);border-radius:999px;padding:2px 8px;color:var(--muted)}
.cards{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;min-height:60px}
.kcard{position:relative;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px 12px 10px;cursor:grab;transition:border-color .15s ease,transform .15s ease}
.kcard:hover{border-color:var(--border-strong,#3a3f48)}
.kcard:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.kcard.drag{opacity:.4}
.kcard p{font-size:14px;line-height:1.4;padding-right:18px}
.meta{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--muted)}
.avatar{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:9px;font-weight:700;color:#fff;background:var(--accent)}
.del{position:absolute;top:6px;right:6px;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:15px;line-height:1;padding:2px 5px;border-radius:5px;opacity:0}
.kcard:hover .del,.kcard:focus-within .del{opacity:1}
.del:hover{color:var(--danger);background:var(--surface)}
.add-card{display:flex;gap:6px;margin-top:auto}
.add-card input{flex:1;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--surface-2);font-size:13px;min-width:0}
.add-card button{width:34px;height:34px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;font-size:16px}
.add-card button:hover{color:var(--ink);border-color:var(--accent)}
.col.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--surface))}
.foot{font-size:12px;color:var(--muted);margin-top:auto}
@media (max-width:900px){.board{grid-template-columns:1fr}.col{min-height:auto}}
`;

    const js = `var board = document.getElementById("board");
var dragged = null;

function updateCounts() {
  board.querySelectorAll("[data-count]").forEach(function (badge) {
    var key = badge.getAttribute("data-count");
    var list = board.querySelector('[data-list="' + key + '"]');
    badge.textContent = String(list.querySelectorAll(".kcard").length);
  });
}

function wire(card) {
  card.addEventListener("dragstart", function () {
    dragged = card;
    card.classList.add("drag");
  });
  card.addEventListener("dragend", function () {
    card.classList.remove("drag");
    dragged = null;
    board.querySelectorAll(".col").forEach(function (col) { col.classList.remove("over"); });
  });
  var del = card.querySelector(".del");
  if (del) {
    del.addEventListener("click", function () {
      card.remove();
      updateCounts();
    });
  }
  card.addEventListener("keydown", function (event) {
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      card.remove();
      updateCounts();
    }
  });
}

board.querySelectorAll(".kcard").forEach(wire);

board.querySelectorAll(".col").forEach(function (col) {
  col.addEventListener("dragover", function (event) {
    event.preventDefault();
    col.classList.add("over");
  });
  col.addEventListener("dragleave", function () { col.classList.remove("over"); });
  col.addEventListener("drop", function (event) {
    event.preventDefault();
    col.classList.remove("over");
    if (!dragged) return;
    var list = col.querySelector("[data-list]");
    list.appendChild(dragged);
    updateCounts();
  });
});

board.querySelectorAll(".add-card").forEach(function (form) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var input = form.querySelector("input");
    var text = input.value.trim();
    if (!text) return;
    var key = form.getAttribute("data-add");
    var list = board.querySelector('[data-list="' + key + '"]');
    var card = document.createElement("li");
    card.className = "kcard";
    card.draggable = true;
    card.tabIndex = 0;
    card.innerHTML = '<p></p><span class="meta"><span class="avatar" aria-hidden="true">+</span>Just added</span><button class="del" type="button" aria-label="Delete card">×</button>';
    card.querySelector("p").textContent = text;
    wire(card);
    list.appendChild(card);
    input.value = "";
    updateCounts();
  });
});

var addTop = document.getElementById("add-top");
if (addTop) {
  addTop.addEventListener("click", function () {
    var input = board.querySelector('[data-list="backlog"]').parentElement.querySelector("input");
    if (input) input.focus();
  });
}

updateCounts();
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — board", description: "A kanban board", body, css, js }) };
  }
};

export const quiz = {
  key: "quiz",
  label: "Quiz / flashcards",
  test: (p) => /quiz|flashcard|trivia|study|learning app|geography|questions app|exam/.test(p),
  build(ctx) {
    const name = ctx.name;
    const body = `<main class="stage">
      <section class="card panel" id="panel">
        <header class="panel-head">
          <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
          <p class="pill" id="progress-pill">Quiz</p>
        </header>

        <div class="screen" id="intro">
          <h1>${esc(ctx.headline)}</h1>
          <p class="sub">${esc(ctx.tagline)}</p>
          <ul class="rules">
            <li>Six questions, no timer — think it through.</li>
            <li>One answer per question, then you see why.</li>
            <li>Retry at the end; only your best run is remembered.</li>
          </ul>
          <button class="btn wide" type="button" id="start">Start</button>
        </div>

        <div class="screen" id="play" hidden>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Quiz progress"><span id="bar-fill"></span></div>
          <p class="count" id="count">Question 1 of 6</p>
          <h2 id="question">…</h2>
          <div class="options" id="options"></div>
          <div class="feedback" id="feedback" role="status" aria-live="polite"></div>
          <button class="btn wide" type="button" id="next" disabled>Next</button>
        </div>

        <div class="screen" id="result" hidden>
          <p class="pill" id="verdict">Result</p>
          <h1 id="score">0 / 6</h1>
          <p class="sub" id="verdict-copy"></p>
          <div class="review" id="review"></div>
          <button class="btn wide" type="button" id="again">Try again</button>
        </div>
      </section>
      <p class="foot">Audio-free, keyboard-friendly, works offline.</p>
    </main>`;

    const css = `
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:28px 16px}
.panel{width:100%;max-width:620px;padding:28px}
.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;text-decoration:none;font-size:15px}
.mark{width:18px;height:18px;border-radius:6px;background:var(--accent)}
h1{font-size:26px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:14px;margin-top:10px;line-height:1.6}
.rules{margin:18px 0;padding-left:18px;color:var(--muted);font-size:14px;display:flex;flex-direction:column;gap:8px}
.wide{width:100%;margin-top:18px}
.bar{height:6px;border-radius:999px;background:var(--surface-2);overflow:hidden}
.bar span{display:block;height:100%;width:0;background:var(--accent);transition:width .3s ease}
.count{font-size:12px;color:var(--muted);margin:12px 0 6px;letter-spacing:.04em;text-transform:uppercase}
h2{font-size:20px;line-height:1.35;letter-spacing:-.01em}
.options{display:flex;flex-direction:column;gap:8px;margin-top:18px}
.option{display:flex;align-items:center;gap:12px;text-align:left;padding:13px 15px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);cursor:pointer;font-size:14px;transition:border-color .15s ease,background .15s ease}
.option:hover:not([disabled]){border-color:var(--accent)}
.option .key{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:var(--surface);border:1px solid var(--line);font-size:11px;font-weight:700;color:var(--muted);flex:0 0 auto}
.option.correct{border-color:var(--success);background:color-mix(in srgb,var(--success) 14%,transparent)}
.option.wrong{border-color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)}
.feedback{font-size:13px;color:var(--muted);min-height:20px;margin-top:14px;line-height:1.5}
.review{margin-top:20px;display:flex;flex-direction:column;gap:8px}
.review-row{display:flex;gap:10px;font-size:13px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2)}
.review-row .ok{color:var(--success);font-weight:700}
.review-row .no{color:var(--danger);font-weight:700}
#score{font-size:44px;letter-spacing:-.03em}
.foot{font-size:12px;color:var(--muted)}
@media (max-width:520px){.panel{padding:20px}h1{font-size:22px}h2{font-size:18px}}
`;

    const js = `var QUESTIONS = [
  { q: "Which one is a colour *role* rather than a colour?", options: ["#3b6fd4", "accent", "rgb(15, 20, 30)", "hsl(210 80% 50%)"], answer: 1, why: "A role names the job; the value behind it can change with the theme." },
  { q: "What is the safest place for a generated app's script to run?", options: ["In the page itself", "A sandboxed iframe", "In a Worker", "In a service worker"], answer: 1, why: "A sandboxed iframe keeps untrusted code away from your session and storage." },
  { q: "A save button that never leaves its loading state is usually…", options: ["A CSS bug", "A promise that never settles", "A missing font", "A race in the router"], answer: 1, why: "The loading flag is reset after an await that rejects silently." },
  { q: "Which is the better empty state?", options: ["A blank panel", "A spinner forever", "One line saying what to do next", "A console warning"], answer: 2, why: "An empty state is an instruction, not an apology." },
  { q: "Which number is the WCAG AA floor for body text?", options: ["1.5:1", "3:1", "4.5:1", "12:1"], answer: 2, why: "4.5:1 for body text; 3:1 is the floor for large text and UI borders." },
  { q: "Publishing should copy the project files, not point at them, because…", options: ["It is faster", "Edits would otherwise go live unannounced", "Links are expensive", "Browsers cache badly"], answer: 1, why: "A snapshot means the live site changes only when you press Update." }
];

var index = 0;
var score = 0;
var answers = [];
var locked = false;

var intro = document.getElementById("intro");
var play = document.getElementById("play");
var result = document.getElementById("result");
var questionEl = document.getElementById("question");
var optionsEl = document.getElementById("options");
var countEl = document.getElementById("count");
var barFill = document.getElementById("bar-fill");
var feedback = document.getElementById("feedback");
var nextBtn = document.getElementById("next");
var progressPill = document.getElementById("progress-pill");

function show(screen) {
  [intro, play, result].forEach(function (el) { el.hidden = el !== screen; });
}

function renderQuestion() {
  locked = false;
  var item = QUESTIONS[index];
  questionEl.textContent = item.q;
  countEl.textContent = "Question " + (index + 1) + " of " + QUESTIONS.length;
  barFill.style.width = Math.round((index / QUESTIONS.length) * 100) + "%";
  progressPill.textContent = "Question " + (index + 1);
  feedback.textContent = "";
  nextBtn.disabled = true;
  nextBtn.textContent = index === QUESTIONS.length - 1 ? "See result" : "Next";
  optionsEl.innerHTML = "";
  item.options.forEach(function (text, i) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.innerHTML = '<span class="key">' + "ABCD"[i] + "</span><span class=\\"label\\"></span>";
    button.querySelector(".label").textContent = text;
    button.addEventListener("click", function () { choose(i); });
    optionsEl.appendChild(button);
  });
}

function choose(i) {
  if (locked) return;
  locked = true;
  var item = QUESTIONS[index];
  var buttons = optionsEl.querySelectorAll(".option");
  buttons.forEach(function (button, n) {
    button.disabled = true;
    if (n === item.answer) button.classList.add("correct");
    if (n === i && i !== item.answer) button.classList.add("wrong");
  });
  var right = i === item.answer;
  if (right) score += 1;
  answers.push({ question: item.q, right: right, answer: item.options[item.answer], picked: item.options[i] });
  feedback.textContent = (right ? "Correct. " : "Not quite. ") + item.why;
  nextBtn.disabled = false;
  nextBtn.focus();
}

function finish() {
  show(result);
  document.getElementById("score").textContent = score + " / " + QUESTIONS.length;
  var verdict = score === QUESTIONS.length ? "Flawless" : score >= QUESTIONS.length - 2 ? "Strong run" : score >= 3 ? "Halfway there" : "Worth another pass";
  document.getElementById("verdict").textContent = verdict;
  document.getElementById("verdict-copy").textContent = score + " of " + QUESTIONS.length + " correct. " + (score === QUESTIONS.length ? "Nothing left to prove here." : "The review below is the quickest way back to a perfect run.");
  var review = document.getElementById("review");
  review.innerHTML = "";
  answers.forEach(function (entry) {
    var row = document.createElement("div");
    row.className = "review-row";
    row.innerHTML = '<span class="' + (entry.right ? "ok" : "no") + '">' + (entry.right ? "✓" : "✕") + '</span><span class="copy"></span>';
    row.querySelector(".copy").textContent = entry.question + " — " + entry.answer;
    review.appendChild(row);
  });
  progressPill.textContent = "Done";
}

nextBtn.addEventListener("click", function () {
  if (index === QUESTIONS.length - 1) {
    finish();
    return;
  }
  index += 1;
  renderQuestion();
});

document.getElementById("start").addEventListener("click", function () {
  index = 0;
  score = 0;
  answers = [];
  show(play);
  renderQuestion();
});

document.getElementById("again").addEventListener("click", function () {
  index = 0;
  score = 0;
  answers = [];
  show(intro);
  progressPill.textContent = "Quiz";
});

document.addEventListener("keydown", function (event) {
  if (play.hidden) return;
  if (["1", "2", "3", "4"].indexOf(event.key) >= 0) {
    var i = Number(event.key) - 1;
    var buttons = optionsEl.querySelectorAll(".option");
    if (buttons[i]) buttons[i].click();
  }
});
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — quiz", description: "A quiz", body, css, js }) };
  }
};

export const store = {
  key: "store",
  label: "Storefront",
  test: (p) => /store|shop|ecommerce|e-commerce|products|checkout|cart|boutique|marketplace/.test(p),
  build(ctx) {
    const name = ctx.name;
    const products = [
      ["Field Notes Tote", "Canvas, 14oz", 4800, "a"],
      ["Morning Mug", "Stoneware, 300ml", 2600, "b"],
      ["Desk Tray", "Oak, hand-finished", 6200, "c"],
      ["Cotton Throw", "Woven, 130×170", 8900, "d"],
      ["Brass Clip Set", "Set of four", 1800, "e"],
      ["Notebook Duo", "Dot grid, 96pp", 2200, "f"]
    ];
    const body = `<header class="topbar">
      <div class="wrap bar">
        <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
        <nav class="links" aria-label="Shop">
          <a href="#all">All</a><a href="#home">Home</a><a href="#desk">Desk</a><a href="#gifts">Gifts</a>
        </nav>
        <button class="btn cart-btn" type="button" id="open-cart">
          Cart <span class="badge" id="cart-count">0</span>
        </button>
      </div>
    </header>

    <main>
      <section class="hero wrap">
        <div class="hero-copy">
          <p class="pill">Small batch · ships in 2 days</p>
          <h1>${esc(ctx.headline)}</h1>
          <p class="lede">${esc(ctx.tagline)}</p>
          <div class="chips" role="group" aria-label="Filter products">
            <button class="chip" type="button" data-filter="all" aria-pressed="true">All</button>
            <button class="chip" type="button" data-filter="under" aria-pressed="false">Under $30</button>
            <button class="chip" type="button" data-filter="premium" aria-pressed="false">$60 and up</button>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"><span class="blob"></span><span class="ring"></span></div>
      </section>

      <section class="wrap" id="all">
        <div class="grid" id="grid">
          ${products
            .map(
              ([title, detail, cents, art], i) => `<article class="card product" data-price="${cents}">
            <div class="art art-${art}" aria-hidden="true"><span></span></div>
            <div class="product-body">
              <h2>${esc(title)}</h2>
              <p class="detail">${esc(detail)}</p>
              <div class="product-foot">
                <span class="price">$${(cents / 100).toFixed(2)}</span>
                <button class="btn small add" type="button" data-id="${i}">Add</button>
              </div>
            </div>
          </article>`
            )
            .join("\n          ")}
        </div>
      </section>

      <section class="wrap values">
        <div class="value"><h3>Free shipping over $60</h3><p>Sent the next working day from our own shelf.</p></div>
        <div class="value"><h3>Thirty-day returns</h3><p>Used it and changed your mind? That is fine.</p></div>
        <div class="value"><h3>Made to be repaired</h3><p>Spare parts kept for five years, not five months.</p></div>
      </section>
    </main>

    <div class="overlay" id="overlay" hidden></div>
    <aside class="cart" id="cart" aria-label="Cart" aria-hidden="true">
      <div class="cart-head">
        <h2>Your cart</h2>
        <button class="icon" type="button" id="close-cart" aria-label="Close cart">×</button>
      </div>
      <ul class="cart-list" id="cart-list"></ul>
      <p class="cart-empty" id="cart-empty">Nothing in here yet.</p>
      <div class="cart-foot">
        <div class="row"><span>Subtotal</span><span id="subtotal">$0.00</span></div>
        <div class="row muted"><span>Shipping</span><span id="shipping">—</span></div>
        <button class="btn wide" type="button" id="checkout">Checkout</button>
        <p class="fine" id="cart-note">Demo store — nothing will be charged.</p>
      </div>
    </aside>`;

    const css = `
.topbar{position:sticky;top:0;z-index:10;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px)}
.bar{display:flex;align-items:center;gap:26px;height:66px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none}
.mark{width:20px;height:20px;border-radius:6px;background:var(--accent)}
.links{display:flex;gap:20px;font-size:14px;color:var(--muted)}
.links a{text-decoration:none}
.links a:hover{color:var(--ink)}
.cart-btn{margin-left:auto;height:40px;padding:0 16px;font-size:13px;gap:8px}
.badge{display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:999px;background:rgba(0,0,0,.18);font-size:11px;font-weight:700;padding:0 5px}
.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:32px;align-items:center;padding:56px 24px 26px}
.hero h1{font-size:clamp(32px,4.6vw,52px);margin:16px 0 14px;max-width:16ch}
.lede{color:var(--muted);font-size:17px;max-width:46ch}
.chips{display:flex;gap:8px;margin-top:22px;flex-wrap:wrap}
.chip{height:32px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font-size:13px;font-weight:600;cursor:pointer}
.chip[aria-pressed="true"]{background:var(--surface-2);color:var(--ink);border-color:var(--accent)}
.hero-art{position:relative;height:240px}
.blob{position:absolute;inset:0;border-radius:40% 60% 55% 45%/50% 45% 55% 50%;background:linear-gradient(140deg,color-mix(in srgb,var(--accent) 55%,transparent),color-mix(in srgb,var(--accent) 12%,transparent));filter:blur(2px)}
.ring{position:absolute;inset:38px;border-radius:50%;border:1px dashed color-mix(in srgb,var(--accent) 60%,transparent)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:26px 0 8px}
.product{overflow:hidden;display:flex;flex-direction:column}
.art{height:170px;display:grid;place-items:center;background:var(--surface-2);border-bottom:1px solid var(--line)}
.art span{width:78px;height:78px;border-radius:14px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 70%,#fff),var(--accent));box-shadow:0 12px 26px rgba(0,0,0,.16)}
.art-b span{width:86px;height:64px;border-radius:10px 10px 26px 26px}
.art-c span{width:100px;height:58px;border-radius:8px}
.art-d span{width:92px;height:92px;border-radius:50% 50% 12px 12px}
.art-e span{width:44px;height:76px;border-radius:22px;transform:rotate(12deg)}
.art-f span{width:72px;height:90px;border-radius:6px;transform:rotate(-6deg)}
.product-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px;flex:1}
.product h2{font-size:15px}
.detail{font-size:12px;color:var(--muted)}
.product-foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:10px}
.price{font-weight:650;font-variant-numeric:tabular-nums}
.btn.small{height:32px;padding:0 14px;font-size:12px}
.values{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:48px 24px 64px;border-top:1px solid var(--line);margin-top:36px}
.value h3{font-size:14px;margin-bottom:4px}
.value p{font-size:13px;color:var(--muted)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:20}
.cart{position:fixed;top:0;right:0;bottom:0;width:min(380px,100%);background:var(--surface);border-left:1px solid var(--line);z-index:21;display:flex;flex-direction:column;transform:translateX(102%);transition:transform .22s cubic-bezier(.2,.8,.2,1);padding:18px}
.cart.open{transform:none}
.cart-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.cart-head h2{font-size:16px}
.icon{border:0;background:transparent;font-size:20px;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:6px}
.icon:hover{background:var(--surface-2);color:var(--ink)}
.cart-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1}
.cart-item{display:grid;grid-template-columns:38px 1fr auto;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:10px}
.cart-thumb{width:38px;height:38px;border-radius:8px;background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 70%,#fff),var(--accent))}
.cart-item h3{font-size:13px;font-weight:600}
.cart-item p{font-size:11px;color:var(--muted)}
.qty{display:inline-flex;align-items:center;gap:6px;margin-top:4px}
.qty button{width:20px;height:20px;border-radius:5px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;font-size:12px;line-height:1}
.cart-empty{color:var(--muted);font-size:13px;text-align:center;padding:26px 0}
.cart-foot{border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;justify-content:space-between;font-size:14px}
.wide{width:100%;margin-top:6px}
.fine{font-size:11px;color:var(--muted);text-align:center}
@media (max-width:900px){.links{display:none}.hero{grid-template-columns:1fr;padding-top:36px}.hero-art{display:none}.grid{grid-template-columns:repeat(2,1fr)}.values{grid-template-columns:1fr}}
@media (max-width:560px){.grid{grid-template-columns:1fr}}
`;

    const js = `${money}

var PRODUCTS = [
  { id: "p1", title: "Field Notes Tote", price: 4800 },
  { id: "p2", title: "Morning Mug", price: 2600 },
  { id: "p3", title: "Desk Tray", price: 6200 },
  { id: "p4", title: "Cotton Throw", price: 8900 },
  { id: "p5", title: "Brass Clip Set", price: 1800 },
  { id: "p6", title: "Notebook Duo", price: 2200 }
];

var cart = {};
var grid = document.getElementById("grid");
var cartEl = document.getElementById("cart");
var overlay = document.getElementById("overlay");
var cartList = document.getElementById("cart-list");
var cartEmpty = document.getElementById("cart-empty");
var subtotalEl = document.getElementById("subtotal");
var shippingEl = document.getElementById("shipping");
var countEl = document.getElementById("cart-count");
var note = document.getElementById("cart-note");

function openCart() {
  cartEl.classList.add("open");
  cartEl.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
  document.getElementById("close-cart").focus();
}

function closeCart() {
  cartEl.classList.remove("open");
  cartEl.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
}

function totals() {
  var count = 0;
  var cents = 0;
  Object.keys(cart).forEach(function (id) {
    var product = PRODUCTS.filter(function (p) { return p.id === id; })[0];
    if (!product) return;
    count += cart[id];
    cents += cart[id] * product.price;
  });
  return { count: count, cents: cents };
}

function render() {
  var t = totals();
  countEl.textContent = String(t.count);
  subtotalEl.textContent = money(t.cents);
  shippingEl.textContent = t.cents === 0 ? "—" : t.cents >= 6000 ? "Free" : money(600);
  cartEmpty.hidden = t.count > 0;
  cartList.innerHTML = "";
  Object.keys(cart).forEach(function (id) {
    var product = PRODUCTS.filter(function (p) { return p.id === id; })[0];
    if (!product) return;
    var li = document.createElement("li");
    li.className = "cart-item";
    li.innerHTML = '<span class="cart-thumb" aria-hidden="true"></span><div><h3></h3><p></p><div class="qty"><button type="button" data-step="-1" aria-label="One fewer">−</button><span class="n"></span><button type="button" data-step="1" aria-label="One more">+</button></div></div><strong class="line"></strong>';
    li.querySelector("h3").textContent = product.title;
    li.querySelector("p").textContent = money(product.price) + " each";
    li.querySelector(".n").textContent = String(cart[id]);
    li.querySelector(".line").textContent = money(product.price * cart[id]);
    li.querySelectorAll("[data-step]").forEach(function (button) {
      button.addEventListener("click", function () {
        var next = cart[id] + Number(button.getAttribute("data-step"));
        if (next <= 0) delete cart[id];
        else cart[id] = next;
        render();
      });
    });
    cartList.appendChild(li);
  });
}

grid.addEventListener("click", function (event) {
  var button = event.target.closest(".add");
  if (!button) return;
  var id = PRODUCTS[Number(button.getAttribute("data-id"))].id;
  cart[id] = (cart[id] || 0) + 1;
  button.textContent = "Added";
  button.disabled = true;
  setTimeout(function () {
    button.textContent = "Add";
    button.disabled = false;
  }, 700);
  render();
});

document.querySelectorAll(".chip").forEach(function (chip) {
  chip.addEventListener("click", function () {
    var mode = chip.getAttribute("data-filter");
    document.querySelectorAll(".chip").forEach(function (other) {
      other.setAttribute("aria-pressed", String(other === chip));
    });
    grid.querySelectorAll(".product").forEach(function (card) {
      var price = Number(card.getAttribute("data-price"));
      var show = mode === "all" || (mode === "under" && price < 3000) || (mode === "premium" && price >= 6000);
      card.style.display = show ? "" : "none";
    });
  });
});

document.getElementById("open-cart").addEventListener("click", openCart);
document.getElementById("close-cart").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeCart();
});

document.getElementById("checkout").addEventListener("click", function () {
  var t = totals();
  if (t.count === 0) {
    note.textContent = "Add something first.";
    return;
  }
  note.textContent = "This is a demo — no payment was taken.";
  cart = {};
  setTimeout(render, 40);
});

render();
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — shop", description: "A small storefront", body, css, js }) };
  }
};

export const expense = {
  key: "expense",
  label: "Expense tracker",
  test: (p) => /expense|budget|spending|money tracker|finance app|costs|subscriptions? tracker/.test(p),
  build(ctx) {
    const name = ctx.name;
    const body = `<main class="stage">
      <header class="top">
        <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
        <p class="pill">This month</p>
      </header>

      <section class="card summary">
        <div>
          <p class="label">Spent so far</p>
          <p class="big" id="total">$0.00</p>
          <p class="sub" id="count">No entries yet</p>
        </div>
        <div class="split" aria-hidden="true">
          <div class="donut" id="donut"></div>
        </div>
      </section>

      <section class="card form-card">
        <form id="entry-form" class="entry">
          <div class="field">
            <label for="label">What was it?</label>
            <input class="input" id="label" placeholder="Coffee with the team" maxlength="60" required />
          </div>
          <div class="field amount-field">
            <label for="amount">Amount</label>
            <input class="input" id="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="12.50" required />
          </div>
          <div class="field">
            <label for="category">Category</label>
            <select class="input" id="category">
              <option>Food</option><option>Travel</option><option>Tools</option><option>Bills</option><option>Other</option>
            </select>
          </div>
          <button class="btn" type="submit">Add</button>
        </form>
      </section>

      <section class="grid">
        <div class="card list-card">
          <div class="card-head"><h2>Recent spend</h2><span class="muted" id="entries-count"></span></div>
          <ul class="entries" id="entries"></ul>
          <p class="empty" id="empty">Nothing logged yet. The first entry is the hard one.</p>
        </div>
        <div class="card by-cat">
          <h2>By category</h2>
          <div id="cats" class="cats"></div>
        </div>
      </section>
      <p class="foot">Saved in this browser. Amounts are for show, not accounting.</p>
    </main>`;

    const css = `
.stage{min-height:100vh;display:flex;flex-direction:column;gap:16px;padding:26px clamp(16px,4vw,40px) 44px;max-width:1000px;margin:0 auto}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none}
.mark{width:20px;height:20px;border-radius:6px;background:var(--accent)}
.summary{padding:24px;display:flex;justify-content:space-between;align-items:center;gap:24px;background:linear-gradient(120deg,var(--surface),color-mix(in srgb,var(--accent) 10%,var(--surface)))}
.label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.big{font-size:44px;font-weight:650;letter-spacing:-.03em;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.sub{font-size:13px;color:var(--muted)}
.donut{width:96px;height:96px;border-radius:50%;background:conic-gradient(var(--accent) 0 40%,color-mix(in srgb,var(--accent) 55%,#777) 40% 70%,color-mix(in srgb,var(--accent) 25%,#777) 70% 100%);mask:radial-gradient(circle,transparent 52%,#000 53%);-webkit-mask:radial-gradient(circle,transparent 52%,#000 53%)}
.form-card{padding:16px}
.entry{display:grid;grid-template-columns:1.4fr .7fr .9fr auto;gap:10px;align-items:end}
.entry .btn{height:46px}
.grid{display:grid;grid-template-columns:1.4fr .6fr;gap:16px;align-items:start}
.card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
h2{font-size:15px}
.list-card{padding:18px}
.entries{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.entry-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);animation:in .18s ease}
@keyframes in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.entry-row:last-child{border-bottom:0}
.tag{font-size:11px;font-weight:600;padding:3px 8px;border-radius:999px;background:var(--surface-2);color:var(--muted);min-width:60px;text-align:center}
.entry-row .what{flex:1;font-size:14px;overflow-wrap:anywhere}
.entry-row .when{font-size:11px;color:var(--muted)}
.entry-row .amt{font-variant-numeric:tabular-nums;font-weight:600}
.entry-row .del{border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;padding:4px 6px;border-radius:5px}
.entry-row .del:hover{color:var(--danger);background:var(--surface-2)}
.empty{color:var(--muted);font-size:13px;text-align:center;padding:28px 0}
.by-cat{padding:18px;display:flex;flex-direction:column;gap:12px}
.cats{display:flex;flex-direction:column;gap:10px}
.cat{display:flex;flex-direction:column;gap:5px}
.cat-top{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
.bar{height:7px;border-radius:999px;background:var(--surface-2);overflow:hidden}
.bar span{display:block;height:100%;background:var(--accent);border-radius:999px;transition:width .3s ease}
.foot{font-size:12px;color:var(--muted);margin-top:auto}
@media (max-width:820px){.entry{grid-template-columns:1fr 1fr}.entry .btn{grid-column:1 / -1}.grid{grid-template-columns:1fr}.summary{flex-direction:row;align-items:flex-start}.big{font-size:34px}}
`;

    const js = `${storage}

var KEY = "spend-v1";
var entries = keep(KEY, [
  { id: 1, label: "Coffee with the team", amount: 1250, category: "Food", at: Date.now() - 86400000 },
  { id: 2, label: "Train to the studio", amount: 480, category: "Travel", at: Date.now() - 172800000 },
  { id: 3, label: "Browser extension", amount: 900, category: "Tools", at: Date.now() - 259200000 }
]);
var form = document.getElementById("entry-form");
var list = document.getElementById("entries");
var empty = document.getElementById("empty");
var totalEl = document.getElementById("total");
var countEl = document.getElementById("count");
var entriesCount = document.getElementById("entries-count");
var catsEl = document.getElementById("cats");

function money(cents) {
  return "$" + (cents / 100).toFixed(2);
}

function when(ts) {
  var days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return days + " days ago";
}

function render() {
  var total = entries.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
  totalEl.textContent = money(total);
  countEl.textContent = entries.length === 0 ? "No entries yet" : entries.length + (entries.length === 1 ? " entry" : " entries") + " · avg " + money(entries.length ? total / entries.length : 0);
  entriesCount.textContent = entries.length ? entries.length + " logged" : "";
  empty.hidden = entries.length > 0;

  list.innerHTML = "";
  entries.slice().sort(function (a, b) { return b.at - a.at; }).forEach(function (entry) {
    var li = document.createElement("li");
    li.className = "entry-row";
    li.innerHTML = '<span class="tag"></span><span class="what"></span><span class="when"></span><span class="amt"></span><button class="del" type="button" aria-label="Delete entry">×</button>';
    li.querySelector(".tag").textContent = entry.category;
    li.querySelector(".what").textContent = entry.label;
    li.querySelector(".when").textContent = when(entry.at);
    li.querySelector(".amt").textContent = money(entry.amount);
    li.querySelector(".del").addEventListener("click", function () {
      entries = entries.filter(function (e) { return e.id !== entry.id; });
      save(KEY, entries);
      render();
    });
    list.appendChild(li);
  });

  var byCategory = {};
  entries.forEach(function (entry) {
    byCategory[entry.category] = (byCategory[entry.category] || 0) + entry.amount;
  });
  var keys = Object.keys(byCategory).sort(function (a, b) { return byCategory[b] - byCategory[a]; });
  catsEl.innerHTML = "";
  if (!keys.length) {
    catsEl.innerHTML = '<p class="empty">No categories yet.</p>';
    return;
  }
  keys.forEach(function (key) {
    var share = total ? Math.round((byCategory[key] / total) * 100) : 0;
    var row = document.createElement("div");
    row.className = "cat";
    row.innerHTML = '<div class="cat-top"><span class="name"></span><span class="val"></span></div><div class="bar"><span style="width:' + share + '%"></span></div>';
    row.querySelector(".name").textContent = key;
    row.querySelector(".val").textContent = money(byCategory[key]) + " · " + share + "%";
    catsEl.appendChild(row);
  });

  var donut = document.getElementById("donut");
  if (donut && total) {
    var stops = [];
    var start = 0;
    keys.slice(0, 4).forEach(function (key, i) {
      var pct = (byCategory[key] / total) * 100;
      var shade = 70 - i * 18;
      stops.push("color-mix(in srgb, var(--accent) " + shade + "%, #666) " + start + "% " + (start + pct) + "%");
      start += pct;
    });
    donut.style.background = "conic-gradient(" + stops.join(",") + ")";
  }
}

form.addEventListener("submit", function (event) {
  event.preventDefault();
  var labelInput = document.getElementById("label");
  var amountInput = document.getElementById("amount");
  var categoryInput = document.getElementById("category");
  var label = labelInput.value.trim();
  var amount = Math.round(Number(amountInput.value) * 100);
  if (!label || !amount || amount <= 0) {
    if (!label) labelInput.focus();
    else amountInput.focus();
    return;
  }
  entries.unshift({ id: Date.now(), label: label, amount: amount, category: categoryInput.value, at: Date.now() });
  save(KEY, entries);
  form.reset();
  categoryInput.value = "Food";
  labelInput.focus();
  render();
});

render();
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — spending", description: "An expense tracker", body, css, js }) };
  }
};

export const calculator = {
  key: "calculator",
  label: "Calculator",
  test: (p) => /calculator|calculate|math app|unit converter|tip calculator/.test(p),
  build(ctx) {
    const name = ctx.name;
    const body = `<main class="stage">
      <section class="card calc" aria-label="Calculator">
        <header class="head">
          <a class="brand" href="#"><span class="mark" aria-hidden="true"></span>${esc(name)}</a>
          <p class="pill" id="hint">Type or tap</p>
        </header>
        <div class="screen">
          <p class="expr" id="expr" aria-live="off">&nbsp;</p>
          <p class="out" id="out" aria-live="polite">0</p>
        </div>
        <div class="keys" role="group" aria-label="Keypad">
          <button type="button" class="key fn" data-key="clear">AC</button>
          <button type="button" class="key fn" data-key="negate">±</button>
          <button type="button" class="key fn" data-key="percent">%</button>
          <button type="button" class="key op" data-key="/">÷</button>
          <button type="button" class="key" data-key="7">7</button>
          <button type="button" class="key" data-key="8">8</button>
          <button type="button" class="key" data-key="9">9</button>
          <button type="button" class="key op" data-key="*">×</button>
          <button type="button" class="key" data-key="4">4</button>
          <button type="button" class="key" data-key="5">5</button>
          <button type="button" class="key" data-key="6">6</button>
          <button type="button" class="key op" data-key="-">−</button>
          <button type="button" class="key" data-key="1">1</button>
          <button type="button" class="key" data-key="2">2</button>
          <button type="button" class="key" data-key="3">3</button>
          <button type="button" class="key op" data-key="+">+</button>
          <button type="button" class="key zero" data-key="0">0</button>
          <button type="button" class="key" data-key=".">,</button>
          <button type="button" class="key equal" data-key="=">=</button>
        </div>
      </section>
      <p class="foot">Keyboard works: numbers, + − * /, Enter, Backspace.</p>
    </main>`;

    const css = `
.stage{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:28px 16px}
.calc{width:100%;max-width:340px;padding:18px;display:flex;flex-direction:column;gap:14px}
.head{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;text-decoration:none;font-size:14px}
.mark{width:16px;height:16px;border-radius:5px;background:var(--accent)}
.screen{background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-align:right;min-height:104px;display:flex;flex-direction:column;justify-content:flex-end;gap:4px}
.expr{font-size:13px;color:var(--muted);min-height:18px;overflow-wrap:anywhere}
.out{font-size:38px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.out.error{color:var(--danger);font-size:22px}
.keys{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.key{height:52px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:17px;cursor:pointer;transition:transform .1s ease,background .15s ease}
.key:hover{background:color-mix(in srgb,var(--accent) 10%,var(--surface-2))}
.key:active{transform:scale(.97)}
.key.fn{color:var(--muted);font-size:14px;font-weight:600}
.key.op{color:var(--accent);font-weight:600;font-size:19px}
.key.equal{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700;font-size:20px}
.key.equal:hover{filter:brightness(1.07);background:var(--accent)}
.key.zero{grid-column:span 1}
.foot{font-size:12px;color:var(--muted);text-align:center;max-width:320px}
`;

    const js = `var out = document.getElementById("out");
var expr = document.getElementById("expr");
var hint = document.getElementById("hint");
var current = "0";
var stored = null;
var operator = null;
var fresh = true;

function pretty(value) {
  if (value === "Error") return value;
  var n = Number(value);
  if (!isFinite(n)) return "Error";
  var text = String(n);
  if (text.length > 12) text = n.toPrecision(10).replace(/0+$/, "").replace(/\\.$/, "");
  return text;
}

function paint() {
  out.textContent = pretty(current);
  out.classList.toggle("error", current === "Error");
  expr.innerHTML = stored !== null && operator ? pretty(stored) + " " + operator : "&nbsp;";
}

function apply(a, b, op) {
  var x = Number(a);
  var y = Number(b);
  if (op === "+") return x + y;
  if (op === "-") return x - y;
  if (op === "*") return x * y;
  if (op === "/") return y === 0 ? NaN : x / y;
  return y;
}

function press(key) {
  if (/^[0-9]$/.test(key)) {
    if (fresh) {
      current = key;
      fresh = false;
    } else {
      current = current === "0" ? key : current + key;
    }
    paint();
    return;
  }
  if (key === ".") {
    if (fresh) {
      current = "0.";
      fresh = false;
    } else if (current.indexOf(".") < 0) {
      current += ".";
    }
    paint();
    return;
  }
  if (key === "clear") {
    current = "0";
    stored = null;
    operator = null;
    fresh = true;
    hint.textContent = "Cleared";
    paint();
    return;
  }
  if (key === "negate") {
    current = current === "0" ? "0" : String(Number(current) * -1);
    paint();
    return;
  }
  if (key === "percent") {
    current = String(Number(current) / 100);
    paint();
    return;
  }
  if (key === "+" || key === "-" || key === "*" || key === "/") {
    if (stored !== null && operator && !fresh) {
      var result = apply(stored, current, operator);
      stored = isFinite(result) ? result : "Error";
      current = String(stored);
    } else {
      stored = Number(current);
    }
    operator = key;
    fresh = true;
    paint();
    return;
  }
  if (key === "=") {
    if (stored === null || !operator) return;
    var value = apply(stored, current, operator);
    current = isFinite(value) ? String(value) : "Error";
    expr.innerHTML = pretty(stored) + " " + operator + " " + pretty(Number(current) === current ? stored : stored) + " =";
    expr.innerHTML = pretty(stored) + " " + operator + " " + "…";
    stored = null;
    operator = null;
    fresh = true;
    paint();
    expr.innerHTML = pretty(current) + " =";
    hint.textContent = "Done";
  }
}

document.querySelectorAll(".key").forEach(function (button) {
  button.addEventListener("click", function () {
    press(button.getAttribute("data-key"));
  });
});

document.addEventListener("keydown", function (event) {
  var key = event.key;
  if (/^[0-9]$/.test(key)) { press(key); return; }
  if (key === "." || key === ",") { press("."); return; }
  if (key === "+" || key === "-" || key === "*" || key === "/") { press(key); return; }
  if (key === "Enter" || key === "=") { event.preventDefault(); press("="); return; }
  if (key === "Escape") { press("clear"); return; }
  if (key === "Backspace") {
    event.preventDefault();
    current = current.length > 1 ? current.slice(0, -1) : "0";
    if (current === "-") current = "0";
    paint();
  }
});

paint();
`;

    return { name, summary: ctx.summary, files: site(ctx, { title: name + " — calculator", description: "A calculator", body, css, js }) };
  }
};

export const apps = [timer, todo, kanban, quiz, store, expense, calculator];
