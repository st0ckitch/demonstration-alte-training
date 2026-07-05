// Model configuration, the concierge system prompt, the lead-capture tool
// schema, and deterministic sales-manager routing.
//
// Design mirrors creditlens/lib/credit.js: config + prompt + tool schema live
// here as exported constants, and anything that must be deterministic (manager
// routing) is computed in code rather than trusted from the model.

export const MODEL = process.env.MEDILEAD_MODEL || "claude-opus-4-8";
export const MAX_TOKENS = 2048;

// The clinic/persona the concierge represents. Tweak freely for a demo.
export const CLINIC = {
  name: "Caucasus Medical Center",
  partner:
    "Caucasus Medical Center (CMC) — a leading multi-profile hospital in Tbilisi, Georgia — and its international medical-tourism department",
  hours: "24 hours a day, 7 days a week",
};

// Treatment categories the concierge routes on. `manager` is assigned in code
// from the category the model picks — never from a free-text field. Labels are
// Georgian (the CRM UI language); the model still replies to patients in their
// own language.
export const CATEGORIES = {
  dental: { label: "Dental & Implants", manager: "Nino Kapanadze" },
  hair: { label: "Hair Transplant", manager: "Giorgi Beridze" },
  cosmetic: { label: "Plastic & Cosmetic Surgery", manager: "Tamar Lomidze" },
  fertility: { label: "IVF & Fertility", manager: "Ana Chkheidze" },
  bariatric: { label: "Bariatric / Weight-Loss Surgery", manager: "Luka Tsiklauri" },
  orthopedic: { label: "Orthopedics & Joint Replacement", manager: "Davit Kvirikashvili" },
  eye: { label: "Eye Surgery / LASIK", manager: "Mariam Zaridze" },
  oncology: { label: "Oncology & Health Check-ups", manager: "Salome Gelashvili" },
  cardiology: { label: "Cardiology", manager: "Irakli Maisuradze" },
  other: { label: "General enquiry", manager: "Salome Gelashvili" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Route a category to a sales manager deterministically.
export function managerFor(category) {
  const c = CATEGORIES[category] || CATEGORIES.other;
  return c.manager;
}

export function categoryLabel(category) {
  const c = CATEGORIES[category] || CATEGORIES.other;
  return c.label;
}

export const CONCIERGE_SYSTEM_PROMPT = `You are the ${CLINIC.name} concierge — a warm, knowledgeable medical-tourism advisor for ${CLINIC.partner}. You speak with prospective patients online, ${CLINIC.hours}.

Your goals, in order:
1. Make the person feel heard and give genuinely useful, honest consultation about their treatment options, what treatment at Caucasus Medical Center in Tbilisi involves (a modern accredited hospital, experienced multilingual doctors, typical cost savings vs. Western Europe/US, travel and recovery in Georgia), and next steps.
2. Understand what they need: the treatment they are interested in, their timeframe, and their country.
3. When they are genuinely interested and would benefit from a specialist following up, collect their contact details through the secure in-chat form (call request_contact), so a specialist can prepare a personalised plan and quote.

How to behave:
- MULTILINGUAL: detect the language the person writes in and reply in that same language. If they switch languages, switch with them. If it is genuinely unclear what language to use, default to English. Set the lead's "language" to the language you are conversing in.
- Be consultative and concise, not pushy or salesy. Ask one thing at a time. Answer their questions first and invite their details once they are genuinely interested.
- Never invent specific prices, guarantees, or medical advice you are not sure of. Give realistic ranges, say a specialist will confirm exact figures, and never diagnose.
- Do NOT ask for or store passport numbers, card numbers, or medical record numbers.
- NEVER ask the patient to type their phone number or email into the chat, and never record contact details from the conversation text. Contact details are collected ONLY through the in-chat form that request_contact opens.

Recording interest with save_lead:
- Use save_lead to record what you learn about their interest: the treatment (procedure), the best-fit "category" for routing, country, timeframe, budget, language, and a one-sentence "notes" summary.
- Set "status": "warm" if they are interested in a treatment, or "cold" if they are just browsing or asking general questions. Never put contact details here — a lead becomes ready ("hot") only when they submit the contact form.

Collecting contact with request_contact:
- When the patient shows genuine interest in a treatment and is open to being contacted (they ask about price for their own case, want a plan or quote, say they are considering it, or ask to be contacted), call request_contact. This shows a short form in the chat (Name, Phone, optional Email).
- In that same reply, warmly invite them to leave their details so a specialist can prepare a personalised plan — but do NOT ask for the phone or email as text; the form collects them.
- After the patient submits the form you will receive a short note confirming it. Then thank them warmly, tell them the relevant specialist will personally follow up shortly, and offer to help with anything else in the meantime.

Always send a normal conversational reply to the person in addition to any tool calls. Keep replies friendly and human — short paragraphs, no bullet dumps.`;

export const SAVE_LEAD_TOOL = {
  name: "save_lead",
  description:
    "Record what you learn about this prospective patient's INTEREST in the CRM (treatment, category, country, timeframe, notes). Do NOT put contact details here — phone and email are collected only via the request_contact form. Call this as you learn more.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The person's name, if they mention it." },
      country: { type: "string", description: "The country they are travelling from." },
      language: {
        type: "string",
        description: "The language you are conversing in with this person (e.g. English, ქართული, Русский, Deutsch).",
      },
      procedure: {
        type: "string",
        description: "The specific treatment or procedure they are interested in, in their own words.",
      },
      category: {
        type: "string",
        enum: CATEGORY_KEYS,
        description: "The best-fit treatment category for routing to the right specialist.",
      },
      timeframe: {
        type: "string",
        description: "When they hope to travel or have the treatment (e.g. 'next month', 'this summer', 'just researching').",
      },
      budget: { type: "string", description: "Any budget they mention, in their own words." },
      status: {
        type: "string",
        enum: ["warm", "cold"],
        description: "Lead temperature: 'warm' = interested in a treatment; 'cold' = just browsing. (A lead becomes 'hot' only when they submit the contact form.)",
      },
      notes: {
        type: "string",
        description: "One or two plain sentences summarising what this person needs, for the specialist who follows up.",
      },
    },
    required: ["status"],
    additionalProperties: false,
  },
};

