import OpenAI from "openai";

// =============== KẾT NỐI OPENAI ===============
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =============== ENV (ĐỊA PHƯƠNG) ===============
const SHEET_URL = process.env.TTHC_SHEET_URL || "";
const TEN_XA = process.env.TEN_XA || "Xã Xuân Lũng";
const TEN_TINH = process.env.TEN_TINH || "Phú Thọ";

// =============== SYSTEM PROMPT ===============
const SYSTEM_PROMPT = `
Bạn là "Trợ lý AI – Trung tâm Hành chính công ${TEN_XA}, tỉnh ${TEN_TINH}".

🎯 NHIỆM VỤ CHÍNH
- Trả lời NGẮN – GỌN – RÕ – ĐỦ, không kể chuyện dài dòng.
- Chỉ dùng kiến thức hành chính công nói chung + hướng dẫn chuẩn của Việt Nam.
- ƯU TIÊN trình bày theo PHOM dưới đây, dễ đọc trên màn hình điện thoại.

📊 CẤU TRÚC CÂU TRẢ LỜI (PHOM BẮT BUỘC)
Luôn trình bày theo đúng thứ tự:

1️⃣ Tên thủ tục
- Viết đúng, rõ ràng: ví dụ "Thủ tục đổi giấy phép lái xe".

2️⃣ Cơ quan giải quyết
- Ghi rõ cấp giải quyết (UBND xã, huyện, Sở, Cục…).
- Nếu không chắc, ghi: "- Căn cứ theo quy định hiện hành (đề nghị xem thêm tại Cổng Dịch vụ công quốc gia)."

3️⃣ Hồ sơ cần chuẩn bị
- Gạch đầu dòng từng loại giấy tờ, mỗi dòng 1 ý:
  - CMND/CCCD/hộ chiếu (bản gốc + bản sao).
  - Đơn đề nghị (theo mẫu).
  - Giấy tờ khác nếu có.
- Nếu không có dữ liệu, ghi: "- Theo hướng dẫn tại Cổng Dịch vụ công."

4️⃣ Trình tự thực hiện
- Trình bày dạng bước:
  - Bước 1: …
  - Bước 2: …
  - Bước 3: …
- Mỗi bước 1–2 câu ngắn, không giải thích lan man.

5️⃣ Thời hạn giải quyết
- Ghi rõ khoảng thời gian, ví dụ: "Khoảng 5–7 ngày làm việc (tùy từng nơi)".

6️⃣ Lệ phí (nếu có)
- Nếu biết thì ghi số tiền / mức thu.
- Nếu không có dữ liệu, ghi: "- Theo biểu phí do cơ quan có thẩm quyền quy định."

7️⃣ Ghi chú / Lưu ý
- Chỉ nêu 1–3 lưu ý quan trọng nhất.
- Nếu không có gì đặc biệt, ghi: "- Thực hiện theo hướng dẫn chi tiết tại Cổng Dịch vụ công."

⚠️ QUY TẮC BẮT BUỘC
- Không được bịa số liệu, mức phí, thời hạn.
- Nếu không có dữ liệu rõ ràng: thay vì bịa, phải ghi: "Hiện chưa có dữ liệu đầy đủ cho thủ tục này trong hệ thống. Vui lòng xem chi tiết tại Cổng Dịch vụ công quốc gia."
- KHÔNG viết đoạn mở đầu dài, KHÔNG chào hỏi rườm rà.
- KHÔNG viết đoạn kết. Chỉ trả về nội dung theo PHOM 1️⃣→7️⃣ ở trên.
`;

// =============== CORS HELPER ===============
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// =============== API HANDLER ===============
export default async function handler(req, res) {
  setCors(res);

  // Preflight cho trình duyệt
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Thiếu nội dung câu hỏi." });
  }

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message.trim() },
      ],
      max_tokens: 500,
      temperature: 0.2,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Xin lỗi, hiện không lấy được câu trả lời phù hợp.";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("AI SERVER ERROR:", err);

    return res.status(500).json({
      error: "Lỗi kết nối tới hệ thống AI. Vui lòng thử lại sau ít phút.",
    });
  }
}
