/* Marlowe — accounts, session and settings.
   Talks to the Worker's small JSON API; everything else stays local. */

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const PREFS_KEY = "marlowe.prefs";
  const DEFAULTS = { theme: "system", motion: "auto", suggestions: true };

  const status = $("#status");
  const app = $("#app");

  let prefs = readPrefs();
  let user = null;
  let authMode = "signin";
  let submitting = false;
  let saveTimer = null;
  let prefsStatusTimer = null;

  class ApiError extends Error {
    constructor(message, statusCode, field) {
      super(message);
      this.status = statusCode;
      this.field = field;
    }
  }

  /* ------------------------------------------------------------- utilities */

  function readPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return { ...DEFAULTS, ...saved };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function writePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* private mode: settings still apply for this page */
    }
  }

  const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

  function announce(text) {
    status.textContent = text;
    status.classList.add("is-visible");
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => status.classList.remove("is-visible"), 2400);
  }

  function initialsOf(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "M";
    return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  }

  const isDefault = (settings) =>
    Boolean(settings) &&
    settings.theme === DEFAULTS.theme &&
    settings.motion === DEFAULTS.motion &&
    settings.suggestions === DEFAULTS.suggestions;

  async function api(path, options = {}) {
    const init = { method: options.method || "GET", credentials: "same-origin", headers: {} };
    if (options.body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    let response;
    try {
      response = await fetch(path, init);
    } catch {
      throw new ApiError("You look offline. Check the connection and try again.", 0);
    }
    let data = null;
    try {
      data = await response.json();
    } catch {
      /* empty body is fine for some responses */
    }
    if (!response.ok) {
      throw new ApiError(
        (data && data.error) || "Something went wrong. Try again.",
        response.status,
        data && data.field
      );
    }
    return data || {};
  }

  /* --------------------------------------------------------------- prefs */

  function applyPrefs() {
    const dark = prefs.theme === "dark" || (prefs.theme === "system" && systemDark());
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (prefs.motion === "reduce") document.documentElement.dataset.motion = "reduce";
    else delete document.documentElement.dataset.motion;
    if (prefs.suggestions) delete document.documentElement.dataset.chips;
    else document.documentElement.dataset.chips = "off";

    const radio = $(`input[name="theme"][value="${prefs.theme}"]`);
    if (radio) radio.checked = true;
    const suggestions = $("#setSuggestions");
    const motion = $("#setMotion");
    if (suggestions) suggestions.checked = prefs.suggestions;
    if (motion) motion.checked = prefs.motion === "reduce";
  }

  function flashPrefs(text) {
    const node = $("#prefsStatus");
    if (!node) return;
    node.textContent = text;
    clearTimeout(prefsStatusTimer);
    prefsStatusTimer = setTimeout(() => { node.textContent = ""; }, 2200);
  }

  function changePrefs(patch) {
    prefs = { ...prefs, ...patch };
    writePrefs();
    applyPrefs();

    if (!user) {
      flashPrefs("Saved on this device");
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const { settings } = await api("/api/settings", { method: "PUT", body: prefs });
        prefs = { ...prefs, ...settings };
        writePrefs();
        applyPrefs();
        flashPrefs("Saved to your account");
      } catch (error) {
        flashPrefs(error.status === 401 ? "Sign in again to sync" : "Could not save changes");
      }
    }, 350);
  }

  async function adoptServerPrefs() {
    try {
      const { settings } = await api("/api/settings");
      if (!settings) return;
      if (isDefault(settings) && !isDefault(prefs)) {
        // First sign-in on this account: seed it with this device's choices.
        await api("/api/settings", { method: "PUT", body: prefs });
        return;
      }
      prefs = { ...prefs, ...settings };
      writePrefs();
      applyPrefs();
    } catch {
      /* signed out between requests, or offline: local prefs stay */
    }
  }

  /* -------------------------------------------------------------- account */

  function renderAccount() {
    const signedIn = Boolean(user);
    $("#authActions").hidden = signedIn;
    $("#accountActions").hidden = !signedIn;
    $("#promoCard").hidden = signedIn;
    $("#sidebarAccount").hidden = !signedIn;
    $("#acctOut").hidden = signedIn;
    $("#acctIn").hidden = !signedIn;

    if (signedIn) {
      const initials = initialsOf(user.name);
      $("#avatarInitials").textContent = initials;
      $("#sideInitials").textContent = initials;
      $("#sideName").textContent = user.name;
      $("#sideEmail").textContent = user.email;
      $("#menuName").textContent = user.name;
      $("#menuEmail").textContent = user.email;
      $("#avatarBtn").setAttribute("aria-label", `Account menu for ${user.name}`);
      $("#acctEmail").textContent = user.email;
      $("#setName").value = user.name;
      $("#acctSince").textContent = new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    }
  }

  /* ------------------------------------------------------- sign in / up */

  const authDialog = $("#authDialog");
  const settingsDialog = $("#settingsDialog");

  function openDialog(dialog, focusTarget) {
    if (!dialog || dialog.open) return;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    if (focusTarget) setTimeout(() => focusTarget.focus(), 40);
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.close) dialog.close();
    else dialog.removeAttribute("open");
  }

  function clearAuthErrors() {
    for (const node of ["#emailError", "#passwordError", "#authError"]) {
      const field = $(node);
      field.textContent = "";
      field.hidden = true;
    }
    $("#authEmail").removeAttribute("aria-invalid");
    $("#authPassword").removeAttribute("aria-invalid");
  }

  function fieldError(id, message) {
    const node = $(id);
    node.textContent = message;
    node.hidden = false;
    if (id === "#emailError") $("#authEmail").setAttribute("aria-invalid", "true");
    if (id === "#passwordError") $("#authPassword").setAttribute("aria-invalid", "true");
  }

  function setAuthMode(mode) {
    authMode = mode;
    const signup = mode === "signup";
    $("#authTitle").textContent = signup ? "Create your account" : "Welcome back";
    $("#authSub").textContent = signup
      ? "An email and a password is all this demo stores."
      : "Sign in to keep your chats and settings.";
    $("#nameField").hidden = !signup;
    $("#authPassword").setAttribute("autocomplete", signup ? "new-password" : "current-password");
    $("#passwordHint").hidden = !signup;
    $("#authSubmit").textContent = signup ? "Create account" : "Sign in";
    $("#authSwitchText").textContent = signup ? "Already have an account?" : "New here?";
    $("#authToggle").textContent = signup ? "Sign in instead" : "Create an account";
    clearAuthErrors();
  }

  function openAuth(mode) {
    setAuthMode(mode === "signup" ? "signup" : "signin");
    $("#authForm").reset();
    clearAuthErrors();
    openDialog(authDialog, authMode === "signup" ? $("#authName") : $("#authEmail"));
  }

  function validateAuth() {
    clearAuthErrors();
    let ok = true;
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;

    if (!email) {
      fieldError("#emailError", "Enter your email.");
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      fieldError("#emailError", "That does not look like an email address.");
      ok = false;
    }

    if (!password) {
      fieldError("#passwordError", "Enter your password.");
      ok = false;
    } else if (authMode === "signup" && password.length < 8) {
      fieldError("#passwordError", "Use at least 8 characters.");
      ok = false;
    }

    if (!ok) {
      const first = $("[aria-invalid='true']");
      if (first) first.focus();
    }
    return ok;
  }

  $("#authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !validateAuth()) return;

    const button = $("#authSubmit");
    const label = button.textContent;
    submitting = true;
    button.disabled = true;
    button.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
    $("#authForm").setAttribute("aria-busy", "true");

    const body = {
      email: $("#authEmail").value.trim(),
      password: $("#authPassword").value
    };
    if (authMode === "signup") body.name = $("#authName").value.trim();

    try {
      const path = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const data = await api(path, { method: "POST", body });
      user = data.user;
      renderAccount();
      closeDialog(authDialog);
      announce(authMode === "signup" ? `Welcome, ${user.name}` : `Signed in as ${user.name}`);
      await adoptServerPrefs();
      renderAccount();
    } catch (error) {
      if (error.field === "email") {
        fieldError("#emailError", error.message);
        $("#authEmail").focus();
      } else if (error.field === "password") {
        fieldError("#passwordError", error.message);
        $("#authPassword").focus();
      } else {
        const node = $("#authError");
        node.textContent = error.message;
        node.hidden = false;
      }
    } finally {
      submitting = false;
      button.disabled = false;
      button.textContent = label;
      $("#authForm").removeAttribute("aria-busy");
    }
  });

  $("#authToggle").addEventListener("click", () => {
    setAuthMode(authMode === "signup" ? "signin" : "signup");
    (authMode === "signup" ? $("#authName") : $("#authEmail")).focus();
  });

  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* the cookie may already be gone */
    }
    user = null;
    setMenu(false);
    renderAccount();
    announce("Signed out");
  }

  $("#menuSignOut").addEventListener("click", signOut);
  $("#sideSignOut").addEventListener("click", signOut);
  $("#settingsSignOut").addEventListener("click", async () => {
    await signOut();
    closeDialog(settingsDialog);
  });

  /* ----------------------------------------------------------- account menu */

  const menu = $("#accountMenu");
  const avatarBtn = $("#avatarBtn");

  function setMenu(open) {
    menu.hidden = !open;
    avatarBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      const first = $(".menu__item", menu);
      if (first) first.focus();
    }
  }

  avatarBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setMenu(menu.hidden);
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.target.closest(".account")) setMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setMenu(false);
      avatarBtn.focus();
    }
  });

  $("#menuSignOut").addEventListener("click", () => setMenu(false));

  /* ------------------------------------------------------------- settings */

  function setTab(name) {
    for (const tab of $$(".settings__tab")) {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "true");
      else tab.removeAttribute("aria-current");
    }
    for (const pane of $$(".settings__pane")) pane.hidden = pane.dataset.pane !== name;
  }

  function openSettings() {
    renderAccount();
    applyPrefs();
    setTab("general");
    $("#prefsStatus").textContent = "";
    $("#dataStatus").textContent = "";
    $("#deleteConfirm").hidden = true;
    $("#nameError").hidden = true;
    openDialog(settingsDialog, $(".settings__tab"));
  }

  for (const tab of $$(".settings__tab")) {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  }

  for (const close of $$("[data-close]")) {
    close.addEventListener("click", () => closeDialog(close.closest("dialog")));
  }

  // Clicking the backdrop closes, clicking the panel itself does not.
  for (const dialog of $$("dialog.sheet")) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside =
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom;
      if (outside) closeDialog(dialog);
    });
  }

  for (const radio of $$("input[name='theme']")) {
    radio.addEventListener("change", () => {
      if (radio.checked) changePrefs({ theme: radio.value });
    });
  }

  $("#setSuggestions").addEventListener("change", (event) => {
    changePrefs({ suggestions: event.target.checked });
  });

  $("#setMotion").addEventListener("change", (event) => {
    changePrefs({ motion: event.target.checked ? "reduce" : "auto" });
  });

  $("#saveName").addEventListener("click", async () => {
    if (!user) return;
    const name = $("#setName").value.trim();
    const error = $("#nameError");
    error.hidden = true;
    if (!name) {
      error.textContent = "Enter a display name.";
      error.hidden = false;
      $("#setName").focus();
      return;
    }
    try {
      const data = await api("/api/account", { method: "PATCH", body: { name } });
      user = data.user;
      renderAccount();
      flashPrefs("Name updated");
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    }
  });

  /* ------------------------------------------------------------ data tools */

  $("#exportData").addEventListener("click", () => {
    if (!user) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      settings: prefs
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "marlowe-account.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("#dataStatus").textContent = "Export downloaded.";
  });

  $("#deleteAccount").addEventListener("click", () => {
    if (!user) {
      $("#dataStatus").textContent = "Sign in first — there is no account to delete.";
      return;
    }
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
      user = null;
      renderAccount();
      $("#deleteConfirm").hidden = true;
      setTab("account");
      $("#dataStatus").textContent = "Account deleted. This device keeps its own settings.";
    } catch (error) {
      $("#dataStatus").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Delete account";
    }
  });

  /* -------------------------------------------------------------- triggers */

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open]");
    if (!trigger) return;
    event.preventDefault();
    if (app.classList.contains("is-drawer-open")) $("#scrim").click();
    const what = trigger.dataset.open;
    if (what === "auth") {
      setMenu(false);
      openAuth(trigger.dataset.mode || "signin");
    }
    if (what === "settings") {
      setMenu(false);
      openSettings();
    }
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemTheme = () => {
    if (prefs.theme === "system") applyPrefs();
  };
  if (media.addEventListener) media.addEventListener("change", onSystemTheme);
  else if (media.addListener) media.addListener(onSystemTheme);

  /* ---------------------------------------------------------------- boot */

  applyPrefs();
  renderAccount();

  (async () => {
    try {
      const data = await api("/api/auth/me");
      if (data.user) {
        user = data.user;
        renderAccount();
        await adoptServerPrefs();
      }
    } catch {
      /* signed out; the local settings still work */
    }
  })();
})();
