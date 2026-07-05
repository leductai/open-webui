"use client";

import {useEffect, useState} from "react";
import Link from "next/link";
import {useTranslations} from "next-intl";
import {ArrowRight, LibraryBig, Plus} from "lucide-react";
import {AppHeader} from "@/components/layout/app-header";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {apiFetch} from "@/lib/api";

type Notebook = {id: string; title: string; emoji: string; visibility: string};

const accents = [
  "from-[#1e5565] via-[#2f7581] to-[#ed9a59]",
  "from-[#5f3b72] via-[#8f598f] to-[#f1a35c]",
  "from-[#285447] via-[#3d7e66] to-[#f0b15a]",
  "from-[#6b4232] via-[#ad6848] to-[#f3bc71]"
];

export default function NotebooksPage() {
  const t = useTranslations("app");
  const [items, setItems] = useState<Notebook[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  async function create() {
    if (!title.trim()) return;
    const notebook = await apiFetch<Notebook>("/notebooks", {
      method: "POST",
      body: JSON.stringify({title, emoji: "folio"})
    });
    setItems([notebook, ...items]);
    setTitle("");
  }

  useEffect(() => {
    queueMicrotask(() => {
      void (async () => {
        setLoading(true);
        try {
          setItems(await apiFetch<Notebook[]>("/notebooks"));
        } finally {
          setLoading(false);
        }
      })().catch(() => undefined);
    });
  }, []);

  return (
    <main className="min-h-dvh px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <AppHeader
          title={t("notebooks")}
          subtitle="Notebook AI"
          badges={[{label: `${items.length} so tay`}]}
          actions={
            <Link href="/admin">
              <Button variant="secondary" className="h-10 rounded-xl px-4 text-xs">
                {t("admin")}
              </Button>
            </Link>
          }
        />

        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[linear-gradient(135deg,#fff7ec_0%,#f4d2a5_100%)] text-[hsl(var(--accent-foreground))]">
                <LibraryBig className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">{t("newNotebook")}</p>
                <h2 className="mt-1 text-xl font-semibold">Tao khong gian nghien cuu moi</h2>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input placeholder={t("newNotebook")} value={title} onChange={(e) => setTitle(e.target.value)} className="sm:min-w-[16rem]" />
              <Button onClick={create} className="sm:min-w-[10rem]">
                <Plus className="h-4 w-4" />
                Tao so tay
              </Button>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Thu vien</p>
              <h2 className="mt-1 text-2xl font-semibold text-[hsl(var(--foreground))]">Danh sach so tay</h2>
            </div>
            <div className="rounded-full bg-[rgba(255,248,238,0.9)] px-4 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))]">
              {items.length} so tay
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((notebook, index) => (
                <Link
                  key={notebook.id}
                  href={`/notebooks/${notebook.id}`}
                  className="group relative overflow-hidden rounded-2xl border border-[rgba(203,188,166,0.86)] bg-white p-4 shadow-[0_12px_28px_rgba(23,39,50,0.07)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(20,39,48,0.12)]"
                >
                  <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${accents[index % accents.length]} opacity-95`} />
                  <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_65%)]" />
                  <div className="relative flex h-full flex-col">
                    <div className="flex items-start justify-between">
                      <div className="grid h-14 w-14 place-items-center rounded-[1.4rem] bg-white/16 text-lg font-semibold text-white backdrop-blur">
                        {notebook.emoji?.slice(0, 2) || "NB"}
                      </div>
                      <span className="rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/82">
                        {notebook.visibility}
                      </span>
                    </div>
                    <div className="mt-16 rounded-xl bg-[rgba(255,250,244,0.94)] p-4 text-[hsl(var(--foreground))]">
                      <h3 className="text-lg font-semibold leading-tight">{notebook.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                        Mo studio de xem nguon, chat va ghi chu.
                      </p>
                      <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))]">
                        Vao workspace
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}

              {items.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-[hsl(var(--border-strong))] bg-[rgba(255,252,247,0.86)] px-6 py-14 text-center">
                  <p className="font-display text-2xl text-[hsl(var(--foreground))]">Chua co so tay nao.</p>
                  <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Tao so tay dau tien de bat dau nghien cuu.</p>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
