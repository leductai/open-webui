"use client";

import {FormEvent, use, useEffect, useMemo, useRef, useState} from "react";
import {useTranslations} from "next-intl";
import {
  BookOpenText,
  Copy,
  FileText,
  Link2,
  LoaderCircle,
  MessageSquareText,
  NotebookTabs,
  Pin,
  Plus,
  Radio,
  SendHorizonal,
  Square,
  Trash2,
  Upload,
  Users,
  WandSparkles
} from "lucide-react";
import {PanelErrorBoundary} from "@/components/notebook/error-boundary";
import {AppHeader} from "@/components/layout/app-header";
import {PdfViewer} from "@/components/notebook/pdf-viewer";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Skeleton} from "@/components/ui/skeleton";
import {apiFetch, authFetch, apiUrl} from "@/lib/api";
import {parseSseChunks} from "@/lib/sse";

type Source = {id: string; title: string; type: string; status: string; failure_reason?: string; rendered_html?: string; raw_text?: string};
type Note = {id: string; content: string; pinned: boolean};
type ChatSession = {id: string; selected_source_defaults: string[]};
type ChatMessage = {
  id: string;
  role: string;
  content: string;
  citations: Array<{source_id: string; chunk_id?: string; quote: string; location: Record<string, unknown>}>;
  created_at?: string | null;
};
type NotebookMember = {id: string; user_id: string; username: string; role: string};
type ShareLink = {id: string; token: string; mode: "notebook" | "chat"; enabled: boolean};
type ResolvedSession = {chatSession: ChatSession; chatMessages: ChatMessage[]};
type CitationLocation = Record<string, unknown>;
type AdvancedSourceForm = {
  title: string;
  semanticType: string;
  sourceLabel: string;
  sourceUrl: string;
  sourceDate: string;
  currentState: string;
  goals: string;
  primaryConcerns: string;
  triggers: string;
  protectiveFactors: string;
  suggestedSupport: string;
  preferredCoping: string;
  tags: string;
  notes: string;
  content: string;
};
type EditSourceForm = {
  id: string;
  title: string;
  rawText: string;
  editableContent: boolean;
};
const inlineCitationPattern = /(\[(\d+)\]|\u3010(\d+)(?:\u2020L\d+(?:-L?\d+)?)?\u3011)/g;

const emptyAdvancedSourceForm: AdvancedSourceForm = {
  title: "",
  semanticType: "custom_profile",
  sourceLabel: "",
  sourceUrl: "",
  sourceDate: "",
  currentState: "",
  goals: "",
  primaryConcerns: "",
  triggers: "",
  protectiveFactors: "",
  suggestedSupport: "",
  preferredCoping: "",
  tags: "",
  notes: "",
  content: "",
};

const emptyEditSourceForm: EditSourceForm = {
  id: "",
  title: "",
  rawText: "",
  editableContent: false,
};

function normalizeSelectedSources(sourceRows: Source[], selectedSourceIds: string[]) {
  const readySourceIds = sourceRows.filter((source) => source.status === "ready").map((source) => source.id);
  if (readySourceIds.length === 0) {
    return [];
  }
  if (selectedSourceIds.length === 0) {
    return readySourceIds;
  }
  const selected = selectedSourceIds.filter((sourceId) => readySourceIds.includes(sourceId));
  return selected.length > 0 ? selected : readySourceIds;
}

function getSourceStatusMeta(status: string, t: ReturnType<typeof useTranslations<"app">>) {
  if (status === "ready") {
    return {
      label: t("sourceReady"),
      badgeClass: "bg-[rgba(34,120,87,0.12)] text-[hsl(var(--foreground))]",
      animate: false,
    };
  }
  if (status === "processing") {
    return {
      label: t("sourceProcessing"),
      badgeClass: "bg-[rgba(20,84,106,0.10)] text-[hsl(var(--primary))]",
      animate: true,
    };
  }
  if (status === "uploaded") {
    return {
      label: t("sourceQueued"),
      badgeClass: "bg-[rgba(231,153,89,0.14)] text-[hsl(var(--accent-foreground))]",
      animate: true,
    };
  }
  if (status === "failed") {
    return {
      label: t("sourceFailed"),
      badgeClass: "bg-[rgba(191,75,57,0.12)] text-[hsl(var(--danger))]",
      animate: false,
    };
  }
  return {
    label: status,
    badgeClass: "bg-[rgba(20,84,106,0.08)] text-[hsl(var(--muted-foreground))]",
    animate: false,
  };
}

