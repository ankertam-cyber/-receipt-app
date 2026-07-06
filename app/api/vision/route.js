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
    const prompt = `分析這張單據/收據/發票/app截圖，提取資訊並只回傳一個 JSON 物件，不要任何其他文字：
    {"date":"YYYY-MM-DD","project":"專案名稱(無則留空)","category":"種類(餐飲/交通/住宿/文具/雜項)","merchant":"商家名稱","amount":數字}
    規則：
    1. 若係 Uber/Grab/打車 app 截圖，merchant 填 Uber/Grab 等，amount 填總金額數字。
    2. 若無具體日期，回傳今天日期。
    3. amount 只填數字，不含貨幣符號。
    4. 只回傳 JSON，不要任何解釋或 Markdown。`;
    const base64Data = base64Image.split(',')[1] || base64Image;
    const imagePart = { inlineData: { data: base64Data, mimeType: mimeType || 'image/jpeg' } };
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();
    let jsonString = responseText.replace(/```json\n?|```/g, '').trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonString = jsonMatch[0];
    const parsedData = JSON.parse(jsonString);
    return NextResponse.json(parsedData);
  } catch (error) {
    console.error('Vision API Error:', error);
    return NextResponse.json({ error: '圖片解析失敗', details: error.message }, { status: 500 });
  }
}
