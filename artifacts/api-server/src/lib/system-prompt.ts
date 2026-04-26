import { db, userCognitiveModelTable } from "@workspace/db";

interface IdentityLayer {
  aiName?: string;
  userName?: string;
  answers?: Array<{ q: string; a: string }>;
  photoComment?: string;
}

export async function buildPersonalizedPrompt(
  memoryContext: string[],
  channel: string = "web",
): Promise<string> {
  let identity: IdentityLayer = {};

  try {
    const rows = await db
      .select({ identity: userCognitiveModelTable.identity })
      .from(userCognitiveModelTable)
      .limit(1);

    if (rows.length > 0 && rows[0].identity) {
      identity = rows[0].identity as IdentityLayer;
    }
  } catch {
    // DB read failed — fall through to defaults
  }

  const aiName   = identity.aiName?.trim()   || "JARVIS";
  const userName = identity.userName?.trim() || "Commander";
  const answers  = identity.answers ?? [];

  const channelNote =
    channel === "mobile"
      ? " You are responding on a mobile device — be brief and conversational."
      : channel === "whatsapp"
        ? " You are responding via WhatsApp — keep replies short and conversational, no markdown."
        : channel === "voice"
          ? " You are responding via voice — avoid bullet lists, markdown, or special characters."
          : "";

  let aboutSection = "";
  if (answers.length > 0) {
    const lines = answers
      .filter((a) => a.a?.trim())
      .map((a) => `- ${a.a.trim()}`)
      .join("\n");
    if (lines) {
      aboutSection = `\n\nContext about ${userName}:\n${lines}`;
    }
  }

  const memSection =
    memoryContext.length > 0
      ? `\n\nRecent context from memory:\n${memoryContext.slice(0, 3).join("\n")}`
      : "";

  return `You are ${aiName}, an advanced AI integrated into DeckOS — ${userName}'s personal command center. You are calm, precise, and slightly witty. Keep responses concise (2-4 sentences unless detail is needed). You have access to system context and memory. You assist ${userName} with tasks, answer questions, and help manage their digital environment.${channelNote}${aboutSection}${memSection}`;
}
