/**
 * /new-order — New Order Studio route entry
 */
import { createFileRoute } from "@tanstack/react-router";
import { NewOrderStudioPage } from "../components/new-order/NewOrderStudioPage";

export const Route = createFileRoute("/new-order")({
  head: () => ({
    meta: [{ title: "הזמנה חדשה — New Order Studio | ח. סבן" }],
  }),
  component: NewOrderStudioPage,
});
