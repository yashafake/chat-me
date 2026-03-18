"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { apiFetch, ApiError, clearStoredCsrfToken, setStoredCsrfToken, apiBaseUrl } from "../lib/api";

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
}

interface ConversationDetails extends ConversationSummary {
  sourceUrl: string | null;
  referrer: string | null;
  messages: Message[];
  notes: Note[];
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function ChatConsole(props: {
  conversationId?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
    } finally {
      setListLoading(false);
    }
  }

  async function loadConversation() {
    if (!selectedConversationId) {
      setConversation(null);
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
  }, [projectFilter, statusFilter]);

  useEffect(() => {
    void loadConversation();
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const source = new EventSource(
      `${apiBaseUrl}/v1/admin/conversations/${selectedConversationId}/stream`,
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
    const interval = window.setInterval(() => {
      void loadConversations();
    }, 10_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [projectFilter, statusFilter]);

  const sortedMessages = useMemo(() => conversation?.messages ?? [], [conversation?.messages]);

  async function handleReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversationId || !replyBody.trim()) {
      return;
    }

    setSavingReply(true);

    try {
      await apiFetch(`/v1/admin/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: replyBody
        })
      }, { csrf: true });
      setReplyBody("");
      await Promise.all([loadConversation(), loadConversations()]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось отправить ответ.";
      setDetailError(message);
    } finally {
      setSavingReply(false);
    }
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversationId || !noteBody.trim()) {
      return;
    }

    setSavingNote(true);

    try {
      await apiFetch(`/v1/admin/conversations/${selectedConversationId}/notes`, {
        method: "POST",
        body: JSON.stringify({
          body: noteBody
        })
      }, { csrf: true });
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
      await apiFetch(`/v1/admin/conversations/${selectedConversationId}/status`, {
        method: "POST",
        body: JSON.stringify({
          status
        })
      }, { csrf: true });
      await Promise.all([loadConversation(), loadConversations()]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось обновить статус.";
      setDetailError(message);
    }
  }

  async function logout() {
    try {
      await apiFetch("/v1/admin/auth/logout", {
        method: "POST"
      }, { csrf: true });
    } finally {
      clearStoredCsrfToken();
      router.push("/login");
      router.refresh();
    }
  }

  if (loading) {
    return <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-200">Загружаем операторскую консоль...</div>;
  }

  return (
    <div className="grid min-h-[76vh] gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="rounded-[28px] border border-white/10 bg-white/5 p-4 shadow-glass backdrop-blur">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Operator Console</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Диалоги</h2>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:border-white/20 hover:bg-white/5"
          >
            Выйти
          </button>
        </div>

        <div className="grid gap-3">
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">Все проекты</option>
            {projects.map((project) => (
              <option key={project.projectKey} value={project.projectKey}>
                {project.displayName}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none"
          >
            <option value="">Все статусы</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="spam">Spam</option>
          </select>
        </div>

        <div className="mt-5 flex items-center justify-between text-xs text-slate-400">
          <span>{operator?.displayName}</span>
          <span>{listLoading ? "Обновляем..." : `${conversations.length} диалогов`}</span>
        </div>

        <div className="mt-4 space-y-3">
          {conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
              Диалогов по текущему фильтру пока нет.
            </div>
          ) : null}

          {conversations.map((item) => {
            const active = pathname?.endsWith(`/chat/${item.id}`);

            return (
              <Link
                key={item.id}
                href={`/chat/${item.id}`}
                className={`block rounded-3xl border px-4 py-4 transition ${
                  active
                    ? "border-aurora/50 bg-aurora/10"
                    : "border-white/10 bg-slate-950/30 hover:border-white/20 hover:bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      {item.projectDisplayName}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {item.visitorName || item.visitorEmail || item.visitorPhone || `Диалог #${item.id}`}
                    </div>
                  </div>
                  {item.unread ? (
                    <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-aurora" />
                  ) : null}
                </div>
                <div className="mt-3 line-clamp-2 text-sm text-slate-300">
                  {item.latestMessage || "Сообщений пока нет"}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 px-2 py-1 uppercase">
                    {item.status}
                  </span>
                  <span>{formatTime(item.lastMessageAt)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </aside>

      <section className="rounded-[30px] border border-white/10 bg-slate-950/45 shadow-glass backdrop-blur">
        {error ? (
          <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {!selectedConversationId ? (
          <div className="flex min-h-[76vh] flex-col items-center justify-center px-6 text-center">
            <div className="max-w-md rounded-[28px] border border-white/10 bg-white/5 px-8 py-10">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">chat-me</div>
              <h3 className="mt-3 text-2xl font-semibold text-white">Выберите диалог слева</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Здесь будет поток сообщений, карточка посетителя, внутренние заметки и быстрые действия оператора.
              </p>
            </div>
          </div>
        ) : conversation ? (
          <div className="flex min-h-[76vh] flex-col">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-400">
                  {conversation.projectDisplayName}
                </div>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {conversation.visitorName ||
                    conversation.visitorEmail ||
                    conversation.visitorPhone ||
                    `Диалог #${conversation.id}`}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full border border-white/10 px-2 py-1">{conversation.status}</span>
                  {conversation.visitorEmail ? (
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      {conversation.visitorEmail}
                    </span>
                  ) : null}
                  {conversation.visitorPhone ? (
                    <span className="rounded-full border border-white/10 px-2 py-1">
                      {conversation.visitorPhone}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => updateStatus("open")}
                  className="rounded-full border border-aurora/30 px-3 py-2 text-xs text-aurora transition hover:bg-aurora/10"
                >
                  Reopen
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus("closed")}
                  className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:bg-white/5"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus("spam")}
                  className="rounded-full border border-red-500/20 px-3 py-2 text-xs text-red-200 transition hover:bg-red-500/10"
                >
                  Spam
                </button>
              </div>
            </div>

            {detailError ? (
              <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-3 text-sm text-amber-100">
                {detailError}
              </div>
            ) : null}

            <div className="grid flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex min-h-0 flex-col">
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
                  {sortedMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.senderType === "operator" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-[24px] px-4 py-3 text-sm leading-6 ${
                          message.senderType === "operator"
                            ? "bg-gradient-to-r from-aurora to-cyan-300 text-slate-950"
                            : "border border-white/10 bg-white/5 text-slate-100"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{message.bodyPlain}</div>
                        <div
                          className={`mt-2 text-[11px] ${
                            message.senderType === "operator"
                              ? "text-slate-900/70"
                              : "text-slate-400"
                          }`}
                        >
                          {message.operatorName ? `${message.operatorName} · ` : ""}
                          {formatTime(message.createdAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 px-5 py-4">
                  <form onSubmit={handleReplySubmit} className="space-y-3">
                    <textarea
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      rows={4}
                      placeholder="Ответ оператором"
                      className="w-full rounded-[24px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-aurora/50 focus:bg-white/10"
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingReply || !replyBody.trim()}
                        className="rounded-full bg-gradient-to-r from-aurora to-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingReply ? "Отправляем..." : "Ответить"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              <div className="border-t border-white/10 px-5 py-5 xl:border-l xl:border-t-0">
                <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Context</div>
                  <dl className="mt-4 space-y-3 text-sm text-slate-200">
                    <div>
                      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Started</dt>
                      <dd className="mt-1">{formatTime(conversation.lastMessageAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Source URL</dt>
                      <dd className="mt-1 break-all text-slate-300">{conversation.sourceUrl || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Referrer</dt>
                      <dd className="mt-1 break-all text-slate-300">{conversation.referrer || "—"}</dd>
                    </div>
                  </dl>
                </div>

                <form onSubmit={handleNoteSubmit} className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Internal Note</div>
                  <textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    rows={4}
                    placeholder="Внутренняя заметка без показа посетителю"
                    className="mt-4 w-full rounded-[20px] border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-gold/50"
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !noteBody.trim()}
                    className="mt-3 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingNote ? "Сохраняем..." : "Сохранить заметку"}
                  </button>
                </form>

                <div className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Notes Feed</div>
                  <div className="mt-4 space-y-3">
                    {conversation.notes.length === 0 ? (
                      <div className="text-sm text-slate-400">Заметок пока нет.</div>
                    ) : (
                      conversation.notes.map((note) => (
                        <div key={note.id} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                          <div className="whitespace-pre-wrap text-sm text-slate-200">{note.body}</div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            {note.operatorName || "Operator"} · {formatTime(note.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[76vh] items-center justify-center px-6 text-center text-slate-300">
            Диалог не найден или ещё загружается.
          </div>
        )}
      </section>
    </div>
  );
}
