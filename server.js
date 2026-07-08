// MediLead — AI medical-tourism concierge + lead CRM.
// Zero external dependencies: Node's built-in http server, global fetch to the
// Claude API, and a JSON-file store. Load environment before anything else.
import "./lib/env.js";

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  MODEL,
  MAX_TOKENS,
  CONCIERGE_SYSTEM_PROMPT,
  SAVE_LEAD_TOOL,
  REQUEST_CONTACT_TOOL,
  FOLLOWUP_TOOL,
  WEB_TOOLS,
  CATEGORIES,
} from "./lib/concierge.js";
import {
  ensureConversation,
  addMessage,
  getHistoryForModel,
  upsertLead,
  getLead,
  listLeads,
  getLeadDetail,
  addFollowup,
  stats,
} from "./lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.MEDILEAD_PORT || process.env.PORT || 3200;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---- Small HTTP helpers -------------------------------------------------
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
const fail = (res, status, message) => sendJSON(res, status, { error: message });

function readJSONBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

// ---- Optional password gate --------------------------------------------
const SITE_PASSWORD = process.env.MEDILEAD_PASSWORD;
const SITE_USER = process.env.MEDILEAD_USER || "medilead";
function passesAuth(req) {
  if (!SITE_PASSWORD) return true;
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const [user, pass] = Buffer.from(encoded, "base64").toString().split(":");
  return safeEqual(user, SITE_USER) && safeEqual(pass, SITE_PASSWORD);
}
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ---- Naive per-IP rate limit -------------------------------------------
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 40;
function rateLimited(req) {
  const ip = req.socket.remoteAddress || "unknown";
  const nowTs = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => nowTs - t < WINDOW_MS);
  recent.push(nowTs);
  hits.set(ip, recent);
  return recent.length > MAX_HITS;
}

// ---- Claude API (raw HTTP via built-in fetch) ---------------------------
function apiKeyFrom(req) {
  const pasted = (req.headers["x-api-key"] || "").toString().trim();
  return pasted || (process.env.ANTHROPIC_API_KEY || "").trim();
}

