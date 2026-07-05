// Lead CRM dashboard logic.
import {
  icons, initTheme, buildNav, mountKeyModal, api, esc, toast, timeAgo, hasKey,
} from "./common.js";

initTheme();
const keyModal = mountKeyModal();
buildNav({ active: "dashboard", onKey: keyModal.open });

document.getElementById("refresh").innerHTML = `${icons.refresh} Refresh`;
document.getElementById("d-close").innerHTML = icons.x;

const STATUS_LABELS = { hot: "hot", warm: "warm", cold: "cold" };

const kpisEl = document.getElementById("kpis");
const tableHost = document.getElementById("table-host");
const catPanel = document.getElementById("cat-panel");
const catBars = document.getElementById("cat-bars");
const leadCount = document.getElementById("lead-count");

const scrim = document.getElementById("scrim");
const drawer = document.getElementById("drawer");

let leadsById = new Map();
let currentLead = null; // the lead open in the drawer (for follow-up send links)

function kpi(label, value, cls = "") {
  return `<div class="kpi ${cls}"><div class="k-label">${label}</div><div class="k-value">${value}</div></div>`;
}

function badge(status) {
  const s = status || "warm";
  return `<span class="badge ${s}"><span class="bd"></span>${esc(STATUS_LABELS[s] || s)}</span>`;
}

function contactCell(lead) {
  const mail = lead.email
    ? `<span title="${esc(lead.email)}">${icons.mail}</span>`
    : `<span class="off">${icons.mail}</span>`;
  const phone = lead.phone
    ? `<span title="${esc(lead.phone)}">${icons.phone}</span>`
    : `<span class="off">${icons.phone}</span>`;
  return `<div class="contact-icons">${mail}${phone}</div>`;
}

async function load() {
  try {
    const { leads, stats } = await api("/api/leads");
    renderStats(stats);
    renderTable(leads);
  } catch (err) {
    toast(err.message, true);
  }
}

function renderStats(s) {
  kpisEl.innerHTML =
    kpi("Total leads", s.total) +
    kpi("Hot", s.hot, "hot") +
    kpi("Warm", s.warm, "warm") +
    kpi("Cold", s.cold, "cold") +
    kpi("Contactable", s.contactable, "tinted") +
    kpi("Conversations", s.conversations);

  if (s.byCategory && s.byCategory.length) {
    catPanel.hidden = false;
    const max = Math.max(...s.byCategory.map((c) => c.n), 1);
    catBars.innerHTML = s.byCategory
      .map(
        (c) => `
      <div class="cat-bar">
        <div>${esc(c.label || "—")}</div>
        <div class="track"><div class="fill" style="width:${(c.n / max) * 100}%"></div></div>
        <div class="n">${c.n}</div>
      </div>`
      )
      .join("");
  } else {
    catPanel.hidden = true;
  }
}

