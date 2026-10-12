"use client";

/**
 * Çalışma alanı (tüm teknikler) — teknik sonucun ALTINDA, Roxy yorumundan AYRI:
 *   1) "Bilgi Bankam"  — haritanın kanonik konularıyla eşleşen KENDİ mesleki notlarım (Roxy değil)
 *   2) "Danışana Özel Yorumum" — bu profile özel çalışma notları (Bilgi Bankası'nı DEĞİŞTİRMEZ)
 * Kayıt (2026-10-12): ayrı bir "Analizi Kaydet" formu YOK — çalışma masasının tek kayıt işlemi (toplu kayıt penceresi,
 * SaveBatchDialog) bütün kaydedilmemiş analizleri kaydeder. Bu panel yalnız Bilgi Bankası ve not taslaklarını yönetir.
 * Bu panel sağlayıcıyı ÇAĞIRMAZ. Bağlam = (profil, revizyon, teknik, normalize seçenekler); notlar
 * (profil, teknik, karşı taraf) bağlamındadır — transit notu natal'e, Y sinastrisi Z'ye karışmaz.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { astroFetch } from "../_lib/api";
import { KbEditor, KbEntryCard, type KbEntry } from "./KnowledgeBankPanel";

type Topic = { key: string; kind: string; label: string };
type Note = { id: string; sectionKey: string; sectionLabel: string; body: string; revision: number; updatedAt: string };
type Workspace = { technique: string; contextKey: string; contextLocationId?: string | null; noteContext?: string | null; knowledgeBankEnabled: boolean; topics: Topic[]; kbMatches: KbEntry[]; notes: Note[] };
export type WorkspaceSelection = { technique: string; options: Record<string, unknown> };

function NoteEditor({
  profileId,
  technique,
  contextKey,
  contextLocationId = null,
  noteContext = null,
  sectionKey,
  label,
  note,
  onSaved,
  onDirty,
}: {
  /** FINAL: kaydedilmemiş değişiklik bildirimi (sekme kapatma / ekrandan ayrılma uyarısı için). */
  onDirty?: (sectionKey: string, dirty: boolean) => void;
  profileId: string;
  technique: string;
  contextKey: string;
  contextLocationId?: string | null;
  noteContext?: string | null;
  sectionKey: string;
  label: string;
  note: Note | null;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = body !== (note?.body ?? "");
  const onDirtyRef = useRef(onDirty);
  useEffect(() => {
    onDirtyRef.current = onDirty;
  }, [onDirty]);
  useEffect(() => {
    onDirtyRef.current?.(sectionKey, dirty);
  }, [sectionKey, dirty]);
  useEffect(() => () => onDirtyRef.current?.(sectionKey, false), [sectionKey]);
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await astroFetch("/api/admin/astroloji/notes", {
      method: "PUT",
      body: { profileId, technique, contextKey, contextLocationId, noteContext, sectionKey, body, expectedRevision: note ? note.revision : null },
    });
    setBusy(false);
    if (r.ok) {
      setMsg("Kaydedildi");
      onSaved();
    } else setMsg(r.error);
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-teal-900">{label}</span>
        {dirty ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900" data-testid="astro-note-dirty">
            Kaydedilmemiş değişiklik
          </span>
        ) : note ? (
          <span className="text-[11px] text-teal-800/80">Kayıtlı</span>
        ) : null}
      </div>
      <textarea
        className="min-h-[160px] w-full resize-y rounded-xl border border-teal-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-800 shadow-inner outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200"
        value={body}
        maxLength={20000}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Bu danışana özel yorumunuz…"
      />
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:bg-teal-300">
          {busy ? "Kaydediliyor…" : "Notu kaydet"}
        </button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function AnalysisWorkspace({
  profileId,
  revision,
  selection,
  refreshKey = 0,
  onData,
  section = "all",
  profileLabel,
  techniqueLabel,
  onDirtyChange,
}: {
  /** FINAL: bu çalışma alanında kaydedilmemiş not / Bilgi Bankası taslağı var mı (sessiz veri kaybını önlemek için). */
  onDirtyChange?: (dirty: boolean) => void;
  profileId: string;
  revision: number;
  selection: WorkspaceSelection;
  refreshKey?: number;
  /** Çalışma alanı yüklendiğinde (konu + KB eşleşmeleri) üst bileşene bildirilir — ek istek yok. */
  onData?: (data: { kbMatches: KbEntry[] }) => void;
  /** Sonuç çalışma masası sekmesi: tek örnek bölümler arasında geçer (durum korunur). Varsayılan "all" = önceki görünüm. */
  section?: "all" | "kb" | "notes";
  /** Kendi Yorumum başlığında hangi danışan / analiz için yazıldığını göstermek için (yalnız görüntü). */
  profileLabel?: string;
  techniqueLabel?: string;
}) {
  const selJson = JSON.stringify(selection);
  const dirtyMap = useRef(new Map<string, boolean>());
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  const reportDirty = useCallback((k: string, d: boolean) => {
    dirtyMap.current.set(k, d);
    onDirtyChangeRef.current?.([...dirtyMap.current.values()].some(Boolean));
  }, []);
  useEffect(() => () => onDirtyChangeRef.current?.(false), []);
  // Üst bileşen bildirimi: en güncel geri çağırma ref'te (efekt bağımlılığı değil → yeniden yükleme döngüsü yok).
  const onDataRef = useRef(onData);
  useEffect(() => {
    onDataRef.current = onData;
  });
  const key = `${profileId}|${revision}|${selJson}`;
  const [ws, setWs] = useState<{ key: string; data: Workspace; error: string | null } | null>(null);
  const [reload, setReload] = useState(0);
  const [addTopic, setAddTopic] = useState<string | null>(null);
  const [kbCreate, setKbCreate] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const sel = JSON.parse(selJson) as WorkspaceSelection;
    void astroFetch<Workspace>("/api/admin/astroloji/workspace", { method: "POST", body: { profileId, revision, technique: sel.technique, options: sel.options } }).then((r) => {
      if (!alive) return;
      if (r.ok) onDataRef.current?.({ kbMatches: r.data.kbMatches });
      setWs(
        r.ok
          ? { key, data: r.data, error: null }
          : { key, data: { technique: sel.technique, contextKey: "", knowledgeBankEnabled: false, topics: [], kbMatches: [], notes: [] }, error: r.error },
      );
    });
    return () => {
      alive = false;
    };
  }, [key, profileId, revision, selJson, reload, refreshKey]);

  const data = ws && ws.key === key ? ws.data : null;
  const matchesByTopic = useMemo(() => {
    const m = new Map<string, KbEntry[]>();
    for (const e of data?.kbMatches ?? []) m.set(e.topicKey, [...(m.get(e.topicKey) ?? []), e]);
    return m;
  }, [data]);
  const matchedTopics = (data?.topics ?? []).filter((t) => matchesByTopic.has(t.key));
  const unmatchedTopics = (data?.topics ?? []).filter((t) => !matchesByTopic.has(t.key));
  const notesByKey = new Map((data?.notes ?? []).map((n) => [n.sectionKey, n]));
  const noteSections = [...new Set([...(data?.notes ?? []).map((n) => n.sectionKey).filter((k) => k !== "overall"), ...(addTopic ? [addTopic] : [])])];

  if (!data) return <p className="text-sm text-slate-400">Çalışma alanı yükleniyor…</p>;

  return (
    <div className="flex flex-col gap-4">
      {/* 1) Bilgi Bankam */}
      {/* Bölümler sekme değişince SÖKÜLMEZ, yalnız gizlenir: yazılan not / özet durumu korunur. */}
      <section hidden={!(section === "all" || section === "kb")} className="rounded-2xl border border-[#ead9b0] bg-[#FFF8E8] p-5" aria-label="Bilgi Bankam">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-[#5b4416]">Bilgi Bankam</h3>
          <span className="text-xs text-[#7a5d22]">
            {data.topics.length} konu · {matchedTopics.length} konuda {data.kbMatches.length} kendi notum
          </span>
        </div>
        {!data.knowledgeBankEnabled && <p className="text-sm text-slate-600">Bilgi Bankası yetkisi kapalı.</p>}
        {ws?.error && <p className="text-sm text-rose-700">{ws.error}</p>}
        {matchedTopics.length === 0 ? (
          <p className="text-sm text-slate-600">Bu haritanın konularıyla eşleşen Bilgi Bankası kaydınız yok.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {matchedTopics.map((t) => (
              <div key={t.key}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#5b4416]">{t.label}</span>
                  {!notesByKey.has(t.key) && (
                    <button type="button" className="text-xs text-emerald-700 underline" onClick={() => setAddTopic(t.key)}>
                      Bu konuya danışan yorumu yaz
                    </button>
                  )}
                </div>
                <ul className="flex flex-col gap-2">
                  {(matchesByTopic.get(t.key) ?? []).map((e) => (
                    <KbEntryCard key={e.id} entry={e} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {unmatchedTopics.length > 0 && data.knowledgeBankEnabled && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[#7a5d22]">Eşleşmeyen {unmatchedTopics.length} konu — Bilgi Bankama ekle</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unmatchedTopics.map((t) => (
                <button key={t.key} type="button" className="rounded-full border border-[#ead9b0] bg-white px-2 py-0.5 text-xs text-[#5b4416] hover:bg-[#FFF0D2]" onClick={() => setKbCreate(t.key)}>
                  + {t.label}
                </button>
              ))}
            </div>
          </details>
        )}
        {kbCreate && (
          <div className="mt-3">
            <KbEditor
              key={kbCreate}
              editing={{ mode: "create", topicKey: kbCreate }}
              onDirtyChange={(d) => reportDirty("kb-create", d)}
              onCancel={() => {
                reportDirty("kb-create", false);
                setKbCreate(null);
              }}
              onDone={() => {
                reportDirty("kb-create", false);
                setKbCreate(null);
                setReload((n) => n + 1);
              }}
            />
          </div>
        )}
      </section>

      {/* 2) Danışana özel yorum */}
      <section hidden={!(section === "all" || section === "notes")} className="rounded-2xl border border-teal-200 bg-[#EEF9F7] p-5" aria-label="Danışana Özel Yorumum">
        <h3 className="mb-1 text-base font-semibold text-teal-950">Danışana Özel Yorumum</h3>
        {(profileLabel || techniqueLabel) && (
          <p className="mb-1 text-sm text-teal-900">
            {profileLabel && (
              <>
                Danışan / profil: <strong>{profileLabel}</strong>
              </>
            )}
            {profileLabel && techniqueLabel ? " · " : ""}
            {techniqueLabel && (
              <>
                Analiz: <strong>{techniqueLabel}</strong>
              </>
            )}
          </p>
        )}
        <p className="mb-4 text-xs text-teal-800">
          Bu notlar yalnız bu doğum profiline ve bu analiz türüne{data.noteContext
            ? ` (bağlam: ${data.noteContext.split("|").map((p) => p.replace(":", " ")).join(" · ")})`
            : data.contextLocationId
              ? " (bu konum bağlamında)"
              : data.contextKey
                ? " (bu karşı tarafla)"
                : ""} aittir; Bilgi Bankası kayıtlarınızı değiştirmez.
        </p>
        <div className="flex flex-col gap-3">
          <NoteEditor key={`overall-${notesByKey.get("overall")?.revision ?? 0}`} profileId={profileId} technique={data.technique} contextKey={data.contextKey} contextLocationId={data.contextLocationId ?? null} noteContext={data.noteContext ?? null} sectionKey="overall" label="Genel yorum" note={notesByKey.get("overall") ?? null} onSaved={() => setReload((n) => n + 1)} onDirty={reportDirty} />
          {noteSections.map((k) => {
            const n = notesByKey.get(k) ?? null;
            const label = n?.sectionLabel ?? data.topics.find((t) => t.key === k)?.label ?? k;
            return <NoteEditor key={`${k}-${n?.revision ?? 0}`} profileId={profileId} technique={data.technique} contextKey={data.contextKey} contextLocationId={data.contextLocationId ?? null} noteContext={data.noteContext ?? null} sectionKey={k} label={label} note={n} onSaved={() => setReload((x) => x + 1)} onDirty={reportDirty} />;
          })}
        </div>
      </section>

    </div>
  );
}
