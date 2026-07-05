import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { base64Image, mimeType } = await req.json();
    if (!base64Image) {
      return NextResponse.json({ error: '缺少圖片資料' }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: '伺服器缺少 GEMINI_API_KEY 環境變數' }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `請分析這張單據/發票圖片，提取以下資訊並嚴格以 JSON 格式回傳：
    {
      "date": "YYYY-MM-DD",
      "project": "專案/客戶名稱 (如無明顯標示請留空)",
      "category": "單據種類 (例如: 餐飲、交通、文具、住宿、雜項)",
      "merchant": "商家名稱",
      "amount": 數字
    }
    規則：
    1. 若無具體日期請推測，或回傳當天日期。
    2. 總金額僅需數字，不含貨幣符號。
    3. 嚴格回傳 JSON，不要任何 Markdown 標籤。`;
    const base64Data = base64Image.split(',')[1] || base64Image;
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType || 'image/jpeg' } };
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    const jsonString = responseText.replace(/```json\n?|```/g, '').trim();
    const parsedData = JSON.parse(jsonString);
    return NextResponse.json(parsedData);
  } catch (error) {
    console.error('Vision API Error:', error);
    return NextResponse.json({ error: '圖片解析失敗', details: error.message }, { status: 500 });
  }
}
