/**
 * NOA MEDIA STUDIO — סטודיו מדיה ו-Google Drive
 * ממשק מקצועי לחיפוש תמונות מוצרים, העלאה ל-Google Drive, הפקת קישורים ישירים והזרקה לגיליון סבן
 *
 * ארגון: ח. סבן חומרי בניין (1994) בע"מ | סניף התלמיד 6 הוד השרון
 * תיקיית דרייב ציבורית: 1mb48kxT-9k5mYb356BtTJN6j9bjvPREG
 * מנוע חיפוש גוגל מותאם (CSE): 1340c66f5e73a4076
 * גיליון יעד: בדיקת תעודות משלוח- (1FsLseQrKbIj_AvlE6-dW4J12Gr88P3uaoFVBjEcUjsw)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Search,
  Upload,
  Image as ImageIcon,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  FolderOpen,
  Eye,
  Send,
  FileSpreadsheet,
  Building2,
  Package,
  ArrowUpRight,
  Globe,
} from "lucide-react";
import {
  SABAN_GATEWAY,
  lookupCatalog,
  type CatalogItem,
} from "@/lib/saban-gateway";
import { sabanGatewayFn } from "@/lib/saban-gateway.functions";

export const Route = createFileRoute("/media-studio")({
  head: () => ({ meta: [{ title: "סטודיו מדיה ו-Drive · נועה AI · ח. סבן" }] }),
  component: MediaStudioPage,
});

const DRIVE_CONFIG = {
  FOLDER_ID: "1mb48kxT-9k5mYb356BtTJN6j9bjvPREG",
  FOLDER_URL: "https://drive.google.com/drive/folders/1mb48kxT-9k5mYb356BtTJN6j9bjvPREG",
  CSE_ID: "1340c66f5e73a4076",
  CSE_URL: "https://cse.google.com/cse?cx=1340c66f5e73a4076",
  SHEET_ID: SABAN_GATEWAY.sheetId,
  SHEET_URL: `https://docs.google.com/spreadsheets/d/${SABAN_GATEWAY.sheetId}/edit`,
};

const BRAND_PRESETS = [
  { name: "סיקה (SIKA)", q: "סיקה SIKA דבק איטום צמנט", color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  { name: "טמבור", q: "טמבור טיח גבס צבע שפכטל", color: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  { name: "נירלט", q: "נירלט צבע קיר שפכטל שליכט", color: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200" },
  { name: "תרמוקיר", q: "תרמוקיר טיח דבק בידוד", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  { name: "כרמית מיסטר פיקס", q: "מיסטר פיקס כרמית טיח דבק 116", color: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" },
  { name: "קנאוף / אורבונד", q: "אורבונד קנאוף לוח גבס פרופיל", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200" },
  { name: "מלט נשר", q: "מלט נשר שק 25 קג פורטלנד", color: "bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-200" },
];

const SAMPLE_PRODUCTS = [
  {
    sku: "112260",
    name: "לוח גבס סוג ב 200 ע 12.50",
    category: "גבס ופרופילים",
    unit: "יח'",
    weightKg: 18,
    slang: "לוח גבס רגיל, גבס 200, גבס סוג ב",
    palletQty: 60,
    depositSku: "60060",
    imageUrl: "https://i.ibb.co/SDY6vrCY/112260.jpg",
  },
  {
    sku: "10001",
    name: "מלט לבן 25 ק\"ג",
    category: "מליטה וצמנט",
    unit: "שק",
    weightKg: 25,
    slang: "צמנט לבן, שק מלט לבן",
    palletQty: 64,
    depositSku: "60060",
    imageUrl: "",
  },
  {
    sku: "14075",
    name: "טיח גבס MP75 שק 25 ק\"ג",
    category: "טיח וציפויים",
    unit: "שק",
    weightKg: 25,
    slang: "טיח גבס קנאוף, MP75, אמ פי 75",
    palletQty: 48,
    depositSku: "60060",
    imageUrl: "",
  },
  {
    sku: "14603",
    name: "פלסטומר AD603 אפור 25 ק\"ג",
    category: "דבקים ומליטה",
    unit: "שק",
    weightKg: 25,
    slang: "פלסטומר 603, סיקה 603, דבק קרמיקה אפור",
    palletQty: 48,
    depositSku: "60060",
    imageUrl: "",
  },
  {
    sku: "10002",
    name: "מלט שחור 25 ק\"ג",
    category: "מליטה וצמנט",
    unit: "שק",
    weightKg: 25,
    slang: "מלט רגיל, צמנט פורטלנד, שק מלט",
    palletQty: 64,
    depositSku: "60060",
    imageUrl: "",
  },
];

function convertDriveToDirectUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.includes("drive.google.com/uc?") && trimmed.includes("id=")) {
    return trimmed;
  }
  const fileIdMatch =
    trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    trimmed.match(/id=([a-zA-Z0-9_-]+)/);

  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
  }
  return trimmed;
}

function MediaStudioPage() {
  const [sku, setSku] = useState("112260");
  const [productName, setProductName] = useState("לוח גבס סוג ב 200 ע 12.50");
  const [category, setCategory] = useState("גבס ופרופילים");
  const [unit, setUnit] = useState("יח'");
  const [weightKg, setWeightKg] = useState("18");
  const [slang, setSlang] = useState("לוח גבס רגיל, גבס 200");
  const [palletQty, setPalletQty] = useState("60");
  const [depositSku, setDepositSku] = useState("60060");
  const [listPrice, setListPrice] = useState("32");
  const [discount, setDiscount] = useState("0");
  const [netPrice, setNetPrice] = useState("32");
  const [yardSource, setYardSource] = useState("התלמיד 6");
  const [dispatchYard, setDispatchYard] = useState("התלמיד 6");

  const [rawImageUrl, setRawImageUrl] = useState("https://i.ibb.co/SDY6vrCY/112260.jpg");
  const [finalDirectUrl, setFinalDirectUrl] = useState("https://i.ibb.co/SDY6vrCY/112260.jpg");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isInjecting, setIsInjecting] = useState(false);

  const [cseQuery, setCseQuery] = useState("לוח גבס סוג ב");
  const [catalogSearchQ, setCatalogSearchQ] = useState("");
  const [catalogSearchResults, setCatalogSearchResults] = useState<CatalogItem[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaCode = `SKU_${sku.trim() || "00000"}`;

  useEffect(() => {
    if (rawImageUrl) {
      setFinalDirectUrl(convertDriveToDirectUrl(rawImageUrl));
    }
  }, [rawImageUrl]);

  const loadPreset = (item: typeof SAMPLE_PRODUCTS[0]) => {
    setSku(item.sku);
    setProductName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setWeightKg(String(item.weightKg));
    setSlang(item.slang);
    setPalletQty(String(item.palletQty));
    setDepositSku(item.depositSku);
    if (item.imageUrl) {
      setRawImageUrl(item.imageUrl);
      setFinalDirectUrl(convertDriveToDirectUrl(item.imageUrl));
    }
    setCseQuery(item.name);
    toast.success(`נטענו פרטי מוצר: ${item.name} (${item.sku})`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("סוג קובץ לא נתמך. יש לבחור קובץ תמונה (JPG, PNG, WEBP, GIF).");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("גודל הקובץ חורג מ-15MB.");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const res = event.target?.result as string;
      setFinalDirectUrl(res);
      toast.success(`נבחר קובץ: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
    };
    reader.readAsDataURL(file);
  };

  const handleCatalogLookup = async () => {
    if (!catalogSearchQ.trim()) return;
    setIsSearchingCatalog(true);
    try {
      const res = await lookupCatalog(catalogSearchQ);
      const items = res.items || res.products || [];
      setCatalogSearchResults(items);
      if (items.length === 0) {
        toast.info("לא נמצאו מוצרים בקטלוג התואמים לחיפוש.");
      } else {
        toast.success(`נמצאו ${items.length} מוצרים בקטלוג`);
      }
    } catch {
      toast.error("שגיאה בחיפוש בקטלוג סבן");
    } finally {
      setIsSearchingCatalog(false);
    }
  };

  const selectCatalogItem = (it: CatalogItem) => {
    setSku(it.sku);
    setProductName(it.name);
    if (it.category) setCategory(it.category);
    if (it.unit) setUnit(it.unit);
    if (it.weightKg) setWeightKg(String(it.weightKg));
    if (it.warehouse) {
      setYardSource(it.warehouse);
      setDispatchYard(it.warehouse);
    }
    if (it.imageUrl) {
      setRawImageUrl(it.imageUrl);
      setFinalDirectUrl(convertDriveToDirectUrl(it.imageUrl));
    }
    setCseQuery(it.name);
    toast.success(`נבחר מק״ט ${it.sku}: ${it.name}`);
  };

  const openCseSearch = (term?: string) => {
    const q = encodeURIComponent(term || cseQuery);
    const url = `${DRIVE_CONFIG.CSE_URL}#gsc.tab=1&gsc.q=${q}&gsc.sort=`;
    window.open(url, "_