async function callClaude(apiKey, body, timeoutMs = 55000) {
  // Hard timeout so a slow/stalled request (e.g. a long web search) can never
  // hang the chat forever — it fails cleanly and the user can retry.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res;
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (netErr) {
      if (netErr?.name === "AbortError") {
        throw Object.assign(new Error("The reply took too long. Please try again."), { status: 504 });
      }
      throw Object.assign(new Error("Could not reach the Claude API. Check your connection."), { status: 502 });
    }
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
      const e = new Error(detail || `Claude API error (${res.status}).`);
      e.status = res.status;
      throw e;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function friendlyClaudeError(err) {
  const status = err?.status;
  if (status === 401) return { status: 401, message: "That API key was rejected. Check the key and try again." };
  if (status === 429) return { status: 429, message: "The Claude API is rate-limited right now. Wait a moment and retry." };
  if (status === 400) return { status: 400, message: err?.message || "The request was rejected by the Claude API." };
  return { status: 502, message: err?.message || "The Claude API is unavailable right now. Please retry shortly." };
}

// ---- Route handlers -----------------------------------------------------

// The concierge agentic loop: converse, and let Claude call save_lead as it
// learns the lead's details. Stores everything in the JSON backend.
async function handleChat(req, res) {
  const apiKey = apiKeyFrom(req);
  if (!apiKey) {
    return fail(res, 428, "No API key set. Click “API key” and paste your Anthropic API key to start the chat.");
  }

  const payload = await readJSONBody(req);
  const sessionId = String(payload.sessionId || "").trim();
  const userMessage = String(payload.message || "").trim();
  if (!sessionId) return fail(res, 400, "Missing session id.");
  if (!userMessage) return fail(res, 400, "Message is empty.");
  if (userMessage.length > 4000) return fail(res, 400, "Message is too long.");

  ensureConversation(sessionId);
  addMessage(sessionId, "user", userMessage);

  const messages = getHistoryForModel(sessionId);
  let showForm = false;

  // Client tools (we execute) + Anthropic server tools (web search/fetch,
  // executed on their side and returned inline). If this key's org doesn't have
  // web search enabled, the first call 400s — we then drop the web tools and
  // carry on, so the chat never breaks.
  let tools = [SAVE_LEAD_TOOL, REQUEST_CONTACT_TOOL, ...WEB_TOOLS];
  let webDropped = false;

  // Overall budget for the whole turn so it can never hang the UI.
  const deadline = Date.now() + 50000;

  try {
    for (let step = 0; step < 6; step++) {
      if (Date.now() > deadline) break; // out of budget — fall through to a graceful reply
      const remaining = Math.max(8000, deadline - Date.now());
      let response;
      try {
        response = await callClaude(
          apiKey,
          { model: MODEL, max_tokens: MAX_TOKENS, system: CONCIERGE_SYSTEM_PROMPT, tools, messages },
          remaining
        );
      } catch (err) {
        if (!webDropped && err?.status === 400 && tools.length > 2) {
          webDropped = true;
          tools = [SAVE_LEAD_TOOL, REQUEST_CONTACT_TOOL];
          console.error("web tools unavailable — retrying without them:", err?.message || err);
          response = await callClaude(
            apiKey,
            { model: MODEL, max_tokens: MAX_TOKENS, system: CONCIERGE_SYSTEM_PROMPT, tools, messages },
            Math.max(8000, deadline - Date.now())
          );
        } else {
          throw err;
        }
      }

      // Server tools (web search/fetch) can pause the turn when they hit their
      // internal step limit — re-send the accumulated content to continue.
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      if (response.stop_reason === "tool_use") {
        // Only our client tools need executing; server_tool_use blocks are
        // already resolved inline by the API.
        const toolUses = (response.content || []).filter(
          (b) => b.type === "tool_use" && (b.name === "save_lead" || b.name === "request_contact")
        );
        messages.push({ role: "assistant", content: response.content });

        if (!toolUses.length) {
          // No client tool to run (e.g. only a server tool ran) — return whatever
          // text came back rather than looping.
          const reply = (response.content || [])
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();
          if (reply) {
            addMessage(sessionId, "assistant", reply);
            return sendJSON(res, 200, { reply, form: showForm, lead: getLead(sessionId) });
          }
          continue; // no text yet — let it produce a reply on the next pass
        }

        const toolResults = [];
        for (const tu of toolUses) {
          const input = tu.input || {};
          if (tu.name === "save_lead") {
            // Interest only — never contact details.
            upsertLead(sessionId, { ...input, email: undefined, phone: undefined });
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "Interest saved to CRM (no contact details).",
            });
          } else if (tu.name === "request_contact") {
            // Record interest context and tell the frontend to show the form.
            upsertLead(sessionId, {
              procedure: input.procedure,
              category: input.category,
              language: input.language,
              notes: input.note,
              status: "warm",
            });
            showForm = true;
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content:
                "The contact form (Name, Phone, optional Email) is now shown to the patient in the chat. Invite them to fill it in; wait for them to submit — do not ask for the details as text.",
            });
          } else {
            toolResults.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "Unknown tool.",
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: toolResults });
        continue; // let the model produce its natural-language reply
      }

      const reply = (response.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      const finalReply =
        reply || "Sorry — I didn't quite catch that. Could you say a little more about what you're looking for?";
      addMessage(sessionId, "assistant", finalReply);
      return sendJSON(res, 200, { reply: finalReply, form: showForm, lead: getLead(sessionId) });
    }

    const fallback = "Thanks — I've noted that. What else can I help you with?";
    addMessage(sessionId, "assistant", fallback);
    return sendJSON(res, 200, { reply: fallback, form: showForm, lead: getLead(sessionId) });
  } catch (err) {
    const mapped = friendlyClaudeError(err);
    console.error("chat error:", mapped.status, err?.message || err);
    return fail(res, mapped.status, mapped.message);
  }
}

// The in-chat contact form submits here — the only place a lead's contact
// details enter the CRM. Name and phone are required; email is optional. No
// Claude call, so no API key is needed to submit.
async function handleLeadForm(req, res) {
  const payload = await readJSONBody(req);
  const sessionId = String(payload.sessionId || "").trim();
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  const email = String(payload.email || "").trim();
  if (!sessionId) return fail(res, 400, "Missing session id.");
  if (!name) return fail(res, 400, "Name is required.");
  if (!phone) return fail(res, 400, "A phone number is required.");
  if (name.length > 120 || phone.length > 40 || email.length > 160) {
    return fail(res, 400, "That field is too long.");
  }

  ensureConversation(sessionId);
  const lead = upsertLead(sessionId, {
    name,
    phone,
    email: email || undefined,
    status: "hot",
  });
  return sendJSON(res, 200, { ok: true, lead });
}

