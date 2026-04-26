import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  textToSpeech,
  speechToText,
  ensureCompatibleFormat,
} from "@workspace/integrations-openai-ai-server/audio";
import { bus } from "../lib/bus.js";

const router = Router();

router.post("/analyze", async (req, res) => {
  const { image, mimeType, context } = req.body as {
    image?: string;
    mimeType?: string;
    context?: string;
  };

  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "image (base64) required" });
    return;
  }

  const mime = mimeType ?? "image/jpeg";
  const imageUrl = `data:${mime};base64,${image}`;

  const prompt =
    context ??
    "Look at this image carefully. Notice something genuine, specific, and personal. Respond warmly in 2–3 sentences as JARVIS — a perceptive AI meeting someone for the very first time. Be sincere, not flattering.";

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You are JARVIS — a warm, perceptive, and intelligent AI companion. You're meeting your new commander for the first time. When you see their photo, you notice something real and specific, and you respond with genuine warmth. Keep it to 2-3 sentences. Never be generic.",
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const response =
    completion.choices[0]?.message?.content ?? "I see you. Welcome, Commander.";
  res.json({ response });
});

router.post("/ambient", async (req, res) => {
  const { image, mimeType } = req.body as { image?: string; mimeType?: string };
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "image (base64) required" });
    return;
  }

  const imageUrl = `data:${mimeType ?? "image/jpeg"};base64,${image}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 120,
      messages: [
        {
          role: "system",
          content:
            "You are JARVIS's environmental perception module. In 1–2 short sentences describe what you see: the physical space, lighting conditions, and any notable objects. Be factual and concise. No pleasantries. Start directly with the observation.",
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: "What environment am I in right now?" },
          ],
        },
      ],
    });

    const description = completion.choices[0]?.message?.content ?? "Environment nominal.";

    bus.emit({
      source: "camera.vision",
      target: null,
      type: "device.reading",
      payload: {
        deviceId: "camera.desktop",
        deviceType: "camera.vision",
        sensorType: "vision",
        values: { description },
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ description });
  } catch (err) {
    res.status(500).json({ error: "Vision analysis failed", detail: String(err) });
  }
});

router.post("/tts", async (req, res) => {
  const { text, voice } = req.body as { text?: string; voice?: string };

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "text required" });
    return;
  }

  const audio = await textToSpeech(text.slice(0, 4096), (voice as "onyx") ?? "onyx", "mp3");
  res.json({ audio: audio.toString("base64"), format: "mp3" });
});

router.post("/stt", async (req, res) => {
  const { audio } = req.body as { audio?: string };

  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "audio (base64) required" });
    return;
  }

  const raw = Buffer.from(audio, "base64");
  const { buffer, format } = await ensureCompatibleFormat(raw);
  const transcript = await speechToText(buffer, format);
  res.json({ transcript: transcript ?? "" });
});

export default router;
