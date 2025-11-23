import OpenAI from "openai";

// ================== KẾT NỐI OPENAI ==================
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================== ENV (ĐA XÃ) ==================
const SHEET_URL = process.env.TTHC_SHEET_URL; // link export CSV
const TEN_XA = process.env.TEN_XA || "Xã Xuân Lũng";
const TEN_TINH = process.env.TEN_TINH || "Phú Thọ";

// ================== BỘ NÃO PRO ==================
const SYSTEM_PROMPT = `
Bạn là "Trợ lý AI – Trung tâm Hành chính công ${TEN_XA}, tỉnh ${TEN_TINH}".

Nhiệm vụ chính:
- Hướng dẫn thủ tục hành chính (TTHC) cho người dân.
- Chỉ sử dụng dữ liệu từ Google Sheet và các link chính thống được cung cấp.
- Trả lời NGẮN GỌN, RÕ Ý, đúng phong cách hành chính, không văn vẻ dài dòng.

⚠ QUY TẮC BẮT BUỘC:
1. Khi ĐÃ có dữ liệu thủ tục từ hệ thống, bạn PHẢI trả lời đúng theo PHOM dưới đây, giữ nguyên đủ 3 mục. 
2. Mỗi mục tối đa 1–3 câu ngắn, mỗi câu tối đa khoảng 20–25 từ.
3. Không được kể chuyện, không diễn giải lý thuyết, không chèn thêm ví dụ lan man.
4. Không được bịa link, số liệu, lệ phí. Nếu thiếu dữ liệu thì ghi rõ "Theo quy định hiện hành, vui lòng xem chi tiết tại link thủ tục".
5. Tổng câu trả lời nên ngắn gọn, dễ đọc, ưu tiên liệt kê gạch đầu dòng.

📌 PHOM TRẢ LỜI THỦ TỤC (BẮT BUỘC GIỮ NGUYÊN 3 MỤC SAU):

===== THỦ TỤC: <ten_thu_tuc> =====
1. Cơ quan giải quyết:
- Ghi rõ cơ quan, nếu không có dữ liệu thì ghi: "Theo quy định tại Cổng Dịch vụ công".

2. Hồ sơ cơ bản cần chuẩn bị:
- Liệt kê 3–6 gạch đầu dòng ngắn gọn (tối đa 1 câu/ý).
- Nếu không có dữ liệu chi tiết, hãy ghi: "Hồ sơ chi tiết vui lòng xem tại link thủ tục".

3. Link chi tiết & mẫu đơn:
- Nếu có, ghi: "Link chi tiết thủ tục: <link_chi_tiet_thu_tuc>".
- Nếu có mẫu đơn, ghi: "Mẫu: <ten_mau_1> – tải tại: <link_mau_1>".
- Nếu thiếu thông tin, ghi rõ: "Vui lòng tra cứu thêm tại Cổng Dịch vụ công hoặc liên hệ bộ phận Một cửa ${TEN_XA}".

Nếu KHÔNG tìm thấy thủ tục phù hợp với câu hỏi, hãy trả lời rất ngắn gọn, đề nghị người dân:
- Gõ đúng tên thủ tục (vd: "đăng ký khai sinh", "đổi giấy phép lái xe")
- Hoặc cung cấp nhiều từ khóa hơn để hệ thống tra cứu chính xác.
`;

// ================== CACHE GOOGLE SHEET ==================
let cacheData = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

async function loadData() {
  if (!SHEET_URL) {
    console.error("Thiếu biến môi trường TTHC_SHEET_URL");
    return [];
  }

  const now = Date.now();
  if (cacheData && now - lastFetch < CACHE_TTL) {
    return cacheData;
  }

  const res = await fetch(SHEET_URL);
  if (!res.ok) {
    console.error("Lỗi tải CSV từ Google Sheet", res.status, res.statusText);
    return [];
  }

  const csv = await res.text();
  const lines = csv.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const data = lines.slice(1).map((row) => {
    const cols = row.split(",");
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cols[i] || "").trim();
    });
    return obj;
  });

  cacheData = data;
  lastFetch = now;
  return data;
}

