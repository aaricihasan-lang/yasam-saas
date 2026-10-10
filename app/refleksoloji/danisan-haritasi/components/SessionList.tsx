"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { istanbulToday } from "@/lib/danisan/istanbulTime";
import { SESSION_TITLE_MAX, type MarkSession } from "@/lib/refleksoloji/markSurfaces";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import { MarksApiError, createSession, deleteSession, listSessions } from "../lib/marksApi";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function SessionList({
  clientId,
  readOnly,
  onOpen,
  onChangeClient,
}: {
  clientId: string;
  readOnly: boolean;
  onOpen: (sessionId: string) => void;
  onChangeClient: () => void;
}) {
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<MarkSession[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => istanbulToday());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Yükleme sonucu yalnız promise geri çağrısında state'e yazılır (effect gövdesinde setState yok).
  const load = useCallback(
    () =>
      listSessions(clientId).then(
        (r) => {
          setError(null);
          setSessions(r.sessions);
          setClientName(r.clientName);
          setLoading(false);
        },
        (e: unknown) => {
          setError(e instanceof MarksApiError ? e.message : "Seanslar yüklenemedi.");
          setLoading(false);
        },
      ),
    [clientId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || readOnly) return;
    setBusy(true);
    try {
      const s = await createSession({ client_id: clientId, session_date: date, title: title.trim() || null, note: null });
      onOpen(s.id);
    } catch (err) {
      showToast({ type: "error", title: "Seans oluşturulamadı", message: err instanceof Error ? err.message : "Tekrar deneyin." });
      setBusy(false);
    }
  }

  async function handleDelete(s: MarkSession) {
    if (readOnly || deletingId) return;
    const label = `${formatDate(s.session_date)}${s.title ? ` — ${s.title}` : ""}`;
    const ok = requiresBulkDeleteGuard(s.mark_count)
      ? await runBulkDeleteConfirm(confirm, {
          count: s.mark_count,
          noun: "nokta",
          detail: `Seans: ${label}\nBu seans ve içindeki ${s.mark_count} nokta kalıcı olarak silinecek.`,
        })
      : await confirm({
          title: "Seansı sil",
          message: `"${label}" seansı${s.mark_count > 0 ? ` ve ${s.mark_count} noktası` : ""} kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`,
          confirmText: "Sil",
          cancelText: "Vazgeç",
          tone: "danger",
        });
    if (!ok) return;
    setDeletingId(s.id);
    try {
      await deleteSession(s.id, s.mark_count);
      setSessions((prev) => prev.filter((x) => x.id !== s.id));
      showToast({ type: "success", title: "Silindi", message: "Seans silindi." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Silinemedi.";
      showToast({ type: "error", title: "Silinemedi", message: msg });
      if (err instanceof MarksApiError && err.code === "MARK_COUNT_CHANGED") void load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section className="min-w-0 rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm ring-1 ring-violet-100 sm:p-4" aria-labelledby="dh-sessions-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Danışan</p>
            <h2 id="dh-sessions-title" className="truncate text-lg font-black text-slate-900">
              {clientName ?? (loading ? "Yükleniyor…" : "Danışan")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onChangeClient}
            className="min-h-[44px] rounded-lg border border-violet-200 bg-white px-3 text-sm font-semibold text-violet-900 hover:border-violet-400"
          >
            Danışanı değiştir
          </button>
        </div>

        <h3 className="mt-4 text-sm font-black text-slate-800">İşaret seansları</h3>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Yükleniyor…</p>
        ) : error ? (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
            {error}{" "}
            <button type="button" onClick={retry} className="font-bold underline">
              Tekrar dene
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-violet-200 bg-violet-50/50 p-4 text-sm text-slate-600">
            Bu danışan için henüz işaret seansı yok. Sağdaki formdan ilk seansı başlatın.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-violet-100 overflow-hidden rounded-xl border border-violet-100 bg-white">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center rounded-lg px-1 text-left hover:bg-violet-50"
                >
                  <span className="text-sm font-bold text-slate-900">
                    {formatDate(s.session_date)}
                    {s.title ? <span className="font-semibold text-slate-700"> — {s.title}</span> : null}
                  </span>
                  <span className="text-xs font-medium text-slate-600">{s.mark_count} nokta</span>
                </button>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete(s)}
                    disabled={deletingId === s.id}
                    aria-label={`${formatDate(s.session_date)} seansını sil`}
                    className="min-h-[44px] shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:border-rose-400 disabled:opacity-50"
                  >
                    {deletingId === s.id ? "Siliniyor…" : "Sil"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/80 bg-white/85 p-3 shadow-sm ring-1 ring-violet-100 sm:p-4" aria-labelledby="dh-new-title">
        <h3 id="dh-new-title" className="text-sm font-black text-slate-800">
          Yeni seans
        </h3>
        <form onSubmit={handleCreate} className="mt-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            Seans tarihi
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-[44px] rounded-lg border border-violet-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-violet-500 sm:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            Başlık (isteğe bağlı)
            <input
              type="text"
              value={title}
              maxLength={SESSION_TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn. 3. seans — bel bölgesi"
              className="min-h-[44px] rounded-lg border border-violet-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-violet-500 sm:text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy || readOnly || !date}
            className="min-h-[44px] rounded-lg bg-violet-700 px-4 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:opacity-50"
          >
            {busy ? "Oluşturuluyor…" : "Seansı başlat"}
          </button>
          {readOnly ? <p className="text-xs text-slate-600">Demo hesabında seans oluşturulamaz.</p> : null}
        </form>
      </section>
    </div>
  );
}
