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
<<< ANH DÁN BỘ NÃO PRO Ở ĐÂY >>>
`;

// ====== CACHE GOOGLE SHEET ======
let cache = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadData() {
  const now = Date.now();

  if (cache && now - lastFetch < CACHE_TTL) return cache;

  const res = await fetch(SHEET_URL);
  const csv = await res.text();
  const lines = csv.split("\n").filter(Boolean);

  const header = lines[0].split(",").map(h => h.trim());
  const data = lines.slice(1).map(row => {
    const cols = row.split(",");
    const item = {};
    header.forEach((h, i) => item[h] = (cols[i] || "").trim());
    return item;
  });

  cache = data;
  lastFetch = now;
  return data;
}

function findProcedure(question, data) {
  if (!question || !data.length) return null;

  const q = question.toLowerCase();

  return data.find(item =>
    item.ten_thu_tuc?.toLowerCase().includes(q) ||
    item.ma_thu_tuc?.toLowerCase().includes(q) ||
    (item.tu_khoa_tim_kiem || "")
      .toLowerCase()
      .split(";")
      .some(k => q.includes(k.trim()))
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

    let CONTEXT = "Không tìm thấy thủ tục phù hợp trong dữ liệu.";

    if (matched) {
      CONTEXT = `
Mã thủ tục: ${matched.ma_thu_tuc}
Tên: ${matched.ten_thu_tuc}
Link gốc: ${matched.link_chi_tiet_thu_tuc}
Mẫu đơn 1: ${matched.ten_mau_1} – ${matched.link_mau_1}
Ghi chú: ${matched.ghi_chu}
`;
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content: `Dưới đây là dữ liệu từ Google Sheet của ${TEN_XA}:\n` + CONTEXT,
        },
        { role: "user", content: message },
      ],
    });

    return res.status(200).json({
      answer: completion.choices[0]?.message?.content || "Empty response",
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
