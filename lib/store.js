// Persistent JSON-file store — the backend "where all the data is stored".
//
// Zero dependencies: one JSON document under data/medilead.json holds every
// conversation, message, captured lead, and follow-up draft. Writes are atomic
// (write to a temp file, then rename) so a crash mid-write can't corrupt it.
// Node handles one request at a time on the event loop, so the synchronous
// read-modify-write here is race-free for this single-process app.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { managerFor, categoryLabel } from "./concierge.js";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(rootDir, "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, "medilead.json");

const empty = () => ({ conversations: {}, leads: {}, followups: {} });
const seedPath = path.join(dataDir, "seed.json");

let db;
try {
  // Live data (may have been written by this deployment).
  db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
} catch {
  // No live data yet (e.g. a fresh deploy) — start from the bundled demo seed.
  try {
    db = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  } catch {
    db = empty();
  }
}
db.conversations ||= {};
db.leads ||= {};
db.followups ||= {};

function persist() {
  const tmp = dbPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, dbPath);
}

const now = () => new Date().toISOString();

// ---- Conversations & messages -------------------------------------------

export function ensureConversation(id) {
  if (!db.conversations[id]) {
    const ts = now();
    db.conversations[id] = { id, created_at: ts, updated_at: ts, messages: [] };
    persist();
  }
}

export function addMessage(conversationId, role, content) {
  const conv = db.conversations[conversationId];
  if (!conv) return;
  conv.messages.push({ role, content, created_at: now() });
  conv.updated_at = now();
  persist();
}

export function getMessages(conversationId) {
  return (db.conversations[conversationId]?.messages || []).slice();
}

// The transcript formatted for the Claude Messages API (user/assistant turns).
export function getHistoryForModel(conversationId) {
  return getMessages(conversationId).map((m) => ({ role: m.role, content: m.content }));
}

// ---- Leads --------------------------------------------------------------

// Upsert a lead from a save_lead tool call. Only overwrite fields the model
// actually provided this turn, so later partial updates don't wipe earlier data.
export function upsertLead(conversationId, input) {
  const existing = db.leads[conversationId];
  const category = input.category || existing?.category || "other";
  const ts = now();

  const take = (field) => (input[field] != null && input[field] !== "" ? input[field] : existing?.[field] ?? null);

  const lead = {
    conversation_id: conversationId,
    name: take("name"),
    email: take("email"),
    phone: take("phone"),
    country: take("country"),
    language: take("language"),
    procedure: take("procedure"),
    category,
    category_label: categoryLabel(category),
    timeframe: take("timeframe"),
    budget: take("budget"),
    status: input.status || existing?.status || "warm",
    assigned_manager: managerFor(category),
    notes: take("notes"),
    created_at: existing?.created_at || ts,
    updated_at: ts,
  };

  db.leads[conversationId] = lead;
  persist();
  return lead;
}

export function getLead(conversationId) {
  return db.leads[conversationId] || null;
}

// All leads for the dashboard, newest activity first, with a message count.
// category_label is (re)derived from the category key so the UI stays Georgian
// regardless of what was stored when the lead was captured.
export function listLeads() {
  return Object.values(db.leads)
    .map((l) => ({
      ...l,
      category_label: categoryLabel(l.category),
      message_count: db.conversations[l.conversation_id]?.messages.length || 0,
    }))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export function getLeadDetail(conversationId) {
  const lead = getLead(conversationId);
  if (!lead) return null;
  return {
    lead: { ...lead, category_label: categoryLabel(lead.category) },
    messages: getMessages(conversationId),
    followups: (db.followups[conversationId] || []).slice().reverse(),
  };
}

export function addFollowup(conversationId, draft) {
  const entry = {
    conversation_id: conversationId,
    language: draft.language ?? null,
    email_subject: draft.email_subject ?? null,
    email_body: draft.email_body ?? null,
    whatsapp: draft.whatsapp ?? null,
    created_at: now(),
  };
  (db.followups[conversationId] ||= []).push(entry);
  persist();
  return entry;
}

// ---- Dashboard stats ----------------------------------------------------

export function stats() {
  const leads = Object.values(db.leads);
  const count = (pred) => leads.filter(pred).length;
  const byCategoryMap = {};
  for (const l of leads) {
    const label = categoryLabel(l.category);
    byCategoryMap[label] = (byCategoryMap[label] || 0) + 1;
  }
  const byCategory = Object.entries(byCategoryMap)
    .map(([label, n]) => ({ label, n }))
    .sort((a, b) => b.n - a.n);

  return {
    total: leads.length,
    hot: count((l) => l.status === "hot"),
    warm: count((l) => l.status === "warm"),
    cold: count((l) => l.status === "cold"),
    contactable: count((l) => l.email || l.phone),
    conversations: Object.keys(db.conversations).length,
    byCategory,
  };
}
