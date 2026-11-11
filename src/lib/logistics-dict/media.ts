/** קישורי Drive ציבוריים + טיפוסי מדיה לפקודות NotebookLM */

export type MediaItem = {
  id: string;
  name: string;
  publicUrl: string;
  previewUrl: string;
  source: "drive" | "upload" | "url";
};

export function extractDriveFileId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  if (!s) return null;
  const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/) || s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m?.[1] && m[1].length > 15) return m[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return s;
  return null;
}

export function drivePublicUrls(fileId: string) {
  return {
    view: `https://drive.google.com/uc?export=view&id=${fileId}`,
    open: `https://drive.google.com/file/d/${fileId}/view`,
  };
}

export const PHOTO_FALLBACK = `--- יצירת תמונות (אין תמונה מצורפת) ---
צור/י תמונות קרובות מאוד למציאות — צילום מקצועי טבעי, לא הדמיה:
• אתר בנייה ישראלי באור יום רך, חומרי גלם על משטח
• משאית מנוף בחזית אתר, בלי לוגואים בדויים
• תקריב ידיים עם כפפות ליד שקי מלט
סגנון: documentary / editorial, עומק שדה טבעי, גרגיר קל
אסור: מראה AI, עור פלסטיק, טקסט מעוות, סצנה פנטסטית`;

export const DEFAULT_STYLE = `סגנון Stone Industrial Hebrew (ח. סבן):
חומר: אבן חול #E8E2D8 + בטון עדין · טקסט #1C1917 · אמרלד #0F766E
תאורה רכה טבעית · RTL · כותרות כבדות
NotebookLM: slide-deck presenter · video style heritage/classic
ויזואל: צילום אמיתי מקצועי בלבד — לא הדמיה, לא CGI
אסור: סטוק גנרי מוגזם, גרדיאנט צעקני, מספרים מומצאים`;

export function buildMediaBlock(media: MediaItem[], imageNote: string): string {
  const lines = ["--- מדיה ל-NotebookLM (תיקייה ציבורית / Drive) ---"];
  const withUrl = media.filter((m) => m.publicUrl);
  const localOnly = media.filter((m) => !m.publicUrl);
  if (withUrl.length) {
    lines.push("קישורים ציבוריים לשימוש בשקפים / וידאו:");
    withUrl.forEach((m, i) => lines.push(`${i + 1}. ${m.name}: ${m.publicUrl}`));
    lines.push("השתמש בקישורים כרקע/המחשה בלבד; אל תשנה מספרי KPI.");
  }
  if (localOnly.length) {
    lines.push("קבצים מקומיים (להעלות ל-NotebookLM כ-source או ל-Drive ציבורי):");
    localOnly.forEach((m, i) => lines.push(`${i + 1}. ${m.name}`));
  }
  if (imageNote.trim()) lines.push(`הנחיית שימוש: ${imageNote.trim()}`);
  if (!withUrl.length && !localOnly.length) lines.push(PHOTO_FALLBACK);
  return lines.join("\n");
}
