// Chat front page logic.
import {
  icons, initTheme, buildNav, mountKeyModal, api, esc, toast, hasKey,
} from "./common.js";

initTheme();
const keyModal = mountKeyModal();
buildNav({ active: "chat", onKey: keyModal.open });

// Fill the hero icons + model badge.
document.getElementById("fi-clock").innerHTML = icons.clock;
document.getElementById("fi-globe").innerHTML = icons.globe;
document.getElementById("fi-route").innerHTML = icons.route;

api("/api/meta")
  .then((m) => {
    document.getElementById("hero-model").innerHTML = `● ${esc(m.model)}`;
  })
  .catch(() => {});

// ---- Session ------------------------------------------------------------
const SESSION_STORE = "medilead.session";
function newSessionId() {
  const id = (crypto.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  localStorage.setItem(SESSION_STORE, id);
  return id;
}
let sessionId = localStorage.getItem(SESSION_STORE) || newSessionId();

const messagesEl = document.getElementById("messages");
const suggestionsEl = document.getElementById("suggestions");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
sendBtn.innerHTML = icons.send;

const GREETING =
  "Hi! 👋 I'm the Caucasus Medical Center concierge. I can help you explore treatments at our hospital in Tbilisi — dental, hair transplant, cosmetic surgery, IVF, and more — and answer questions about cost, travel, and recovery. What brings you here today?";

const SUGGESTIONS = [
  "How much does a hair transplant cost?",
  "I'm considering dental implants",
  "Is IVF available at your hospital?",
  "How does treatment in Tbilisi work?",
];

let busy = false;
let formShown = false;

function scrollDown() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addBubble(role, text) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const avatar = role === "assistant" ? '<div class="mini-avatar">C</div>' : "";
  wrap.innerHTML = `${avatar}<div class="bubble">${esc(text)}</div>`;
  messagesEl.appendChild(wrap);
  scrollDown();
  return wrap;
}

// The in-chat contact form. Shown when the concierge decides the patient is
// genuinely interested (server returns form:true). This is the ONLY place a
// lead's contact details are captured — Name + Phone required, Email optional.
function addContactForm(prefill = {}) {
  if (formShown) return; // one form per conversation
  formShown = true;
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  wrap.innerHTML = `
    <div class="mini-avatar">C</div>
    <div class="lead-form" id="lead-form">
      <div class="lf-title">${icons.user} A specialist will follow up</div>
      <div class="lf-sub">Leave your details and our specialist will prepare a personalised plan for you.</div>
      <label class="lf-label" for="lf-name">Name <span>*</span></label>
      <input class="lf-input" id="lf-name" type="text" placeholder="Your name" value="${esc(prefill.name || "")}" />
      <label class="lf-label" for="lf-phone">Phone / WhatsApp <span>*</span></label>
      <input class="lf-input" id="lf-phone" type="tel" placeholder="+1 555 000 0000" />
      <label class="lf-label" for="lf-email">Email <small>(optional)</small></label>
      <input class="lf-input" id="lf-email" type="email" placeholder="you@example.com" />
      <div class="lf-err" id="lf-err"></div>
      <button class="btn btn-primary lf-send" id="lf-send" type="button">${icons.send} Send</button>
    </div>`;
  messagesEl.appendChild(wrap);
  scrollDown();

  const err = wrap.querySelector("#lf-err");
  const submit = async () => {
    const name = wrap.querySelector("#lf-name").value.trim();
    const phone = wrap.querySelector("#lf-phone").value.trim();
    const email = wrap.querySelector("#lf-email").value.trim();
    if (!name) { err.textContent = "Please enter your name."; return; }
    if (!phone) { err.textContent = "Please enter a phone number."; return; }
    err.textContent = "";
    const btn = wrap.querySelector("#lf-send");
    btn.disabled = true;
    btn.innerHTML = `<span class="spin" style="display:inline-flex">${icons.refresh}</span> Sending…`;
    try {
      await api("/api/lead-form", { method: "POST", body: { sessionId, name, phone, email } });
      wrap.querySelector("#lead-form").innerHTML =
        `<div class="lf-done">${icons.check} Thanks, ${esc(name)}! We've got your details — a specialist will follow up shortly.</div>`;
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
      btn.innerHTML = `${icons.send} Send`;
    }
  };

  wrap.querySelector("#lf-send").addEventListener("click", submit);
  wrap.querySelectorAll(".lf-input").forEach((i) =>
    i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    })
  );
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant";
  wrap.innerHTML = `<div class="mini-avatar">C</div><div class="bubble typing"><i></i><i></i><i></i></div>`;
  messagesEl.appendChild(wrap);
  scrollDown();
  return wrap;
}

function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  SUGGESTIONS.forEach((s) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = s;
    b.addEventListener("click", () => { if (!busy) send(s); });
    suggestionsEl.appendChild(b);
  });
}

function resetChat() {
  sessionId = newSessionId();
  formShown = false;
  messagesEl.innerHTML = "";
  addBubble("assistant", GREETING);
  renderSuggestions();
}

async function send(text) {
  const message = (text ?? input.value).trim();
  if (!message || busy) return;

  if (!hasKey()) {
    toast("Add your Anthropic API key to start chatting.", true);
    keyModal.open();
    return;
  }

  busy = true;
  sendBtn.disabled = true;
  input.value = "";
  input.style.height = "auto";
  suggestionsEl.innerHTML = "";
  addBubble("user", message);
  const typing = showTyping();

  try {
    const data = await api("/api/chat", { method: "POST", body: { sessionId, message } });
    typing.remove();
    addBubble("assistant", data.reply);
    if (data.form) addContactForm({ name: data.lead && data.lead.name });
  } catch (err) {
    typing.remove();
    if (err.status === 428 || err.status === 401) {
      addBubble("assistant", "⚠️ " + err.message);
      keyModal.open();
    } else {
      addBubble("assistant", "⚠️ " + err.message);
    }
    toast(err.message, true);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// ---- Composer behaviour -------------------------------------------------
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
document.getElementById("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  send();
});
document.getElementById("new-chat").addEventListener("click", resetChat);

// ---- Boot ---------------------------------------------------------------
addBubble("assistant", GREETING);
renderSuggestions();
input.focus();

if (!hasKey()) {
  setTimeout(() => {
    toast("Tip: paste your Anthropic API key to make the concierge live.");
  }, 700);
}
