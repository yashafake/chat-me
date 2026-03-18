"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

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

type MobilePane = "chat" | "context";

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

function getStatusMeta(status: ConversationSummary["status"]): {
  label: string;
  className: string;
} {
  if (status === "open") {
    return {
      label: "Открыт",
      className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
    };
  }

  if (status === "closed") {
    return {
      label: "Закрыт",
      className: "border-white/10 bg-white/[0.06] text-slate-200"
    };
  }

  return {
    label: "Спам",
    className: "border-rose-400/25 bg-rose-400/10 text-rose-100"
  };
}

function getConversationTitle(item: Pick<ConversationSummary, "id" | "visitorName" | "visitorEmail" | "visitorPhone">): string {
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

function sortConversations(items: ConversationSummary[]): ConversationSummary[] {
  return [...items].sort((left, right) => {
    const unreadWeight = Number(right.unread) - Number(left.unread);

    if (unreadWeight !== 0) {
      return unreadWeight;
    }

    if (left.status !== right.status) {
      if (left.status === "open") {
        return -1;
      }

      if (right.status === "open") {
        return 1;
      }
    }

    return new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime();
  });
}

function SummaryCard(props: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-[24px] border px-4 py-4 ${
        props.tone === "accent"
          ? "border-cyan-300/20 bg-cyan-300/[0.08]"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{props.label}</div>
      <div className="mt-3 text-2xl font-semibold text-white">{props.value}</div>
    </div>
  );
}

function DetailCard(props: {
  label: string;
  value: string;
  href?: string | null;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{props.label}</div>
      {props.href ? (
        <a
          href={props.href}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all text-sm font-medium text-cyan-100 transition hover:text-white"
        >
          {props.value}
        </a>
      ) : (
        <div className="mt-2 text-sm font-medium text-slate-100">{props.value}</div>
      )}
    </div>
  );
}

export function ChatConsole(props: {
  conversationId?: number;
}) {
  const router = useRouter();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [savingReply, setSavingReply] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [mobilePane, setMobilePane] = useState<MobilePane>("chat");
  const eventSourceRef = useRef<EventSource | null>(null);

  const selectedConversationId = props.conversationId;

  async function loadAuth() {
    try {
      const payload = await apiFetch<{
        operator: Operator;
        csrfToken: string;
      }>("/v1/admin/auth/me");
      setOperator(payload.operator);
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

  async function loadConversations(showSpinner = false) {
    if (showSpinner) {
      setListLoading(true);
    }

    try {
      const search = new URLSearchParams();

      if (projectFilter) {
        search.set("projectKey", projectFilter);
      }

      if (statusFilter) {
        search.set("status", statusFilter);
      }

      const payload = await apiFetch<{
        conversations: ConversationSummary[];
      }>(`/v1/admin/conversations${search.toString() ? `?${search.toString()}` : ""}`);
      setConversations(payload.conversations);
      setError("");
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : "Не удалось загрузить очередь диалогов.";
      setError(message);
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

      await Promise.all([loadProjects(), loadConversations(true)]);

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

    void loadConversations(true);
  }, [operator, projectFilter, statusFilter]);

  useEffect(() => {
    if (!operator) {
      return;
    }

    setMobilePane("chat");
    void loadConversation();
  }, [operator, selectedConversationId]);

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
      setDetailError("Поток обновлений переподключается...");
    };
    eventSourceRef.current = source;

    return () => {
      source.close();
    };
  }, [selectedConversationId]);

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
  }, [operator, projectFilter, statusFilter]);

  const sortedConversations = useMemo(() => sortConversations(conversations), [conversations]);
  const queueStats = useMemo(
    () => ({
      total: sortedConversations.length,
      unread: sortedConversations.filter((item) => item.unread).length,
      open: sortedConversations.filter((item) => item.status === "open").length
    }),
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
      await loadConversation();
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось сохранить заметку.";
      setDetailError(message);
    } finally {
      setSavingNote(false);
    }
  }

  async function updateStatus(status: "open" | "closed" | "spam") {
    if (!selectedConversationId) {
      return;
    }

    try {
      await apiFetch(
        `/v1/admin/conversations/${selectedConversationId}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            status
          })
        },
        { csrf: true }
      );
      await Promise.all([loadConversation(), loadConversations()]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось обновить статус.";
      setDetailError(message);
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
      <div className="rounded-[30px] border border-white/10 bg-white/[0.05] px-6 py-10 text-slate-200 shadow-glass backdrop-blur">
        Загружаем операторскую консоль...
      </div>
    );
  }

  const selectedTitle = conversation ? getConversationTitle(conversation) : "";
  const selectedSubtitle = conversation ? getConversationSubtitle(conversation) : null;
  const statusMeta = conversation ? getStatusMeta(conversation.status) : null;

  const queueSidebar = (
    <aside className="flex min-h-0 flex-col rounded-[32px] border border-white/10 bg-slate-950/55 shadow-glass backdrop-blur">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
              Operator Workspace
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-white">Очередь чатов</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
              Сначала бери карточки с меткой «Ждет ответа», затем открывай диалог и отвечай из нижнего блока.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            Выйти
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          <SummaryCard label="В очереди" value={String(queueStats.total)} />
          <SummaryCard label="Ждут ответа" value={String(queueStats.unread)} tone="accent" />
          <SummaryCard label="Открытые" value={String(queueStats.open)} />
        </div>

        <div className="mt-5 rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
          <div className="text-sm font-medium text-white">{operator?.displayName}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
            {operator?.role}
          </div>
          <div className="mt-3 text-sm text-slate-300">{operator?.email}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="space-y-4">
          <OperatorPwaControls />

          <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Фильтры</div>
            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-200">Проект</span>
                <select
                  value={projectFilter}
                  onChange={(event) => setProjectFilter(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                >
                  <option value="">Все проекты</option>
                  {projects.map((project) => (
                    <option key={project.projectKey} value={project.projectKey}>
                      {project.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-200">Статус</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40"
                >
                  <option value="">Все статусы</option>
                  <option value="open">Открытые</option>
                  <option value="closed">Закрытые</option>
                  <option value="spam">Спам</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
            <span>Диалоги</span>
            <span>{listLoading ? "Обновляем" : `${sortedConversations.length} в выборке`}</span>
          </div>

          {error ? (
            <div className="rounded-[22px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {sortedConversations.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm leading-6 text-slate-400">
              По текущему фильтру диалогов нет. Проверь проект или статус, либо дождись новых обращений.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedConversations.map((item) => {
                const itemStatus = getStatusMeta(item.status);
                const active = selectedConversationId === item.id;
                const subtitle = getConversationSubtitle(item);

                return (
                  <Link
                    key={item.id}
                    href={`/chat/${item.id}`}
                    className={`block rounded-[28px] border px-4 py-4 transition ${
                      active
                        ? "border-cyan-300/35 bg-cyan-300/[0.10] shadow-[0_0_0_1px_rgba(103,232,249,0.08)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                            {item.projectDisplayName}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${itemStatus.className}`}
                          >
                            {itemStatus.label}
                          </span>
                          {item.unread ? (
                            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                              Ждет ответа
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 truncate text-base font-semibold text-white">
                          {getConversationTitle(item)}
                        </div>
                        {subtitle ? (
                          <div className="mt-1 truncate text-sm text-slate-400">{subtitle}</div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-xs text-slate-500">{formatTime(item.lastMessageAt)}</div>
                    </div>

                    <div className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">
                      {item.latestMessage || "Сообщений пока нет"}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-4 text-xs text-slate-500">
                      <span className="truncate">{compactUrl(item.sourceUrl)}</span>
                      <span>{formatDateTime(item.lastMessageAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  const detailThread = conversation ? (
    <div
      className="chatme-detail-thread min-h-0 flex-col"
      style={{ display: mobilePane === "chat" ? "flex" : "none" }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {conversation.messages.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm leading-6 text-slate-400">
              Сообщений пока нет. Как только посетитель напишет, переписка появится здесь.
            </div>
          ) : null}

          {conversation.messages.map((message) => {
            if (message.senderType === "system") {
              return (
                <div key={message.id} className="flex justify-center">
                  <div className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs text-slate-300">
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
                  className={`max-w-[90%] rounded-[28px] border px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.12)] ${
                    operatorMessage
                      ? "border-cyan-300/20 bg-gradient-to-r from-cyan-300 to-emerald-300 text-slate-950"
                      : "border-white/10 bg-white/[0.05] text-slate-100"
                  }`}
                >
                  <div
                    className={`text-[11px] uppercase tracking-[0.22em] ${
                      operatorMessage ? "text-slate-900/60" : "text-slate-500"
                    }`}
                  >
                    {messageAuthorLabel(message)}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-7">{message.bodyPlain}</div>
                  <div
                    className={`mt-4 text-[11px] ${
                      operatorMessage ? "text-slate-900/70" : "text-slate-500"
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

      <div className="border-t border-white/10 bg-slate-950/70 px-4 py-4 backdrop-blur sm:px-6">
        <form onSubmit={handleReplySubmit} className="mx-auto max-w-3xl space-y-3">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Ответ уйдет посетителю в виджет на сайте.</span>
            <span>Cmd/Ctrl + Enter</span>
          </div>

          <textarea
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            onKeyDown={handleReplyKeyDown}
            rows={4}
            placeholder="Напиши ответ оператором"
            className="w-full rounded-[26px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:bg-white/[0.08]"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-sm text-rose-100">{detailError || "\u00a0"}</div>
            <button
              type="submit"
              disabled={savingReply || !replyBody.trim()}
              className="rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingReply ? "Отправляем..." : "Отправить ответ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  const detailSidebar = conversation ? (
    <div
      className="chatme-detail-sidebar min-h-0 flex-col border-t border-white/10 px-4 py-5 sm:px-6 xl:border-l xl:border-t-0"
      style={{ display: mobilePane === "context" ? "flex" : "none" }}
    >
      <div className="space-y-4">
        <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Посетитель</div>
          <div className="mt-4 text-lg font-semibold text-white">{selectedTitle}</div>
          {selectedSubtitle ? <div className="mt-1 text-sm text-slate-400">{selectedSubtitle}</div> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {conversation.visitorEmail ? (
              <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200">
                {conversation.visitorEmail}
              </span>
            ) : null}
            {conversation.visitorPhone ? (
              <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200">
                {conversation.visitorPhone}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-300">
              Диалог #{conversation.id}
            </span>
          </div>
        </div>

        <div className="grid gap-3">
          <DetailCard label="Начат" value={formatDateTime(conversation.startedAt)} />
          <DetailCard label="Последнее сообщение" value={formatDateTime(conversation.lastMessageAt)} />
          <DetailCard
            label="Страница"
            value={compactUrl(conversation.sourceUrl)}
            href={conversation.sourceUrl}
          />
          <DetailCard
            label="Referrer"
            value={compactUrl(conversation.referrer)}
            href={conversation.referrer}
          />
        </div>

        <form
          onSubmit={handleNoteSubmit}
          className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4"
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Внутренняя заметка</div>
          <textarea
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            rows={4}
            placeholder="Напиши служебную заметку для себя или команды"
            className="mt-4 w-full rounded-[22px] border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/40"
          />
          <button
            type="submit"
            disabled={savingNote || !noteBody.trim()}
            className="mt-3 rounded-full border border-amber-300/25 px-4 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingNote ? "Сохраняем..." : "Сохранить заметку"}
          </button>
        </form>

        <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Лента заметок</div>
            <div className="text-xs text-slate-500">{conversation.notes.length}</div>
          </div>

          <div className="mt-4 space-y-3">
            {conversation.notes.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-white/10 bg-slate-950/40 px-4 py-5 text-sm leading-6 text-slate-400">
                Заметок пока нет. Используй их для внутренних договоренностей, статуса лида или следующего шага.
              </div>
            ) : (
              conversation.notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-[20px] border border-white/10 bg-slate-950/45 px-4 py-4"
                >
                  <div className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{note.body}</div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    {note.operatorName || "Оператор"} · {formatDateTime(note.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const detailPanel = selectedConversationId ? (
    <section className="flex min-h-[78vh] min-h-0 flex-col rounded-[32px] border border-white/10 bg-slate-950/55 shadow-glass backdrop-blur">
      {conversation ? (
        <>
          <div className="border-b border-white/10 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  <Link
                    href="/chat"
                    className="chatme-mobile-only-inline rounded-full border border-white/10 px-3 py-1 text-slate-300 transition hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    К очереди
                  </Link>
                  <span>{conversation.projectDisplayName}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h2 className="truncate text-2xl font-semibold text-white">{selectedTitle}</h2>
                  {statusMeta ? (
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  ) : null}
                  {conversation.unread ? (
                    <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
                      Ждет ответа
                    </span>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-400">
                  {selectedSubtitle ? <span>{selectedSubtitle}</span> : null}
                  <span>Диалог #{conversation.id}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateStatus("open")}
                  className="rounded-full border border-emerald-400/25 px-4 py-2.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/10"
                >
                  Открыть
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus("closed")}
                  className="rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-white/[0.06]"
                >
                  Закрыть
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus("spam")}
                  className="rounded-full border border-rose-400/25 px-4 py-2.5 text-sm font-medium text-rose-100 transition hover:bg-rose-400/10"
                >
                  Спам
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <DetailCard label="Начат" value={formatDateTime(conversation.startedAt)} />
              <DetailCard label="Последнее сообщение" value={formatDateTime(conversation.lastMessageAt)} />
              <DetailCard
                label="Страница"
                value={compactUrl(conversation.sourceUrl)}
                href={conversation.sourceUrl}
              />
            </div>

            <div className="chatme-mobile-tabs mt-5 flex rounded-[18px] border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setMobilePane("chat")}
                className={`flex-1 rounded-[14px] px-4 py-2 text-sm font-medium transition ${
                  mobilePane === "chat"
                    ? "bg-white text-slate-950"
                    : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                Чат
              </button>
              <button
                type="button"
                onClick={() => setMobilePane("context")}
                className={`flex-1 rounded-[14px] px-4 py-2 text-sm font-medium transition ${
                  mobilePane === "context"
                    ? "bg-white text-slate-950"
                    : "text-slate-300 hover:bg-white/[0.06]"
                }`}
              >
                Контекст
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_340px]">
            {detailThread}
            {detailSidebar}
          </div>
        </>
      ) : (
        <div className="flex min-h-[72vh] items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-[28px] border border-white/10 bg-white/[0.04] px-6 py-8">
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">chat-me</div>
            <h3 className="mt-3 text-2xl font-semibold text-white">Диалог загружается</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Если данные не появились, проверь фильтр или обнови страницу.
            </p>
            {detailError ? (
              <div className="mt-4 rounded-[18px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {detailError}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  ) : (
    <section className="chatme-desktop-only-flex min-h-[78vh] flex-col rounded-[32px] border border-white/10 bg-slate-950/55 shadow-glass backdrop-blur">
      <div className="px-6 py-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Workspace Overview</div>
        <h2 className="mt-3 text-3xl font-semibold text-white">Выбери диалог слева</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
          Открой любую карточку из очереди: справа появятся переписка, данные посетителя, страница источника и внутренние заметки.
        </p>
      </div>

      <div className="grid flex-1 gap-5 px-6 pb-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
          <div className="text-sm font-medium text-white">Как работать с очередью</div>
          <div className="mt-5 grid gap-4">
            <div className="rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-4">
              <div className="text-sm font-semibold text-amber-100">1. Смотри на «Ждет ответа»</div>
              <div className="mt-2 text-sm leading-6 text-amber-50/90">
                Это диалоги, где последнее сообщение написал посетитель и оператор еще не ответил.
              </div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-4">
              <div className="text-sm font-semibold text-white">2. Открой карточку диалога</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                В верхней части будет краткий контекст, ниже переписка, справа - заметки и данные о посетителе.
              </div>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-slate-950/45 px-4 py-4">
              <div className="text-sm font-semibold text-white">3. Отвечай из нижнего блока</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                Ответ уйдет в сайт-виджет. Если разговор завершен, закрой диалог кнопкой в шапке.
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
            <div className="text-sm font-medium text-white">Что видно в списке</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <div>Проект: с какого сайта пришел диалог.</div>
              <div>Статус: открыт, закрыт или спам.</div>
              <div>Метка «Ждет ответа»: приоритет для обработки.</div>
              <div>Последнее сообщение: короткий контекст без открытия чата.</div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6">
            <div className="text-sm font-medium text-white">Текущая выборка</div>
            <div className="mt-4 grid gap-3">
              <SummaryCard label="В очереди" value={String(queueStats.total)} />
              <SummaryCard label="Ждут ответа" value={String(queueStats.unread)} tone="accent" />
              <SummaryCard label="Открытые" value={String(queueStats.open)} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="grid min-h-[82vh] gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <div className={selectedConversationId ? "chatme-queue-shell-mobile-hidden" : ""}>{queueSidebar}</div>
      {detailPanel}
    </div>
  );
}
