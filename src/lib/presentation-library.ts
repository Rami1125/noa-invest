/**
 * ספריית מצגות NotebookLM — מטא-דאטה ב-localStorage, קבצי PDF ב-IndexedDB
 */

const META_KEY = "saban.presentation.decks.v1";
const IDB_NAME = "saban-presentation-decks";
const IDB_STORE = "pdfs";
const IDB_VERSION = 1;

export type PresentationDeckMeta = {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  dateIso?: string;
  dateLabel?: string;
  customerNo?: string;
  customerName?: string;
  pageCount?: number;
  fileName: string;
  createdAt: string;
  updatedAt: string;
};

function uid(): string {
  return `deck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatIsoToHe(iso?: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function heDateToIso(he: string): string | undefined {
  const m = he.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return undefined;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function listDeckMeta(): PresentationDeckMeta[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PresentationDeckMeta[];
    return Array.isArray(arr)
      ? arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [];
  } catch {
    return [];
  }
}

function saveMetaList(list: PresentationDeckMeta[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

export function getDeckMeta(id: string): PresentationDeckMeta | undefined {
  return listDeckMeta().find((d) => d.id === id);
}

export function upsertDeckMeta(
  patch: Partial<PresentationDeckMeta> & Pick<PresentationDeckMeta, "title" | "fileName">,
): PresentationDeckMeta {
  const list = listDeckMeta();
  const now = new Date().toISOString();
  const existing = patch.id ? list.find((d) => d.id === patch.id) : undefined;
  const meta: PresentationDeckMeta = {
    id: existing?.id || patch.id || uid(),
    title: patch.title,
    fileName: patch.fileName,
    dateIso: patch.dateIso ?? existing?.dateIso,
    dateLabel: patch.dateLabel ?? existing?.dateLabel ?? formatIsoToHe(patch.dateIso ?? existing?.dateIso),
    customerNo: patch.customerNo ?? existing?.customerNo,
    customerName: patch.customerName ?? existing?.customerName,
    pageCount: patch.pageCount ?? existing?.pageCount,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const next = [meta, ...list.filter((d) => d.id !== meta.id)];
  saveMetaList(next);
  return meta;
}

export function removeDeckMeta(id: string): void {
  saveMetaList(listDeckMeta().filter((d) => d.id !== id));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

export async function saveDeckPdf(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB put failed"));
  });
  db.close();
}

export async function loadDeckPdf(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) || null);
    req.onerror = () => reject(req.error || new Error("IDB get failed"));
  });
  db.close();
  return blob;
}

export async function deleteDeckPdf(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB delete failed"));
  });
  db.close();
  removeDeckMeta(id);
}

export async function registerUploadedDeck(opts: {
  file: File;
  title?: string;
  dateIso?: string;
  customerNo?: string;
  customerName?: string;
}): Promise<PresentationDeckMeta> {
  const meta = upsertDeckMeta({
    title: opts.title || opts.file.name.replace(/\.pdf$/i, "") || "מצגת ללא שם",
    fileName: opts.file.name,
    dateIso: opts.dateIso,
    dateLabel: formatIsoToHe(opts.dateIso),
    customerNo: opts.customerNo,
    customerName: opts.customerName,
  });
  await saveDeckPdf(meta.id, opts.file);
  return meta;
}
