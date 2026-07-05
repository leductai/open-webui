"use client";

import {FormEvent, useState} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {ArrowRight, BookOpenText, Layers3, Sparkles} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {apiFetch, setAccessToken} from "@/lib/api";

const highlights = [
  "Grounded chat with citations",
  "Shared notebooks, notes, and sources",
  "Fast local-first research workflow"
];

export default function LoginPage() {
  const t = useTranslations("app");
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(path: "/auth/login" | "/auth/register", event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const data = await apiFetch<{access_token: string}>(path, {
        method: "POST",
        body: JSON.stringify({username, password})
      });
      setAccessToken(data.access_token);
      router.push("/notebooks");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-4 md:px-8 md:py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-7xl gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="grain-overlay relative hidden overflow-hidden rounded-2xl border border-[rgba(198,181,156,0.8)] bg-[linear-gradient(135deg,rgba(17,55,69,0.96)_0%,rgba(35,99,112,0.95)_52%,rgba(231,153,89,0.88)_100%)] p-8 text-white shadow-[0_26px_70px_rgba(16,38,48,0.22)] md:block md:p-10">
          <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_65%)]" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-sm font-medium text-white/88 backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Research studio for grounded conversations
              </div>
              <h1 className="font-display text-5xl leading-[0.98] tracking-tight md:text-7xl">
                Build a sharper second brain for every notebook.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/82 md:text-lg">
                Upload documents, ask focused questions, and turn answers into shared notes inside a workspace that feels more like a studio than a dashboard.
              </p>
            </div>

            <div className="grid gap-3 md:max-w-xl">
              {highlights.map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded-[1.4rem] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.08)] px-4 py-4 backdrop-blur">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgba(255,248,238,0.16)] text-sm font-semibold">
                    0{index + 1}
                  </div>
                  <p className="text-sm font-medium text-white/88">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass-panel flex flex-col justify-between rounded-2xl p-6 md:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[hsl(var(--muted-foreground))]">Notebook AI</p>
              <h2 className="mt-3 font-display text-4xl text-[hsl(var(--foreground))]">{t("title")}</h2>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-[1.4rem] bg-[linear-gradient(135deg,#fff4e8_0%,#f5d8b5_100%)] text-[hsl(var(--accent-foreground))] shadow-[0_12px_28px_rgba(231,153,89,0.18)]">
              <BookOpenText className="h-7 w-7" />
            </div>
          </div>

          <form className="mt-8 grid gap-4" onSubmit={(event) => submit("/auth/login", event)}>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">{t("username")}</span>
              <Input placeholder={t("username")} value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">{t("password")}</span>
              <Input placeholder={t("password")} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>

            {error ? <p className="rounded-2xl border border-[rgba(191,75,57,0.22)] bg-[rgba(255,241,238,0.95)] px-4 py-3 text-sm text-[hsl(var(--danger))]">{error}</p> : null}

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Button type="submit" className="h-12 rounded-[1.3rem]">
                {t("login")}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button type="button" variant="secondary" className="h-12 rounded-[1.3rem]" onClick={(event) => submit("/auth/register", event)}>
                {t("register")}
              </Button>
            </div>
          </form>

          <div className="mt-8 grid gap-3 rounded-[1.6rem] bg-[rgba(246,239,228,0.9)] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            <div className="flex items-center gap-3">
              <Layers3 className="h-4 w-4 text-[hsl(var(--primary))]" />
              Multi-panel workspace designed for long-form research.
            </div>
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-[hsl(var(--accent))]" />
              Modern, grounded AI interactions without losing your sources.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
