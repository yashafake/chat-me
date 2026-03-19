"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { apiFetch, ApiError, clearStoredCsrfToken, getApiBaseUrl, setStoredCsrfToken } from "../lib/api";
import { OperatorPwaControls } from "./operator-pwa-controls";

interface Operator {
  id: number;
  email: string;
  displayName: string;
  role: string;
}

interface Project {
  projectKey: string;
  displayName: string;
}

interface Contact {
  id: number;
  projectKey: string;
  projectDisplayName: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastConversationId: number | null;
}

interface Message {
  id: number;
  senderType: "visitor" | "operator" | "system";
  bodyPlain: string;
  createdAt: string;
  operatorName?: string | null;
}

interface Note {
  id: number;
  body: string;
  createdAt: string;
  operatorName: string | null;
}

interface ConversationSummary {
  id: number;
  projectKey: string;
  projectDisplayName: string;
  status: "open" | "closed" | "spam";
  lastMessageAt: string;
  unread: boolean;
  latestMessage: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  sourceUrl?: string | null;
}

interface ConversationDetails extends ConversationSummary {
  startedAt: string;
  sourceUrl: string | null;
  referrer: string | null;
  messages: Message[];
  notes: Note[];
}

type QueueStatus = ConversationSummary["status"];

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getStatusMeta(status: QueueStatus): {
  label: string;
  className: string;
} {
  if (status === "open") {
    return {
      label: "Открыт",
      className: "border-emerald-300/70 bg-emerald-100 text-emerald-900"
    };
  }

  if (status === "closed") {
    return {
      label: "Закрыт",
      className: "border-slate-300/80 bg-slate-100 text-slate-700"
    };
  }

  return {
    label: "Спам",
    className: "border-rose-300/70 bg-rose-100 text-rose-800"
  };
}

function getConversationTitle(
  item: Pick<ConversationSummary, "id" | "visitorName" | "visitorEmail" | "visitorPhone">
): string {
  return item.visitorName || item.visitorEmail || item.visitorPhone || `Диалог #${item.id}`;
}

function getConversationSubtitle(
  item: Pick<ConversationSummary, "visitorName" | "visitorEmail" | "visitorPhone">
): string | null {
  if (item.visitorName) {
    return item.visitorEmail || item.visitorPhone || null;
  }

  if (item.visitorEmail && item.visitorPhone) {
    return item.visitorPhone;
  }

  return null;
}

