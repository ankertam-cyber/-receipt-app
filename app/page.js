'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Trash2, Loader2, AlertCircle, CheckCircle, Edit, Eraser, FileDown, FileSpreadsheet } from 'lucide-react';
import localforage from 'localforage';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
if (typeof window !== 'undefined') {
  localforage.config({ name: 'ReceiptManager', storeName: 'receipts_store' });
}
export default function Home() {
  const [receipts, setReceipts] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [editModal, setEditModal] = useState({ isOpen: false, data: {} });
  const [imageModal, setImageModal] = useState({ isOpen: false, src: '' });
  const [clearModalOpen, setClearModalOpen] = useState(false);

  const fileInputRef = useRef(null);
  const pdfContainerRef = useRef(null);
  useEffect(() => {
    const loadData = async () => {
      try {
        const stored = await localforage.getItem('receipts');
        if (stored && Array.isArray(stored)) {
          const normalized = stored.map(r => ({ ...r, project: r.project || "", category: r.category || "未分類" }));
          setReceipts(normalized.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        }
      } catch (err) {
        showMessage('error', '無法讀取本地資料。');
      }
    };
    loadData();
  }, []);
  const showMessage = (type, text) => {
    setMessage({ type, text });
    if(type === 'success') setTimeout(() => setMessage({ type: '', text: '' }), 4000);
  };
  const saveData = async (newData) => {
    try {
      const sorted = [...newData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      await localforage.setItem('receipts', sorted);
      setReceipts(sorted);
    } catch (err) {
      throw new Error("儲存失敗，可能空間不足。");
    }
  };
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1024;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else { width = Math.round(width * MAX / height); height = MAX; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
    };
  });
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showMessage('error', '請上傳圖片。');
    if (file.size > 20 * 1024 * 1024) return showMessage('error', '圖片不能超過 20MB。');
    setIsUploading(true);
    setMessage({ type: '', text: '' });
    try {
      const base64Full = await compressImage(file);

      if (receipts.some(r => r.base64Image === base64Full)) {
        throw new Error("圖片已存在列表中，已攔截重複上傳。");
      }
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: base64Full, mimeType: 'image/jpeg' })
      });
      const parsed = await res.json();
      if (!res.ok) throw new Error(parsed.details || parsed.error || "解析失敗");
      // Validate receipt date: must be YYYY-MM-DD format; fall back to upload date only if null/invalid
      const isValidDate = (d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d).getTime());
      const newDate = isValidDate(parsed.date) ? parsed.date : (() => {
        // Try to coerce non-standard format (e.g. "09/07/2026" → parse → reformat)
        const attempt = parsed.date ? new Date(parsed.date) : null;
        return (attempt && !isNaN(attempt.getTime())) ? attempt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      })();
      const newMerchant = parsed.merchant || "未辨識商家";
      const newAmount = Number(parsed.amount) || 0;
      if (receipts.some(r => r.date === newDate && r.merchant === newMerchant && r.amount === newAmount)) {
        throw new Error(`發現重複單據：${newDate} 於 ${newMerchant} 消費 $${newAmount}。`);
      }
      const newReceipt = {
        id: crypto.randomUUID(), date: newDate, uploadedAt: new Date().toISOString(),
        project: parsed.project || "",
        category: parsed.category || "未分類", merchant: newMerchant, amount: newAmount, base64Image: base64Full,
      };
      await saveData([...receipts, newReceipt]);
      showMessage('success', '✅ 單據解析成功！');
    } catch (err) {
      showMessage('error', err.message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const handleDelete = async (id) => {
    try { await saveData(receipts.filter(r => r.id !== id)); showMessage('success', '單據已刪除。'); }
    catch (err) { showMessage('error', '刪除失敗。'); }
  };
  const exportExcel = () => {
    try {
      let csvContent = "﻿";
      csvContent += "日期,Project (項目),種類,價錢,商家(備註)\n";
      receipts.forEach(r => { csvContent += `"${r.date}","${r.project.replace(/"/g, '""')}","${r.category.replace(/"/g, '""')}",${r.amount},"${r.merchant.replace(/"/g, '""')}"\n`; });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `月結報銷單_${new Date().toISOString().split('T')[0]}.csv`; link.click();
      showMessage('success', '✅ Excel 檔案已下載。');
    } catch (err) { showMessage('error', 'Excel 匯出失敗。'); }
  };
  const exportPDF = async () => {
    setIsExportingPDF(true);
    try {
      const doc = new jsPDF();
      const canvas = await html2canvas(pdfContainerRef.current, { scale: 2, useCORS: true });
      const tableImgData = canvas.toDataURL('image/png');

      const margin = 14; const pdfWidth = doc.internal.pageSize.getWidth() - (margin * 2);
      const imgProps = doc.getImageProperties(tableImgData);
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      doc.addImage(tableImgData, 'PNG', margin, 20, pdfWidth, pdfHeight);
      let currentY = 20, col = 0, rowMaxHeight = 0;
      const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight();
      const colWidth = (pageWidth - margin * 2 - 10) / 2;
      for (let i = 0; i < receipts.length; i++) {
        const r = receipts[i]; if (!r.base64Image) continue;
        if (i === 0) { doc.addPage(); doc.setFontSize(16); doc.text("Receipt Attachments", margin, 18); currentY = 28; }
        const imgP = doc.getImageProperties(r.base64Image);
        let finalWidth = colWidth; let finalHeight = (imgP.height * finalWidth) / imgP.width;
        const maxHeight = (pageHeight - margin * 2) / 2.2;
        if (finalHeight > maxHeight) { finalHeight = maxHeight; finalWidth = (imgP.width * finalHeight) / imgP.height; }
        if (currentY + finalHeight + 15 > pageHeight - margin) {
          if (col === 1) { doc.addPage(); currentY = 20; col = 0; rowMaxHeight = 0; }
          else if (col === 0 && currentY > margin + 15) { doc.addPage(); currentY = 20; rowMaxHeight = 0; }
        }
        const currentX = margin + col * (colWidth + 10);
        doc.setFontSize(11); doc.text(`Attachment ${i + 1} - ${r.date}`, currentX, currentY - 3);
        doc.addImage(r.base64Image, 'JPEG', currentX + (colWidth - finalWidth) / 2, currentY, finalWidth, finalHeight);
        if (finalHeight > rowMaxHeight) rowMaxHeight = finalHeight;
        col++; if (col === 2) { col = 0; currentY += rowMaxHeight + 15; rowMaxHeight = 0; }
      }
      doc.save(`月結單據_${new Date().toISOString().split('T')[0]}.pdf`);
      showMessage('success', '✅ PDF 下載成功！');
    } catch (err) { showMessage('error', 'PDF 匯出失敗：' + err.message); } finally { setIsExportingPDF(false); }
  };
  const totalSum = receipts.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 relative overflow-x-hidden font-sans">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 relative">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white flex flex-col md:flex-row justify-between items-center gap-4">
          <div><h1 className="text-2xl font-bold flex items-center gap-2"><FileText /> 單據管理與報銷系統</h1></div>
          <div className="text-right"><p className="text-sm text-blue-200">本月累計金額</p><p className="text-3xl font-bold">${totalSum.toLocaleString()}</p></div>
        </div>
        {message.type && (
          <div className={`p-4 m-6 border-l-4 flex items-start gap-3 rounded-r-md ${message.type === 'error' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-green-50 border-green-500 text-green-700'}`}>
            {message.type === 'error' ? <AlertCircle className="mt-0.5 w-5 h-5" /> : <CheckCircle className="mt-0.5 w-5 h-5" />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}
        <div className="p-6 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center bg-gray-50/50">
          <div>
            <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" ref={fileInputRef} />
            <button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="flex items-center gap-2 bg-white border-2 border-dashed border-blue-400 text-blue-600 px-6 py-3 rounded-xl hover:bg-blue-50 transition-colors font-medium shadow-sm">
              {isUploading ? <Loader2 className="animate-spin" /> : <Upload />}{isUploading ? '解析中...' : '上傳單據'}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setClearModalOpen(true)} disabled={!receipts.length} className="flex items-center gap-2 bg-white border border-red-200 text-red-500 px-4 py-3 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50 font-medium"><Eraser /> 新月份清除</button>
            <button onClick={exportExcel} disabled={!receipts.length} className="flex items-center gap-2 bg-green-600 text-white px-5 py-3 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 font-medium shadow-md"><FileSpreadsheet /> 匯出 Excel</button>
            <button onClick={exportPDF} disabled={!receipts.length || isExportingPDF} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium shadow-md">{isExportingPDF ? <Loader2 className="animate-spin" /> : <FileDown />} 匯出 PDF</button>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm uppercase">
                <th className="p-4">序號</th><th className="p-4">縮圖</th><th className="p-4">日期</th><th className="p-4 text-blue-600">Project</th><th className="p-4 text-indigo-600">種類</th><th className="p-4">商家</th><th className="p-4 text-right">金額</th><th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {receipts.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="p-4 text-gray-500">#{i + 1}</td>
                  <td className="p-4"><img src={r.base64Image} onClick={() => setImageModal({ isOpen: true, src: r.base64Image })} className="w-12 h-12 object-cover rounded cursor-pointer border hover:opacity-80" alt="receipt" /></td>
                  <td className="p-4">{r.date}</td>
                  <td className="p-4">{r.project ? <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">{r.project}</span> : '-'}</td>
                  <td className="p-4"><span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-xs">{r.category}</span></td>
                  <td className="p-4">{r.merchant}</td>
                  <td className="p-4 font-bold text-right">${r.amount.toLocaleString()}</td>
                  <td className="p-4 text-right">
                    <button onClick={() => setEditModal({ isOpen: true, data: r })} className="text-blue-500 p-2 hover:bg-blue-50 rounded-lg mr-1"><Edit size={18} /></button>
                    <button onClick={() => handleDelete(r.id)} className="text-red-400 p-2 hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div ref={pdfContainerRef} style={{ position: 'absolute', left: '-9999px', top: 0, width: '1000px', background: 'white', padding: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '5px', color: '#1f2937' }}>月結單據總表 (Monthly Statement)</h1>
        <p style={{ fontSize: '16px', color: '#4b5563', marginBottom: '20px' }}>建立日期: {new Date().toISOString().split('T')[0]}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead><tr style={{ backgroundColor: '#2563eb', color: 'white' }}><th style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'left', width: '50px' }}>序號</th><th style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'left', width: '120px' }}>日期</th><th style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'left' }}>Project</th><th style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'left' }}>種類</th><th style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'left' }}>商家</th><th style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'right', width: '100px' }}>金額</th></tr></thead>
          <tbody>
            {receipts.map((r, i) => (
              <tr key={r.id} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                <td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#4b5563' }}>{i + 1}</td><td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#111827' }}>{r.date}</td><td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#2563eb', fontWeight: 500 }}>{r.project || '-'}</td><td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#4f46e5' }}>{r.category}</td><td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#4b5563' }}>{r.merchant}</td><td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#111827', textAlign: 'right', fontWeight: 'bold' }}>${r.amount.toLocaleString()}</td>
              </tr>
            ))}
            <tr><td colSpan="5" style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f3f4f6' }}>總計</td><td style={{ padding: '10px', border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 'bold', fontSize: '16px', color: '#2563eb', backgroundColor: '#f3f4f6' }}>${totalSum.toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>
      {editModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center"><h3 className="font-bold flex items-center gap-2"><Edit size={18}/> 修改資料</h3><button onClick={() => setEditModal({ isOpen: false, data: {} })} className="text-white hover:text-gray-200 text-xl">&times;</button></div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-gray-600 mb-1">日期</label><input type="date" value={editModal.data.date} onChange={e => setEditModal({...editModal, data: {...editModal.data, date: e.target.value}})} className="w-full border rounded p-2" /></div>
                <div><label className="block text-sm text-gray-600 mb-1">金額</label><input type="number" value={editModal.data.amount} onChange={e => setEditModal({...editModal, data: {...editModal.data, amount: Number(e.target.value)}})} className="w-full border rounded p-2" /></div>
              </div>
              <div><label className="block text-sm text-blue-600 font-semibold mb-1">Project</label><input type="text" value={editModal.data.project} onChange={e => setEditModal({...editModal, data: {...editModal.data, project: e.target.value}})} className="w-full border border-blue-300 rounded p-2" /></div>
              <div><label className="block text-sm text-indigo-600 font-semibold mb-1">種類</label><input type="text" value={editModal.data.category} onChange={e => setEditModal({...editModal, data: {...editModal.data, category: e.target.value}})} className="w-full border border-indigo-300 rounded p-2" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">商家</label><input type="text" value={editModal.data.merchant} onChange={e => setEditModal({...editModal, data: {...editModal.data, merchant: e.target.value}})} className="w-full border rounded p-2" /></div>
            </div>
            <div className="bg-gray-50 p-4 flex gap-3 justify-end"><button onClick={() => setEditModal({ isOpen: false, data: {} })} className="px-4 py-2 hover:bg-gray-200 rounded">取消</button><button onClick={async () => { await saveData(receipts.map(r => r.id === editModal.data.id ? editModal.data : r)); setEditModal({ isOpen: false, data: {} }); showMessage('success', '資料已更新'); }} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">儲存</button></div>
          </div>
        </div>
      )}
      {clearModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center">
            <h3 className="text-xl font-bold text-gray-800 mb-2 text-red-600">清除所有單據？</h3><p className="text-gray-600 text-sm mb-6">資料將無法復原，請確認已匯出 PDF/Excel。</p>
            <div className="flex gap-3 justify-center"><button onClick={() => setClearModalOpen(false)} className="flex-1 bg-gray-100 px-4 py-2 rounded-lg">取消</button><button onClick={async () => { await saveData([]); setClearModalOpen(false); showMessage('success', '已清空資料'); }} className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg">確認清除</button></div>
          </div>
        </div>
      )}
      {imageModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"><button onClick={() => setImageModal({ isOpen: false, src: '' })} className="absolute top-4 right-4 text-white text-3xl">&times;</button><img src={imageModal.src} className="max-w-full max-h-[90vh] object-contain rounded" alt="preview" /></div>
      )}
    </div>
  );
}
