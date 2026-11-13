/**
 * /notebook — חדר רנטגן תפעולי
 */
import { createFileRoute } from "@tanstack/react-router";
import { NotebookPage } from "@/components/NotebookPage";

export const Route = createFileRoute("/notebook")({
  head: () => ({ meta: [{ title: "חדר רנטגן תפעולי ו-Notebook · ח. סבן" }] }),
  component: NotebookPage,
});
