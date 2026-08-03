"use client";

/**
 * BF-14 Paket 2 — Yeniden kullanılabilir Yaşam Hafızası seçici (üç teslim akışı ortak).
 *
 * İki AÇIK sekme: "Mesleki Hafıza" (BF-13 professional arama) ve "Danışan Hafızası"
 * (BF-14 client arama). İki bağlam UI'da AÇIKÇA ayrıdır; yanıtlar KARIŞMAZ; otomatik/AI
 * seçim YOKTUR (uzman seçmeden hiçbir kayıt eklenmez). Seçim → server-side snapshot.
 *
 * Danışan zorunludur: snapshot her zaman danışan-scoped'tur. `fixedClient` verilmezse
 * (protokol/rehber akışı) uzman doğrulanmış client listesinden bir danışan seçer;
 * client ID isim/serbest metinden TÜRETİLMEZ (yalnız /api/clients'tan gelen id).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Check, Trash2, AlertTriangle } from "lucide-react";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { fetchYhSearch } from "@/lib/yasam-hafizasi/ui/searchApiClient";
import type { YhSearchResponse } from "@/lib/yasam-hafizasi/ui/searchResult";
import { fetchClientYhSearch } from "@/lib/yasam-hafizasi/client/clientSearchApiClient";
import type { ClientSearchResponse } from "@/lib/yasam-hafizasi/client/clientSearchResult";
import { createSnapshotSelectionGroup } from "@/lib/yasam-hafizasi/client/snapshotApiClient";
import type { SnapshotTargetKind } from "@/lib/yasam-hafizasi/client/snapshotDto";

type Scope = "professional" | "client";
type Status = "idle" | "loading" | "done" | "error" | "disabled";

interface PickRow {
  scope: Scope;
  id: string;
  moduleLabel: string;
  title: string | null;
  snippet: string | null;
  date: string | null;
  evidence: { kind: string; text: string }[];
  topicTags: string[];
  sourceAvailable: boolean;
  isShared: boolean;
}

interface Facet {
  key: string;
  label: string;
  count: number;
}

interface SelectedItem {
  scope: Scope;
  indexId: string;
  moduleLabel: string;
  title: string;
}

interface ClientOption {
  id: string;
  name: string;
}

export interface MemoryPickerProps {
  open: boolean;
  onClose: () => void;
  targetKind: SnapshotTargetKind;
  targetRef?: string | null;
  /** report akışı: danışan sabittir. Yoksa dahili danışan seçici gösterilir. */
  fixedClient?: ClientOption | null;
  onConfirmed: (result: { selectionGroupId: string; clientId: string; total: number }) => void;
}

const DISABLED_MSG: Record<string, { title: string; msg: string }> = {
  "not-active": { title: "Danışan Hafızası henüz etkin değil", msg: "Bu özellik etkinleştirildiğinde bu danışanın kayıtlarında arama yapabilirsiniz." },
  "flag-disabled": { title: "Yaşam Hafızası bu hesapta aktif değil", msg: "Bu özellik hesabınız için etkinleştirildiğinde arama yapabilirsiniz." },
  demo: { title: "Demo hesabında kullanılamaz", msg: "Demo hesaplarında Yaşam Hafızası seçimi yapılmaz." },
};

function selKey(scope: Scope, id: string): string {
  return `${scope}:${id}`;
}