function compactUrl(value: string | null | undefined): string {
  if (!value) {
    return "Не указано";
  }

  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

function messageAuthorLabel(message: Message): string {
  if (message.senderType === "operator") {
    return message.operatorName || "Оператор";
  }

  if (message.senderType === "system") {
    return "Система";
  }

  return "Посетитель";
}

function getStatusWeight(status: QueueStatus): number {
  if (status === "open") {
    return 0;
  }

  if (status === "closed") {
    return 1;
  }

  return 2;
}

function sortConversations(items: ConversationSummary[]): ConversationSummary[] {
  return [...items].sort((left, right) => {
    const statusWeight = getStatusWeight(left.status) - getStatusWeight(right.status);

    if (statusWeight !== 0) {
      return statusWeight;
    }

    if (left.status === "open" && right.status === "open") {
      const unreadWeight = Number(right.unread) - Number(left.unread);

      if (unreadWeight !== 0) {
        return unreadWeight;
      }
    }

    return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
  });
}

function getConversationInitial(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "#";
}

function getQueueHeading(status: QueueStatus): string {
  if (status === "open") {
    return "Активные";
  }

  if (status === "closed") {
    return "Закрытые";
  }

  return "Спам";
}

function getQueueEmptyText(status: QueueStatus): string {
  if (status === "open") {
    return "Сейчас в основной очереди пусто. Как только придет новое сообщение, диалог появится здесь.";
  }

  if (status === "closed") {
    return "Закрытых диалогов пока нет по текущему проекту.";
  }

  return "В спам пока ничего не отправляли по текущему фильтру.";
}

function QueueTabButton(props: {
  active: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        props.active
          ? "bg-slate-950 text-white shadow-[0_12px_30px_rgba(15,23,42,0.2)]"
          : "text-slate-600 hover:bg-slate-950/8 hover:text-slate-950"
      }`}
    >
      {props.label}
    </button>
  );
}

function DrawerSection(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{props.title}</div>
      {props.description ? (
        <p className="mt-2 text-sm leading-6 text-slate-500">{props.description}</p>
      ) : null}
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

function DetailRow(props: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{props.label}</div>
      {props.href ? (
        <a
          href={props.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all text-sm font-medium text-sky-700 transition hover:text-sky-800"
        >
          {props.value}
        </a>
      ) : (
        <div className="mt-2 text-sm font-medium text-slate-900">{props.value}</div>
      )}
    </div>
  );
}

function ActionButton(props: {
  tone: "neutral" | "accent" | "danger";
  disabled?: boolean;
  children: React.ReactNode;
  onClick(): void;
}) {
  const toneClassName =
    props.tone === "accent"
      ? "border-emerald-300/70 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
      : props.tone === "danger"
        ? "border-rose-300/70 bg-rose-50 text-rose-800 hover:bg-rose-100"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`rounded-full border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClassName}`}
    >
      {props.children}
    </button>
  );
}

export function ChatConsole(props: {
  conversationId?: number;
}) {
  const router = useRouter();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("open");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingStatus, setSavingStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [menuError, setMenuError] = useState("");
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const selectedConversationId = props.conversationId;

  async function loadAuth() {
    try {
      const payload = await apiFetch<{
        operator: Operator;
        csrfToken: string;
      }>("/v1/admin/auth/me");
      setOperator(payload.operator);
      setProfileName(payload.operator.displayName);
      setStoredCsrfToken(payload.csrfToken);
      return true;
    } catch (unknownError) {
      clearStoredCsrfToken();

      if (unknownError instanceof ApiError && unknownError.statusCode === 401) {
        router.push("/login");
        return false;
      }

      setError("Не удалось проверить сессию оператора.");
      return false;
    }
  }

  async function loadProjects() {
    const payload = await apiFetch<{
      projects: Project[];
    }>("/v1/admin/projects");
    setProjects(payload.projects);
  }

  async function loadContacts(options?: {
    showSpinner?: boolean;
  }) {
    if (options?.showSpinner) {
      setContactsLoading(true);
    }

    try {
      const search = new URLSearchParams();

      if (projectFilter) {
        search.set("projectKey", projectFilter);
      }

      search.set("limit", "80");

      const payload = await apiFetch<{
        contacts: Contact[];
      }>(`/v1/admin/contacts?${search.toString()}`);
      setContacts(payload.contacts);
      setMenuError("");
      return payload.contacts;
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : "Не удалось загрузить контакты.";
      setMenuError(message);
      return [];
    } finally {
      setContactsLoading(false);
    }
  }

  async function loadConversations(options?: {
    showSpinner?: boolean;
    status?: QueueStatus;
  }): Promise<ConversationSummary[]> {
    if (options?.showSpinner) {
      setListLoading(true);
    }

    const effectiveStatus = options?.status ?? queueStatus;

    try {
      const search = new URLSearchParams();

      if (projectFilter) {
        search.set("projectKey", projectFilter);
      }

      search.set("status", effectiveStatus);

      const payload = await apiFetch<{
        conversations: ConversationSummary[];
      }>(`/v1/admin/conversations?${search.toString()}`);
      setConversations(payload.conversations);
      setError("");
      return payload.conversations;
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : "Не удалось загрузить очередь диалогов.";
      setError(message);
      return [];
    } finally {
      setListLoading(false);
    }
  }

  async function loadConversation() {
    if (!selectedConversationId) {
      setConversation(null);
      setDetailError("");
      return;
    }

    try {
      const payload = await apiFetch<{
        conversation: ConversationDetails;
      }>(`/v1/admin/conversations/${selectedConversationId}`);
      setConversation(payload.conversation);
      setDetailError("");
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось загрузить диалог.";
      setConversation(null);
      setDetailError(message);
    }
  }

  useEffect(() => {
    let ignore = false;

    void (async () => {
      setLoading(true);
      const authed = await loadAuth();

      if (!authed || ignore) {
        setLoading(false);
        return;
      }

      await Promise.all([
        loadProjects(),
        loadConversations({ showSpinner: true }),
        loadContacts({ showSpinner: true })
      ]);

      if (!ignore) {
        setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!operator) {
      return;
    }

    void loadConversations({ showSpinner: true });
  }, [operator, projectFilter, queueStatus]);

  useEffect(() => {
    if (!operator) {
      return;
    }

    void loadContacts({ showSpinner: workspaceMenuOpen });
  }, [operator, projectFilter, workspaceMenuOpen]);

  useEffect(() => {
    if (!operator) {
      return;
    }

    void loadConversation();
  }, [operator, selectedConversationId]);

  useEffect(() => {
    setWorkspaceMenuOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (workspaceMenuOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [workspaceMenuOpen]);

  useEffect(() => {
    if (!selectedConversationId) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const source = new EventSource(
      `${getApiBaseUrl()}/v1/admin/conversations/${selectedConversationId}/stream`,
      {
        withCredentials: true
      }
    );

    source.addEventListener("conversation.updated", () => {
      void Promise.all([loadConversation(), loadConversations()]);
    });
    source.onerror = () => {
      setDetailError("Обновления переподключаются...");
    };
    eventSourceRef.current = source;

    return () => {
      source.close();
    };
  }, [selectedConversationId, projectFilter, queueStatus]);

  useEffect(() => {
    if (!operator) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadConversations();
    }, 10_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [operator, projectFilter, queueStatus]);

  const sortedConversations = useMemo(() => sortConversations(conversations), [conversations]);

  useEffect(() => {
    if (!selectedConversationId || loading || listLoading) {
      return;
    }

    if (sortedConversations.some((item) => item.id === selectedConversationId)) {
      return;
    }

    router.replace(sortedConversations[0] ? `/chat/${sortedConversations[0].id}` : "/chat");
  }, [selectedConversationId, sortedConversations, loading, listLoading, router]);

  useEffect(() => {
    if (!conversation) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (threadRef.current) {
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
      }
    }, 30);

    return () => {
      window.clearTimeout(timer);
    };
  }, [conversation?.id, conversation?.messages.length]);

  const replyWaitingCount = useMemo(
    () => sortedConversations.filter((item) => item.unread).length,
    [sortedConversations]
  );

  async function sendReply() {
    if (!selectedConversationId || !replyBody.trim()) {
      return;
    }

    setSavingReply(true);

    try {
      await apiFetch(
        `/v1/admin/conversations/${selectedConversationId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body: replyBody
          })
        },
        { csrf: true }
      );
      setReplyBody("");
      setDetailError("");
      await Promise.all([loadConversation(), loadConversations()]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось отправить ответ.";
      setDetailError(message);
    } finally {
      setSavingReply(false);
    }
  }

  async function handleReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendReply();
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversationId || !noteBody.trim()) {
      return;
    }

    setSavingNote(true);

    try {
      await apiFetch(
        `/v1/admin/conversations/${selectedConversationId}/notes`,
        {
          method: "POST",
          body: JSON.stringify({
            body: noteBody
          })
        },
        { csrf: true }
      );
      setNoteBody("");
      setDetailError("");
      await loadConversation();
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось сохранить заметку.";
      setDetailError(message);
    } finally {
      setSavingNote(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!operator || !profileName.trim() || savingProfile) {
      return;
    }

    setSavingProfile(true);
    setMenuError("");

    try {
      const payload = await apiFetch<{
        operator: Operator;
      }>(
        "/v1/admin/profile",
        {
          method: "POST",
          body: JSON.stringify({
            displayName: profileName
          })
        },
        { csrf: true }
      );

      setOperator(payload.operator);
      setProfileName(payload.operator.displayName);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : "Не удалось сохранить имя оператора.";
      setMenuError(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function updateStatus(nextStatus: QueueStatus) {
    if (!selectedConversationId || savingStatus) {
      return;
    }

    setSavingStatus(nextStatus);
    setDetailError("");

    try {
      const payload = await apiFetch<{
        conversation: ConversationSummary | null;
      }>(
        `/v1/admin/conversations/${selectedConversationId}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            status: nextStatus
          })
        },
        { csrf: true }
      );

      if (payload.conversation) {
        setConversation((currentConversation) =>
          currentConversation && currentConversation.id === payload.conversation?.id
            ? {
                ...currentConversation,
                ...payload.conversation
              }
            : currentConversation
        );
      }

      setQueueStatus(nextStatus);
      await Promise.all([
        loadConversation(),
        loadConversations({
          status: nextStatus
        })
      ]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось обновить статус.";
      setDetailError(message);
    } finally {
      setSavingStatus(null);
    }
  }

  async function logout() {
    try {
      await apiFetch(
        "/v1/admin/auth/logout",
        {
          method: "POST"
        },
        { csrf: true }
      );
    } finally {
      clearStoredCsrfToken();
      router.push("/login");
      router.refresh();
    }
  }

  function handleReplyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void sendReply();
    }
  }

  if (loading) {
    return (
      <div className="rounded-[34px] border border-white/40 bg-white/70 px-6 py-10 text-slate-700 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
        Загружаем операторскую консоль...
      </div>
    );
  }

  const selectedTitle = conversation ? getConversationTitle(conversation) : "";
  const selectedSubtitle = conversation ? getConversationSubtitle(conversation) : null;
  const statusMeta = conversation ? getStatusMeta(conversation.status) : null;
  const replyLocked = conversation?.status !== "open";

  const queueSidebar = (
    <aside className="flex min-h-[78vh] min-h-0 flex-col rounded-[34px] border border-white/45 bg-white/72 shadow-[0_28px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
      <div className="border-b border-slate-200/80 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">chat-me</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">Чаты</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Очередь слева, переписка справа. Остальное спрятано в меню.</p>
          </div>

          <button
            type="button"
            onClick={() => setWorkspaceMenuOpen(true)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Меню
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <div className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-medium text-white">
            {getQueueHeading(queueStatus)}
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
            {sortedConversations.length} в списке
          </div>
          {queueStatus === "open" ? (
            <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900">
              {replyWaitingCount} ждут ответа
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 rounded-full bg-slate-100 p-1.5">
          <QueueTabButton
            active={queueStatus === "open"}
            label="Активные"
            onClick={() => setQueueStatus("open")}
          />
          <QueueTabButton
            active={queueStatus === "closed"}
            label="Закрытые"
            onClick={() => setQueueStatus("closed")}
          />
          <QueueTabButton
            active={queueStatus === "spam"}
            label="Спам"
            onClick={() => setQueueStatus("spam")}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {error ? (
          <div className="mb-3 rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {sortedConversations.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-sm leading-6 text-slate-500">
            {getQueueEmptyText(queueStatus)}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedConversations.map((item) => {
              const active = selectedConversationId === item.id;
              const subtitle = getConversationSubtitle(item);
              const itemStatus = getStatusMeta(item.status);
              const title = getConversationTitle(item);

              return (
                <Link
                  key={item.id}
                  href={`/chat/${item.id}`}
                  className={`block rounded-[28px] border px-4 py-4 transition ${
                    active
                      ? "border-sky-300 bg-[#edf5ff] shadow-[0_16px_40px_rgba(59,130,246,0.12)]"
                      : "border-white/50 bg-white/70 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                      {getConversationInitial(title)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{title}</div>
                          {subtitle ? (
                            <div className="mt-1 truncate text-xs text-slate-500">{subtitle}</div>
                          ) : null}
                        </div>

                        <div className="shrink-0 text-xs font-medium text-slate-400">
                          {formatTime(item.lastMessageAt)}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-white">
                          {item.projectDisplayName}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${itemStatus.className}`}
                        >
                          {itemStatus.label}
                        </span>
                        {item.unread ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                            Ждет ответа
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                        {item.latestMessage || "Сообщений пока нет"}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                        <span className="truncate">{compactUrl(item.sourceUrl)}</span>
                        <span>{formatDateTime(item.lastMessageAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );

  const mainPanel = selectedConversationId ? (
    <section className="flex min-h-[78vh] min-h-0 flex-col rounded-[34px] border border-white/45 bg-white/76 shadow-[0_28px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
      {conversation ? (
        <>
          <div className="border-b border-slate-200/80 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <Link
                    href="/chat"
                    className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
                  >
                    К чатам
                  </Link>
                  <span>{conversation.projectDisplayName}</span>
                  <span>Диалог #{conversation.id}</span>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">
                    {getConversationInitial(selectedTitle)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-2xl font-semibold text-slate-950">{selectedTitle}</h2>
                      {statusMeta ? (
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      ) : null}
                      {conversation.unread ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                          Ждет ответа
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">
                      {selectedSubtitle ? <span>{selectedSubtitle}</span> : null}
                      <span>Последнее сообщение {formatDateTime(conversation.lastMessageAt)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setWorkspaceMenuOpen(true)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Меню
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                tone="accent"
                disabled={savingStatus === "open" || conversation.status === "open"}
                onClick={() => updateStatus("open")}
              >
                {savingStatus === "open" ? "Открываем..." : "Открыть"}
              </ActionButton>
              <ActionButton
                tone="neutral"
                disabled={savingStatus === "closed" || conversation.status === "closed"}
                onClick={() => updateStatus("closed")}
              >
                {savingStatus === "closed" ? "Закрываем..." : "Закрыть"}
              </ActionButton>
              <ActionButton
                tone="danger"
                disabled={savingStatus === "spam" || conversation.status === "spam"}
                onClick={() => updateStatus("spam")}
              >
                {savingStatus === "spam" ? "Переносим..." : "В спам"}
              </ActionButton>
            </div>
          </div>

          <div
            ref={threadRef}
            className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
              {conversation.messages.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 px-5 py-10 text-center text-sm leading-7 text-slate-500">
                  Сообщений пока нет. Как только посетитель напишет, переписка появится здесь.
                </div>
              ) : null}

              {conversation.messages.map((message) => {
                if (message.senderType === "system") {
                  return (
                    <div key={message.id} className="flex justify-center">
                      <div className="rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600">
                        {message.bodyPlain}
                      </div>
                    </div>
                  );
                }

                const operatorMessage = message.senderType === "operator";

                return (
                  <div
                    key={message.id}
                    className={`flex ${operatorMessage ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-[30px] px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:max-w-[78%] ${
                        operatorMessage
                          ? "bg-gradient-to-br from-sky-400 to-cyan-300 text-slate-950"
                          : "border border-white/60 bg-white text-slate-900"
                      }`}
                    >
                      <div
                        className={`text-[11px] uppercase tracking-[0.2em] ${
                          operatorMessage ? "text-slate-900/60" : "text-slate-400"
                        }`}
                      >
                        {messageAuthorLabel(message)}
                      </div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-7">{message.bodyPlain}</div>
                      <div
                        className={`mt-4 text-[11px] ${
                          operatorMessage ? "text-slate-900/65" : "text-slate-400"
                        }`}
                      >
                        {formatDateTime(message.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200/80 bg-white/86 px-4 py-4 backdrop-blur-xl sm:px-6">
            <form onSubmit={handleReplySubmit} className="mx-auto max-w-4xl">
              <div className="rounded-[30px] border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3 px-2 pb-2 text-xs text-slate-500">
                  <span>
                    {replyLocked
                      ? "Диалог закрыт или в спаме. Верни его в открытые, чтобы снова отвечать."
                      : "Ответ уйдет посетителю в виджет на сайте."}
                  </span>
                  <span>Cmd/Ctrl + Enter</span>
                </div>

                <textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  onKeyDown={handleReplyKeyDown}
                  rows={4}
                  placeholder="Напиши короткий и понятный ответ"
                  disabled={replyLocked}
                  className="w-full resize-none rounded-[24px] border border-white bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-[20px] text-sm text-rose-700">{detailError || "\u00a0"}</div>
                  <button
                    type="submit"
                    disabled={savingReply || !replyBody.trim() || replyLocked}
                    className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {savingReply ? "Отправляем..." : "Отправить"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      ) : (
        <div className="flex min-h-[72vh] items-center justify-center px-6 text-center">
            <div className="max-w-lg rounded-[30px] border border-slate-200 bg-white/80 px-6 py-8 shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Чат</div>
              <h3 className="mt-3 text-2xl font-semibold text-slate-950">Диалог загружается</h3>
            <p className="mt-3 text-sm leading-7 text-slate-500">Если карточка не открылась, обнови список или выбери диалог заново.</p>
            {detailError ? (
              <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {detailError}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  ) : (
    <section className="hidden min-h-[78vh] flex-col items-center justify-center rounded-[34px] border border-white/45 bg-white/76 px-8 text-center shadow-[0_28px_90px_rgba(15,23,42,0.14)] backdrop-blur-2xl lg:flex">
      <div className="max-w-xl">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Operator Workspace</div>
        <h2 className="mt-4 text-4xl font-semibold text-slate-950">Переписка в центре, все лишнее в меню</h2>
        <p className="mt-4 text-sm leading-8 text-slate-500">
          Открой любой диалог слева. Основной экран теперь только про очередь и сообщения: детали посетителя,
          заметки, push и фильтры открываются по кнопке «Меню».
        </p>
      </div>
    </section>
  );

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={selectedConversationId ? "hidden lg:block" : ""}>{queueSidebar}</div>
        {mainPanel}
      </div>

      <div
        className={`fixed inset-0 z-40 transition ${
          workspaceMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!workspaceMenuOpen}
      >
      <div
        className={`absolute inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity ${
          workspaceMenuOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => setWorkspaceMenuOpen(false)}
      />

        <aside
          className={`absolute right-0 top-0 h-full w-full max-w-[460px] overflow-y-auto border-l border-slate-200 bg-[#f8fbff] p-4 text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.18)] transition-transform sm:p-5 ${
            workspaceMenuOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Workspace</div>
              <h3 className="mt-2 text-2xl font-semibold text-slate-950">Меню</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Здесь фильтры, контакты, служебные заметки и настройки оператора. Основной экран оставляем только под очередь и переписку.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen(false)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {menuError ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {menuError}
              </div>
            ) : null}

            <DrawerSection title="Фильтры очереди">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Проект</span>
                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                >
                  <option value="">Все проекты</option>
                  {projects.map((project) => (
                    <option key={project.projectKey} value={project.projectKey}>
                      {project.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </DrawerSection>

            <DrawerSection
              title="Контакты"
              description="Здесь видно, кто оставил телефон или email. Это отдельный быстрый список по всем сайтам."
            >
              {contactsLoading ? (
                <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                  Загружаем контакты...
                </div>
              ) : contacts.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
                  Контактов по текущему фильтру пока нет.
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => {
                    const title =
                      contact.name || contact.email || contact.phone || `Контакт #${contact.id}`;

                    return (
                      <div
                        key={contact.id}
                        className="rounded-[24px] border border-slate-200 bg-white px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-950">{title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {contact.projectDisplayName} · {formatDateTime(contact.lastSeenAt)}
                            </div>
                          </div>

                          {contact.lastConversationId ? (
                            <Link
                              href={`/chat/${contact.lastConversationId}`}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                              onClick={() => setWorkspaceMenuOpen(false)}
                            >
                              Открыть
                            </Link>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {contact.phone ? (
                            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900">
                              {contact.phone}
                            </span>
                          ) : null}
                          {contact.email ? (
                            <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900">
                              {contact.email}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DrawerSection>

            {conversation ? (
              <>
                <DrawerSection title="Посетитель">
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <div className="text-lg font-semibold text-slate-950">{selectedTitle}</div>
                    {selectedSubtitle ? (
                      <div className="mt-1 text-sm text-slate-500">{selectedSubtitle}</div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {conversation.visitorEmail ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
                          {conversation.visitorEmail}
                        </span>
                      ) : null}
                      {conversation.visitorPhone ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">
                          {conversation.visitorPhone}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                        {conversation.projectDisplayName}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <DetailRow label="Начат" value={formatDateTime(conversation.startedAt)} />
                    <DetailRow label="Последнее сообщение" value={formatDateTime(conversation.lastMessageAt)} />
                    <DetailRow
                      label="Страница"
                      value={compactUrl(conversation.sourceUrl)}
                      href={conversation.sourceUrl}
                    />
                    <DetailRow
                      label="Referrer"
                      value={compactUrl(conversation.referrer)}
                      href={conversation.referrer}
                    />
                  </div>
                </DrawerSection>

                <DrawerSection
                  title="Внутренние заметки"
                  description="Заметки не видны посетителю. Здесь можно фиксировать договоренности и следующий шаг."
                >
                  <form onSubmit={handleNoteSubmit}>
                    <textarea
                      value={noteBody}
                      onChange={(event) => setNoteBody(event.target.value)}
                      rows={4}
                      placeholder="Напиши служебную заметку"
                      className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                    />
                    <button
                      type="submit"
                      disabled={savingNote || !noteBody.trim()}
                      className="mt-3 rounded-full border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingNote ? "Сохраняем..." : "Сохранить заметку"}
                    </button>
                  </form>

                  <div className="mt-4 space-y-3">
                    {conversation.notes.length === 0 ? (
                      <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm leading-6 text-slate-500">
                        Заметок пока нет.
                      </div>
                    ) : (
                      conversation.notes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-[22px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="whitespace-pre-wrap text-sm leading-6 text-slate-900">{note.body}</div>
                          <div className="mt-3 text-[11px] text-slate-500">
                            {note.operatorName || "Оператор"} · {formatDateTime(note.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </DrawerSection>
              </>
            ) : null}

            <DrawerSection
              title="Оператор"
              description="Это имя увидит посетитель в сообщениях оператора внутри чата."
            >
              <form onSubmit={handleProfileSubmit}>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-700">Имя в чате</span>
                  <input
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Например, Мария"
                    className="rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                  />
                </label>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm text-slate-500">
                    {operator?.role} · {operator?.email}
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile || !profileName.trim()}
                    className="shrink-0 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {savingProfile ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </form>
            </DrawerSection>

            <OperatorPwaControls />

            <button
              type="button"
              onClick={logout}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Выйти из операторской
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
