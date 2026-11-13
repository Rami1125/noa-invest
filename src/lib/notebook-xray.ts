/**
 * notebook-xray — constants + TTS polish for /notebook
 */
import { Users, FileText, MapPin, Truck } from "lucide-react";

export const TABS = [
  { id: "customers", label: "לקוחות מאוחדים", icon: Users },
  { id: "notes", label: "תעודות משלוח", icon: FileText },
  { id: "sites", label: "אתרי אספקה", icon: MapPin },
  { id: "pto", label: "מנוף איתוראן PTO", icon: Truck },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export const CHART_COLORS = [
  "#06b6d4", // cyan-500
  "#10b981", // emerald-500
  "#8b5cf6", // purple-500
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
];

export const PTO_ALERT_MIN = 20;

/** המרת מספרים למילים בעברית לקריינות TTS טבעית */
export function numHe(n: number): string {
  const abs = Math.round(Math.abs(n));
  const ones = ["אפס","אחת","שתיים","שלוש","ארבע","חמש","שש","שבע","שמונה","תשע"];
  const tens = ["","עשר","עשרים","שלושים","ארבעים","חמישים","שישים","שבעים","שמונים","תשעים"];
  if (abs <= 9) return ones[abs] ?? String(abs);
  if (abs === 10) return "עשר";
  if (abs < 20) {
    const teens: Record<number, string> = { 11: "אחת־עשרה", 12: "שתים־עשרה", 13: "שלוש־עשרה", 14: "ארבע־עשרה", 15: "חמש־עשרה", 16: "שש־עשרה", 17: "שבע־עשרה", 18: "שמונה־עשרה", 19: "תשע־עשרה" };
    return teens[abs] ?? String(abs);
  }
  if (abs < 100) {
    const t = Math.floor(abs / 10);
    const o = abs % 10;
    return o === 0 ? (tens[t] ?? String(abs)) : `${tens[t]} ו${ones[o]}`;
  }
  if (abs < 1000) {
    const h = Math.floor(abs / 100);
    const rest = abs % 100;
    const hundreds = h === 1 ? "מאה" : h === 2 ? "מאתיים" : `${ones[h]} מאות`;
    return rest === 0 ? hundreds : `${hundreds} ו${numHe(rest)}`;
  }
  return String(abs);
}

export function pluralHe(n: number, one: string, many: string): string {
  return n === 1 ? `${numHe(1)} ${one}` : `${numHe(n)} ${many}`;
}

/** ניקוי טקסט לקריינות: מספרים למילים + הסרת אימוג'ים וסימני פקודה */
export function polishForTts(raw: string): string {
  let t = raw;
  const voiceMatch = t.match(/🎙️[^\n]*:\s*\n?"([\s\S]*?)"\s*$/);
  if (voiceMatch?.[1]) t = voiceMatch[1];
  else {
    const q = t.match(/"([\s\S]+)"/);
    if (q?.[1]) t = q[1];
  }
  t = t.replace(/[🎙️📦👷♂️•#*_`]/g, " ");
  t = t.replace(/\((\d+)\)/g, " $1 ");
  t = t.replace(/\b(\d{1,3})\b/g, (_, n) => numHe(Number(n)));
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
