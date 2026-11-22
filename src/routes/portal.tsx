/**
 * /portal — פורטל הזמנות לקוח קצה (Self-Service)
 */
import { createFileRoute } from "@tanstack/react-router";
import { CustomerOrderPortal } from "@/components/portal/CustomerOrderPortal";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "פורטל הזמנות — ח. סבן" },
      {
        name: "description",
        content: "הזמנת חומרי בניין לשטח · זיהוי לפי נייד · מד משאית ופקדונות",
      },
    ],
  }),
  component: CustomerOrderPortal,
});
