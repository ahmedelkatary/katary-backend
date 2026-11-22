export const maxDuration = 30;
const OK_IMG = /^image\/(png|jpe?g|webp|gif)$/;
const SYSTEM = "You are KATARY AI, a rigorous analytical assistant. Analyze the problem and give a clear, structured, practical answer. Always reply in the same language the user wrote in.";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { text = "", files = [], images = [] } = req.body || {};
    if (typeof text !== "string" || text.length > 20000) return res.status(400).json({ error: "Invalid text" });
    if (!Array.isArray(files) || !Array.isArray(images) || files.length > 5 || images.length > 3)
      return res.status(400).json({ error: "Too many attachments" });
    let prompt = text.trim();
    for (const f of files) {
      if (typeof f?.name !== "string" || typeof f?.content !== "string") continue;
      prompt += `\n\n--- File: ${f.name.slice(0, 100)} ---\n${f.content.slice(0, 20000)}`;
    }
    const parts = [{ text: prompt || "(see attachments)" }];
    for (const im of images) {
      if (!OK_IMG.test(im?.mime || "") || typeof im.data !== "string" || im.data.length > 1_400_000)
        return res.status(400).json({ error: "Invalid or too large image" });
      parts.push({ inline_data: { mime_type: im.mime, data: im.data } });
    }
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts }] })
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: "AI service error" });
    const out = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    res.json({ text: out || "No answer was returned. Please try again." });
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
}
