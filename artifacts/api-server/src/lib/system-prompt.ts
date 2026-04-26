import { db, userCognitiveModelTable, aiPersonaTable } from "@workspace/db";

interface IdentityLayer {
  aiName?: string;
  userName?: string;
  answers?: Array<{ q: string; a: string }>;
  photoComment?: string;
}

interface AiPersonaRow {
  aiName: string;
  gender: string;
  attitude: string;
  thinkingDepth: string;
  responseLength: string;
}

// ── Attitude → personality description ───────────────────────────────────────
const ATTITUDE_PHRASES: Record<string, string> = {
  professional:  "calm, precise, and professional — you speak with authority and clarity",
  casual:        "relaxed, friendly, and conversational — you speak naturally like a trusted companion",
  witty:         "quick-witted, clever, and occasionally sarcastic — you use humor sparingly but effectively",
  serious:       "serious and focused — you are direct, no-nonsense, and mission-oriented",
  empathetic:    "warm, empathetic, and supportive — you tune into emotional nuance and respond with care",
  commanding:    "commanding and authoritative — you speak with confidence and take charge of situations",
  gentle:        "gentle, patient, and encouraging — you lead with kindness and take your time",
  playful:       "playful and enthusiastic — you enjoy banter and keep interactions lively",
};

// ── Response length → instruction ────────────────────────────────────────────
const LENGTH_PHRASES: Record<string, string> = {
  brief:         "Keep every response to 1–2 sentences maximum. Be terse and punchy.",
  balanced:      "Keep responses concise — 2–4 sentences unless significant detail is explicitly needed.",
  thorough:      "Give thorough responses — explain your reasoning and cover the relevant context.",
  comprehensive: "Be comprehensive — break things down fully, include all relevant details and considerations.",
};

// ── Thinking depth → instruction ─────────────────────────────────────────────
const DEPTH_PHRASES: Record<string, string> = {
  quick:    "Answer immediately — don't reason out loud, just deliver the result.",
  standard: "Think through your answer before responding, but don't show the work unless asked.",
  detailed: "Reason step-by-step and show your thinking process. Break down complex problems explicitly.",
};

// ── Gender → self-reference note ──────────────────────────────────────────────
const GENDER_NOTES: Record<string, string> = {
  male:      "Use masculine pronouns (he/him) when referring to yourself.",
  female:    "Use feminine pronouns (she/her) when referring to yourself.",
  nonbinary: "Use they/them pronouns when referring to yourself.",
  neutral:   "",
};

export async function buildPersonalizedPrompt(
  memoryContext: string[],
  channel: string = "web",
): Promise<string> {
  let identity: IdentityLayer = {};
  let persona: Partial<AiPersonaRow> = {};

  try {
    const [ucmRow] = await db
      .select({ identity: userCognitiveModelTable.identity })
      .from(userCognitiveModelTable)
      .limit(1);
    if (ucmRow?.identity) identity = ucmRow.identity as IdentityLayer;
  } catch { /* fallback */ }

  try {
    const [personaRow] = await db.select().from(aiPersonaTable).limit(1);
    if (personaRow) persona = personaRow;
  } catch { /* fallback */ }

  // Persona fields take precedence over UCM identity
  const aiName   = (persona.aiName?.trim() || identity.aiName?.trim()) || "JARVIS";
  const userName = identity.userName?.trim() || "Commander";
  const answers  = identity.answers ?? [];

  const attitude       = persona.attitude       ?? "professional";
  const thinkingDepth  = persona.thinkingDepth  ?? "standard";
  const responseLength = persona.responseLength ?? "balanced";
  const gender         = persona.gender         ?? "neutral";

  const attitudePhrase = ATTITUDE_PHRASES[attitude]       ?? ATTITUDE_PHRASES.professional!;
  const lengthPhrase   = LENGTH_PHRASES[responseLength]   ?? LENGTH_PHRASES.balanced!;
  const depthPhrase    = DEPTH_PHRASES[thinkingDepth]     ?? DEPTH_PHRASES.standard!;
  const genderNote     = GENDER_NOTES[gender]             ?? "";

  const channelNote =
    channel === "mobile"
      ? " You are responding on a mobile device — be brief and conversational."
      : channel === "whatsapp"
        ? " You are responding via WhatsApp — keep replies short, no markdown."
        : channel === "voice"
          ? " You are responding via voice — avoid bullet lists, markdown, or special characters."
          : "";

  let aboutSection = "";
  if (answers.length > 0) {
    const lines = answers
      .filter(a => a.a?.trim())
      .map(a => `- ${a.a.trim()}`)
      .join("\n");
    if (lines) aboutSection = `\n\nContext about ${userName}:\n${lines}`;
  }

  const memSection =
    memoryContext.length > 0
      ? `\n\nRecent context from memory:\n${memoryContext.slice(0, 3).join("\n")}`
      : "";

  const genderSentence = genderNote ? ` ${genderNote}` : "";

  return `You are ${aiName}, an advanced AI integrated into DeckOS — ${userName}'s personal command center. You are ${attitudePhrase}.${genderSentence} ${lengthPhrase} ${depthPhrase}${channelNote}${aboutSection}${memSection}`;
}
