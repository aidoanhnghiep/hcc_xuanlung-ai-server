import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // 👇 Bật CORS cho mọi nguồn (127.0.0.1, website thật, v.v.)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Trả lời preflight request (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Chỉ cho phép POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Only POST requests are allowed",
    });
  }

  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Missing 'message' field in request body",
      });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant.",
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const reply =
      completion.choices?.[0]?.message?.content || "Không có nội dung trả về";

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
}
