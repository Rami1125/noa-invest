/**
 * Server functions — מילון לוגיסטי מלא + העשרת ידע מוצר
 */
import { createServerFn } from "@tanstack/react-start";
import { loadLogisticsDict, type LogisticsDictPayload } from "./logistics-dict.server";
import {
  enrichProductKnowledge,
  type ProductKnowledge,
  type ProductKnowledgeInput,
} from "./product-knowledge.server";

export type { LogisticsDictItem, LogisticsDictPayload } from "./logistics-dict.server";
export type { ProductKnowledge, ProductKnowledgeInput };

/** קטלוג מלא ממילון_לוגיסט (cache ~10 דק׳ בשרת) */
export const getLogisticsDictFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<LogisticsDictPayload> => {
    return loadLogisticsDict(false);
  },
);

/** רענון כפוי של המטמון */
export const refreshLogisticsDictFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<LogisticsDictPayload> => {
    return loadLogisticsDict(true);
  },
);

/** העשרת ידע טכני למוצר בודד (גיליון + URL + Gemini) */
export const enrichProductKnowledgeFn = createServerFn({ method: "POST" })
  .inputValidator((d: ProductKnowledgeInput) => {
    const sku = String(d?.sku || "").trim();
    if (!sku) throw new Error("חסר מק\"ט");
    return {
      sku,
      name: String(d.name || "").trim(),
      category: String(d.category || "").trim(),
      unit: String(d.unit || "").trim(),
      keywords: String(d.keywords || "").trim(),
      techInfo: String(d.techInfo || "").trim(),
      techUrl: String(d.techUrl || "").trim(),
      deposit: String(d.deposit || "").trim(),
      weightKg: d.weightKg == null ? null : Number(d.weightKg),
      warehouse: String(d.warehouse || "").trim(),
      listPrice: d.listPrice == null ? null : Number(d.listPrice),
      netPrice: d.netPrice == null ? null : Number(d.netPrice),
    } satisfies ProductKnowledgeInput;
  })
  .handler(async ({ data }): Promise<ProductKnowledge> => {
    return enrichProductKnowledge(data);
  });
