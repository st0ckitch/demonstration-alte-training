// Shared client helpers used by both the chat page and the dashboard:
// API-key storage (localStorage), the key modal, theme toggle, toasts, and a
// fetch wrapper that attaches the pasted key as the x-api-key header.

const KEY_STORE = "medilead.apiKey";
const THEME_STORE = "medilead.theme";

export const getKey = () => (localStorage.getItem(KEY_STORE) || "").trim();
export const setKey = (v) => localStorage.setItem(KEY_STORE, (v || "").trim());
export const hasKey = () => getKey().length > 0;

// ---- Icons (inline SVG) -------------------------------------------------
export const icons = {
  spark: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
  cross: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  globe: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
  clock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  route: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H14a3.5 3.5 0 0 0 0-7H10a3.5 3.5 0 0 1 0-7h5.5"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  key: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l2 2M15 8l2 2"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  chat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/></svg>',
  mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  phone: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg>',
  user: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
};

// ---- Theme --------------------------------------------------------------
export function initTheme() {
  const saved = localStorage.getItem(THEME_STORE) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  return saved;
}
export function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", cur);
  localStorage.setItem(THEME_STORE, cur);
  return cur;
}

// ---- HTML escape --------------------------------------------------------
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Toast --------------------------------------------------------------
let toastHost;
export function toast(message, isErr = false) {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 250);
  }, isErr ? 4200 : 2600);
}

// ---- fetch wrapper (adds x-api-key) -------------------------------------
export async function api(pathname, { method = "GET", body } = {}) {
  const headers = {};
  const key = getKey();
  if (key) headers["x-api-key"] = key;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(pathname, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---- API-key modal (built once, shared) ---------------------------------
export function mountKeyModal({ onSave } = {}) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim";
  scrim.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Connect your Anthropic API key</h3>
      <p>Paste an Anthropic API key to make the concierge live. The chat uses the Claude API to consult leads and save them to your CRM.</p>
      <label for="mk-input">API key</label>
      <div class="key-input">
        <input id="mk-input" type="password" placeholder="sk-ant-..." autocomplete="off" spellcheck="false" />
        <button class="btn btn-ghost" id="mk-reveal" type="button">Show</button>
      </div>
      <div id="mk-state"></div>
      <div class="note">${icons.key}<span>Stored only in this browser (localStorage) and sent to your own Caucasus Medical Center server, which calls Anthropic. Clear it anytime.</span></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="mk-clear" type="button">Clear key</button>
        <button class="btn btn-ghost" id="mk-cancel" type="button">Cancel</button>
        <button class="btn btn-primary" id="mk-save" type="button">Save key</button>
      </div>
    </div>`;
  document.body.appendChild(scrim);

  const input = scrim.querySelector("#mk-input");
  const stateEl = scrim.querySelector("#mk-state");
  const reveal = scrim.querySelector("#mk-reveal");

  const renderState = () => {
    stateEl.innerHTML = hasKey()
      ? `<span class="key-state set">${icons.key} Key connected · ${maskKey(getKey())}</span>`
      : `<span class="key-state unset">No key connected yet</span>`;
  };

  const open = () => { input.value = getKey(); renderState(); scrim.classList.add("open"); setTimeout(() => input.focus(), 50); };
  const close = () => scrim.classList.remove("open");

  reveal.addEventListener("click", () => {
    input.type = input.type === "password" ? "text" : "password";
    reveal.textContent = input.type === "password" ? "Show" : "Hide";
  });
  scrim.querySelector("#mk-save").addEventListener("click", () => {
    setKey(input.value);
    renderState();
    close();
    toast(hasKey() ? "API key connected." : "API key cleared.");
    onSave?.(getKey());
  });
  scrim.querySelector("#mk-clear").addEventListener("click", () => {
    setKey("");
    input.value = "";
    renderState();
    toast("API key cleared.");
    onSave?.("");
  });
  scrim.querySelector("#mk-cancel").addEventListener("click", close);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") scrim.querySelector("#mk-save").click(); });

  return { open, close };
}

export const maskKey = (k) => (k.length <= 12 ? "••••" : `${k.slice(0, 7)}…${k.slice(-4)}`);

// ---- Shared nav builder -------------------------------------------------
export function buildNav({ active, onKey } = {}) {
  const nav = document.querySelector(".nav-inner");
  if (!nav) return;
  const theme = document.documentElement.getAttribute("data-theme");
  nav.innerHTML = `
    <a class="brand" href="/">
      <span class="brand-mark">${icons.cross}</span>
      <span>
        <span class="brand-name">Caucasus Medical <span>Center</span></span><br/>
        <span class="brand-sub">Medical tourism</span>
      </span>
    </a>
    <span class="nav-spacer"></span>
    <div class="nav-links">
      <a class="pill ${active === "chat" ? "active" : ""}" href="/">${icons.chat} Chat</a>
      <a class="pill ${active === "dashboard" ? "active" : ""}" href="/dashboard">${icons.grid} Dashboard</a>
      <button class="pill" id="nav-key" type="button">${icons.key} API key</button>
      <button class="icon-btn" id="nav-theme" type="button" aria-label="Toggle theme">${theme === "dark" ? icons.sun : icons.moon}</button>
    </div>`;
  nav.querySelector("#nav-key").addEventListener("click", () => onKey?.());
  nav.querySelector("#nav-theme").addEventListener("click", () => {
    const t = toggleTheme();
    nav.querySelector("#nav-theme").innerHTML = t === "dark" ? icons.sun : icons.moon;
  });
}

export function timeAgo(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