export default function MemoryPicker({ open, onClose, targetKind, targetRef, fixedClient, onConfirmed }: MemoryPickerProps) {
  const [scope, setScope] = useState<Scope>("professional");
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<PickRow[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [disabledReason, setDisabledReason] = useState<string>("not-active");
  const [emptyReason, setEmptyReason] = useState<string | undefined>();
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<PickRow | null>(null);
  const [selected, setSelected] = useState<Map<string, SelectedItem>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Danışan seçimi (fixedClient yoksa)
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [pickedClient, setPickedClient] = useState<ClientOption | null>(fixedClient ?? null);

  const abortRef = useRef<AbortController | null>(null);

  const activeClient = fixedClient ?? pickedClient;

  // Danışan listesi (yalnız fixedClient yoksa). Bileşen her açılışta yeniden
  // mount edildiği için (parent koşullu render) ek "reset" effect'ine gerek yoktur.
  useEffect(() => {
    if (!open || fixedClient) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      setClientsLoading(true);
      const u = readYasamUser();
      const t = readSessionToken();
      try {
        const res = await fetch("/api/clients?order=asc&limit=1000", {
          headers: { "x-user-id": u?.id ?? "", ...(t ? { "x-session-token": t } : {}) },
          cache: "no-store",
        });
        const data: unknown = await res.json().catch(() => null);
        if (cancelled) return;
        const list = data && typeof data === "object" && Array.isArray((data as { clients?: unknown }).clients)
          ? ((data as { clients: Record<string, unknown>[] }).clients)
          : [];
        setClients(
          list.map((c) => ({
            id: String(c.id ?? ""),
            name: `${String(c.ad ?? "").trim()} ${String(c.soyad ?? "").trim()}`.trim() || "İsimsiz Danışan",
          })).filter((c) => c.id),
        );
      } catch {
        /* danışan listesi alınamazsa boş kalır; UI güvenli boş durum gösterir */
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, fixedClient]);

  const runSearch = useCallback(
    async (query: string, useScope: Scope) => {
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        setStatus("idle");
        setRows([]);
        setFacets([]);
        setSubmitted("");
        return;
      }
      // Danışan sekmesi için doğrulanmış client zorunlu.
      if (useScope === "client" && !activeClient) {
        setStatus("idle");
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setSubmitted(trimmed);
      setStatus("loading");
      setModuleFilter(null);

      if (useScope === "professional") {
        const res: YhSearchResponse = await fetchYhSearch({ q: trimmed }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (res.disabled) {
          setDisabledReason("flag-disabled");
          setStatus("disabled");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setRows(res.results.map((r) => ({
          scope: "professional", id: r.id, moduleLabel: r.moduleLabel, title: r.title, snippet: r.snippet,
          date: r.updatedAt, evidence: r.evidence, topicTags: r.topicTags, sourceAvailable: true, isShared: r.isShared,
        })));
        setFacets(res.facets.map((f) => ({ key: f.module, label: f.moduleLabel, count: f.count })));
        setEmptyReason(res.emptyReason);
        setStatus("done");
      } else {
        const res: ClientSearchResponse = await fetchClientYhSearch(activeClient!.id, { q: trimmed }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (res.disabled) {
          setDisabledReason(res.reason ?? "not-active");
          setStatus("disabled");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        setRows(res.results.map((r) => ({
          scope: "client", id: r.id, moduleLabel: r.moduleLabel, title: r.title, snippet: r.snippet,
          date: r.occurredAt ?? r.updatedAt, evidence: r.evidence, topicTags: r.topicTags,
          sourceAvailable: r.sourceAvailable, isShared: false,
        })));
        setFacets(res.facets.map((f) => ({ key: f.module, label: f.moduleLabel, count: f.count })));
        setEmptyReason(res.emptyReason);
        setStatus("done");
      }
    },
    [activeClient],
  );

  const displayed = useMemo(
    () => (moduleFilter ? rows.filter((r) => r.moduleLabel === moduleFilter) : rows),
    [rows, moduleFilter],
  );

  const toggleSelect = (r: PickRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const k = selKey(r.scope, r.id);
      if (next.has(k)) next.delete(k);
      else next.set(k, { scope: r.scope, indexId: r.id, moduleLabel: r.moduleLabel, title: r.title ?? "Kayıt" });
      return next;
    });
  };

  const removeSelected = (k: string) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(k);
      return next;
    });
  };

  const switchScope = (s: Scope) => {
    if (s === scope) return;
    setScope(s);
    setStatus("idle");
    setRows([]);
    setFacets([]);
    setModuleFilter(null);
    setSubmitted("");
    setQ("");
  };

  const confirm = async () => {
    if (!activeClient || selected.size === 0 || saving) return;
    setSaving(true);
    setSaveError(null);
    const items = [...selected.values()].map((s, i) => ({ scope: s.scope, indexId: s.indexId, ordering: i }));
    const res = await createSnapshotSelectionGroup(activeClient.id, {
      targetKind,
      targetRef: targetRef ?? null,
      items,
    });
    setSaving(false);
    if (!res.ok || !res.selectionGroupId) {
      setSaveError(
        res.code === "YH_NOT_ACTIVE" ? "Yaşam Hafızası bu hesapta aktif değil."
          : res.code === "YH_DEMO_READONLY" ? "Demo hesabında bu işlem yapılamaz."
            : "Seçim kaydedilemedi. Lütfen tekrar deneyin.",
      );
      return;
    }
    onConfirmed({ selectionGroupId: res.selectionGroupId, clientId: activeClient.id, total: res.total ?? items.length });
  };

  if (!open) return null;

  const needsClient = !fixedClient && !pickedClient;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Yaşam Hafızası'ndan seç">
      <button type="button" aria-label="Kapat" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[88vh] sm:rounded-2xl">
        {/* Başlık */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-base font-black text-slate-900">Yaşam Hafızası&apos;ndan Seç</h2>
            <p className="text-xs text-slate-500">
              Seçtiğiniz kayıtlar bu teslime <span className="font-semibold">değişmez kopya</span> olarak eklenir.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Danışan seçici (fixedClient yoksa) */}
        {!fixedClient ? (
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Danışan (teslim için zorunlu)</label>
            <select
              value={pickedClient?.id ?? ""}
              onChange={(e) => {
                const c = clients.find((x) => x.id === e.target.value) ?? null;
                setPickedClient(c);
                setSelected(new Map());
                if (scope === "client") { setStatus("idle"); setRows([]); setSubmitted(""); }
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
            >
              <option value="">{clientsLoading ? "Danışanlar yükleniyor…" : "— Danışan seçin —"}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="border-b border-slate-100 bg-violet-50/60 px-4 py-2 text-xs text-violet-700">
            Danışan: <span className="font-bold">{fixedClient.name}</span>
          </div>
        )}

        {/* Sekmeler */}
        <div className="flex gap-1 border-b border-slate-100 px-3 pt-2">
          <TabBtn active={scope === "professional"} onClick={() => switchScope("professional")}>Mesleki Hafıza</TabBtn>
          <TabBtn active={scope === "client"} onClick={() => switchScope("client")} disabled={needsClient}>Danışan Hafızası</TabBtn>
        </div>

        {/* Arama */}
        <div className="border-b border-slate-100 px-4 py-3">
          {scope === "client" && needsClient ? (
            <p className="text-sm text-slate-500">Önce yukarıdan bir danışan seçin.</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void runSearch(q, scope); }} className="flex items-stretch gap-2" role="search">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200}
                  aria-label={scope === "professional" ? "Mesleki hafıza araması" : "Danışan hafızası araması"}
                  placeholder={scope === "professional" ? "Mesleki bilgi ara…" : "Danışan kaydı ara…"}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-base outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
                />
              </div>
              <button type="submit" className="btn-primary inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm">Ara</button>
            </form>
          )}
        </div>

        {/* Sonuçlar */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {status === "idle" ? (
            <StateCard icon="🔎" title="Aramaya başlayın" msg={scope === "professional" ? "Mesleki bilgi havuzunuzda arayın." : "Bu danışanın geçmiş kayıtlarında arayın."} />
          ) : null}
          {status === "loading" ? <Skeleton /> : null}
          {status === "disabled" ? (
            <StateCard icon="🔒" title={DISABLED_MSG[disabledReason]?.title ?? "Kullanılamaz"} msg={DISABLED_MSG[disabledReason]?.msg ?? ""} />
          ) : null}
          {status === "error" ? (
            <StateCard icon="⚠️" title="Bir şeyler ters gitti" msg="Arama tamamlanamadı." action={
              <button type="button" onClick={() => void runSearch(submitted, scope)} className="btn-primary inline-flex items-center rounded-lg px-3 py-1.5 text-sm">Tekrar dene</button>
            } />
          ) : null}
          {status === "done" ? (
            rows.length === 0 ? (
              <StateCard icon="🗂️" title="Kayıt bulunamadı" msg={emptyReason === "filtered" ? "Bu filtrede kayıt yok." : "Bu arama için kayıt bulunamadı."} />
            ) : (
              <>
                {facets.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {facets.map((f) => {
                      const active = moduleFilter === f.label;
                      return (
                        <button key={f.key} type="button" onClick={() => setModuleFilter(active ? null : f.label)} aria-pressed={active}
                          className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${active ? "border-violet-300 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
                          {f.label}<span className={`rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{f.count}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {displayed.length === 0 ? (
                  <StateCard icon="🧭" title="Seçili filtrede sonuç yok" msg="Filtreyi kaldırın." />
                ) : (
                  <div className="space-y-2">
                    {displayed.map((r) => {
                      const isSel = selected.has(selKey(r.scope, r.id));
                      return (
                        <div key={selKey(r.scope, r.id)} className={`flex items-start gap-2 rounded-xl border p-3 ${isSel ? "border-violet-300 bg-violet-50/50" : "border-slate-200 bg-white"}`}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r)} aria-label="Kaydı seç" className="mt-1 h-4 w-4 accent-violet-600" />
                          <button type="button" onClick={() => setDetail(r)} className="min-w-0 flex-1 text-left">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-black uppercase text-violet-700">{r.moduleLabel}</span>
                              {r.scope === "professional" && r.isShared ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Kütüphane</span> : null}
                              {r.date ? <span className="text-[11px] text-slate-400">{r.date.slice(0, 10)}</span> : null}
                            </div>
                            <h4 className="line-clamp-1 text-sm font-bold text-slate-900">{r.title ?? "Kayıt"}</h4>
                            {r.snippet ? <p className="line-clamp-1 text-sm text-slate-600">{r.snippet}</p> : null}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )
          ) : null}
        </div>

        {/* Seçim özeti + onay */}
        <div className="border-t border-slate-100 px-4 py-3">
          {selected.size > 0 ? (
            <div className="mb-2 max-h-24 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {[...selected.entries()].map(([k, s]) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    <span className="font-semibold">{s.moduleLabel}</span>
                    <span className="max-w-[140px] truncate">· {s.title}</span>
                    <button type="button" onClick={() => removeSelected(k)} aria-label="Seçimi kaldır" className="text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {saveError ? (
            <p className="mb-2 flex items-center gap-1.5 text-sm text-rose-600"><AlertTriangle className="h-4 w-4" aria-hidden />{saveError}</p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-500"><span className="font-bold text-slate-800">{selected.size}</span> kayıt seçildi</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary inline-flex min-h-[40px] items-center rounded-lg px-4 text-sm">Vazgeç</button>
              <button type="button" onClick={() => void confirm()} disabled={selected.size === 0 || !activeClient || saving}
                className="btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 text-sm disabled:opacity-50">
                <Check className="h-4 w-4" aria-hidden />{saving ? "Ekleniyor…" : "Teslime Ekle"}
              </button>
            </div>
          </div>
        </div>

        {/* Detay */}
        {detail ? (
          <div className="absolute inset-0 z-10 flex justify-end" role="dialog" aria-modal="true" aria-label="Kayıt detayı">
            <button type="button" aria-label="Kapat" onClick={() => setDetail(null)} className="absolute inset-0 bg-slate-900/30" />
            <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black uppercase text-violet-700">{detail.moduleLabel}</span>
                <button type="button" onClick={() => setDetail(null)} aria-label="Kapat" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
              </div>
              <div className="space-y-3 px-4 py-4">
                <h3 className="text-xl font-black text-slate-900">{detail.title ?? "Kayıt"}</h3>
                {detail.date ? <p className="text-sm text-slate-500">Tarih: {detail.date.slice(0, 10)}</p> : null}
                {detail.snippet ? <p className="text-sm text-slate-700">{detail.snippet}</p> : null}
                {detail.evidence.length > 0 ? (
                  <ul className="space-y-1.5">
                    {detail.evidence.slice(0, 8).map((e, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{e.text}</li>)}
                  </ul>
                ) : null}
                {detail.topicTags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">{detail.topicTags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{t}</span>)}</div>
                ) : null}
                {!detail.sourceAvailable ? <p className="text-sm text-amber-700">Kaynak kaydı artık mevcut değil (snapshot korunur).</p> : null}
                <button type="button" onClick={() => { toggleSelect(detail); }} className="btn-primary inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm">
                  <Check className="h-4 w-4" aria-hidden />{selected.has(selKey(detail.scope, detail.id)) ? "Seçimden çıkar" : "Seç"}
                </button>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabBtn({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      className={`min-h-[38px] rounded-t-lg px-4 text-sm font-bold ${active ? "border-x border-t border-slate-200 bg-white text-violet-700" : "text-slate-500 hover:text-slate-700"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
      {children}
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 h-3 w-20 rounded-full bg-slate-200" />
          <div className="h-4 w-2/3 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

function StateCard({ icon, title, msg, action }: { icon: string; title: string; msg: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
      <div className="mb-2 text-2xl" aria-hidden>{icon}</div>
      <h3 className="text-base font-black text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-600">{msg}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
