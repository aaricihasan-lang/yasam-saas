"use client";

/**
 * Kayıtlı analizler — liste + salt-okunur SNAPSHOT görünümü. Açmak yalnız snapshot okur
 * (0 sağlayıcı isteği). Katmanlar ayrı bölümlerde: profil · yöntem · teknik · Bilgi Bankası (o anki) ·
 * danışan yorumu (o anki) · Roxy yorumu (dahil edildiyse VE güncel yetki izin veriyorsa) · sürümler.
 */

import { useEffect, useState } from "react";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { astroDownload, astroFetch } from "../_lib/api";
import { describeOptions, houseSystemLabel, techniqueLabel, zodiacLabel } from "../_lib/techniques";
import { TechniqueTechnical } from "./TimingPanels";
import ProviderInterpretationPanel, { type InterpretationLayer } from "./ProviderInterpretationPanel";

type ListItem = {
  id: string;
  title: string;
  technique: string;
  params: Record<string, unknown>;
  partnerLabel: string | null;
  analysisAt: string;
  profileRevision: number;
  houseSystem: string | null;
  providerInterpIncluded: boolean;
};

type RevSnap = { revision: number; birthDate: string; birthTime: string | null; locationLabel: string; timezone: string; timeAccuracyLabel: string; latitude?: number; longitude?: number };
type PersonSnap = { profileId?: string; label: string; client: { name: string | null } | null; revision: RevSnap };

type KbSnap = { entryId: string; topicKey: string; topicLabel: string; title: string; body: string; sourceNote: string | null; tags: string[]; revision: number; updatedAt: string };

