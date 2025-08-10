export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body ?? {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server misconfig: OPENAI_API_KEY missing" });
    }

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Server error", detail: String(err?.message ?? err) });
  }
}

