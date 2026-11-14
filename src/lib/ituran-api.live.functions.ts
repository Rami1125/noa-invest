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

export const getIturanLiveFn = createServerFn({ method: "GET" }).handler(async () => {
  const u = new URL(gasUrl());
  u.searchParams.set("action", "getIturanPto");
  u.searchParams.set("since", "90");
  u.searchParams.set("token", apiToken());
  u.searchParams.set("nocache", "1");
  const res = await fetch(u.toString(), { redirect: "follow" });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`תשובה לא תקינה מ-GAS (HTTP ${res.status})`);
  }
});