// Draft the "one week later" follow-up in the lead's own language.
async function handleFollowup(req, res, id) {
  const apiKey = apiKeyFrom(req);
  if (!apiKey) return fail(res, 428, "No API key set. Paste your Anthropic API key first.");

  const detail = getLeadDetail(id);
  if (!detail) return fail(res, 404, "Lead not found.");
  const { lead, messages } = detail;

  // Only draft the channels this lead actually left contact details for.
  const hasEmail = !!(lead.email && String(lead.email).trim());
  const hasPhone = !!(lead.phone && String(lead.phone).trim());
  if (!hasEmail && !hasPhone) {
    return fail(res, 400, "This lead has no contact details for a follow-up.");
  }
  const channels = [hasEmail && "email", hasPhone && "WhatsApp"].filter(Boolean).join(" and ");

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Patient" : "Concierge"}: ${m.content}`)
    .join("\n");

  try {
    const response = await callClaude(apiKey, {
      model: MODEL,
      max_tokens: 1024,
      system:
        "You write short, warm re-engagement follow-ups for a medical-tourism concierge service. The lead went quiet about a week ago. Write in the lead's own language. Be personal and specific to their treatment; never pushy; invite them to reply with any questions. Respond only by calling draft_followup.",
      tools: [FOLLOWUP_TOOL],
      tool_choice: { type: "tool", name: "draft_followup" },
      messages: [
        {
          role: "user",
          content:
            `Lead details:\n` +
            `Name: ${lead.name || "(unknown)"}\n` +
            `Language: ${lead.language || "English"}\n` +
            `Treatment: ${lead.procedure || lead.category_label || "(general enquiry)"}\n` +
            `Country: ${lead.country || "(unknown)"}\n` +
            `Notes: ${lead.notes || "(none)"}\n\n` +
            `Conversation so far:\n${transcript || "(no messages)"}\n\n` +
            `Available contact channels for this lead: ${channels}. ` +
            `Draft the one-week follow-up now — write ONLY the ${channels} message(s), and leave the other channel's fields out.`,
        },
      ],
    });

    const toolUse = (response.content || []).find((b) => b.type === "tool_use");
    if (!toolUse) return fail(res, 502, "The model did not return a follow-up. Please retry.");
    const saved = addFollowup(id, toolUse.input || {});
    return sendJSON(res, 200, { followup: saved });
  } catch (err) {
    const mapped = friendlyClaudeError(err);
    console.error("followup error:", mapped.status, err?.message || err);
    return fail(res, mapped.status, mapped.message);
  }
}

// ---- Static files (preloaded into memory at startup) --------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// Read every file in public/ into memory once at startup, then serve from RAM.
// This means each asset is read from disk exactly once (no per-request disk I/O)
// and the running server is immune to files being evicted from cache.
const STATIC = new Map();
function preloadStatic() {
  for (const name of fs.readdirSync(PUBLIC_DIR)) {
    const full = path.join(PUBLIC_DIR, name);
    if (fs.statSync(full).isFile()) {
      STATIC.set("/" + name, {
        body: fs.readFileSync(full),
        type: MIME[path.extname(name)] || "application/octet-stream",
      });
    }
  }
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  if (!path.extname(rel)) rel += ".html"; // /dashboard → /dashboard.html

  const asset = STATIC.get(rel);
  if (!asset) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  res.writeHead(200, { "Content-Type": asset.type });
  res.end(req.method === "HEAD" ? undefined : asset.body);
}

// ---- Router -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    if (!passesAuth(req)) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="MediLead"' });
      return res.end("Authentication required.");
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const { pathname } = url;
    const { method } = req;

    // API routes
    if (pathname.startsWith("/api/")) {
      if (pathname === "/api/meta" && method === "GET") {
        return sendJSON(res, 200, { model: MODEL, categories: CATEGORIES });
      }
      if (pathname === "/api/stats" && method === "GET") {
        return sendJSON(res, 200, stats());
      }
      if (pathname === "/api/leads" && method === "GET") {
        return sendJSON(res, 200, { leads: listLeads(), stats: stats() });
      }
      const leadMatch = pathname.match(/^\/api\/leads\/([^/]+)$/);
      if (leadMatch && method === "GET") {
        const detail = getLeadDetail(decodeURIComponent(leadMatch[1]));
        if (!detail) return fail(res, 404, "Lead not found.");
        return sendJSON(res, 200, detail);
      }
      const followMatch = pathname.match(/^\/api\/leads\/([^/]+)\/followup$/);
      if (followMatch && method === "POST") {
        if (rateLimited(req)) return fail(res, 429, "Too many requests — give it a moment and try again.");
        return handleFollowup(req, res, decodeURIComponent(followMatch[1]));
      }
      if (pathname === "/api/lead-form" && method === "POST") {
        if (rateLimited(req)) return fail(res, 429, "Too many requests — give it a moment and try again.");
        return handleLeadForm(req, res);
      }
      if (pathname === "/api/chat" && method === "POST") {
        if (rateLimited(req)) return fail(res, 429, "Too many requests — give it a moment and try again.");
        return handleChat(req, res);
      }
      return fail(res, 404, "Unknown endpoint.");
    }

    // Static files (GET/HEAD only)
    if (method === "GET" || method === "HEAD") {
      return serveStatic(req, res, pathname);
    }
    return fail(res, 405, "Method not allowed.");
  } catch (err) {
    const status = err?.status || 500;
    console.error("request error:", status, err?.message || err);
    if (!res.headersSent) fail(res, status, err?.message || "Server error.");
  }
});

server.on("error", (err) => {
  console.error("Server failed to start:", err?.message || err);
  process.exit(1);
});

preloadStatic();

server.listen(PORT, () => {
  console.log(`MediLead running on http://localhost:${PORT}  (model: ${MODEL})`);
  // Readiness signal that survives stdout buffering — pollable cross-process.
  try {
    fs.writeFileSync(path.join(__dirname, "data", "READY"), `http://localhost:${PORT}\n`);
  } catch {
    /* non-fatal */
  }
});
