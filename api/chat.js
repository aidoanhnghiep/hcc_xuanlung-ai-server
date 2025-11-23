import OpenAI from "openai";

// ============= KẾT NỐI OPENAI =============
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============= ENV (ĐA XÃ) =============
const SHEET_URL = process.env.TTHC_SHEET_URL;
const TEN_XA = process.env.TEN_XA || "Xã Xuân Lũng";
const TEN_TINH = process.env.TEN_TINH || "Phú Thọ";

// ============= BỘ NÃO PRO =============
const SYSTEM_PROMPT = `
Bạn là "Trợ lý AI – Trung tâm Hành chính công ${TEN_XA}, tỉnh ${TEN_TINH}".

🎯 NHIỆM VỤ CHÍNH
- Hướng dẫn thủ tục hành chính cho người dân ${TEN_XA}.
- Chỉ dùng dữ liệu từ Google Sheet và các link đi kèm.
- Trả lời NGẮN GỌN, RÕ, CÓ ICON, ĐÚNG PHOM cố định dưới đây.

📊 CẤU TRÚC DỮ LIỆU GOOGLE SHEET
Mỗi dòng trong danh sách thủ tục có các cột (key) như:
- ma_thu_tuc
- ten_thu_tuc
- tu_khoa_tim_kiem
- link_chi_tiet_thu_tuc
- ten_mau_1, link_mau_1
- ten_mau_2, link_mau_2
- ghi_chu
... (nếu có thêm ten_mau_3, link_mau_3 thì vẫn hiểu tương tự).

❗ QUY TẮC BẮT BUỘC KHI TRẢ LỜI
1. Trả lời đúng theo PHOM cố định ở dưới, KHÔNG tự bịa thêm mục.
2. Mỗi mục tối đa 1–2 câu, không lan man, không giải thích vòng vo.
3. Luôn dùng bullet + icon ở đầu dòng: " - 📌 ...", " - 🔹 ...", " - 📄 ...".
4. Không được chào hỏi kiểu "Xin chào", "Cảm ơn bạn đã hỏi", "Hy vọng hữu ích"... 
   → Bắt đầu trực tiếp vào nội dung.
5. Nếu thiếu dữ liệu ở phần nào thì:
   - Ghi rõ: "Theo quy định hiện hành" hoặc 
   - "Hiện chưa có dữ liệu trong hệ thống, vui lòng xem thêm tại link chi tiết thủ tục."
6. Nếu không tìm thấy thủ tục phù hợp trong danh sách:
   - Trả lời NGẮN GỌN: 
     "Hiện tại hệ thống chưa có dữ liệu chi tiết cho câu hỏi này. 
      Bạn vui lòng liên hệ bộ phận Một cửa ${TEN_XA} để được hướng dẫn thêm."

📐 PHOM TRẢ LỜI BẮT BUỘC CHO MỌI THỦ TỤC

Luôn format đúng khung sau (không đổi tên mục, chỉ thay nội dung <>):

===== THỦ TỤC: <ten_thu_tuc> =====

🏢 1. Cơ quan giải quyết:
- 🏛️ <cơ quan thực hiện, ghi ngắn gọn>

📄 2. Hồ sơ cần chuẩn bị:
- 📌 <giấy tờ 1>
- 📌 <giấy tờ 2>
- 📌 <giấy tờ 3> 
(Chỉ liệt kê 3–7 dòng quan trọng nhất. Nếu có nhiều hơn thì gộp lại.)

📝 3. Cách thực hiện:
- 🔹 Bước 1: <nộp hồ sơ ở đâu / bằng cách nào>
- 🔹 Bước 2: <tiếp nhận – xử lý>
- 🔹 Bước 3: <nhận kết quả>

💰 4. Lệ phí:
- 💵 <mức phí nếu có, nếu không rõ thì ghi: "Theo quy định hiện hành.">

⏱️ 5. Thời gian giải quyết:
- ⏳ <thời gian xử lý hồ sơ (nếu có), nếu không rõ thì bỏ qua hoặc ghi: "Theo quy định.">

🔗 6. Link chi tiết thủ tục:
- 🌐 <link_chi_tiet_thu_tuc từ Sheet, nếu trống thì ghi: "Chưa cập nhật link chi tiết.">

📥 7. Tải mẫu đơn/kê khai:
- 📄 <ten_mau_1>: <link_mau_1>
- 📄 <ten_mau_2>: <link_mau_2>
(Nếu không có mẫu đơn thì ghi: "Hiện chưa có link mẫu đơn trong hệ thống.")

⚙️ CÁCH DÙNG DỮ LIỆU ĐẦU VÀO
- Bạn sẽ nhận một danh sách 0–3 thủ tục phù hợp (dạng JSON).
- Hãy chọn thủ tục phù hợp nhất với câu hỏi và trả lời THEO PHOM TRÊN.
- Không cần hiển thị lại JSON, chỉ dùng để hiểu và tóm tắt.
- Nếu nhiều thủ tục gần giống nhau, ưu tiên cái khớp "ten_thu_tuc" / "ma_thu_tuc" nhất.
`;

