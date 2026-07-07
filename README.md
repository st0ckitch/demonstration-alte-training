# MediLead

A showcase product for the deck **"How we implemented AI at the corporate level."**
It brings the medical‑tourism lead‑generation case to life:

> An AI‑based chat that consults leads interested in medical tourism, captures
> hot‑lead contact details into a database, routes them to a sales manager, and
> drafts a one‑week follow‑up (email / WhatsApp) for leads who go quiet.

Built in the same spirit as `creditlens` and `narrativelens` — Node on the back,
the Claude API with **forced / agentic tool use**, a static front‑end — plus the
two things this brief specifically asked for: an **API‑key paste** flow in the UI,
and a **persistent backend that stores all the data.**

It has **zero external dependencies** — it runs on Node's built‑ins (`node:http`,
global `fetch` to the Claude API, and a JSON‑file store). No `npm install`, no
native build, nothing to hydrate — just `node server.js`. That makes it bullet‑proof
to run live in a demo.

## What it does

- **Modern chat front page** (`/`) — a 24/7, multilingual concierge. It replies in
  the visitor's own language, gives real consultation, and quietly captures details.
- **Lead capture via tool use** — while chatting, Claude calls a `save_lead` tool.
  The server writes the lead to SQLite and deterministically assigns a **sales
  manager** based on the treatment category (routing is done in code, not trusted
  from the model).
- **CRM dashboard** (`/dashboard`) — KPIs (hot / warm / cold / contactable),
  leads by treatment, a leads table, and a drawer with the full transcript and
  captured fields — *the backend where all the data is stored.*
- **Follow‑up simulator** — on any lead, "Simulate 1‑week follow‑up" asks Claude to
  draft a personalised re‑engagement email + WhatsApp message in the lead's language.
- **Paste‑an‑API‑key** — click **API key**, paste an Anthropic key. It's kept in the
  browser's `localStorage` and sent per‑request to your own server, which calls Claude.

## Run it

```bash
cd medilead
npm start          # == node server.js — no install needed
```

Open **http://localhost:3200**, click **API key**, paste your Anthropic key, and chat.
Then open **/dashboard** to watch leads land. (Optionally `cp .env.example .env` to set a
server‑side key or the port instead of pasting.)

## Deploy a permanent URL (Render)

The app is a plain Node server, so it needs a Node host (GitHub Pages can't run it).
Two steps and you get an always‑on URL:

1. **Push to GitHub** (from this folder):
   ```bash
   git push -u origin main
   ```
2. **Deploy on Render** — click the button (it reads `render.yaml`):

   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/st0ckitch/demonstration-alte-training)

   Sign in with GitHub → **Apply**. You get a fixed `*.onrender.com` URL that stays up 24/7,
   independent of your machine. Visitors paste their own Anthropic key, or set
   `ANTHROPIC_API_KEY` in Render → Environment so the chat works with no paste.

The deployed CRM starts pre‑populated from `data/seed.json` (the sample leads) so it looks
alive on first load. Note: Render's free filesystem is ephemeral, so leads captured live
reset on redeploy — add a Render disk (or a database) for durable storage.

## Stack

- **Model:** `claude-opus-4-8` (override with `MEDILEAD_MODEL`)
- **Server:** Node `http`, the Claude Messages API over `fetch` — an agentic tool‑use
  loop for the chat and forced tool use for the follow‑up drafter
- **Storage:** a JSON file at `data/medilead.json` (conversations, messages, leads,
  follow‑ups), written atomically
- **Front‑end:** plain HTML/CSS/JS modules — no build step
- **Dependencies:** none

## Layout

```
medilead/
├── server.js            Express app: /api/chat, /api/leads, follow-up, static
├── lib/
│   ├── env.js           tiny built-in .env loader (no dotenv)
│   ├── concierge.js     model config, system prompt, tool schemas, manager routing
│   └── store.js         JSON-file store (conversations, messages, leads, follow-ups)
├── public/
│   ├── index.html/app.js        chat front page
│   ├── dashboard.html/dashboard.js  lead CRM
│   ├── common.js        shared: key modal, theme, toasts, fetch wrapper
│   └── styles.css
└── data/                medilead.json — the data store (git-ignored)
```

## A note on the API key

Passing the key from the browser to your own backend is intentional for this demo,
so anyone can try it with their own key without server config. For a real
deployment, set `ANTHROPIC_API_KEY` server‑side and remove the paste flow, and/or
enable the `MEDILEAD_PASSWORD` Basic‑auth gate.