function renderTable(leads) {
  leadsById = new Map(leads.map((l) => [l.conversation_id, l]));
  leadCount.textContent = leads.length ? `${leads.length} total` : "";

  if (!leads.length) {
    tableHost.innerHTML = `
      <div class="empty">
        <div class="big">${icons.chat}</div>
        <b>No leads captured yet</b>
        <p>Head to the <a href="/" style="color:var(--brand-strong);font-weight:600">chat</a> and have a conversation — captured leads will appear here in real time.</p>
      </div>`;
    return;
  }

  const rows = leads
    .map((l) => {
      const name = l.name || "Anonymous visitor";
      const treatment = l.procedure || l.category_label || "—";
      return `
      <tr class="row" data-id="${esc(l.conversation_id)}">
        <td>${badge(l.status)}</td>
        <td>
          <div class="lead-name">${esc(name)}</div>
          <div class="lead-sub">${esc(treatment)}</div>
        </td>
        <td class="col-opt"><span class="tag">${esc(l.category_label || "—")}</span><div class="lead-sub">${esc(l.assigned_manager || "")}</div></td>
        <td class="muted-cell col-opt">${esc(l.country || "—")}</td>
        <td class="muted-cell col-opt">${esc(l.language || "—")}</td>
        <td>${contactCell(l)}</td>
        <td class="muted-cell col-opt">${l.message_count || 0}</td>
        <td class="muted-cell">${esc(timeAgo(l.updated_at))}</td>
      </tr>`;
    })
    .join("");

  tableHost.innerHTML = `
    <table class="leads">
      <thead>
        <tr>
          <th>Status</th><th>Lead</th><th class="col-opt">Treatment · Manager</th>
          <th class="col-opt">Country</th><th class="col-opt">Language</th>
          <th>Contact</th><th class="col-opt">Msgs</th><th>Updated</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableHost.querySelectorAll("tr.row").forEach((tr) => {
    tr.addEventListener("click", () => openLead(tr.dataset.id));
  });
}

// ---- Drawer -------------------------------------------------------------
function field(label, value) {
  const empty = value === null || value === undefined || value === "";
  return `<div class="field"><div class="fl">${label}</div><div class="fv ${empty ? "empty-v" : ""}">${empty ? "—" : esc(value)}</div></div>`;
}

async function openLead(id) {
  scrim.classList.add("open");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  const body = document.getElementById("d-body");
  body.innerHTML = `<div style="text-align:center;color:var(--muted);padding:30px">Loading…</div>`;

  try {
    const { lead, messages, followups } = await api(`/api/leads/${encodeURIComponent(id)}`);
    currentLead = lead;

    const name = lead.name || "Anonymous visitor";
    document.getElementById("d-avatar").textContent = (lead.name || "?").trim().charAt(0).toUpperCase();
    document.getElementById("d-name").textContent = name;
    document.getElementById("d-meta").innerHTML = `${badge(lead.status)} · ${esc(lead.category_label || "—")}`;

    const transcript = messages
      .map((m) => `<div class="t-msg ${m.role}">${esc(m.content)}</div>`)
      .join("");

    body.innerHTML = `
      <div>
        <div class="section-title">Captured details</div>
        <div class="field-grid">
          ${field("Email", lead.email)}
          ${field("Phone / WhatsApp", lead.phone)}
          ${field("Country", lead.country)}
          ${field("Language", lead.language)}
          ${field("Treatment", lead.procedure)}
          ${field("Timeframe", lead.timeframe)}
          ${field("Budget", lead.budget)}
          ${field("Assigned to", lead.assigned_manager)}
        </div>
        ${lead.notes ? `<div style="margin-top:14px">${field("Notes", lead.notes)}</div>` : ""}
      </div>

      <div>
        <div class="section-title">Conversation</div>
        <div class="transcript">${transcript || '<div class="lead-sub">No messages.</div>'}</div>
      </div>

      <div>
        <div class="section-title">Automated follow-up</div>
        ${(lead.email || lead.phone)
          ? `<p class="lead-sub" style="margin:0 0 12px">Draft the one-week re-engagement message for a lead who's gone quiet — written in ${esc(lead.language || "the patient's")} language, via ${esc(channelsLabel(lead))}. Generate, then send.</p>
             <button class="btn btn-primary" id="fu-btn" type="button">${icons.send} Generate follow-up</button>
             <div id="fu-list" style="margin-top:14px;display:flex;flex-direction:column;gap:12px">
               ${followups.map(followupCard).join("")}
             </div>`
          : `<p class="lead-sub" style="margin:0">This lead hasn't left contact details yet — follow-up becomes available once they fill in the contact form in the chat.</p>`}
      </div>`;

    const fuBtn = document.getElementById("fu-btn");
    if (fuBtn) fuBtn.addEventListener("click", () => runFollowup(id));
    wireFollowupSends(body);
  } catch (err) {
    body.innerHTML = `<div style="color:var(--hot);padding:20px">${esc(err.message)}</div>`;
  }
}

function channelsLabel(lead) {
  const e = !!lead.email, p = !!lead.phone;
  if (e && p) return "Email & WhatsApp";
  if (e) return "Email";
  if (p) return "WhatsApp";
  return "";
}

function followupCard(f) {
  const lead = currentLead || {};
  const hasEmail = !!(f.email_subject || f.email_body);
  const hasWa = !!f.whatsapp;

  const rows = [];
  if (hasEmail) {
    rows.push(`
      <div class="fu-row">
        <div class="fu-chan">${icons.mail} Email</div>
        <div class="fu-subject">${esc(f.email_subject || "")}</div>
        <div class="fu-text">${esc(f.email_body || "")}</div>
      </div>`);
  }
  if (hasWa) {
    rows.push(`
      <div class="fu-row">
        <div class="fu-chan">${icons.phone} WhatsApp</div>
        <div class="fu-text">${esc(f.whatsapp || "")}</div>
      </div>`);
  }

  // Send buttons: mailto: for email, wa.me deep link for WhatsApp — each opens
  // the message pre-filled to the lead. Only shown when the lead left that channel.
  const actions = [];
  if (hasEmail && lead.email) {
    const href = `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(f.email_subject || "")}&body=${encodeURIComponent(f.email_body || "")}`;
    actions.push(`<a class="btn fu-send email" href="${href}" data-chan="email">${icons.mail} Send via Email</a>`);
  }
  if (hasWa && lead.phone) {
    const num = String(lead.phone).replace(/[^\d]/g, "");
    const href = `https://wa.me/${num}?text=${encodeURIComponent(f.whatsapp || "")}`;
    actions.push(`<a class="btn fu-send wa" href="${href}" target="_blank" rel="noopener" data-chan="wa">${icons.phone} Send via WhatsApp</a>`);
  }
  const actionsHtml = actions.length ? `<div class="fu-actions">${actions.join("")}</div>` : "";

  return `<div class="followup-card">${rows.join("")}${actionsHtml}</div>`;
}

// Mark a Send button as sent (it still opens the mail/WhatsApp client via href).
function wireFollowupSends(scope) {
  scope.querySelectorAll(".fu-send").forEach((a) => {
    if (a.dataset.wired) return;
    a.dataset.wired = "1";
    a.addEventListener("click", () => {
      setTimeout(() => {
        a.classList.add("sent");
        a.innerHTML = `${icons.check} Sent`;
      }, 60);
    });
  });
}

async function runFollowup(id) {
  if (!hasKey()) {
    toast("Add your API key to draft a follow-up.", true);
    keyModal.open();
    return;
  }
  const btn = document.getElementById("fu-btn");
  btn.disabled = true;
  btn.innerHTML = `<span class="spin" style="display:inline-flex">${icons.refresh}</span> Drafting…`;
  try {
    const { followup } = await api(`/api/leads/${encodeURIComponent(id)}/followup`, { method: "POST" });
    const list = document.getElementById("fu-list");
    list.insertAdjacentHTML("afterbegin", followupCard(followup));
    wireFollowupSends(list);
    toast("Follow-up drafted.");
  } catch (err) {
    toast(err.message, true);
    if (err.status === 428 || err.status === 401) keyModal.open();
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icons.send} Generate follow-up`;
  }
}

function closeDrawer() {
  scrim.classList.remove("open");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}
scrim.addEventListener("click", closeDrawer);
document.getElementById("d-close").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
document.getElementById("refresh").addEventListener("click", load);

// ---- Boot ---------------------------------------------------------------
load();
