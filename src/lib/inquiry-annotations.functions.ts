import { createServerFn } from "@tanstack/react-start";

const DEFAULT_GAS_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

function gasUrl(): string {
  return (process.env["GAS_URL"] || "").trim() || DEFAULT_GAS_URL;
}

function apiToken(): string {
  const t = process.env["API_TOKEN"];
  if (!t) throw new Error("API_TOKEN לא מוגדר בשרת");
  return t;
}

export const saveInquiryAnnotationsFn = createServerFn({ method: "POST" })
  .inputValidator((d: Record<string, unknown>) => d)
  .handler(async ({ data }) => {
    const res = await fetch(gasUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "saveInquiryAnnotations", token: apiToken(), ...data }),
      redirect: "follow",
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`תשובה לא תקינה מ-GAS (HTTP ${res.status})`);
    }
  });
