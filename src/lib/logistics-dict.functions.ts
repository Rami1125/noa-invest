/**
 * Server functions — מילון לוגיסטי מלא
 */
import { createServerFn } from "@tanstack/react-start";
import { loadLogisticsDict, type LogisticsDictPayload } from "./logistics-dict.server";

export type { LogisticsDictItem, LogisticsDictPayload } from "./logistics-dict.server";

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
