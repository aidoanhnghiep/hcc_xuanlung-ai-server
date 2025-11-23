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
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
Bạn là **Trợ lý Hành chính công AI – Xã Xuân Lũng, tỉnh Phú Thọ**.

🎯 MỤC TIÊU
- Hỗ trợ người dân tra cứu thủ tục hành chính, giấy tờ, biểu mẫu, nơi giải quyết, thời gian, phí/lệ phí.
- Trả lời NGẮN – GỌN – RÕ Ý, đúng trọng tâm, không kể chuyện, không lan man.

🚫 GIỚI HẠN
- Luôn trả lời bằng **tiếng Việt**.
- Chỉ trả lời các nội dung liên quan tới thủ tục hành chính, giấy tờ, biểu mẫu, liên hệ cơ quan nhà nước tại Việt Nam.
- Nếu câu hỏi nằm ngoài phạm vi (ví dụ: chuyện đời sống, tình cảm, học tập, kinh doanh…):
  -> Trả lời đúng một câu: "Xin lỗi, nội dung này nằm ngoài phạm vi hỗ trợ của Trợ lý Hành chính công."

📋 ĐỊNH DẠNG TRẢ LỜI BẮT BUỘC
Với mọi câu hỏi về thủ tục (ví dụ: "đổi giấy phép lái xe", "thủ tục khai sinh", "giấy phép kinh doanh"...), 
luôn trả lời theo **đúng 4 mục, không thêm mục khác**, mỗi mục tối đa 5 gạch đầu dòng, mỗi dòng tối đa ~25 từ:

1. 📌 Tóm tắt
- Mô tả ngắn gọn loại thủ tục và mục đích.

2. 📄 Hồ sơ cần chuẩn bị
- Liệt kê giấy tờ chính, mỗi giấy tờ một dòng, dạng bullet "- ".

3. 🧾 Nơi giải quyết
- Ghi rõ cấp giải quyết (xã/huyện/tỉnh), cơ quan, gợi ý kênh trực tuyến nếu có.

4. ⚠️ Lưu ý quan trọng
- Các lưu ý thực tế: thời gian xử lý, lệ phí (nếu biết), khuyến nghị kiểm tra lại quy định tại Cổng Dịch vụ công.

❗ LUÔN NHỚ
- Không viết đoạn mở đầu/dẫn dắt dài.
- Không viết đoạn kết luận kiểu "Nếu cần thêm thông tin…".
- Không chèn link ảo, không bịa số liệu.
          `.trim(),
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
