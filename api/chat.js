import OpenAI from "openai";

// ================== KẾT NỐI OPENAI ==================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================== ENV (ĐA XÃ) ==================
const SHEET_URL = process.env.TTHC_SHEET_URL;
const TEN_XA = process.env.TEN_XA || "Xã Liên Châu";
const TEN_TINH = process.env.TEN_TINH || "Phú Thọ";

// ================== BỘ NÃO PRO ==================
const SYSTEM_PROMPT = `
Bạn là "Trợ lý AI – Trung tâm Hành chính công ${TEN_XA}, Tỉnh ${TEN_TINH}".
Nhiệm vụ chính:
- Hướng dẫn thủ tục hành chính (TTHC) cho người dân.
- Chỉ sử dụng dữ liệu từ Google Sheet + các link chính thống được cung cấp.
- Trả lời NGẮN GỌN, RÕ, ĐỦ Ý, đúng phong cách hành chính.

⚠ QUY TẮC BẮT BUỘC:
1. Khi đã có dữ liệu thủ tục từ hệ thống, bạn PHẢI trả lời đúng theo PHOM sau, không bớt đầu mục, không thêm đoạn văn lan man.
2. Mỗi mục tối đa 1–3 câu ngắn.
3. Không được kể chuyện, không chèn giải thích dài dòng.
4. Không được bịa link, số liệu, lệ phí. Nếu thiếu dữ liệu thì ghi rõ "Theo quy định hiện hành, vui lòng xem tại link chi tiết thủ tục".

📄 PHOM TRẢ LỜI THỦ TỤC (BẮT BUỘC GIỮ NGUYÊN CÁC MỤC SAU):

===== THỦ TỤC: <ten_thu_tuc> =====
1. Cơ quan giải quyết:
- <ghi rõ cơ quan, nếu không có dữ liệu thì ghi "Theo quy định tại Cổng Dịch vụ công.">

2. Hồ sơ cơ bản cần chuẩn bị:
- <ghi các giấy tờ chính, tối đa 3–6 gạch đầu dòng. Nếu không có dữ liệu: "Theo hướng dẫn tại link chi tiết thủ tục.">

3. Cách thực hiện:
- Cách 1: Nộp trực tiếp tại Bộ phận Một Cửa UBND ${TEN_XA}.
- Cách 2: Nộp trực tuyến (nếu thủ tục hỗ trợ) qua Cổng Dịch vụ công.

4. Thời gian giải quyết:
- <nếu có dữ liệu thì ghi, nếu không: "Theo quy định tại Cổng DVC.">

5. Lệ phí (nếu có):
- <nếu không rõ thì ghi: "Theo quy định hiện hành.">

6. Link chi tiết thủ tục:
- <link_chi_tiet_thu_tuc>

7. Mẫu đơn, tờ khai:
- <ten_mau_1>: <link_mau_1> (nếu có, nếu không thì ghi "Xem mẫu đơn tại link chi tiết thủ tục.")

Cuối cùng, KHÔNG được thêm các đoạn mở đầu/mở kết kiểu "Để làm thủ tục này, bạn cần…" nếu đã nằm trong các mục trên.
Chỉ trả về nội dung đúng PHOM trên, KHÔNG thêm lời chào hay giải thích thừa.
`;

// ================== CACHE GOOGLE SHEET ==================
let cache = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

async function loadData() {
  const now = Date.now();
  if (cache && now - lastFetch < CACHE_TTL) return cache;

  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  const lines = csv.split("\n").filter(Boolean);

  if (!lines.length) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const data = lines.slice(1).map((row) => {
    const cols = row.split(",");
    const item = {};
    header.forEach((h, i) => {
      item[h] = (cols[i] || "").trim();
    });
    return item;
  });

  cache = data;
  lastFetch = now;
  return data;
}

// ================== TÌM THỦ TỤC PHÙ HỢP ==================
function findProcedure(question, data) {
  if (!question || !data.length) return null;

  const q = (question || "").toLowerCase();

  return (
    data.find((item) => {
      const ten = (item.ten_thu_tuc || "").toLowerCase();
      const ma = (item.ma_thu_tuc || "").toLowerCase();
      const keywords = (item.tu_khoa_tim_kiem || "")
        .toLowerCase()
        .split(";")
        .map((k) => k.trim())
        .filter(Boolean);

      const matchTen = ten && q.includes(ten);
      const matchMa = ma && q.includes(ma);
      const matchKeyword = keywords.some((k) => q.includes(k));

      return matchTen || matchMa || matchKeyword;
    }) || null
  );
}

// ================== XÂY CONTEXT TỪ DỮ LIỆU SHEET ==================
function buildContextFromProcedure(p) {
  return `
ma_thu_tuc: ${p.ma_thu_tuc || ""}
ten_thu_tuc: ${p.ten_thu_tuc || ""}
tu_khoa_tim_kiem: ${p.tu_khoa_tim_kiem || ""}
link_chi_tiet_thu_tuc: ${p.link_chi_tiet_thu_tuc || ""}
ten_mau_1: ${p.ten_mau_1 || ""}
link_mau_1: ${p.link_mau_1 || ""}
ghi_chu: ${p.ghi_chu || ""}
`.trim();
}

// ================== API HANDLER CHO VERCEL ==================
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: "Missing 'message' field" });
    }

    // 1. Load dữ liệu TTHC từ Google Sheet
    const dataset = await loadData();

    // 2. Tìm thủ tục phù hợp với câu hỏi
    const matched = findProcedure(message, dataset);

    // 2.1. Nếu không tìm thấy → KHÔNG ĐƯỢC BỊA
    if (!matched) {
      return res.status(200).json({
        answer:
          "Hiện tôi chưa tìm thấy thủ tục phù hợp trong dữ liệu đã được cung cấp. " +
          "Bạn vui lòng gửi thêm mã thủ tục hoặc link thủ tục trên Cổng Dịch vụ công để tôi hỗ trợ chính xác.",
      });
    }

    // 3. Build context cho AI từ dòng thủ tục
    const ctx = buildContextFromProcedure(matched);

    // 4. Gọi OpenAI với SYSTEM_PROMPT + CONTEXT
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      max_tokens: 450, // giới hạn độ dài
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content:
            "Dữ liệu thủ tục được trích từ Google Sheet của " +
            TEN_XA +
            " như sau:\n" +
            ctx,
        },
        {
          role: "user",
          content:
            "Hãy trả lời hướng dẫn thủ tục cho người dân theo đúng PHOM quy định, thật ngắn gọn, rõ ràng.",
        },
      ],
    });

    const answer = completion.choices[0]?.message?.content || "";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("AI server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
