import { pgTable, serial, timestamp, text } from "drizzle-orm/pg-core";

export const aiPersonaTable = pgTable("ai_persona", {
  id:             serial("id").primaryKey(),
  aiName:         text("ai_name").notNull().default("JARVIS"),
  gender:         text("gender").notNull().default("neutral"),
  voice:          text("voice").notNull().default("onyx"),
  attitude:       text("attitude").notNull().default("professional"),
  thinkingDepth:  text("thinking_depth").notNull().default("standard"),
  responseLength: text("response_length").notNull().default("balanced"),
  textColor:      text("text_color").notNull().default("#00d4ff"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiPersona = typeof aiPersonaTable.$inferSelect;
export type NewAiPersona = typeof aiPersonaTable.$inferInsert;
