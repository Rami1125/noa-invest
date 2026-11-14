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

export const getCustomerDocumentsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { customerNo: string }) => {
    const customerNo = String(d?.customerNo || "").trim();
    if (!customerNo) throw new Error("חסר מס׳ לקוח");
    return { customerNo };
  })
  .handler(async ({ data }) => {
    const u = new URL(gasUrl());
    u.searchParams.set("action", "getCustomerDocuments");
    u.searchParams.set("token", apiToken());
    u.searchParams.set("customerNo", data.customerNo);
    const res = await fetch(u.toString(), { redirect: "follow" });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`תשובה לא תקינה מ-GAS (HTTP ${res.status})`);
    }
  });
