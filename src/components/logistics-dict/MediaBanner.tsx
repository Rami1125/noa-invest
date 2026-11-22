/**
 * MediaBanner — Feature 5
 * באנר דינמי ממאגר_מדיה (WELCOME / SUCCESS / BRANCH)
 */
import { useQuery } from "@tanstack/react-query";
import { getMediaAssetsFn, type MediaAsset } from "@/lib/catalog-enrichment.functions";
import { cn } from "@/lib/utils";

type Props = {
  code?: string;
  category?: "welcome" | "success" | "branch";
  className?: string;
  alt?: string;
  maxHeight?: number;
};

export function MediaBanner({ code, category = "welcome", className, alt, maxHeight = 160 }: Props) {
  const q = useQuery({
    queryKey: ["media-assets"],
    queryFn: () => getMediaAssetsFn(),
    staleTime: 30 * 60_000,
  });

  const asset = resolveAsset(q.data, code, category);

  if (q.isLoading) {
    return (
      <div
        className={cn("animate-pulse rounded-2xl bg-muted/50", className)}
        style={{ height: maxHeight }}
      />
    );
  }

  if (!asset?.url) return null;

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-muted/20", className)}>
      <img
        src={asset.url}
        alt={alt || asset.titleHe || asset.code}
        loading="lazy"
        className="w-full object-cover object-center"
        style={{ maxHeight }}
      />
    </div>
  );
}

function resolveAsset(
  payload: Awaited<ReturnType<typeof getMediaAssetsFn>> | undefined,
  code?: string,
  category?: Props["category"],
): MediaAsset | null {
  if (!payload) return null;
  if (code) {
    return payload.byCode[code.toUpperCase()] ?? null;
  }
  if (category === "welcome") return payload.welcome;
  if (category === "success") return payload.success;
  if (category === "branch") return payload.branches[0] ?? null;
  return null;
}

export function SuccessOrderMedia({ className }: { className?: string }) {
  return <MediaBanner code="SUCCESS_ORDER" category="success" maxHeight={200} className={className} />;
}

export function WelcomeMedia({ className }: { className?: string }) {
  return <MediaBanner code="WELCOME_CARD" category="welcome" maxHeight={180} className={className} />;
}