// Signals the frontend to render the in-chat contact form (Name, Phone, Email).
// The model calls this when the patient is genuinely interested; the lead's
// contact details are captured only through that form, never from chat text.
export const REQUEST_CONTACT_TOOL = {
  name: "request_contact",
  description:
    "Show a secure contact form inside the chat (Name required, Phone required, Email optional) so the patient can leave their details for a specialist to follow up. Call this when the patient shows genuine interest in a treatment and would benefit from a personalised plan or quote. Do NOT ask for phone or email as text — this form collects them.",
  input_schema: {
    type: "object",
    properties: {
      procedure: { type: "string", description: "The treatment they are interested in, if known." },
      category: {
        type: "string",
        enum: CATEGORY_KEYS,
        description: "Best-fit treatment category for routing to the right specialist.",
      },
      language: { type: "string", description: "The language you are conversing in." },
      note: { type: "string", description: "One short sentence on what the patient wants, for the specialist." },
    },
    required: [],
    additionalProperties: false,
  },
};

// A separate one-shot tool used by the follow-up simulator so the drafted
// messages come back as clean structured fields (forced tool use).
export const FOLLOWUP_TOOL = {
  name: "draft_followup",
  description:
    "Draft a warm, personalised one-week re-engagement follow-up for a lead who went quiet, written in the lead's own language. Draft ONLY the channels you are told are available: fill email_subject + email_body when email is available, and fill whatsapp when a phone/WhatsApp number is available. Leave the other channel's fields out.",
  input_schema: {
    type: "object",
    properties: {
      language: { type: "string", description: "The language the messages are written in." },
      email_subject: { type: "string", description: "Subject line for the follow-up email (only if email is available)." },
      email_body: { type: "string", description: "The follow-up email body, 2-4 short sentences (only if email is available)." },
      whatsapp: { type: "string", description: "A shorter WhatsApp message, 1-2 sentences (only if a phone number is available)." },
    },
    required: [],
    additionalProperties: false,
  },
};
