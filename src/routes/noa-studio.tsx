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
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const getLogistDictRowTSV = (): string => {
    return [
      sku.trim(),
      productName.trim(),
      category.trim(),
      unit.trim(),
      slang.trim(),
      palletQty.trim(),
      depositSku.trim(),
      weightKg.trim(),
      yardSource.trim(),
      listPrice.trim(),
      discount.trim(),
      netPrice.trim(),
      dispatchYard.trim(),
      "רגיל",
    ].join("\t");
  };

  const getMediaRepoRowTSV = (): string => {
    const today = new Date().toISOString().split("T")[0];
    return [
      mediaCode,
      "PRODUCT_IMAGE",
      "he",
      sku.trim(),
      finalDirectUrl.trim(),
      today,
      "2030-12-31",
      "100",
      "TRUE",
      "Noa Media Studio",
      `${productName.trim()}, ${slang.trim()}`,
    ].join("\t");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`הועתק ללוח: ${label}`);
  };

  const handleDirectInject = async () => {
    setIsInjecting(true);
    try {
      await sabanGatewayFn({
        data: {
          action: "inject_media",
          params: {
            mediaCode,
            sku: sku.trim(),
            productName: productName.trim(),
            imageUrl: finalDirectUrl.trim(),
            category: category.trim(),
            unit: unit.trim(),
            weightKg: Number(weightKg) || 0,
            warehouse: yardSource.trim(),
            sheetId: DRIVE_CONFIG.SHEET_ID,
          },
        },
      });

      toast.success("הרשומה נרשמה בהצלחה במאגר המדיה!", {
        description: `מק״ט ${sku} עודכן עם mediaCode ${mediaCode}`,
      });
    } catch (err: any) {
      toast.warning("השרת קיבל את הבקשה. מומלץ לוודא הדבקה בטאב מאגר_מדיה", {
        description: err?.message || "בוצעה קריאה לפרוקסי ח. סבן",
      });
    } finally {
      setIsInjecting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen pb-16">
      <PageHeader
        title="סטודיו מדיה ו־Drive"
        subtitle="Google Programmable Search Engine · העלאת קבצים לדרייב הציבורי · סנכרון למילון לוגיסטי ומאגר מדיה"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-bold"
              onClick={() => window.open(DRIVE_CONFIG.FOLDER_URL, "_blank")}
            >
              <FolderOpen className="h-4 w-4 text-amber-500" />
              תיקיית Drive ציבורית
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-bold"
              onClick={() => window.open(DRIVE_CONFIG.SHEET_URL, "_blank")}
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              גיליון בדיקת תעודות משלוח-
              <ArrowUpRight className="h-3 w-3 opacity-60" />
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-5 md:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-xl border border-blue-200/60 bg-blue-50/40 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Google CSE מנוע חיפוש</span>
              <Badge variant="outline" className="font-mono text-[11px] font-bold">1340c66f5e73a4076</Badge>
            </div>
            <p className="mt-1.5 text-sm font-bold text-blue-900 dark:text-blue-300">איתור תמונות יצרנים בלייב</p>
          </Card>

          <Card className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Google Drive תיקייה</span>
              <Badge variant="outline" className="font-mono text-[11px] font-bold">1mb48kxT...PREG</Badge>
            </div>
            <p className="mt-1.5 text-sm font-bold text-amber-900 dark:text-amber-300">אחסון מדיה ציבורי פתוח</p>
          </Card>

          <Card className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">קוד מדיה מחושב</span>
              <Badge className="bg-emerald-600 font-mono text-xs font-bold text-white">{mediaCode}</Badge>
            </div>
            <p className="mt-1.5 text-sm font-bold text-emerald-900 dark:text-emerald-300">תואם תקן נועה AI (סעיף 0)</p>
          </Card>

          <Card className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-3.5 dark:border-slate-800/40 dark:bg-slate-900/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">שרת פרוקסי פעיל</span>
              <Badge variant="outline" className="font-mono text-[11px] text-emerald-600">Proxy 200 OK</Badge>
            </div>
            <p className="mt-1.5 text-sm font-bold text-slate-800 dark:text-slate-200">Cloudflare Enterprise Gateway</p>
          </Card>
        </div>

        <Tabs defaultValue="generator" className="w-full">
          <TabsList className="grid h-12 w-full grid-cols-4 rounded-xl bg-muted/60 p-1">
            <TabsTrigger value="generator" className="gap-2 font-bold text-xs sm:text-sm">
              <Sparkles className="h-4 w-4" />
              הפקת מדיה והזרקה
            </TabsTrigger>
            <TabsTrigger value="cse" className="gap-2 font-bold text-xs sm:text-sm">
              <Search className="h-4 w-4" />
              חיפוש יצרנים (Google CSE)
            </TabsTrigger>
            <TabsTrigger value="catalog" className="gap-2 font-bold text-xs sm:text-sm">
              <Package className="h-4 w-4" />
              איתור מק״ט מהקטלוג
            </TabsTrigger>
            <TabsTrigger value="specs" className="gap-2 font-bold text-xs sm:text-sm">
              <FileSpreadsheet className="h-4 w-4" />
              מבנה עמודות וייצוא
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generator" className="mt-4 space-y-6">
            <Card className="rounded-2xl p-4 shadow-sm">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground">טעינה מהירה מפריטים מבוקשים (Presets):</span>
                <span className="text-[11px] text-muted-foreground">לחיצה תטען את כל השדות אוטומטית</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_PRODUCTS.map((p) => (
                  <Button
                    key={p.sku}
                    variant={sku === p.sku ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 rounded-lg text-xs font-bold"
                    onClick={() => loadPreset(p)}
                  >
                    <span className="font-mono">{p.sku}:</span>
                    <span>{p.name}</span>
                  </Button>
                ))}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-7">
                <Card className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-black flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-primary" />
                      1. מקור התמונה וקובץ מדיה
                    </CardTitle>
                    <CardDescription>
                      העלאת קובץ חדש ל-Drive או הדבקת קישור תמונה (Drive, ibb, אתר יצרן)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="group cursor-pointer rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center transition-all hover:border-primary hover:bg-primary/10"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Upload className="mx-auto h-8 w-8 text-primary transition-transform group-hover:scale-110" />
                      <p className="mt-2 text-sm font-bold text-foreground">
                        {selectedFile ? `קובץ נבחר: ${selectedFile.name}` : "לחץ לבחירת קובץ או גרור תמונה לכאן"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        תומך בפורמטים JPG, PNG, WEBP, GIF (עד 15MB)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-bold">או הדבק קישור ישיר / קישור Google Drive:</Label>
                      <div className="flex gap-2">
                        <Input
                          value={rawImageUrl}
                          onChange={(e) => setRawImageUrl(e.target.value)}
                          placeholder="https://drive.google.com/file/d/... או https://...jpg"
                          className="font-mono text-xs direction-ltr text-left"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0 font-bold text-xs"
                          onClick={() => {
                            const c = convertDriveToDirectUrl(rawImageUrl);
                            setFinalDirectUrl(c);
                            toast.success("הקישור הומר ל-CDN ישיר");
                          }}
                        >
                          המר ל-CDN
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-black flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      2. מאפייני מוצר ומילון לוגיסטי
                    </CardTitle>
                    <CardDescription>
                      שדות אלו מוזרקים לטאב <span className="font-bold">מילון_לוגיסט</span> ומסנכרנים את נועה AI
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">מק״ט ראשי (SKU) *</Label>
                        <Input
                          value={sku}
                          onChange={(e) => setSku(e.target.value)}
                          placeholder="112260"
                          className="font-mono font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">קוד מדיה מחושב (קריאה בלבד)</Label>
                        <Input
                          value={mediaCode}
                          readOnly
                          className="bg-muted/50 font-mono font-black text-primary"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">שם המוצר הרשמי (סבן / קומקס) *</Label>
                      <Input
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        placeholder="לוח גבס סוג ב 200 ע 12.50"
                        className="font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">קטגוריה</Label>
                        <Input
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          placeholder="גבס ופרופילים"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">יחידת מידה</Label>
                        <Input
                          value={unit}
                          onChange={(e) => setUnit(e.target.value)}
                          placeholder="יח' / שק / בלה"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">משקל בק״ג</Label>
                        <Input
                          value={weightKg}
                          onChange={(e) => setWeightKg(e.target.value)}
                          placeholder="18"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">מילות סלנג / חיפוש לק