type Analysis = {
  id: string;
  title: string;
  analysisAt: string;
  technique: string;
  params: Record<string, unknown>;
  profile: PersonSnap & { partner?: PersonSnap | null };
  method: { houseSystem: keyof typeof HOUSE_SYSTEM_LABELS | null; nodeType: "true" | "mean" | null; timeUnknownMasked: boolean; warnings?: string[] };
  technical: unknown;
  knowledgeBank: KbSnap[];
  notes: { sectionKey: string; sectionLabel: string; body: string }[];
  interpretation: InterpretationLayer;
  versions: Record<string, unknown>;
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

type Group = { tradition: string; label: string; count: number; techniques: { technique: string; techniqueLabel: string; count: number; lastAnalysisAt: string | null }[] };
type ListPage = { groups: Group[]; total: number; filteredTotal: number; hasMore: boolean; analyses: ListItem[] };

/**
 * Kayıtlı analiz geçmişi (Aşama 7B): Batı / Vedik / KP gruplarına ayrılır; grup ve teknik çipleri yalnız
 * GERÇEKTEN kaydı olanlar için gösterilir; liste sunucudan sayfalı gelir. Açmak yalnız snapshot okur
 * (0 sağlayıcı isteği); içerik değiştirilmez.
 */
export function SavedAnalysesList({ profileId, reloadKey, onOpen, openId }: { profileId: string; reloadKey: number; onOpen: (id: string) => void; openId: string | null }) {
  const [sel, setSel] = useState<{ key: string; tradition: string | null; technique: string | null }>({ key: "", tradition: null, technique: null });
  const baseKey = `${profileId}|${reloadKey}`;
  const tradition = sel.key === baseKey ? sel.tradition : null;
  const technique = sel.key === baseKey ? sel.technique : null;
  const key = `${baseKey}|${tradition ?? ""}|${technique ?? ""}`;
  const [state, setState] = useState<{ key: string; page: ListPage | null; items: ListItem[]; error: string | null } | null>(null);
  const [more, setMore] = useState(false);

  const url = (offset: number) => {
    const sp = new URLSearchParams({ profileId, offset: String(offset), limit: "30" });
    if (tradition) sp.set("tradition", tradition);
    if (technique) sp.set("technique", technique);
    return `/api/admin/astroloji/analyses?${sp.toString()}`;
  };

  useEffect(() => {
    let alive = true;
    void astroFetch<ListPage>(url(0)).then((r) => {
      if (alive) setState({ key, page: r.ok ? r.data : null, items: r.ok ? r.data.analyses : [], error: r.ok ? null : r.error });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const cur = state && state.key === key ? state : null;
  if (!cur) return <p className="text-xs text-slate-400">Kayıtlı analizler yükleniyor…</p>;
  if (cur.error) return <p className="text-xs text-rose-700">{cur.error}</p>;
  const page = cur.page!;
  if (page.total === 0) return <p className="text-xs text-slate-500">Bu profil için kayıtlı analiz yok.</p>;

  async function loadMore() {
    if (!cur) return;
    setMore(true);
    const r = await astroFetch<ListPage>(url(cur.items.length));
    setMore(false);
    if (!r.ok) return;
    setState((s) => (s && s.key === key ? { ...s, page: r.data, items: [...s.items, ...r.data.analyses.filter((a) => !s.items.some((x) => x.id === a.id))] } : s));
  }

  const activeGroup = page.groups.find((g) => g.tradition === tradition) ?? null;
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs ${on ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`;

  return (
    <div className="flex flex-col gap-2" data-testid="astro-saved-analyses">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Analiz grubu">
        <button type="button" role="tab" aria-selected={!tradition} className={chip(!tradition)} onClick={() => setSel({ key: baseKey, tradition: null, technique: null })}>
          Tümü ({page.total})
        </button>
        {page.groups.map((g) => (
          <button key={g.tradition} type="button" role="tab" aria-selected={tradition === g.tradition} className={chip(tradition === g.tradition)} onClick={() => setSel({ key: baseKey, tradition: g.tradition, technique: null })}>
            {g.label} ({g.count})
          </button>
        ))}
      </div>
      {activeGroup && activeGroup.techniques.length > 1 && (
        <div className="flex flex-wrap gap-1" aria-label={`${activeGroup.label} teknikleri`}>
          <button type="button" className={chip(!technique)} onClick={() => setSel({ key: baseKey, tradition, technique: null })}>
            Tüm teknikler
          </button>
          {activeGroup.techniques.map((t) => (
            <button key={t.technique} type="button" className={chip(technique === t.technique)} onClick={() => setSel({ key: baseKey, tradition, technique: t.technique })}>
              {t.techniqueLabel} ({t.count})
            </button>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {cur.items.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className={`w-full rounded-lg border px-3 py-1.5 text-left text-sm ${openId === a.id ? "border-slate-500 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-400"}`}
            >
              <div className="break-words font-medium text-slate-800">{a.title}</div>
              <div className="text-xs text-slate-500">
                <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{techniqueLabel(a.technique)}</span>
                {describeOptions(a.technique, a.params, () => a.partnerLabel)} · {fmt(a.analysisAt)} · rev {a.profileRevision}
                {a.providerInterpIncluded ? " · Roxy yorumu dahil" : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {page.hasMore && (
        <button type="button" disabled={more} onClick={() => void loadMore()} className="self-start rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-60" data-testid="astro-analyses-more">
          {more ? "Yükleniyor…" : `Daha fazla göster (${cur.items.length} / ${page.filteredTotal})`}
        </button>
      )}
    </div>
  );
}

export function SavedAnalysisView({ id, previewNoInterp, onClose }: { id: string; previewNoInterp: boolean; onClose: () => void }) {
  const key = `${id}|${previewNoInterp}`;
  const [state, setState] = useState<{ key: string; a: Analysis | null; error: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    void astroFetch<{ analysis: Analysis }>(`/api/admin/astroloji/analyses/${id}${previewNoInterp ? "?previewNoInterp=1" : ""}`).then((r) => {
      if (alive) setState({ key, a: r.ok ? r.data.analysis : null, error: r.ok ? null : r.error });
    });
    return () => {
      alive = false;
    };
  }, [key, id, previewNoInterp]);
  const cur = state && state.key === key ? state : null;
  if (!cur) return <p className="text-sm text-slate-400">Analiz yükleniyor…</p>;
  if (!cur.a) return <p className="text-sm text-rose-700">{cur.error}</p>;
  const a = cur.a;
  const interp = a.interpretation;
  const partner = a.profile.partner ?? null;
  const person = (p: PersonSnap) => (
    <>
      {p.client?.name ? `Danışan: ${p.client.name} · ` : ""}
      {p.label} · rev {p.revision.revision} · {p.revision.birthDate} {p.revision.birthTime ? p.revision.birthTime.slice(0, 5) : "(saat bilinmiyor)"} · {p.revision.locationLabel}
    </>
  );
  return (
    <div className="flex flex-col gap-4" data-testid="astro-saved-analysis">
      <section className="rounded-2xl border-2 border-slate-400 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white">Kayıtlı analiz · değişmez</span>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{a.title}</h3>
            <p className="text-sm text-slate-800">
              <strong>{techniqueLabel(a.technique)}</strong>
              {describeOptions(a.technique, a.params, () => partner?.label ?? null) ? ` · ${describeOptions(a.technique, a.params, () => partner?.label ?? null)}` : ""} · kayıt {fmt(a.analysisAt)}
            </p>
            <p className="text-sm text-slate-600">{partner ? <>1. kişi: {person(a.profile)}</> : person(a.profile)}</p>
            {partner && <p className="text-sm text-slate-600">2. kişi: {person(partner)}</p>}
            <p className="text-xs text-slate-500">
              {zodiacLabel(a.technique)} · {houseSystemLabel(a.method.houseSystem, HOUSE_SYSTEM_LABELS)} · {a.method.nodeType ? NODE_TYPE_LABELS[a.method.nodeType] : "—"} · sağlayıcı {String(a.versions.provider)} ({String(a.versions.providerApiVersion)}) ·
              adaptör {String(a.versions.adapterVersion)} · projeksiyon {String(a.versions.projectionVersion)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ReportButtons id={a.id} previewNoInterp={previewNoInterp} />
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>
              Kapat
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Kayıtlı teknik veriler">
        <h4 className="text-base font-semibold text-slate-900">Hesaplama / Teknik Veriler (kayıt anı)</h4>
        <TechniqueTechnical
          technique={a.technique}
          technical={a.technical}
          timeUnknownMasked={a.method.timeUnknownMasked}
          warnings={a.method.warnings ?? []}
          names={[a.profile.label, partner?.label ?? "2. kişi"]}
          options={a.params}
          birthplace={
            a.profile.revision.latitude !== undefined && a.profile.revision.longitude !== undefined
              ? { lat: a.profile.revision.latitude, lon: a.profile.revision.longitude, label: a.profile.revision.locationLabel }
              : null
          }
          kbLookup={(keys) => a.knowledgeBank.filter((e) => keys.includes(e.topicKey))}
        />
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4" aria-label="Kayıtlı Bilgi Bankası">
        <h4 className="mb-2 text-base font-semibold text-indigo-900">Bilgi Bankam (güncel)</h4>
        {a.knowledgeBank.length === 0 ? (
          <p className="text-sm text-slate-600">Bu analizle eşleşen güncel Bilgi Bankası kaydınız yok.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {a.knowledgeBank.map((e) => (
              <li key={`${e.entryId}-${e.revision}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs font-medium text-violet-700">{e.topicLabel}</div>
                <div className="font-semibold text-slate-800">{e.title}</div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{e.body}</p>
                {e.sourceNote && <p className="mt-1 text-xs text-slate-500">Kaynak: {e.sourceNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4" aria-label="Kayıtlı danışan yorumu">
        <h4 className="mb-2 text-base font-semibold text-emerald-900">Danışana Özel Yorumum (kayıt anındaki hali)</h4>
        {a.notes.length === 0 ? (
          <p className="text-sm text-slate-600">Kayıt anında yorum notu yoktu.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {a.notes.map((n) => (
              <div key={n.sectionKey}>
                <div className="text-xs font-medium text-emerald-800">{n.sectionLabel}</div>
                <p className="whitespace-pre-line text-sm text-slate-800">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {!interp.visible && interp.reason === "not_included" ? (
        <p className="rounded-xl border border-dashed border-violet-200 px-3 py-2 text-sm text-slate-500">Roxy otomatik yorumu bu analize dahil edilmedi.</p>
      ) : (
        <ProviderInterpretationPanel interpretation={interp} />
      )}
    </div>
  );
}

/**
 * Aşama 8 — Word / PDF raporu. Dosya SUNUCUDA, yalnız kayıtlı snapshot'tan üretilir (0 Roxy isteği).
 * Mobil (ürün kuralı, DY Word + Anamnez PDF ile aynı): Android'de hiç render edilmez (`useIsAndroid`)
 * ve SSR'da `.no-android` ile gizlidir; telefon genişliğinde (<768px) `hidden md:inline-flex` ile gizlidir.
 * Sunucu da Android isteğini 403 ile reddeder. Masaüstü davranışı etkilenmez.
 */
function ReportButtons({ id, previewNoInterp }: { id: string; previewNoInterp: boolean }) {
  const isAndroid = useIsAndroid();
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (isAndroid) return null;
  async function run(format: "docx" | "pdf") {
    setBusy(format);
    setErr(null);
    const q = new URLSearchParams({ format });
    if (previewNoInterp) q.set("previewNoInterp", "1");
    const r = await astroDownload(`/api/admin/astroloji/analyses/${id}/report?${q.toString()}`, `Astroloji-Analiz.${format}`);
    setBusy(null);
    if (!r.ok) setErr(r.error);
  }
  const cls = "no-android hidden md:inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm font-medium disabled:opacity-60";
  return (
    <>
      <button type="button" data-testid="astro-report-docx" disabled={busy !== null} onClick={() => void run("docx")} className={`${cls} border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100`}>
        {busy === "docx" ? "Hazırlanıyor…" : "Word"}
      </button>
      <button type="button" data-testid="astro-report-pdf" disabled={busy !== null} onClick={() => void run("pdf")} className={`${cls} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100`}>
        {busy === "pdf" ? "Hazırlanıyor…" : "PDF"}
      </button>
      {err && (
        <span role="alert" className="hidden w-full text-xs text-rose-700 md:block" data-testid="astro-report-error">
          {err}
        </span>
      )}
    </>
  );
}
