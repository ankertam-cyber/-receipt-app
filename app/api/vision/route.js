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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `你係一個收據解析助手。分析這張圖片（可以是手寫單據、打印收據、或手機app截圖如Uber）。
只回傳一個JSON物件，不要任何其他文字或Markdown：
{"date":"YYYY-MM-DD","project":"","category":"交通","merchant":"Uber","amount":0}

提取規則：
- date: 單據上的交易日期或收據日期，格式必須為YYYY-MM-DD。仔細查找圖片中的所有日期資訊（包括頁眉、頁腳、時間戳記等位置）。若圖片上真的完全找不到任何日期資訊，填null。
- category: 餐飲/交通/住宿/文具/雜項 其中一個
- merchant: 商家或服務名稱（如Uber、McDonald's等）
- amount: 純數字金額，不含貨幣符號
- 若係Uber/Grab/打車截圖，category填交通，merchant填Uber或Grab

必須只回傳JSON，例如：{"date":"2024-01-15","project":"","category":"交通","merchant":"Uber","amount":85.5}`;
    const base64Data = base64Image.split(',')[1] || base64Image;
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType || 'image/jpeg' } };
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    let jsonString = responseText.replace(/```json\n?|```\n?/g, '').trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsedData = JSON.parse(jsonMatch[0]);
      return NextResponse.json(parsedData);
    }
    // Gemini returned text instead of JSON — extract what we can
    const dateMatch = responseText.match(/\d{4}-\d{2}-\d{2}/);
    const amountMatch = responseText.match(/\d+\.?\d*/);
    const isTransport = /uber|grab|taxi|lyft|transport|交通/i.test(responseText);
    console.warn('Non-JSON from Gemini:', responseText.substring(0, 300));
    return NextResponse.json({
      date: dateMatch ? dateMatch[0] : null, project: '',
      category: isTransport ? '交通' : '雜項',
      merchant: isTransport ? 'Uber' : '未辨識',
      amount: amountMatch ? parseFloat(amountMatch[0]) : 0,
    });
  } catch (error) {
    console.error('Vision API Error:', error.message);
    return NextResponse.json({ error: error.message, details: error.stack?.substring(0, 300) }, { status: 500 });
  }
}
