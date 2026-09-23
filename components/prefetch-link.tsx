"use client";

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { hasVisitedRoute } from "@/hooks/use-route-prefetch";

type PrefetchLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

// Opt-in wrapper: checks the visited-page cache before showing anything,
// and prefetches route data on hover + focus (not only on click).
// Most links are already covered by the global delegation in ClientLayout;
// use this where you want explicit prefetch + visited-cache semantics.
const PrefetchLink = forwardRef<HTMLAnchorElement, PrefetchLinkProps>(
  function PrefetchLink({ href, prefetch, onMouseEnter, onFocus, onTouchStart, ...rest }, ref) {
    const router = useRouter();
    const hrefString = typeof href === "string" ? href : href.pathname ?? "/";

    const warm = () => {
      if (typeof hrefString !== "string" || !hrefString.startsWith("/")) return;
      // Cache-first: never prefetch (or placeholder) for visited pages.
      if (hasVisitedRoute(hrefString)) return;
      try {
        router.prefetch(hrefString);
      } catch {
        // Prefetch is best-effort; navigation still works on click.
      }
    };

    return (
      <Link
        ref={ref}
        href={href}
        prefetch={prefetch ?? true}
        onMouseEnter={(e) => {
          warm();
          onMouseEnter?.(e);
        }}
        onFocus={(e) => {
          warm();
          onFocus?.(e);
        }}
        onTouchStart={(e) => {
          warm();
          (onTouchStart as unknown as ((e: React.TouchEvent<HTMLAnchorElement>) => void) | undefined)?.(e);
        }}
        {...rest}
      />
    );
  }
);

export default PrefetchLink;
