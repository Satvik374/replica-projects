/* Alcove — small DOM helpers. No framework, no dependencies. */

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function icon(name, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

export function mark(size = 15) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 28V14a11 11 0 0 1 22 0v14h-5V14.5a6 6 0 0 0-12 0V28z");
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A";
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / 104857.6) / 10} MB`;
}

export function relativeTime(stamp) {
  const then = Number(stamp) || 0;
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function dateGroup(stamp) {
  const date = new Date(Number(stamp) || Date.now());
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfToday - start) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(/\s+/)[0]}` : part;
}

export function resetCountdown(resetsAt) {
  const diff = Math.max(0, Number(resetsAt) - Date.now());
  const mins = Math.ceil(diff / 60000);
  if (mins <= 0) return "Resetting now";
  if (mins < 60) return `Resets in ${mins} min`;
  const hours = Math.floor(mins / 60);
  return `Resets in ${hours}h ${mins % 60}m`;
}

export function toast(message) {
  const node = $("#status");
  if (!node) return;
  node.textContent = message;
  node.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("is-visible"), 2800);
}

export function openDialog(dialog) {
  if (!dialog) return;
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

export function closeDialog(dialog) {
  if (!dialog || !dialog.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export function confirmAction({ title, body, confirmLabel = "Confirm", danger = true }) {
  const dialog = $("#confirmDialog");
  $("#confirmTitle").textContent = title;
  $("#confirmBody").textContent = body;
  const yes = $("#confirmYes");
  yes.textContent = confirmLabel;
  yes.className = `btn ${danger ? "btn--danger" : "btn--primary"}`;
  openDialog(dialog);
  return new Promise((resolve) => {
    const done = (value) => {
      yes.removeEventListener("click", onYes);
      $("#confirmNo").removeEventListener("click", onNo);
      dialog.removeEventListener("close", onClose);
      closeDialog(dialog);
      resolve(value);
    };
    const onYes = () => done(true);
    const onNo = () => done(false);
    const onClose = () => done(false);
    yes.addEventListener("click", onYes);
    $("#confirmNo").addEventListener("click", onNo);
    dialog.addEventListener("close", onClose);
    setTimeout(() => yes.focus(), 30);
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function debounce(fn, ms = 220) {
  let handle = null;
  return (...args) => {
    clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  };
}

export function closeAllMenus(except) {
  for (const menu of $$(".menu")) {
    if (menu === except) continue;
    if (menu.hidden) continue;
    menu.hidden = true;
    const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
    if (trigger) trigger.setAttribute("aria-expanded", "false");
  }
  for (const trigger of $$('[aria-haspopup="menu"][aria-expanded="true"]')) {
    if (except && except.id && trigger.getAttribute("aria-controls") === except.id) continue;
    trigger.setAttribute("aria-expanded", "false");
  }
}
