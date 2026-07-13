"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

const STORAGE_KEY = "tekir-sunset-dismissed";

export default function SunsetBanner() {
  const t = useTranslations("sunset");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm rounded-lg border bg-card p-4 shadow-lg">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex flex-col gap-2 pr-4">
        <p className="font-semibold text-sm">{t("title")}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("description")}
        </p>
        <div className="mt-1">
          <button
            type="button"
            onClick={() =>
              window.open(
                "https://btt.community/t/tekir-meta-arama-motoru/18108/150?u=musti",
                "_blank",
                "noopener"
              )
            }
            className="text-sm text-primary hover:underline underline-offset-2 font-medium"
          >
            {t("action")}
          </button>
        </div>
      </div>
    </div>
  );
}
