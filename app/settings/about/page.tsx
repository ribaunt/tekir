"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search, User, Shield, Info, BarChart3 } from "lucide-react";
import { SettingsShell, type SettingsNavItem, type MobileNavItem } from "@/components/settings/settings-shell";
import { BuildInfo } from "@/components/settings/build-info";

export default function AboutPage() {
  const tSettings = useTranslations("settings");
  const tAboutPage = useTranslations("settings.aboutPage");

  useEffect(() => {
    document.title = `${tAboutPage("pageTitle")} | Tekir`;
  }, [tAboutPage]);

  const sidebarItems: SettingsNavItem[] = [
    { href: "/settings/search", icon: Search, label: tSettings("search") },
    { href: "/settings/account", icon: User, label: tSettings("account") },
    { href: "/settings/privacy", icon: Shield, label: tSettings("privacy") },
    { href: "/settings/analytics", icon: BarChart3, label: tSettings("analytics") },
    { href: "/settings/about", icon: Info, label: tSettings("about"), active: true },
  ];

  const mobileNavItems: MobileNavItem[] = [];

  return (
    <SettingsShell
      title={tSettings("title")}
      currentSectionLabel={tSettings("about")}
      sidebar={sidebarItems}
      mobileNavItems={mobileNavItems}
    >
      <div className="space-y-8">
        {/* Page Title and Description */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{tAboutPage("pageTitle")}</h2>
          <p className="text-muted-foreground mt-2">
            {tAboutPage("pageDescription")}
          </p>
          <div className="mt-3">
            <BuildInfo />
          </div>
        </div>

        {/* Translate Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold">{tAboutPage("translate.title")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {tAboutPage("translate.description")}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {tAboutPage("translate.description")}
                </p>
              </div>
              <Link
                href={`https://${tAboutPage("translate.link")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-sm whitespace-nowrap"
              >
                {tAboutPage("translate.link")}
              </Link>
            </div>
          </div>
        </div>

        {/* Acknowledgements Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold">{tAboutPage("acknowledgements.title")}</h3>
          </div>

          <div className="rounded-lg border border-border bg-card p-6 space-y-6">
            {/* Open Source Statement */}
            <div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tAboutPage("acknowledgements.description1")}{" "}
                <Link
                  href={tAboutPage("acknowledgements.sourceCodeUrl")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  {tAboutPage("acknowledgements.sourceCodeLink")}
                </Link>
                .
              </p>
            </div>

            {/* Credits Statement */}
            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tAboutPage("acknowledgements.description2")}
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-muted-foreground">
                  Built by{" "}
                  <Link
                    href={tAboutPage("acknowledgements.ribauntUrl")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    Ribaunt
                  </Link>
                </p>
                <p className="text-sm text-muted-foreground">
                  Secured by{" "}
                  <Link
                    href={tAboutPage("acknowledgements.ribauntUrl")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {tAboutPage("acknowledgements.ribauntLink")}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
