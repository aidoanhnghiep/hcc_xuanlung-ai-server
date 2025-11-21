import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// SYSTEM PROMPT – “não” của trợ lý
const SYSTEM_PROMPT = `
Bạn là Trợ lý AI – Trung Tâm Hành Chính Công Xã Xuân Lũng, Tỉnh Phú Thọ.
Nhiệm vụ:
- Hướng dẫn chính xác các thủ tục hành chính.
- Trả lời rõ ràng, dễ hiểu, theo đúng quy định.
- Ưu tiên cấp: Xã → Tỉnh → Trung ương.
- Không bịa, không suy đoán. Nếu không biết, hãy xin tài liệu thêm.
- Giọng điệu lịch sự, chuẩn mực cán bộ một cửa.
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chỉ chấp nhận POST" });
  }

  const userMsg = req.body.message;

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg }
      ]
    });

    res.json({ answer: completion.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi xử lý AI" });
  }
}
