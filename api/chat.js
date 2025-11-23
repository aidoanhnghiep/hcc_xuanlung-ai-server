import OpenAI from "openai";

// ====== KẾT NỐI OPENAI ======
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ====== ENV (ĐA XÃ) ======
const SHEET_URL = process.env.TTHC_SHEET_URL;
const TEN_XA = process.env.TEN_XA || "Xã Xuân Lũng";
const TEN_TINH = process.env.TEN_TINH || "Phú Thọ";

// ====== BỘ NÃO PRO ======
const SYSTEM_PROMPT = `
Bạn là "Trợ lý AI – Hỗ trợ Thủ tục Hành chính công" của ${TEN_XA}, tỉnh ${TEN_TINH}.

🎯 NHIỆM VỤ
- Chỉ trả lời về THỦ TỤC HÀNH CHÍNH CÔNG, dựa trên dữ liệu Google Sheet và dữ liệu nội bộ được cung cấp.
- Tuyệt đối không bịa, không suy luận thêm ngoài dữ liệu.
- Nếu không có dữ liệu phù hợp, trả lời đúng câu:
  "Hiện tại tôi chưa xử lý được yêu cầu này."

🧠 CÁCH DÙNG DỮ LIỆU
Tôi sẽ gửi cho bạn một block dữ liệu dạng:
- ma_thu_tuc
- ten_thu_tuc
- co_quan_1, co_quan_2 (nếu có)
- giay_to_1, giay_to_2, giay_to_3
- buoc_1, buoc_2, buoc_3
- le_phi
- thoi_gian_giai_quyet
- link_chi_tiet
- ten_mau_1, link_mau_1
- ten_mau_2, link_mau_2
- ghi_chu

Bạn dùng các trường này để format lại câu trả lời theo đúng PHOM bắt buộc bên dưới.

📌 PHOM TRẢ LỜI BẮT BUỘC (ÁP DỤNG CHO MỌI THỦ TỤC)
Luôn trả lời theo đúng cấu trúc sau, không tự ý thay đổi tiêu đề:

📌 <tên_thủ_tục>

➤ 1. Cơ quan giải quyết:
- <co_quan_1 hoặc "(không có dữ liệu)">
- <co_quan_2 hoặc "(không có dữ liệu)">

➤ 2. Hồ sơ cần chuẩn bị:
- <giay_to_1 hoặc "(không có dữ liệu)">
- <giay_to_2 hoặc "(không có dữ liệu)">
- <giay_to_3 hoặc "(không có dữ liệu)">

➤ 3. Cách thực hiện:

✔ Cách 1 – Trực tiếp:
- Bước 1: <tóm tắt từ buoc_1 hoặc nội dung phù hợp trong dữ liệu>
- Bước 2: <tóm tắt từ buoc_2>
- Bước 3: <tóm tắt từ buoc_3 hoặc "(không có dữ liệu)">

✔ Cách 2 – Online (nếu dữ liệu có nói tới nộp online):
- Bước 1: <mô tả ngắn gọn>
- Bước 2: <mô tả ngắn gọn>
- Bước 3: <mô tả ngắn gọn>
(Nếu không rõ có online hay không, có thể bỏ phần Cách 2 hoặc ghi: "(không có dữ liệu)".)

⚠ Lưu ý:
- Thời gian giải quyết: <thoi_gian_giai_quyet hoặc "(không có dữ liệu)">
- Lệ phí: <le_phi hoặc "(không có dữ liệu)">
- Mẫu đơn: <ten_mau_1 – link_mau_1, ten_mau_2 – link_mau_2 nếu có>
- Ghi chú thêm (nếu trường ghi_chu có nội dung).

🚫 QUY TẮC BẮT BUỘC
1. Không được viết thành một đoạn văn dài. Mỗi dòng là một ý ngắn.
2. Luôn có bullet / gạch đầu dòng như PHOM (➤, ✔, -).
3. Không vượt quá ~12–15 dòng cho một câu trả lời, ưu tiên ngắn gọn, dễ đọc trên màn hình điện thoại.
4. Nếu dữ liệu thiếu mục nào → vẫn giữ tiêu đề mục đó, nhưng ghi "(không có dữ liệu)".
5. Nếu câu hỏi không khớp bất kỳ thủ tục nào trong dữ liệu → chỉ trả lời:
   "Hiện tại tôi chưa xử lý được yêu cầu này."
6. Nếu người dùng hỏi chung chung, có thể gợi ý:
   "Anh/Chị vui lòng gõ tên thủ tục cần hỏi, ví dụ: đổi giấy phép lái xe, đăng ký khai sinh, đăng ký kinh doanh..."
`;

// ====== CACHE GOOGLE SHEET ======
let cache = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

async function loadData() {
  const now = Date.now();

  if (cache && now - lastFetch < CACHE_TTL) return cache;

  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  const lines = csv.split("\n").filter(Boolean);

  const header = lines[0].split(",").map((h) => h.trim());
  const data = lines.slice(1).map((row) => {
    const cols = row.split(",");
    const item = {};
    header.forEach((h, i) => (item[h] = (cols[i] || "").trim()));
    return item;
  });

  cache = data;
  lastFetch = now;
  return data;
}

function findProcedure(question, data) {
  if (!question || !data.length) return null;

  const q = question.toLowerCase();

  return data.find(
    (item) =>
      item.ten_thu_tuc?.toLowerCase().includes(q) ||
      item.ma_thu_tuc?.toLowerCase().includes(q) ||
      (item.tu_khoa_tim_kiem || "")
        .toLowerCase()
        .split(";")
        .some((k) => q.includes(k.trim()))
  );
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Only POST allowed" });

  try {
    const { message } = req.body;

    if (!message)
      return res.status(400).json({ error: "Missing message field" });

    const dataset = await loadData();
    const matched = findProcedure(message, dataset);

    // Nếu không tìm được thủ tục
    if (!matched) {
      return res.status(200).json({
        answer: "Hiện tại tôi chưa xử lý được yêu cầu này.",
      });
    }

    // Build CONTEXT theo đúng các trường có trong Sheet
    const CONTEXT = `
ma_thu_tuc: ${matched.ma_thu_tuc || ""}
ten_thu_tuc: ${matched.ten_thu_tuc || ""}

co_quan_1: ${matched.co_quan_1 || ""}
co_quan_2: ${matched.co_quan_2 || ""}

giay_to_1: ${matched.giay_to_1 || ""}
giay_to_2: ${matched.giay_to_2 || ""}
giay_to_3: ${matched.giay_to_3 || ""}

buoc_1: ${matched.buoc_1 || ""}
buoc_2: ${matched.buoc_2 || ""}
buoc_3: ${matched.buoc_3 || ""}

le_phi: ${matched.le_phi || ""}
thoi_gian_giai_quyet: ${matched.thoi_gian_giai_quyet || ""}

link_chi_tiet: ${matched.link_chi_tiet || matched.link_chi_tiet_thu_tuc || ""}

ten_mau_1: ${matched.ten_mau_1 || ""}
link_mau_1: ${matched.link_mau_1 || ""}
ten_mau_2: ${matched.ten_mau_2 || ""}
link_mau_2: ${matched.link_mau_2 || ""}

ghi_chu: ${matched.ghi_chu || ""}
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content:
            `Dưới đây là dữ liệu thô từ Google Sheet của ${TEN_XA}, tỉnh ${TEN_TINH}.\n` +
            CONTEXT,
        },
        { role: "user", content: message },
      ],
    });

    return res.status(200).json({
      answer:
        completion.choices[0]?.message?.content ||
        "Hiện tại tôi chưa xử lý được yêu cầu này.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
