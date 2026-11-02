/**
 * IndexedDB draft storage for delivery-note canvas annotations.
 * Keyed by noteId so Rami can close the tab and resume.
 */

const DB_NAME = "saban-canvas-drafts";
const DB_VERSION = 1;
const STORE = "drafts";

export interface CanvasDraftAnnotationState {
  drawnPaths: Array<{
    points: Array<{ x: number; y: number }>;
    color: string;
    width: number;
    type: "pen" | "highlight";
  }>;
  stampPlacements: Array<{
    id?: string;
    x: number;
    y: number;
    name: string;
    timeStr: string;
    kind: "rami" | "noa";
    w?: number;
    h?: number;
  }>;
  textAnnotations: Array<{
    id?: string;
    x: number;
    y: number;
    text: string;
    color: string;
  }>;
  signedBy?: string;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "noteId" });
      }
    };
  });
}

export async function saveCanvasDraft(
  noteId: string,
  state: Omit<CanvasDraftAnnotationState, "updatedAt">,
): Promise<void> {
  if (!noteId) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({
        noteId,
        ...state,
        updatedAt: Date.now(),
      });
    });
    db.close();
  } catch (err) {
    console.warn("[canvas-draft] save failed", err);
  }
}

export async function loadCanvasDraft(
  noteId: string,
): Promise<CanvasDraftAnnotationState | null> {
  if (!noteId) return null;
  try {
    const db = await openDb();
    const row = await new Promise<CanvasDraftAnnotationState & { noteId: string } | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(noteId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    if (!row) return null;
    const { noteId: _id, ...rest } = row;
    return rest as CanvasDraftAnnotationState;
  } catch (err) {
    console.warn("[canvas-draft] load failed", err);
    return null;
  }
}

export async function clearCanvasDraft(noteId: string): Promise<void> {
  if (!noteId) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(noteId);
    });
    db.close();
  } catch (err) {
    console.warn("[canvas-draft] clear failed", err);
  }
}
