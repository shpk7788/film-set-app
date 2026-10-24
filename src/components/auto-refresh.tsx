"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page's server data every few seconds (used for the live on-set view). */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
