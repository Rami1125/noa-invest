// Vercel Serverless Function — מתווך בין דף הנחיתה לשרת Apps Script.
// מפתח ה-API נשאר בצד השרת בלבד (Environment Variables ב-Vercel):
//   APPS_SCRIPT_URL  = כתובת ה-Web App (…/exec)
//   NOA_API_KEY      = אותו ערך כמו API_KEY ב-Script Properties
const MAX_B64 = 4400000; // ~3.2MB קובץ
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const note = String(b.noteNumber || '');
    if (!/^[0-9A-Za-z-]{1,20}$/.test(note)) return res.status(400).json({ ok: false, message: 'מספר תעודה לא תקין' });
    if (!b.token || String(b.token).length > 400) return res.status(400).json({ ok: false, message: 'קישור לא תקף' });
    if (!MIMES.includes(b.mimeType)) return res.status(400).json({ ok: false, message: 'סוג קובץ לא נתמך' });
    if (!b.fileBase64 || String(b.fileBase64).length > MAX_B64) return res.status(413).json({ ok: false, message: 'הקובץ גדול מדי (עד 3MB)' });

    const r = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      body: JSON.stringify({
        action: 'landing_upload', key: process.env.NOA_API_KEY,
        noteNumber: note, token: b.token, freq: String(b.freq || '2'),
        reason: String(b.reason || '').slice(0, 1000),
        mimeType: b.mimeType, fileBase64: b.fileBase64
      })
    });
    const data = await r.json();
    return res.status(200).json({ ok: !!data.ok, partial: !!data.partial, steps: data.steps || [], message: data.message || data.error || '' });
  } catch (e) {
    return res.status(502).json({ ok: false, message: 'השרת לא זמין, נסה שוב בעוד רגע' });
  }
};
