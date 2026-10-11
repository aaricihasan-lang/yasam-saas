"use client";

/**
 * Çalışma alanı (tüm teknikler) — teknik sonucun ALTINDA, Roxy yorumundan AYRI:
 *   1) "Bilgi Bankam"  — haritanın kanonik konularıyla eşleşen KENDİ mesleki notlarım (Roxy değil)
 *   2) "Danışana Özel Yorumum" — bu profile özel çalışma notları (Bilgi Bankası'nı DEĞİŞTİRMEZ)
 *   3) "Analizi Kaydet" — özet → bilinçli onay → DEĞİŞMEZ snapshot (idempotent istek kimliği)
 * Bu panel sağlayıcıyı ÇAĞIRMAZ. Bağlam = (profil, revizyon, teknik, normalize seçenekler); notlar
 * (profil, teknik, karşı taraf) bağlamındadır — transit notu natal'e, Y sinastrisi Z'ye karışmaz.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { astroFetch } from "../_lib/api";
import { houseSystemLabel } from "../_lib/techniques";
import { KbEditor, KbEntryCard, type KbEntry } from "./KnowledgeBankPanel";

type Topic = { key: string; kind: string; label: string };
type Note = { id: string; sectionKey: string; sectionLabel: string; body: string; revision: number; updatedAt: string };
type Workspace = { technique: string; contextKey: string; contextLocationId?: string | null; noteContext?: string | null; knowledgeBankEnabled: boolean; topics: Topic[]; kbMatches: KbEntry[]; notes: Note[] };
export type WorkspaceSelection = { technique: string; options: Record<string, unknown> };
type Summary = {
  title: string;
  client: string | null;
  profileLabel: string;
  partnerLabel: string | null;
  partnerRevision: number | null;
  technique: string;
  techniqueLabel: string;
  partCount: number;
  revision: number;
  zodiac: "tropical" | "sidereal";
  houseSystem: string | null;
  nodeType: string | null;
  provider: string;
  topicCount: number;
  kbMatchCount: number;
  noteCount: number;
  providerInterpIncluded: boolean;
  timeUnknownMasked: boolean;
};

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
  interpVisible,
  previewNoInterp,
  refreshKey = 0,
  onSaved,
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
  interpVisible: boolean;
  previewNoInterp: boolean;
  refreshKey?: number;
  onSaved: (analysisId: string) => void;
  /** Çalışma alanı yüklendiğinde (konu + KB eşleşmeleri) üst bileşene bildirilir — ek istek yok. */
  onData?: (data: { kbMatches: KbEntry[] }) => void;
  /** Sonuç çalışma masası sekmesi: tek örnek bölümler arasında geçer (durum korunur). Varsayılan "all" = önceki görünüm. */
  section?: "all" | "kb" | "notes" | "save";
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
  const [includeInterp, setIncludeInterp] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState<{ key: string; s: Summary; requestId: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const effectiveInclude = includeInterp && interpVisible && !previewNoInterp;
  const shownSummary = summary && summary.key === `${key}|${effectiveInclude}|${title}` ? summary : null;

  async function prepare() {
    setBusy(true);
    setSaveMsg(null);
    const r = await astroFetch<{ summary: Summary }>(`/api/admin/astroloji/analyses/preview${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId, revision, ...selection, includeProviderInterp: effectiveInclude, title: title.trim() || undefined },
    });
    setBusy(false);
    if (r.ok) setSummary({ key: `${key}|${effectiveInclude}|${title}`, s: r.data.summary, requestId: crypto.randomUUID() });
    else setSaveMsg(r.error);
  }

  async function save() {
    if (!shownSummary) return;
    setBusy(true);
    const r = await astroFetch<{ analysisId: string; reused: boolean }>(`/api/admin/astroloji/analyses${previewNoInterp ? "?previewNoInterp=1" : ""}`, {
      method: "POST",
      body: { profileId, revision, ...selection, includeProviderInterp: effectiveInclude, title: shownSummary.s.title, saveRequestId: shownSummary.requestId },
    });
    setBusy(false);
    if (r.ok) {
      setSummary(null);
      setSaveMsg(r.data.reused ? "Bu analiz zaten kaydedilmişti." : "Analiz kaydedildi (değişmez kayıt).");
      onSaved(r.data.analysisId);
    } else setSaveMsg(r.error);
  }

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

      {/* 3) Analizi Kaydet */}
      <section hidden={!(section === "all" || section === "save")} className="rounded-2xl border border-slate-300 bg-white p-5" aria-label="Analizi Kaydet">
        <h3 className="mb-2 text-base font-semibold text-slate-900">Analizi Kaydet</h3>
        <p className="mb-2 text-xs text-slate-500">
          Kayıt; doğum profili revizyonu, yöntem, teknik sonuç, eşleşen Bilgi Bankası notları ve danışan yorumunuzun o anki halini DEĞİŞMEZ olarak saklar.
        </p>
        <div className="flex flex-col gap-2">
          <input className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" placeholder="Başlık (boş bırakılırsa otomatik)" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <label className={`flex items-center gap-2 text-sm ${interpVisible && !previewNoInterp ? "text-slate-700" : "text-slate-400"}`}>
            <input type="checkbox" disabled={!interpVisible || previewNoInterp} checked={effectiveInclude} onChange={(e) => setIncludeInterp(e.target.checked)} />
            Sistem yorumunu analize ayrı katman olarak dahil et
            {(!interpVisible || previewNoInterp) && <span className="text-xs">(bu görünümde kapalı)</span>}
          </label>
          {!shownSummary ? (
            <button type="button" disabled={busy} onClick={() => void prepare()} className="self-start rounded-lg border border-slate-400 px-4 py-1.5 text-sm text-slate-800 disabled:opacity-60">
              {busy ? "Hazırlanıyor…" : "Kaydetmeden önce özeti gör"}
            </button>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="astro-save-summary">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-slate-500">Başlık</dt>
                <dd>{shownSummary.s.title}</dd>
                <dt className="text-slate-500">Danışan</dt>
                <dd>{shownSummary.s.client ?? "— (bağımsız profil)"}</dd>
                <dt className="text-slate-500">Analiz türü</dt>
                <dd>
                  {shownSummary.s.techniqueLabel}
                  {shownSummary.s.partCount > 1 ? ` · ${shownSummary.s.partCount} parça` : ""}
                </dd>
                {shownSummary.s.partnerLabel && (
                  <>
                    <dt className="text-slate-500">Karşı taraf</dt>
                    <dd>
                      {shownSummary.s.partnerLabel} · rev {shownSummary.s.partnerRevision}
                    </dd>
                  </>
                )}
                <dt className="text-slate-500">Doğum profili</dt>
                <dd>
                  {shownSummary.s.profileLabel} · rev {shownSummary.s.revision}
                  {shownSummary.s.timeUnknownMasked ? " · saat bilinmiyor" : ""}
                </dd>
                <dt className="text-slate-500">Yöntem</dt>
                <dd>
                  {shownSummary.s.zodiac === "sidereal" ? (shownSummary.s.technique.startsWith("kp.") ? "Sidereal (KP)" : "Sidereal (nirayana)") : "Tropikal"} · {houseSystemLabel(shownSummary.s.houseSystem, HOUSE_SYSTEM_LABELS)}
                  {shownSummary.s.nodeType === "true" || shownSummary.s.nodeType === "mean" ? ` · ${NODE_TYPE_LABELS[shownSummary.s.nodeType]}` : ""} · hesap motoru: {shownSummary.s.provider === "roxy" ? "RoxyAPI" : shownSummary.s.provider}
                </dd>
                <dt className="text-slate-500">Bilgi Bankası</dt>
                <dd>
                  {shownSummary.s.kbMatchCount} eşleşen not ({shownSummary.s.topicCount} konu)
                </dd>
                <dt className="text-slate-500">Danışan yorumu</dt>
                <dd>{shownSummary.s.noteCount} not bölümü</dd>
                <dt className="text-slate-500">Sistem yorumu</dt>
                <dd>{shownSummary.s.providerInterpIncluded ? "Dahil (ayrı katman)" : "Dahil değil"}</dd>
              </dl>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={() => void save()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1430] font-semibold text-white transition hover:bg-[#1a2b5c] disabled:cursor-not-allowed disabled:opacity-50 px-4 py-1.5 text-sm disabled:opacity-60">
                  {busy ? "Kaydediliyor…" : "Analizi kaydet"}
                </button>
                <button type="button" onClick={() => setSummary(null)} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">
                  Vazgeç
                </button>
              </div>
            </div>
          )}
          {saveMsg && <p className="text-sm text-slate-700">{saveMsg}</p>}
        </div>
      </section>
    </div>
  );
}
