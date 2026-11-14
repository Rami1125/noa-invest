/** Cloudflare Worker proxy → Apps Script LIP deployment */
const GAS_EXEC_URL =
  "https://script.google.com/macros/s/AKfycbwi9M5HSO9E0sZrrZ8bdKLCf5mBYPaIk-j3ZY_Mram3qkSH8pU4i-bcG2XNeZ42o3c8Og/exec";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = new URL(env.GAS_EXEC_URL || GAS_EXEC_URL);
    url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const init = {
      method: request.method,
      headers: request.headers,
      redirect: "follow",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.arrayBuffer();
    }
    return fetch(target.toString(), init);
  },
};