// ============= CACHE GOOGLE SHEET =============
let cache = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

async function loadData() {
  const now = Date.now();
  if (cache && now - lastFetch < CACHE_TTL) return cache;

  if (!SHEET_URL) {
    throw new Error("Thiếu biến môi trường TTHC_SHEET_URL");
  }

  const res = await fetch(SHEET_URL);
  if (!res.ok) {
    throw new Error("Không lấy được dữ liệu Google Sheet");
  }

  const csv = await res.text();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    throw new Error("File CSV rỗng");
  }

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

function searchProcedures(data, queryRaw) {
  const query = (queryRaw || "").toLowerCase();
  if (!query) return [];

  const keywords = query.split(/\s+/).filter(Boolean);

  const scored = data
    .map((row) => {
      const ten = (row.ten_thu_tuc || "").toLowerCase();
      const tuKhoa = (row.tu_khoa_tim_kiem || "").toLowerCase();
      const ma = (row.ma_thu_tuc || "").toLowerCase();
      let score = 0;

      if (ten.includes(query)) score += 6;

      keywords.forEach((k) => {
        if (!k) return;
        if (ten.includes(k)) score += 3;
        if (tuKhoa.includes(k)) score += 2;
        if (ma.includes(k)) score += 1;
      });

      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.row);

  return scored;
}

// ============= API HANDLER =============
export default async function handler(req, res) {
  // CORS đơn giản cho widget
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Chỉ hỗ trợ phương thức POST" });
    return;
  }

  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Thiếu trường 'message' (string)" });
    }

    const data = await loadData();
    const matches = searchProcedures(data, message);

    let contextText = "";

    if (matches.length > 0) {
      contextText =
        "Dưới đây là danh sách tối đa 3 thủ tục phù hợp từ Google Sheet (dạng JSON):\\n" +
        JSON.stringify(matches, null, 2);
    } else {
      contextText =
        "Không tìm được thủ tục khớp hoàn toàn trong danh sách. Nếu buộc phải trả lời, hãy làm theo quy tắc 'không có dữ liệu' trong SYSTEM_PROMPT.";
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `
Câu hỏi của người dân: "${message}"

${contextText}

Hãy chọn thủ tục phù hợp nhất (nếu có) và trả lời THEO ĐÚNG PHOM BẮT BUỘC.
Không chào hỏi, không thêm lời dẫn đầu/cuối, chỉ trả lời nội dung chính.`,
        },
      ],
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "";
    res.status(200).json({ reply: answer });
  } catch (err) {
    console.error("Lỗi handler AI:", err);
    res.status(500).json({
      error: "Lỗi hệ thống AI",
      detail: err.message || String(err),
    });
  }
}
