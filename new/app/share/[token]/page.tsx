"use client";

import {FormEvent, use, useEffect, useMemo, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {SendHorizonal} from "lucide-react";
import {AppHeader} from "@/components/layout/app-header";
import {PdfViewer} from "@/components/notebook/pdf-viewer";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {apiUrl} from "@/lib/api";
import {parseSseChunks} from "@/lib/sse";

type PublicSource = {
  id: string;
  title: string;
  type: string;
  status: string;
  rendered_html?: string;
  raw_text?: string;
};
type PublicNotebook = {
  notebook_id: string;
  notebook_title: string;
  mode: "notebook" | "chat";
  anonymous_session_id: string;
  sources: PublicSource[];
};

type PublicMessage = {
  id: string;
  role: string;
  content: string;
  citations: Array<{source_id: string; quote: string; location: Record<string, unknown>}>;
};

const inlineCitationPattern = /(\[(\d+)\]|\u3010(\d+)(?:\u2020L\d+(?:-L?\d+)?)?\u3011)/g;

function SourcePreview({source, page, anchor}: {source: PublicSource | null; page?: number; anchor?: string | null}) {
  const t = useTranslations("app");
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!anchor || !contentRef.current) return;
    const target = contentRef.current.querySelector(`[id="${anchor}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({behavior: "smooth", block: "center"});
    }
  }, [anchor, source?.id, source?.rendered_html]);

  if (!source) {
    return <p className="text-sm text-[hsl(var(--muted-foreground))]">{t("sourceContent")}</p>;
  }
  if (source.type === "pdf") {
    return <PdfViewer url={apiUrl(`/sources/${source.id}/download`)} page={page} />;
  }
  if (source.rendered_html) {
    return <div ref={contentRef} className="rich-content" dangerouslySetInnerHTML={{__html: source.rendered_html}} />;
  }
  return <pre className="whitespace-pre-wrap text-sm leading-6">{source.raw_text ?? ""}</pre>;
}

function CitationPreviewDialog({
  open,
  source,
  page,
  anchor,
  onClose,
}: {
  open: boolean;
  source: PublicSource | null;
  page?: number;
  anchor?: string | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,35,46,0.42)] p-4 backdrop-blur-sm">
      <div className="glass-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.8rem]">
        <div className="shrink-0 border-b border-[rgba(205,187,164,0.7)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Citation preview</p>
              <h2 className="mt-1 truncate text-xl font-semibold text-[hsl(var(--foreground))]">{source?.title ?? "Tài liệu"}</h2>
            </div>
            <Button type="button" variant="ghost" onClick={onClose}>Đóng</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="rounded-[1.6rem] border border-[rgba(204,190,171,0.84)] bg-[rgba(255,255,255,0.86)] p-4">
            <SourcePreview source={source} page={page} anchor={anchor} />
          </div>
        </div>
      </div>
    </div>
  );
}

function renderMessageContent(
  message: PublicMessage,
  onCitationClick: (citation: PublicMessage["citations"][number]) => void
) {
  if (!message.content) {
    return null;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of message.content.matchAll(inlineCitationPattern)) {
    const fullMatch = match[0];
    const matchIndex = match.index ?? 0;
    const referenceValue = match[2] ?? match[3];

    if (matchIndex > cursor) {
      parts.push(<span key={`text-${cursor}`}>{message.content.slice(cursor, matchIndex)}</span>);
    }

    const citationIndex = Number(referenceValue) - 1;
    const citation = message.citations[citationIndex];
    if (citation) {
      parts.push(
        <button
          key={`cite-${matchIndex}`}
          type="button"
          title={citation.quote}
          className="mx-0.5 inline-flex min-w-5 -translate-y-1 items-center justify-center rounded-full border border-[rgba(46,119,132,0.22)] bg-[rgba(242,248,249,0.96)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[hsl(var(--primary))] transition hover:bg-white"
          onClick={() => onCitationClick(citation)}
        >
          {citationIndex + 1}
        </button>
      );
    } else {
      parts.push(<span key={`raw-${matchIndex}`}>{fullMatch}</span>);
    }

    cursor = matchIndex + fullMatch.length;
  }

  if (cursor < message.content.length) {
    parts.push(<span key={`text-${cursor}`}>{message.content.slice(cursor)}</span>);
  }

  return parts;
}

export default function SharedNotebookPage({params}: {params: Promise<{token: string}>}) {
  const {token} = use(params);
  const t = useTranslations("app");
  const [notebook, setNotebook] = useState<PublicNotebook | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [viewerSourceId, setViewerSourceId] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState<number | undefined>(undefined);
  const [viewerAnchor, setViewerAnchor] = useState<string | null>(null);
  const [citationPreviewOpen, setCitationPreviewOpen] = useState(false);

  const viewerSource = useMemo(
    () => notebook?.sources.find((source) => source.id === viewerSourceId) ?? null,
    [notebook?.sources, viewerSourceId]
  );

  async function load() {
    setLoading(true);
    const data = await fetch(apiUrl(`/public/notebooks/${token}`), {credentials: "include"}).then((response) => response.json());
    setNotebook(data);
    setSelected(data.sources.filter((source: PublicSource) => source.status === "ready").map((source: PublicSource) => source.id));
    const messageRows = await fetch(apiUrl(`/public/notebooks/${token}/messages`), {credentials: "include"}).then((response) => response.json());
    setMessages(messageRows);
    setLoading(false);
  }

  async function openSource(sourceId: string, location?: Record<string, unknown>) {
    const content = await fetch(apiUrl(`/public/notebooks/${token}/sources/${sourceId}/content`), {credentials: "include"}).then((response) => response.json());
    setNotebook((current) =>
      current
        ? {
            ...current,
            sources: current.sources.map((source) => (source.id === sourceId ? {...source, ...content} : source)),
          }
        : current
    );
    setViewerSourceId(sourceId);
    setViewerPage(typeof location?.page === "number" ? location.page : undefined);
    setViewerAnchor(typeof location?.anchor === "string" ? location.anchor : null);
  }

  async function openCitationPreview(citation: PublicMessage["citations"][number]) {
    await openSource(citation.source_id, citation.location);
    setCitationPreviewOpen(true);
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || streaming) return;
    const streamId = `stream-${crypto.randomUUID()}`;
    setMessages((items) => [...items, {id: crypto.randomUUID(), role: "user", content: question, citations: []}, {id: streamId, role: "assistant", content: "", citations: []}]);
    setStreaming(true);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const response = await fetch(apiUrl(`/public/notebooks/${token}/messages`), {
        method: "POST",
        credentials: "include",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({content: question, selected_source_ids: selected, style: "default", response_length: "default"})
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      reader = response.body?.getReader() ?? null;
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const {events, rest} = parseSseChunks(buffer);
        buffer = rest;
        for (const parsedEvent of events) {
          const eventName = parsedEvent.event;
          const eventData = parsedEvent.data;
          if (eventName === "chunk") {
            answer += eventData;
            setMessages((items) => items.map((item) => (item.id === streamId ? {...item, content: answer} : item)));
          }
        }
      }
      if (buffer.trim()) {
        const {events} = parseSseChunks(`${buffer}\n\n`);
        for (const parsedEvent of events) {
          if (parsedEvent.event === "chunk") {
            answer += parsedEvent.data;
            setMessages((items) => items.map((item) => (item.id === streamId ? {...item, content: answer} : item)));
          }
        }
      }
      setQuestion("");
      await load();
    } catch {
      setMessages((items) => items.filter((item) => item.id !== streamId));
    } finally {
      await reader?.cancel().catch(() => undefined);
      setStreaming(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load().catch(() => undefined);
    });
    // `load` intentionally captures the current token-bound page scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading || !notebook) {
    return (
      <main className="min-h-dvh px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh overflow-hidden flex-col px-4 py-4 md:px-8 md:py-6">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-hidden">
        <CitationPreviewDialog
          open={citationPreviewOpen}
          source={viewerSource}
          page={viewerPage}
          anchor={viewerAnchor}
          onClose={() => setCitationPreviewOpen(false)}
        />

        <AppHeader
          title={notebook.notebook_title}
          subtitle={notebook.mode === "chat" ? t("chatView") : t("publicNotebook")}
          badges={[{label: `${selected.length} nguồn`}]}
        />

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[hsl(var(--muted-foreground))]">{t("sources")}</h2>
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto">
              {notebook.sources.map((source) => (
                <label
                  key={source.id}
                  className="flex items-start gap-3 rounded-xl border border-[hsl(var(--border))] bg-white/80 p-3 text-sm transition hover:bg-white"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.includes(source.id)}
                    disabled={source.status !== "ready"}
                    onChange={(event) =>
                      setSelected(event.target.checked ? [...selected, source.id] : selected.filter((id) => id !== source.id))
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[hsl(var(--foreground))]">{source.title}</span>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{source.status}</span>
                  </span>
                </label>
              ))}
            </div>
          </aside>

          <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl">
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="flex min-h-full flex-col gap-3">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={[
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7",
                      message.role === "user"
                        ? "ml-auto bg-[linear-gradient(135deg,#164d5f_0%,#2c7380_100%)] text-white"
                        : "border border-[hsl(var(--border))] bg-white/90 text-[hsl(var(--foreground))]"
                    ].join(" ")}
                  >
                    <p className="whitespace-pre-wrap">
                      {message.content
                        ? renderMessageContent(message, openCitationPreview)
                        : message.id.startsWith("stream-")
                          ? "..."
                          : ""}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            {notebook.mode === "chat" ? (
              <form onSubmit={ask} className="shrink-0 border-t border-[hsl(var(--border))] bg-white/70 p-4">
                <div className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={t("ask")}
                    disabled={streaming}
                    className="flex-1"
                  />
                  <Button className="rounded-xl px-4" disabled={streaming}>
                    <SendHorizonal className="h-4 w-4" />
                    {t("ask")}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
