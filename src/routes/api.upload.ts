import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy: landing page (notes.html) → Google Apps Script landing_upload.
 * Keeps API key server-side only.
 *
 * Env (Vercel):
 *   APPS_SCRIPT_URL or GAS_URL  — Web App …/exec
 *   NOA_API_KEY or API_TOKEN    — same as Script Properties API_KEY
 */
const MAX_B64 = 4_400_000;
const MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function gasUrl(): string {
  return (
    process.env["APPS_SCRIPT_URL"] ||
    process.env["GAS_URL"] ||
    ""
  ).trim();
}

function apiKey(): string {
  return (
    process.env["NOA_API_KEY"] ||
    process.env["API_TOKEN"] ||
    process.env["API_KEY"] ||
    ""
  ).trim();
}

export const Route = createFileRoute("/api/upload")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          let body: Record<string, unknown> = {};
          try {
            body = (await request.json()) as Record<string, unknown>;
          } catch {
            return Response.json(
              { ok: false, message: "JSON לא תקין" },
              { status: 400 },
            );
          }

          const note = String(body.noteNumber || "");
          if (!/^[0-9A-Za-z-]{1,20}$/.test(note)) {
            return Response.json(
              { ok: false, message: "מספר תעודה לא תקין" },
              { status: 400 },
            );
          }

          const token = String(body.token || "");
          if (!token || token.length > 400) {
            return Response.json(
              { ok: false, message: "קישור לא תקף" },
              { status: 400 },
            );
          }

          const mimeType = String(body.mimeType || "");
          if (!MIMES.has(mimeType)) {
            return Response.json(
              { ok: false, message: "סוג קובץ לא נתמך" },
              { status: 400 },
            );
          }

          const fileBase64 = String(body.fileBase64 || "");
          if (!fileBase64 || fileBase64.length > MAX_B64) {
            return Response.json(
              { ok: false, message: "הקובץ גדול מדי (עד 3MB)" },
              { status: 413 },
            );
          }

          const endpoint = gasUrl();
          const key = apiKey();
          if (!endpoint || !key) {
            console.error("upload: missing APPS_SCRIPT_URL/GAS_URL or NOA_API_KEY/API_TOKEN");
            return Response.json(
              { ok: false, message: "השרת לא מוגדר (env)" },
              { status: 500 },
            );
          }

          const r = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            redirect: "follow",
            body: JSON.stringify({
              action: "landing_upload",
              key,
              noteNumber: note,
              token,
              freq: String(body.freq || "2"),
              reason: String(body.reason || "").slice(0, 1000),
              mimeType,
              fileBase64,
            }),
            signal: AbortSignal.timeout(55_000),
          });

          let data: Record<string, unknown> = {};
          try {
            data = (await r.json()) as Record<string, unknown>;
          } catch {
            return Response.json(
              { ok: false, message: "תשובה לא תקינה מ-Apps Script" },
              { status: 502 },
            );
          }

          return Response.json({
            ok: !!data.ok,
            partial: !!data.partial,
            steps: data.steps || [],
            message: data.message || data.error || "",
            noteNumber: data.noteNumber || note,
            previewUrl: data.previewUrl,
            fileUrl: data.fileUrl || data.url,
          });
        } catch (err) {
          console.error("upload proxy failed", err instanceof Error ? err.message : err);
          return Response.json(
            { ok: false, message: "השרת לא זמין, נסה שוב בעוד רגע" },
            { status: 502 },
          );
        }
      },
      GET: async () =>
        Response.json({
          ok: true,
          service: "harel-landing-upload",
          methods: ["POST"],
        }),
    },
  },
});
