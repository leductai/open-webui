"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {AppHeader} from "@/components/layout/app-header";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {apiFetch} from "@/lib/api";

type SettingsPayload = {
  model: Record<string, string | number | boolean>;
  retrieval: Record<string, string | number | boolean>;
  prompts: Record<string, string | number | boolean>;
  limits: Record<string, string | number | boolean>;
  i18n: Record<string, string | number | boolean>;
};

function castValue(value: string, original: unknown) {
  if (typeof original === "number") {
    return Number(value);
  }
  if (typeof original === "boolean") {
    return value === "true";
  }
  return value;
}

export default function AdminPage() {
  const t = useTranslations("app");
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<SettingsPayload>("/admin/settings").then(setSettings);
  }, []);

  async function saveSection(section: keyof SettingsPayload) {
    if (!settings) return;
    setSavingKey(section);
    await apiFetch(`/admin/settings/${section}`, {
      method: "PATCH",
      body: JSON.stringify({value: settings[section]})
    });
    setSavingKey(null);
  }

  function updateValue(section: keyof SettingsPayload, key: string, value: string) {
    if (!settings) return;
    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [key]: castValue(value, settings[section][key])
      }
    });
  }

  if (!settings) {
    return (
      <main className="min-h-dvh px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-5xl">
          <Skeleton className="h-[32rem] rounded-2xl" />
        </div>
      </main>
    );
  }

  const sections: Array<{key: keyof SettingsPayload; title: string}> = [
    {key: "model", title: t("settingsModel")},
    {key: "retrieval", title: t("settingsRetrieval")},
    {key: "prompts", title: t("settingsPrompts")},
    {key: "limits", title: t("settingsLimits")},
    {key: "i18n", title: t("settingsI18n")}
  ];

  return (
    <main className="min-h-dvh px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <AppHeader
          title={t("admin")}
          subtitle="Cai dat he thong"
          backHref="/notebooks"
          backLabel={t("notebooks")}
          actions={
            <Link href="/notebooks">
              <Button variant="secondary" className="h-10 rounded-xl px-4 text-xs">
                {t("notebooks")}
              </Button>
            </Link>
          }
        />

        <div className="grid gap-4">
          {sections.map((section) => (
            <section key={section.key} className="glass-panel rounded-2xl p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{section.title}</h2>
                  {section.key === "model" ? (
                    <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                      Embedding dimension phai &lt;= 2000 cho pgvector HNSW.
                    </p>
                  ) : null}
                </div>
                <Button onClick={() => saveSection(section.key)} disabled={savingKey === section.key} className="h-10 rounded-xl">
                  {savingKey === section.key ? t("loading") : t("save")}
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(settings[section.key]).map(([key, value]) => (
                  <label key={key} className="grid gap-1.5 text-sm">
                    <span className="font-medium text-[hsl(var(--muted-foreground))]">{key}</span>
                    <Input value={String(value)} onChange={(event) => updateValue(section.key, key, event.target.value)} />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