function parseListField(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function canEditSourceContent(sourceType: string) {
  return ["txt", "markdown", "pasted_text", "chat_context"].includes(sourceType);
}

function SourcePreview({source, page, anchor}: {source: Source | null; page?: number; anchor?: string | null}) {
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

function formatCitationLabel(location: CitationLocation, index: number, t: ReturnType<typeof useTranslations<"app">>) {
  if (typeof location.page === "number") return `Trang ${location.page}`;
  if (typeof location.slide === "number") return `Slide ${location.slide}`;
  if (typeof location.paragraph === "number") return `Đoạn ${location.paragraph + 1}`;
  if (typeof location.section === "string" && location.section.trim()) return location.section;
  if (typeof location.block === "number") return `Khối ${location.block + 1}`;
  return `${t("citations")} ${index + 1}`;
}

function renderMessageContent(
  message: ChatMessage,
  onCitationClick: (citation: ChatMessage["citations"][number]) => void
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
          aria-label={formatCitationLabel(
            citation.location,
            citationIndex,
            ((key: string) => key) as ReturnType<typeof useTranslations<"app">>
          )}
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

function Pill({
  active,
  children,
  onClick
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-[linear-gradient(135deg,#194f61_0%,#2e7784_100%)] text-white shadow-[0_10px_24px_rgba(29,94,110,0.22)]"
          : "bg-[rgba(255,248,238,0.82)] text-[hsl(var(--muted-foreground))] hover:bg-white"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function AdvancedSourceDialog({
  open,
  form,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  form: AdvancedSourceForm;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<AdvancedSourceForm>) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,35,46,0.38)] p-4 backdrop-blur-sm">
      <div className="glass-panel flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.8rem]">
        <div className="shrink-0 border-b border-[rgba(205,187,164,0.7)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Structured source</p>
          <h2 className="mt-1 text-2xl font-semibold text-[hsl(var(--foreground))]">Nâng cao</h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Nhập dữ liệu có cấu trúc để hệ thống lập chỉ mục như một nguồn tri thức trong notebook.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-3">
            <Input placeholder="Tiêu đề nguồn" value={form.title} onChange={(event) => onChange({title: event.target.value})} />
            <Select value={form.semanticType} onChange={(event) => onChange({semanticType: event.target.value})}>
              <option value="custom_profile">Hồ sơ cấu trúc</option>
              <option value="knowledge_note">Ghi chú tri thức</option>
              <option value="qa_outline">Bộ hỏi đáp</option>
              <option value="policy_reference">Quy định / chính sách</option>
              <option value="session_context">Ngữ cảnh phiên</option>
            </Select>
            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="Nguồn tham chiếu / tác giả" value={form.sourceLabel} onChange={(event) => onChange({sourceLabel: event.target.value})} />
              <Input type="date" value={form.sourceDate} onChange={(event) => onChange({sourceDate: event.target.value})} />
            </div>
            <Input placeholder="URL tham chiếu (nếu có)" value={form.sourceUrl} onChange={(event) => onChange({sourceUrl: event.target.value})} />
            <Input placeholder="Trạng thái hiện tại" value={form.currentState} onChange={(event) => onChange({currentState: event.target.value})} />
            <textarea className="min-h-20 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Vấn đề chính, mỗi dòng một ý" value={form.primaryConcerns} onChange={(event) => onChange({primaryConcerns: event.target.value})} />
            <textarea className="min-h-20 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Yếu tố kích hoạt, mỗi dòng một ý" value={form.triggers} onChange={(event) => onChange({triggers: event.target.value})} />
            <textarea className="min-h-20 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Yếu tố bảo vệ / nguồn lực, mỗi dòng một ý" value={form.protectiveFactors} onChange={(event) => onChange({protectiveFactors: event.target.value})} />
            <textarea className="min-h-20 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Hướng hỗ trợ đề xuất, mỗi dòng một ý" value={form.suggestedSupport} onChange={(event) => onChange({suggestedSupport: event.target.value})} />
            <textarea className="min-h-20 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Mục tiêu / goals, mỗi dòng một ý" value={form.goals} onChange={(event) => onChange({goals: event.target.value})} />
            <textarea className="min-h-20 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Cách đối phó ưu tiên, mỗi dòng một ý" value={form.preferredCoping} onChange={(event) => onChange({preferredCoping: event.target.value})} />
            <Input placeholder="Tags, ngăn cách bằng dấu phẩy" value={form.tags} onChange={(event) => onChange({tags: event.target.value})} />
            <textarea className="min-h-24 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Ghi chú" value={form.notes} onChange={(event) => onChange({notes: event.target.value})} />
            <textarea className="min-h-40 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]" placeholder="Nội dung chi tiết hoặc dữ liệu thô" value={form.content} onChange={(event) => onChange({content: event.target.value})} />
          </div>
        </div>

        <div className="shrink-0 border-t border-[rgba(205,187,164,0.7)] px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className="w-full" onClick={onSave} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu nguồn"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CitationPreviewDialog({
  open,
  source,
  page,
  anchor,
  onClose,
}: {
  open: boolean;
  source: Source | null;
  page?: number;
  anchor?: string | null;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,35,46,0.42)] p-4 backdrop-blur-sm">
      <div className="glass-panel flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.8rem]">
        <div className="shrink-0 border-b border-[rgba(205,187,164,0.7)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Citation preview</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-[hsl(var(--foreground))]">{source?.title ?? "Tài liệu"}</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {source?.type?.toUpperCase?.() ?? ""}
                {typeof page === "number" ? ` • Trang ${page}` : ""}
              </p>
            </div>
            <Button type="button" variant="ghost" className="shrink-0" onClick={onClose}>
              Đóng
            </Button>
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

function EditSourceDialog({
  open,
  form,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  form: EditSourceForm;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<EditSourceForm>) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(19,35,46,0.38)] p-4 backdrop-blur-sm">
      <div className="glass-panel flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.8rem]">
        <div className="shrink-0 border-b border-[rgba(205,187,164,0.7)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Source editor</p>
          <h2 className="mt-1 text-2xl font-semibold text-[hsl(var(--foreground))]">Sửa tài liệu</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="grid gap-3">
            <Input placeholder="Tiêu đề nguồn" value={form.title} onChange={(event) => onChange({title: event.target.value})} />
            {form.editableContent ? (
              <textarea
                className="min-h-72 rounded-2xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-sm text-[hsl(var(--foreground))] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--border-strong))] focus:ring-4 focus:ring-[rgba(60,139,158,0.14)]"
                placeholder="Nội dung tài liệu"
                value={form.rawText}
                onChange={(event) => onChange({rawText: event.target.value})}
              />
            ) : (
              <div className="rounded-2xl border border-[rgba(205,187,164,0.72)] bg-[rgba(255,252,247,0.92)] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                Loại tài liệu này chỉ hỗ trợ đổi tiêu đề. Nội dung gốc không thể sửa trực tiếp trong ứng dụng.
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-[rgba(205,187,164,0.7)] px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className="w-full" onClick={onSave} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage({params}: {params: Promise<{notebookId: string}>}) {
  const {notebookId} = use(params);
  const t = useTranslations("app");
  const sessionStorageKey = `chat-session:${notebookId}`;
  const [sources, setSources] = useState<Source[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [members, setMembers] = useState<NotebookMember[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"sources" | "chat" | "notes">("chat");
  const [viewerSourceId, setViewerSourceId] = useState<string | null>(null);
  const [viewerPage, setViewerPage] = useState<number | undefined>(undefined);
  const [viewerAnchor, setViewerAnchor] = useState<string | null>(null);
  const [citationPreviewOpen, setCitationPreviewOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lost, setLost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState("default");
  const [responseLength, setResponseLength] = useState("default");
  const [memberUsername, setMemberUsername] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");
  const [shareMode, setShareMode] = useState<"notebook" | "chat">("notebook");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));
  const [pendingFileName, setPendingFileName] = useState("");
  const [showAdvancedSource, setShowAdvancedSource] = useState(false);
  const [savingAdvancedSource, setSavingAdvancedSource] = useState(false);
  const [advancedSourceForm, setAdvancedSourceForm] = useState<AdvancedSourceForm>(emptyAdvancedSourceForm);
  const [showEditSource, setShowEditSource] = useState(false);
  const [savingEditSource, setSavingEditSource] = useState(false);
  const [editSourceForm, setEditSourceForm] = useState<EditSourceForm>(emptyEditSourceForm);
  const [canManageSharing, setCanManageSharing] = useState(false);

  const readySources = useMemo(() => sources.filter((source) => source.status === "ready"), [sources]);
  const pendingSources = useMemo(
    () => sources.filter((source) => source.status === "uploaded" || source.status === "processing"),
    [sources]
  );
  const viewerSource = useMemo(() => sources.find((source) => source.id === viewerSourceId) ?? null, [sources, viewerSourceId]);
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const activeStreamMessage = messages.find((message) => message.id.startsWith("stream-"));

  async function resolveChatSession(sourceRows: Source[], sessionRows: ChatSession[]): Promise<ResolvedSession> {
    const storedSessionId =
      typeof window === "undefined" ? null : window.sessionStorage.getItem(sessionStorageKey);
    const orderedCandidates = [
      ...sessionRows.filter((sessionRow) => sessionRow.id === storedSessionId),
      ...sessionRows.filter((sessionRow) => sessionRow.id !== storedSessionId)
    ];

    let fallback: ResolvedSession | null = null;

    for (const sessionRow of orderedCandidates) {
      const chatMessages = await apiFetch<ChatMessage[]>(`/chat/sessions/${sessionRow.id}/messages`);
      if (!fallback) {
        fallback = {chatSession: sessionRow, chatMessages};
      }
      if (chatMessages.length > 0) {
        return {chatSession: sessionRow, chatMessages};
      }
    }

    if (fallback) {
      return fallback;
    }

    const chatSession = await apiFetch<ChatSession>(`/notebooks/${notebookId}/chat/sessions`, {
      method: "POST",
      body: JSON.stringify({selected_source_defaults: sourceRows.map((source) => source.id)})
    });
    return {chatSession, chatMessages: []};
  }

  async function load() {
    setLoading(true);
    const [sourceRows, noteRows, sessions, memberRows] = await Promise.all([
      apiFetch<Source[]>(`/notebooks/${notebookId}/sources`),
      apiFetch<Note[]>(`/notebooks/${notebookId}/notes`),
      apiFetch<ChatSession[]>(`/notebooks/${notebookId}/chat/sessions`),
      apiFetch<NotebookMember[]>(`/notebooks/${notebookId}/members`),
    ]);
    let links: ShareLink[] = [];
    try {
      links = await apiFetch<ShareLink[]>(`/notebooks/${notebookId}/share-links`);
      setCanManageSharing(true);
    } catch {
      setCanManageSharing(false);
    }
    setSources(sourceRows);
    setNotes(noteRows);
    setMembers(memberRows);
    setShareLinks(links);
    const {chatSession, chatMessages} = await resolveChatSession(sourceRows, sessions);
    setSession(chatSession);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(sessionStorageKey, chatSession.id);
    }
    setSelected(normalizeSelectedSources(sourceRows, chatSession.selected_source_defaults ?? []));
    setMessages(chatMessages);
    if (!viewerSourceId && sourceRows[0]) {
      await openSource(sourceRows[0].id);
    }
    setLoading(false);
  }

  async function openSource(sourceId: string, location?: CitationLocation) {
    const content = await apiFetch<{raw_text?: string; rendered_html?: string; type: string; title: string}>(`/sources/${sourceId}/content`);
    setSources((items) => items.map((item) => (item.id === sourceId ? {...item, ...content} : item)));
    setViewerSourceId(sourceId);
    setViewerPage(typeof location?.page === "number" ? location.page : undefined);
    setViewerAnchor(typeof location?.anchor === "string" ? location.anchor : null);
  }

  async function openCitationPreview(citation: ChatMessage["citations"][number]) {
    await openSource(citation.source_id, citation.location);
    setCitationPreviewOpen(true);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("file") as HTMLInputElement;
    if (!input.files?.[0]) return;
    const body = new FormData();
    body.append("file", input.files[0]);
    await apiFetch(`/notebooks/${notebookId}/sources/upload`, {method: "POST", body});
    setPendingFileName("");
    input.value = "";
    await load();
  }

  async function saveAdvancedSource() {
    if (!advancedSourceForm.title.trim()) return;
    setSavingAdvancedSource(true);
    try {
      await apiFetch(`/notebooks/${notebookId}/sources/advanced`, {
        method: "POST",
        body: JSON.stringify({
          title: advancedSourceForm.title.trim(),
          semantic_type: advancedSourceForm.semanticType,
          source_label: advancedSourceForm.sourceLabel.trim() || null,
          source_url: advancedSourceForm.sourceUrl.trim() || null,
          source_date: advancedSourceForm.sourceDate.trim() || null,
          current_state: advancedSourceForm.currentState.trim() || null,
          goals: parseListField(advancedSourceForm.goals),
          primary_concerns: parseListField(advancedSourceForm.primaryConcerns),
          triggers: parseListField(advancedSourceForm.triggers),
          protective_factors: parseListField(advancedSourceForm.protectiveFactors),
          suggested_support: parseListField(advancedSourceForm.suggestedSupport),
          preferred_coping: parseListField(advancedSourceForm.preferredCoping),
          tags: parseListField(advancedSourceForm.tags),
          notes: advancedSourceForm.notes.trim() || null,
          content: advancedSourceForm.content.trim() || null,
        })
      });
      setAdvancedSourceForm(emptyAdvancedSourceForm);
      setShowAdvancedSource(false);
      await load();
    } finally {
      setSavingAdvancedSource(false);
    }
  }

  async function beginEditSource(source: Source) {
    let rawText = source.raw_text ?? "";
    if (canEditSourceContent(source.type) && !rawText) {
      const content = await apiFetch<{raw_text?: string}>(`/sources/${source.id}/content`);
      rawText = content.raw_text ?? "";
    }
    setEditSourceForm({
      id: source.id,
      title: source.title,
      rawText,
      editableContent: canEditSourceContent(source.type),
    });
    setShowEditSource(true);
  }

  async function saveEditedSource() {
    if (!editSourceForm.id || !editSourceForm.title.trim()) return;
    setSavingEditSource(true);
    try {
      await apiFetch(`/sources/${editSourceForm.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editSourceForm.title.trim(),
          raw_text: editSourceForm.editableContent ? editSourceForm.rawText : undefined,
        }),
      });
      setShowEditSource(false);
      setEditSourceForm(emptyEditSourceForm);
      await load();
    } finally {
      setSavingEditSource(false);
    }
  }

  async function removeSource(sourceId: string) {
    if (!window.confirm("Xóa tài liệu này?")) return;
    await apiFetch(`/sources/${sourceId}`, {method: "DELETE"});
    if (viewerSourceId === sourceId) {
      setViewerSourceId(null);
      setViewerPage(undefined);
      setViewerAnchor(null);
    }
    await load();
  }

  async function saveSelectionDefaults() {
    if (!session) return;
    await apiFetch(`/chat/sessions/${session.id}/selection`, {
      method: "PATCH",
      body: JSON.stringify({selected_source_defaults: selected})
    });
  }

  async function ask(event?: FormEvent, retry = false) {
    event?.preventDefault();
    if (!session || streaming || (!question.trim() && !retry)) return;
    const normalizedSelected = normalizeSelectedSources(sources, selected);
    const content = retry ? messages.filter((message) => message.role === "user").at(-1)?.content ?? "" : question;
    if (!content.trim() || normalizedSelected.length === 0) return;
    const userMessage: ChatMessage = {id: crypto.randomUUID(), role: "user", content, citations: []};
    const streamId = retry && activeStreamMessage ? activeStreamMessage.id : `stream-${crypto.randomUUID()}`;
    if (retry) {
      setMessages((items) => {
        const withoutStreams = items.filter((message) => !message.id.startsWith("stream-"));
        return [...withoutStreams, {id: streamId, role: "assistant", content: "", citations: []}];
      });
    } else {
      setMessages((items) => [...items, userMessage, {id: streamId, role: "assistant", content: "", citations: []}]);
    }
    setStreaming(true);
    setLost(false);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let assistantText = "";
    try {
      const response = await authFetch(`/chat/sessions/${session.id}/messages`, {
        method: "POST",
        headers: {Accept: "text/event-stream"},
        body: JSON.stringify({
          content,
          selected_source_ids: normalizedSelected,
          style,
          response_length: responseLength,
          save_selection_as_default: false
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      if (!response.body) {
        setLost(true);
        return;
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const {events, rest} = parseSseChunks(buffer);
        buffer = rest;
        for (const parsedEvent of events) {
          const eventName = parsedEvent.event;
          const eventData = parsedEvent.data;
          if (eventName === "meta") {
            setGenerationId(eventData);
          } else if (eventName === "chunk") {
            assistantText += eventData;
            setMessages((items) =>
              items.map((message) => (message.id === streamId ? {...message, content: assistantText} : message))
            );
          } else if (eventName === "done") {
            await load();
            setGenerationId(null);
          }
        }
      }
      if (buffer.trim()) {
        const {events} = parseSseChunks(`${buffer}\n\n`);
        for (const parsedEvent of events) {
          if (parsedEvent.event === "chunk") {
            assistantText += parsedEvent.data;
            setMessages((items) =>
              items.map((message) => (message.id === streamId ? {...message, content: assistantText} : message))
            );
          } else if (parsedEvent.event === "done") {
            await load();
            setGenerationId(null);
          }
        }
      }
    } catch {
      setLost(true);
    } finally {
      await reader?.cancel().catch(() => undefined);
      setStreaming(false);
      if (!retry) {
        setQuestion("");
      }
    }
  }

  async function stopGeneration() {
    if (!generationId) return;
    await apiFetch("/chat/generations/stop", {
      method: "POST",
      body: JSON.stringify({generation_id: generationId})
    });
    setStreaming(false);
    setGenerationId(null);
    await load();
  }

  async function clearChat() {
    if (!session) return;
    await apiFetch(`/chat/sessions/${session.id}/messages`, {method: "DELETE"});
    setMessages([]);
  }

  async function saveLastAnswer() {
    const answer = assistantMessages.at(-1);
    if (!answer) return;
    const note = await apiFetch<Note>(`/notebooks/${notebookId}/notes`, {
      method: "POST",
      body: JSON.stringify({content: answer.content})
    });
    setNotes([note, ...notes]);
  }

  async function pinNote(note: Note) {
    const updated = await apiFetch<Note>(`/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({pinned: !note.pinned})
    });
    setNotes((items) => items.map((item) => (item.id === note.id ? updated : item)));
  }

  async function deleteNote(noteId: string) {
    await apiFetch(`/notes/${noteId}`, {method: "DELETE"});
    setNotes((items) => items.filter((item) => item.id !== noteId));
  }

  async function addMember() {
    if (!memberUsername.trim()) return;
    await apiFetch(`/notebooks/${notebookId}/members`, {
      method: "POST",
      body: JSON.stringify({username: memberUsername, role: memberRole})
    });
    setMemberUsername("");
    await load();
  }

  async function removeMember(memberId: string) {
    await apiFetch(`/notebook-members/${memberId}`, {method: "DELETE"});
    await load();
  }

  async function createShareLink() {
    await apiFetch(`/notebooks/${notebookId}/share-links`, {
      method: "POST",
      body: JSON.stringify({mode: shareMode, enabled: true})
    });
    await load();
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load().catch(() => setLoading(false));
    });
    // `load` intentionally captures the current notebook scope for this page mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId, sessionStorageKey]);

  useEffect(() => {
    if (pendingSources.length === 0) return;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSources.length]);

  const sourcesPanel = (
    <PanelErrorBoundary message={t("error")} retry={t("retry")}>
      <aside className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl">
        <div className="shrink-0 space-y-3 border-b border-[rgba(205,187,164,0.55)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Source deck</p>
              <h2 className="mt-1 text-xl font-semibold">{t("sources")}</h2>
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#fff2e3_0%,#efc998_100%)] text-[hsl(var(--accent-foreground))]">
              <BookOpenText className="h-5 w-5" />
            </div>
          </div>

          <form onSubmit={upload} className="grid gap-2">
            <label className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[rgba(255,255,255,0.9)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition hover:bg-white">
              <span className="inline-flex h-8 shrink-0 items-center rounded-full bg-[linear-gradient(135deg,#194f61_0%,#2e7784_100%)] px-3 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(29,94,110,0.16)]">
                Choose file
              </span>
              <span className="min-w-0 truncate text-xs text-[hsl(var(--muted-foreground))]">
                {pendingFileName || "No file selected"}
              </span>
              <input
                name="file"
                type="file"
                className="sr-only"
                onChange={(event) => setPendingFileName(event.target.files?.[0]?.name ?? "")}
              />
            </label>
            <Button type="submit" className="h-10 w-full">
              <Upload className="h-4 w-4" />
              {t("upload")}
            </Button>
          </form>

          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-10 w-full justify-center px-3"
              onClick={() => setShowAdvancedSource((value) => !value)}
            >
              <Plus className="h-4 w-4" />
              Nâng cao
            </Button>
            <Button type="button" variant="ghost" className="h-10 w-full justify-center px-3" onClick={saveSelectionDefaults}>
              <Pin className="h-4 w-4" />
              {t("saveDefault")}
            </Button>
          </div>

        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
          {loading ? <Skeleton className="h-24 rounded-xl" /> : null}

          <div className="space-y-2.5">
            {sources.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-[hsl(var(--border-strong))] bg-[rgba(255,252,247,0.78)] p-4 text-sm text-[hsl(var(--muted-foreground))]">
                {t("emptySources")}
              </div>
            ) : null}

            {sources.map((source) => {
              const active = viewerSourceId === source.id;
              const checked = selected.includes(source.id);
              const statusMeta = getSourceStatusMeta(source.status, t);
              return (
                <div
                  key={source.id}
                  className={[
                    "rounded-xl border p-3",
                    active
                      ? "border-[rgba(46,119,132,0.5)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98)_0%,rgba(244,235,222,0.92)_100%)] ring-1 ring-[rgba(46,119,132,0.18)]"
                      : "border-[rgba(206,191,171,0.82)] bg-[rgba(255,255,255,0.88)]"
                  ].join(" ")}
                >
                  <div className="flex gap-2.5">
                    <label className="mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={source.status !== "ready"}
                        onChange={(event) =>
                          setSelected(event.target.checked ? [...selected, source.id] : selected.filter((id) => id !== source.id))
                        }
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[hsl(var(--foreground))]">{source.title}</h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--muted-foreground))]">{source.type}</span>
                        <span
                          className={[
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                            statusMeta.badgeClass,
                          ].join(" ")}
                        >
                          {statusMeta.animate ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
                          {statusMeta.label}
                        </span>
                      </div>
                      {source.failure_reason ? (
                        <p className="mt-2 text-xs text-[hsl(var(--danger))]">{source.failure_reason}</p>
                      ) : null}
                      <div className="mt-2.5 grid grid-cols-1 gap-1.5">
                        <Button
                          type="button"
                          variant={active ? "primary" : "secondary"}
                          className="h-8 w-full rounded-lg px-3 text-xs"
                          onClick={() => openSource(source.id)}
                        >
                          Open
                        </Button>
                        {canManageSharing ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-full rounded-lg px-3 text-xs"
                            onClick={() => beginEditSource(source)}
                          >
                            {t("edit")}
                          </Button>
                        ) : null}
                        {canManageSharing ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-full rounded-lg px-3 text-xs text-[hsl(var(--danger))]"
                            onClick={() => removeSource(source.id)}
                          >
                            {t("delete")}
                          </Button>
                        ) : null}
                        {source.type === "pdf" || source.type === "docx" || source.type === "pptx" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 w-full rounded-lg px-3 text-xs"
                            onClick={() => window.open(apiUrl(`/sources/${source.id}/download`), "_blank")}
                          >
                            {t("download")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </PanelErrorBoundary>
  );

  const chatPanel = (
    <PanelErrorBoundary message={t("error")} retry={t("retry")}>
      <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl">
        <div className="border-b border-[rgba(205,187,164,0.7)] bg-[linear-gradient(180deg,rgba(255,250,244,0.95)_0%,rgba(248,241,231,0.9)_100%)] px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Conversation studio</p>
              <h2 className="mt-1 text-2xl font-semibold text-[hsl(var(--foreground))]">{t("chat")}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Pill active={style === "default"} onClick={() => setStyle("default")}>{t("defaultStyle")}</Pill>
              <Pill active={style === "learning_guide"} onClick={() => setStyle("learning_guide")}>{t("learningGuide")}</Pill>
              <Pill active={style === "custom"} onClick={() => setStyle("custom")}>{t("custom")}</Pill>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-[rgba(255,255,255,0.85)] px-3 py-2 text-[hsl(var(--muted-foreground))]">
              {t("readySelected", {ready: readySources.length, selected: selected.length})}
            </span>
            <Pill active={responseLength === "shorter"} onClick={() => setResponseLength("shorter")}>{t("shorter")}</Pill>
            <Pill active={responseLength === "default"} onClick={() => setResponseLength("default")}>{t("defaultLength")}</Pill>
            <Pill active={responseLength === "longer"} onClick={() => setResponseLength("longer")}>{t("longer")}</Pill>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden px-4 py-4 md:px-5">
          <div className="scroll-fade flex h-full flex-col gap-4 overflow-auto pr-1">
            {messages.map((message) => (
              <article
                key={message.id}
                className={[
                  "max-w-[86%] rounded-[1.8rem] px-4 py-4 shadow-[0_16px_32px_rgba(20,42,52,0.07)]",
                  message.role === "user"
                    ? "ml-auto bg-[linear-gradient(135deg,#164d5f_0%,#2c7380_100%)] text-white"
                    : "bg-[rgba(255,251,246,0.95)] text-[hsl(var(--foreground))]"
                ].join(" ")}
              >
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-80">
                  {message.role === "user" ? <Radio className="h-3.5 w-3.5" /> : <WandSparkles className="h-3.5 w-3.5" />}
                  {message.role}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {message.content
                    ? renderMessageContent(message, openCitationPreview)
                    : streaming && message.id === "stream"
                      ? "..."
                      : ""}
                </p>
              </article>
            ))}
            {streaming && messages.every((message) => !message.id.startsWith("stream-")) ? <Skeleton className="h-28 max-w-[32rem]" /> : null}
            {lost ? <Button className="self-start" onClick={() => ask(undefined, true)}>{t("connectionLost")}</Button> : null}
          </div>
        </div>

        <form onSubmit={ask} className="border-t border-[rgba(205,187,164,0.7)] bg-[rgba(255,250,243,0.92)] px-4 py-4 md:px-5">
          <div className="rounded-[1.8rem] border border-[rgba(205,187,164,0.86)] bg-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <div className="flex flex-col gap-3">
              <Input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={t("ask")}
                disabled={streaming}
                className="border-0 bg-[rgba(247,242,234,0.72)] shadow-none focus:ring-[rgba(60,139,158,0.12)]"
              />
              <div className="flex flex-wrap gap-2">
                <Button className="rounded-full px-4" disabled={streaming}>
                  <SendHorizonal className="h-4 w-4" />
                  {t("ask")}
                </Button>
                <Button variant="secondary" type="button" className="rounded-full px-4" onClick={saveLastAnswer}>
                  {t("saveNote")}
                </Button>
                <Button variant="ghost" type="button" className="rounded-full px-4" onClick={clearChat}>
                  <Trash2 className="h-4 w-4" />
                  {t("clearChat")}
                </Button>
                <Button variant="ghost" type="button" className="rounded-full px-4" onClick={stopGeneration} disabled={!streaming}>
                  <Square className="h-4 w-4" />
                  {t("stop")}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  className="rounded-full px-4"
                  onClick={() => copyText(assistantMessages.at(-1)?.content ?? "")}
                >
                  <Copy className="h-4 w-4" />
                  {t("copy")}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </section>
    </PanelErrorBoundary>
  );

  const notesPanel = (
    <PanelErrorBoundary message={t("error")} retry={t("retry")}>
      <aside className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl">
        <div className="border-b border-[rgba(205,187,164,0.7)] bg-[linear-gradient(180deg,rgba(255,250,244,0.95)_0%,rgba(248,241,231,0.9)_100%)] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">Reference stack</p>
          <h2 className="mt-1 text-2xl font-semibold">{t("notes")}</h2>
        </div>

        <div className="scroll-fade flex-1 space-y-4 overflow-auto p-4 md:p-5">
          <section className="overflow-hidden rounded-[1.8rem] border border-[rgba(204,190,171,0.84)] bg-[rgba(255,255,255,0.84)]">
            <div className="flex items-center justify-between border-b border-[rgba(206,191,171,0.7)] px-4 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
                <h3 className="font-semibold">{t("viewer")}</h3>
              </div>
              {viewerSource ? <span className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--muted-foreground))]">{viewerSource.type}</span> : null}
            </div>
            <div className="max-h-[22rem] overflow-auto p-4">
              {loading ? <Skeleton className="h-32" /> : <SourcePreview source={viewerSource} page={viewerPage} anchor={viewerAnchor} />}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-[rgba(204,190,171,0.84)] bg-[rgba(255,255,255,0.84)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <NotebookTabs className="h-4 w-4 text-[hsl(var(--accent))]" />
              <h3 className="font-semibold">{t("notes")}</h3>
            </div>
            {loading ? <Skeleton className="h-28" /> : null}
            <div className="space-y-3">
              {notes.length === 0 && !loading ? (
                <div className="rounded-[1.4rem] border border-dashed border-[hsl(var(--border-strong))] bg-[rgba(255,252,247,0.86)] p-4 text-sm text-[hsl(var(--muted-foreground))]">
                  {t("emptyNotes")}
                </div>
              ) : null}
              {notes.map((note) => (
                <article key={note.id} className="rounded-[1.5rem] bg-[rgba(248,242,233,0.9)] p-4">
                  <p className="whitespace-pre-wrap text-sm leading-7">{note.content}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="secondary" className="h-9 rounded-full px-3 text-xs" onClick={() => pinNote(note)}>
                      <Pin className="h-3.5 w-3.5" />
                      {note.pinned ? t("unpin") : t("pin")}
                    </Button>
                    <Button variant="ghost" className="h-9 rounded-full px-3 text-xs" onClick={() => deleteNote(note.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("delete")}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-[rgba(204,190,171,0.84)] bg-[rgba(255,255,255,0.84)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-[hsl(var(--primary))]" />
              <h3 className="font-semibold">{t("members")}</h3>
            </div>
            <div className="mb-3 flex gap-2">
              <Input value={memberUsername} onChange={(event) => setMemberUsername(event.target.value)} placeholder={t("username")} />
              <Select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
              </Select>
            </div>
            <Button variant="secondary" className="mb-3 w-full" onClick={addMember}>
              <Plus className="h-4 w-4" />
              {t("addMember")}
            </Button>
            <div className="space-y-2">
              {members.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{t("emptyMembers")}</p> : null}
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-[1.3rem] bg-[rgba(248,242,233,0.9)] px-3 py-3 text-sm">
                  <span>{member.username} · {member.role}</span>
                  <Button variant="ghost" className="h-8 rounded-full px-3 text-xs" onClick={() => removeMember(member.id)}>
                    {t("delete")}
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-[rgba(204,190,171,0.84)] bg-[rgba(255,255,255,0.84)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-[hsl(var(--accent))]" />
              <h3 className="font-semibold">{t("sharing")}</h3>
            </div>
            {canManageSharing ? (
              <div className="mb-3 flex gap-2">
                <Select className="flex-1" value={shareMode} onChange={(event) => setShareMode(event.target.value as "notebook" | "chat")}>
                  <option value="notebook">{t("publicNotebook")}</option>
                  <option value="chat">{t("chatView")}</option>
                </Select>
                <Button className="px-4" onClick={createShareLink}>Create</Button>
              </div>
            ) : (
              <p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">Bạn có quyền xem, nhưng không có quyền quản lý chia sẻ notebook này.</p>
            )}
            <div className="space-y-2">
              {shareLinks.map((link) => (
                <div key={link.id} className="rounded-[1.3rem] bg-[rgba(248,242,233,0.9)] p-3 text-sm">
                  <div className="font-semibold capitalize">{link.mode} · {link.enabled ? "enabled" : "disabled"}</div>
                  <div className="mt-2 break-all text-xs text-[hsl(var(--muted-foreground))]">{origin ? `${origin}/share/${link.token}` : link.token}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </PanelErrorBoundary>
  );

  const mobileTabs = [
    {id: "sources" as const, label: t("sources"), icon: FileText},
    {id: "chat" as const, label: t("chat"), icon: MessageSquareText},
    {id: "notes" as const, label: t("notes"), icon: NotebookTabs}
  ];

  return (
    <main className="flex h-dvh overflow-hidden flex-col px-3 py-3 md:px-5 md:py-4">
      <div className="mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col gap-3 overflow-hidden">
        <AdvancedSourceDialog
          open={showAdvancedSource}
          form={advancedSourceForm}
          saving={savingAdvancedSource}
          onClose={() => {
            setAdvancedSourceForm(emptyAdvancedSourceForm);
            setShowAdvancedSource(false);
          }}
          onChange={(patch) => setAdvancedSourceForm((form) => ({...form, ...patch}))}
          onSave={saveAdvancedSource}
        />
        <EditSourceDialog
          open={showEditSource}
          form={editSourceForm}
          saving={savingEditSource}
          onClose={() => {
            setShowEditSource(false);
            setEditSourceForm(emptyEditSourceForm);
          }}
          onChange={(patch) => setEditSourceForm((form) => ({...form, ...patch}))}
          onSave={saveEditedSource}
        />
        <CitationPreviewDialog
          open={citationPreviewOpen}
          source={viewerSource}
          page={viewerPage}
          anchor={viewerAnchor}
          onClose={() => setCitationPreviewOpen(false)}
        />

        <AppHeader
          title={t("chat")}
          subtitle="Notebook studio"
          backHref="/notebooks"
          backLabel={t("notebooks")}
          badges={[
            {label: `${readySources.length} ${t("sources").toLowerCase()}`},
            {label: `${notes.length} ${t("notes").toLowerCase()}`}
          ]}
        />

        <div className="hidden min-h-0 flex-1 gap-3 overflow-hidden xl:grid xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,360px)]">
          {sourcesPanel}
          {chatPanel}
          {notesPanel}
        </div>

        <div className="flex min-h-0 flex-1 flex-col xl:hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            {activeTab === "sources" ? sourcesPanel : activeTab === "notes" ? notesPanel : chatPanel}
          </div>
          <nav className="glass-panel mt-3 grid shrink-0 grid-cols-3 rounded-2xl p-1.5">
            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={[
                    "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition",
                    active
                      ? "bg-[linear-gradient(135deg,#194f61_0%,#2e7784_100%)] text-white shadow-[0_8px_20px_rgba(29,94,110,0.2)]"
                      : "text-[hsl(var(--muted-foreground))] hover:bg-[rgba(255,248,238,0.82)]"
                  ].join(" ")}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </main>
  );
}
