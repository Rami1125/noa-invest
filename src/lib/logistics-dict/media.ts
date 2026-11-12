/**
 * מנוע מדיה ותמונות מקצועי (4 רמות עדיפות + מדיניות AI מחמירה) + קישורי Drive ציבוריים
 */

export type MediaPriorityTier = "manufacturer_official" | "real_product_photo" | "real_site_photo" | "ai_illustration";

export type MediaItem = {
  id: string;
  name: string;
  publicUrl: string;
  previewUrl: string;
  source: "drive" | "upload" | "url";
  tier?: MediaPriorityTier;
};

export const MEDIA_TIER_LABELS: Record<MediaPriorityTier, string> = {
  manufacturer_official: "1. תמונת מוצר רשמית של היצרן",
  real_product_photo: "2. צילום אמיתי של המוצר",
  real_site_photo: "3. צילום מקצועי של סביבת עבודה אמיתית",
  ai_illustration: "4. תמונת AI להמחשה חזותית בלבד",
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

export const PHOTO_STYLE_DIRECTIVE =
  "Professional architectural photography, documentary editorial, natural daylight, realistic material textures, authentic Israeli construction environments, controlled depth of field.";

export const PHOTO_FALLBACK = `--- מדיניות תמונות (אין תמונה מצורפת — סדר עדיפויות 4: המחשה חזותית AI בלבד) ---
• סיווג מחייב: כאשר אין תמונת יצרן רשמית או צילום אמיתי, יש להגדיר במפורש שמדובר בהמחשה חזותית בלבד.
• אסור להציג תמונת AI כתמונת מוצר רשמית.
• אסור להמציא לוגו, תווית, אריזה או טקסט מסחרי על גבי המוצר, ואין לעוות את מראה המוצר.
• סצנות בנייה ישראליות אותנטיות, תאורה טבעית וחומרים בעלי מרקם אמיתי (אבן חול, בטון, שקי מלט מסודרים).
• סגנון צילום: ${PHOTO_STYLE_DIRECTIVE}`;

export const DEFAULT_STYLE = `סגנון PREMIUM ARCHITECTURAL EDITORIAL (ח. סבן):
פלטה: לבן #FFFFFF · כחול עמוק #15324B · תכלת #DCEAF3 · בטון #858B91 · אבן טבעית #E8E2D8 · טקסט #1C2732 · אמרלד #0F766E
תאורה טבעית · עברית RTL · טיפוגרפיה כבדה וקריאה · מרווחים נדיבים
NotebookLM: slide-deck presenter · video style heritage/classic
ויזואל: צילום מקצועי אמיתי בלבד (תיעוד אדריכלי) — ללא CGI צעקני או סטוק גנרי`;

export function buildMediaBlock(media: MediaItem[], imageNote: string): string {
  const lines = [
    "--- מנוע תמונות ומדיה ל-NotebookLM ---",
    "סדר עדיפויות מחייב: 1) תמונת יצרן רשמית ← 2) צילום מוצר אמיתי ← 3) צילום סביבת עבודה אמיתית ← 4) המחשה חזותית AI בלבד.",
  ];
  const withUrl = media.filter((m) => m.publicUrl);
  const localOnly = media.filter((m) => !m.publicUrl);
  if (withUrl.length) {
    lines.push("קישורים ציבוריים מאושרים לשימוש:");
    withUrl.forEach((m, i) => {
      const tierLabel = m.tier ? ` [${MEDIA_TIER_LABELS[m.tier]}]` : "";
      lines.push(`${i + 1}. ${m.name}${tierLabel}: ${m.publicUrl}`);
    });
    lines.push("השתמש בתמונות כהמחשה/רקע בלבד; אין להמציא תכונות מוצר על בסיס תמונה בלבד ואין לשנות מספרי KPI.");
  }
  if (localOnly.length) {
    lines.push("קבצים מקומיים (להעלאה ל-NotebookLM כ-source או ל-Drive ציבורי):");
    localOnly.forEach((m, i) => {
      const tierLabel = m.tier ? ` [${MEDIA_TIER_LABELS[m.tier]}]` : "";
      lines.push(`${i + 1}. ${m.name}${tierLabel}`);
    });
  }
  if (imageNote.trim()) lines.push(`הנחיית שימוש במדיה: ${imageNote.trim()}`);
  if (!withUrl.length && !localOnly.length) lines.push(PHOTO_FALLBACK);
  return lines.join("\n");
}
