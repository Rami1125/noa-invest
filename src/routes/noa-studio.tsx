/**
 * NOA STUDIO ROUTE
 * ארגון: ח. סבן חומרי בניין (1994) בע"מ
 */

import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, LayoutDashboard, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/noa-studio")({
  head: () => ({ meta: [{ title: "נועה סטודיו · ח. סבן" }] }),
  component: NoaStudioPage,
});

function NoaStudioPage() {
  return (
    <div dir="rtl" className="min-h-screen pb-16">
      <PageHeader
        title="נועה AI — סטודיו תפעולי"
        subtitle="מרכז ניהול ומעקב שיחות, ניתובים ותעודות"
        action={
          <Badge variant="outline" className="font-bold">
            פעיל · סבן 1994
          </Badge>
        }
      />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <Card className="rounded-2xl border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              ניתוב למרכזי השליטה של נועה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              מערכת נועה AI פועלת כעת דרך מרכז הניהול הראשי והצ'אט הלוגיסטי. בחר את הממשק הרצוי:
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
              <a
                href="/noa-console"
                className="flex items-center justify-between rounded-xl border p-4 transition-all hover:border-primary hover:bg-muted/40"
              >
                <div className="space-y-1">
                  <div className="font-bold text-sm">מרכז ניהול נועה AI</div>
                  <div className="text-xs text-muted-foreground">הזמנות חיות, Typeahead לקוחות ומד עומס משאיות</div>
                </div>
                <ArrowLeft className="h-4 w-4 text-primary shrink-0" />
              </a>

              <a
                href="/chat"
                className="flex items-center justify-between rounded-xl border p-4 transition-all hover:border-primary hover:bg-muted/40"
              >
                <div className="space-y-1">
                  <div className="font-bold text-sm">צ'אט שירות נועה AI</div>
                  <div className="text-xs text-muted-foreground">תחקור תעודות, איתוראן PTO וחריגות לצי המשאיות</div>
                </div>
                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
