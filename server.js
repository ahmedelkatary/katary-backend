import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ORIGINS = (process.env.ALLOWED_ORIGIN || "*").split(",").map(s => s.trim());
if (!KEY) { console.error("Missing GEMINI_API_KEY"); process.exit(1); }

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: ORIGINS.includes("*") ? true : ORIGINS }));
app.use(express.json({ limit: "12mb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const SYSTEM = "You are KATARY AI, a rigorous analytical assistant. Analyze the problem and give a clear, structured, practical answer. Always reply in the same language the user wrote in.";
const OK_IMG = /^image\/(png|jpe?g|webp|gif)$/;

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/analyze", async (req, res) => {
  try {
    const { text = "", files = [], images = [] } = req.body || {};
    if (typeof text !== "string" || text.length > 20000) return res.status(400).json({ error: "Invalid text" });
    if (!Array.isArray(files) || !Array.isArray(images) || files.length > 5 || images.length > 4)
      return res.status(400).json({ error: "Too many attachments" });
    let prompt = text.trim();
    for (const f of files) {
      if (typeof f?.name !== "string" || typeof f?.content !== "string") continue;
      prompt += `\n\n--- File: ${f.name.slice(0, 100)} ---\n${f.content.slice(0, 20000)}`;
    }
    const parts = [{ text: prompt || "(see attachments)" }];
    for (const im of images) {
      if (!OK_IMG.test(im?.mime || "") || typeof im.data !== "string" || im.data.length > 6_000_000)
        return res.status(400).json({ error: "Invalid image" });
      parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
    }
    if (parts.length === 1 && !prompt) return res.status(400).json({ error: "Empty request" });

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error("Gemini error", r.status, j?.error?.message); return res.status(502).json({ error: "AI service error" }); }
    const out = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    res.json({ text: out || "No answer was returned. Please rephrase and try again." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(process.env.PORT || 8080, () => console.log("KATARY AI backend running"));
