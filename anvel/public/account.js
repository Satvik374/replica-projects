/* Anvel — accounts, session and settings.
   The only place that talks to /api/auth and /api/settings. */

export const state = {
  user: null,
  usage: null,
  settings: { theme: "system", showTokens: true, defaultMode: "website" }
};

let onAuthChange = () => {};

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new ApiError(payload.error || `Request failed (${response.status})`, response.status, payload.field);
  }
  return payload;
}

export function apiAvailable() {
  return typeof fetch === "function";
}

/* ------------------------------------------------------------------ theme */

const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

function resolved(theme) {
  if (theme === "light" || theme === "dark") return theme;
  return media && media.matches ? "light" : "dark";
}

export function applyTheme(theme = state.settings.theme) {
  document.documentElement.dataset.theme = resolved(theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved(theme) === "light" ? "#fbfaf7" : "#0d0f12");
}

media?.addEventListener?.("change", () => applyTheme());

/* ---------------------------------------------------------------- session */

export async function loadSession() {
  try {
    const data = await request("/me");
    if (!data.user) {
      state.user = null;
      applyTheme();
      return null;
    }
    state.user = data.user;
    state.usage = data.usage;
    state.settings = data.settings;
    applyTheme();
    return state.user;
  } catch (error) {
    /* Sessions need the DB binding; without it the app still renders signed out. */
    state.user = null;
    return null;
  }
}

export async function signUp({ username, email, password }) {
  const data = await request("/auth/signup", { method: "POST", body: { username, email, password } });
  state.user = data.user;
  state.usage = data.usage;
  state.settings = data.settings;
  applyTheme();
  return data.user;
}

export async function signIn({ login, password }) {
  const data = await request("/auth/signin", { method: "POST", body: { login, password } });
  state.user = data.user;
  state.usage = data.usage;
  state.settings = data.settings;
  applyTheme();
  return data.user;
}

export async function signOut() {
  await request("/auth/signout", { method: "POST" });
  state.user = null;
  state.usage = null;
  state.settings = { theme: "system", showTokens: true, defaultMode: "website" };
  applyTheme();
}

export async function saveSettings(partial) {
  const data = await request("/settings", { method: "PATCH", body: partial });
  state.settings = data.settings;
  applyTheme();
  return data.settings;
}

export function usageBlocked() {
  return !!state.usage?.blocked;
}

export function formatTokens(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

/* ------------------------------------------------------------------ dialog */

const backdrop = () => document.getElementById("dialog-backdrop");
const dialog = (id) => document.getElementById(id);

export function closeDialogs() {
  backdrop().hidden = true;
  backdrop()
    .querySelectorAll(".dialog")
    .forEach((node) => {
      node.hidden = true;
    });
  document.body.style.overflow = "";
}

export function openDialog(id) {
  backdrop().hidden = false;
  backdrop()
    .querySelectorAll(".dialog")
    .forEach((node) => {
      node.hidden = node.id !== id;
    });
  document.body.style.overflow = "hidden";
  const first = dialog(id)?.querySelector("input, button:not([data-close])");
  setTimeout(() => first?.focus(), 30);
}

const authUi = {
  mode: "signin",
  pending: false,
  resolve: null
};

function paintAuth() {
  const form = dialog("dlg-auth");
  if (!form) return;
  const isSignup = authUi.mode === "signup";
  form.querySelector("#auth-title").textContent = isSignup ? "Create your account" : "Sign in";
  form.querySelector('[data-field="username"]').hidden = !isSignup;
  form.querySelector('[data-field="email"]').hidden = !isSignup;
  form.querySelector('[data-field="login"]').hidden = isSignup;
  form.querySelector("#auth-login-label").textContent = "Email or username";
  form.querySelector("#auth-submit").textContent = isSignup ? "Create account" : "Sign in";
  form.querySelector("#auth-switch-copy").textContent = isSignup ? "Already have an account?" : "No account yet?";
  form.querySelector("#auth-switch").textContent = isSignup ? "Sign in" : "Create one";
  form.querySelector("#auth-password").setAttribute("autocomplete", isSignup ? "new-password" : "current-password");
  const error = form.querySelector("#auth-error");
  error.hidden = true;
  error.textContent = "";
}

export function openAuth(mode = "signin") {
  authUi.mode = mode;
  paintAuth();
  openDialog("dlg-auth");
  return new Promise((resolve) => {
    authUi.resolve = resolve;
  });
}

export function wireAuth({ notify, onSignedIn }) {
  onAuthChange = onSignedIn;
  const form = dialog("dlg-auth");
  if (!form) return;

  form.querySelector("#auth-switch").addEventListener("click", () => {
    authUi.mode = authUi.mode === "signup" ? "signin" : "signup";
    paintAuth();
  });

  form.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (authUi.pending) return;
    const error = form.querySelector("#auth-error");
    const submit = form.querySelector("#auth-submit");
    const password = form.querySelector("#auth-password").value;
    const isSignup = authUi.mode === "signup";
    const payload = isSignup
      ? {
          username: form.querySelector("#auth-username").value.trim().toLowerCase(),
          email: form.querySelector("#auth-email").value.trim(),
          password
        }
      : { login: form.querySelector("#auth-login").value.trim(), password };

    if (isSignup && !/^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/.test(payload.username)) {
      error.textContent = "Usernames are 3–24 characters: lowercase letters, numbers or dashes.";
      error.hidden = false;
      form.querySelector("#auth-username").focus();
      return;
    }
    if (isSignup && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      error.textContent = "That email address does not look right.";
      error.hidden = false;
      form.querySelector("#auth-email").focus();
      return;
    }
    if (password.length < 8) {
      error.textContent = "Passwords need at least eight characters.";
      error.hidden = false;
      form.querySelector("#auth-password").focus();
      return;
    }

    authUi.pending = true;
    submit.disabled = true;
    submit.textContent = isSignup ? "Creating…" : "Signing in…";
    try {
      const user = isSignup ? await signUp(payload) : await signIn(payload);
      authUi.pending = false;
      submit.disabled = false;
      closeDialogs();
      form.reset();
      paintAuth();
      notify(`Signed in as ${user.username}`, "ok");
      onAuthChange(user);
      authUi.resolve?.(user);
      authUi.resolve = null;
    } catch (err) {
      authUi.pending = false;
      submit.disabled = false;
      paintAuth();
      error.textContent = err.message || "That did not work. Try again.";
      error.hidden = false;
    }
  });
}