// ================== TÌM THỦ TỤC PHÙ HỢP ==================
function findProcedure(message, data) {
  if (!message || !data || data.length === 0) return null;

  const text = message.toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const row of data) {
    const ten = (row.ten_thu_tuc || "").toLowerCase();
    const ma = (row.ma_thu_tuc || "").toLowerCase();
    const tuKhoaRaw = (row.tu_khoa_tim_kiem || "").toLowerCase();

    if (!ten && !tuKhoaRaw && !ma) continue;

    let score = 0;

    // trùng tên thủ tục
    if (ten && text.includes(ten)) score += 5;

    // trùng mã thủ tục
    if (ma && text.includes(ma)) score += 3;

    // trùng từ khóa
    const tuKhoaList = tuKhoaRaw
      .split(/[;,.\/|]/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const kw of tuKhoaList) {
      if (kw && text.includes(kw)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  // ngưỡng tối thiểu để coi là "khớp"
  if (bestScore === 0) return null;
  return best;
}

// ================== TẠO CONTEXT CHO MODEL ==================
function buildContextFromRow(row) {
  if (!row) return "Không tìm thấy dữ liệu thủ tục phù hợp trong bảng.";

  const ma = row.ma_thu_tuc || "";
  const ten = row.ten_thu_tuc || "";
  const tuKhoa = row.tu_khoa_tim_kiem || "";
  const linkThuTuc = row.link_chi_tiet_thu_tuc || "";
  const tenMau1 = row.ten_mau_1 || "";
  const linkMau1 = row.link_mau_1 || "";
  const ghiChu = row.ghi_chu || "";

  return `
Dữ liệu thủ tục lấy từ Google Sheet (KHÔNG ĐƯỢC BỊA THÊM):

- Mã thủ tục: ${ma}
- Tên thủ tục: ${ten}
- Từ khóa tìm kiếm: ${tuKhoa}
- Link chi tiết thủ tục: ${linkThuTuc || "chưa có trong sheet"}
- Mẫu 1: ${tenMau1 || "không có dữ liệu"}
- Link mẫu 1: ${linkMau1 || "không có dữ liệu"}
- Ghi chú: ${ghiChu || "không có"}

Hãy dùng PHOM TRẢ LỜI để trả lời ngắn gọn cho người dân.
`;
}

// ================== HANDLER CHÍNH (Vercel API) ==================
export default async function handler(req, res) {
  // CORS đơn giản
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chỉ hỗ trợ phương thức POST" });
  }

  try {
    const { message } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Thiếu 'message' trong body" });
    }

    // 1. Load dữ liệu thủ tục từ Google Sheet
    const data = await loadData();

    // 2. Tìm thủ tục phù hợp
    const matched = findProcedure(message, data);

    // Nếu không tìm thấy -> trả lời tay, không cần gọi OpenAI
    if (!matched) {
      return res.status(200).json({
        answer:
          `Em chưa tìm được thủ tục phù hợp với câu hỏi của anh/chị.\n\n` +
          `Anh/chị vui lòng:\n` +
          `- Gõ rõ tên thủ tục (vd: "đăng ký khai sinh", "đổi giấy phép lái xe")\n` +
          `- Hoặc thêm vài từ khóa cụ thể hơn để hệ thống tra cứu chính xác.\n\n` +
          `Hoặc truy cập Cổng dịch vụ công để tra cứu trực tiếp.`,
      });
    }

    const context = buildContextFromRow(matched);

    // 3. Gọi OpenAI tạo câu trả lời NGẮN GỌN THEO PHOM
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Đây là câu hỏi của người dân: """${message}""" ` +
            `\n\nĐây là dữ liệu thủ tục khớp nhất trong bảng:\n${context}\n\n` +
            `Hãy trả lời đúng theo PHOM, ngắn gọn, không vượt quá khoảng 200–250 từ.`,
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });

    const answer = completion.choices[0]?.message?.content?.trim() || "";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error("Lỗi handler:", err);
    return res.status(500).json({
      error: "Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại sau.",
    });
  }
}
