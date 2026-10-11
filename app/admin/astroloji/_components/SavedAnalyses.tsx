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
import { TechniqueTechnical, wheelForTechnique } from "./TimingPanels";
import ProviderInterpretationPanel, { interpretationTitle, type InterpretationLayer } from "./ProviderInterpretationPanel";
import ResultDesk, { DeskChip, deskGhostLight, type DeskTab } from "./atlas/ResultDesk";
import NatalWheel from "./NatalWheel";
import NatalTechnicalPanel from "./NatalTechnicalPanel";
import type { NatalTechnical } from "@/lib/astrology/model/western";

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

/**
 * Otomatik başlık "<profil adı> · <sunucunun teknik etiketi + seçenekler> · GG.AA.YYYY" kalıbındadır (teknik etiketi
 * arayüzdekinden uzun olabilir: "KP dasha (Vimshottari + significator)", "Solar return → London…"). Profil adıyla
 * başlayıp tarihle biten başlık otomatiktir; bunun dışındaki başlık uzmanın verdiği addır.
 */
export function isCustomTitle(title: string, profileLabel: string): boolean {
  const t = title.trim();
  if (!t) return false;
  const p = profileLabel.trim();
  return !(p !== "" && t.startsWith(`${p} · `) && / · \d{2}\.\d{2}\.\d{4}$/.test(t));
}

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
export function SavedAnalysesList({
  profileId,
  reloadKey,
  onOpen,
  openId,
  currentRevision = null,
  profileLabel = "",
}: {
  profileId: string;
  reloadKey: number;
  onOpen: (id: string) => void;
  openId: string | null;
  /** Güncel doğum revizyonu (eski revizyonla kaydedilenler işaretlenir). */
  currentRevision?: number | null;
  /** Otomatik başlığı uzman başlığından ayırmak için (yalnız görüntü). */
  profileLabel?: string;
}) {
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
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${on ? "border-[#0B1430] bg-[#0B1430] text-[#F6E7C3] shadow-[0_6px_14px_-8px_rgba(11,20,48,0.8)]" : "border-[#d9c9a3] bg-white/80 text-slate-700 hover:border-[#b8954e]"}`;
  /** Gelenek renk işareti (ana sayfa kart tonlarıyla aynı aile). */
  const dot = (t: string) => (t.startsWith("vedic.") ? "bg-[#d9a65a]" : t.startsWith("kp.") ? "bg-[#46b3a3]" : "bg-[#9c86e8]");

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
      <div className="overflow-hidden rounded-xl border border-[#e7dcc3] bg-white/70">
      <div className="hidden grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto_auto] gap-x-3 border-b border-[#efe6d2] bg-[#f6efe0]/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a6d33] sm:grid" aria-hidden="true">
        <span>Teknik</span>
        <span>Ayrıntı</span>
        <span>Kayıt</span>
        <span>Doğum</span>
      </div>
      <ul className="flex flex-col divide-y divide-[#efe6d2]">
        {cur.items.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className={`w-full px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#c9a54e] ${openId === a.id ? "bg-[#f3e7c9]/70" : "hover:bg-[#fbf3e1]"}`}
            >
              {/* Ayrı alanlar: teknik · ayrıntı (hedef tarih / yıl / karşı taraf…) · kayıt tarihi · doğum revizyonu —
                  aynı teknikten farklı tarihli kayıtlar ve eski revizyonla kaydedilenler karışmaz. */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto_auto] sm:items-center" data-saved-item={a.id}>
                <span className="flex w-full min-w-0 items-center gap-2 font-medium text-slate-800 sm:w-auto">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dot(a.technique)}`} aria-hidden="true" />
                  {techniqueLabel(a.technique)}
                </span>
                <span className="min-w-0 max-w-full truncate pl-4 text-xs text-slate-600 sm:pl-0" title={a.title}>
                  {/* 2026-10-12: uzmanın kayıtta verdiği başlık listede görünür (otomatik başlık "… · Teknik · GG.AA.YYYY" gösterilmez). */}
                  {isCustomTitle(a.title, profileLabel) && (
                    <span className="mr-1.5 font-medium text-slate-800" data-testid="astro-saved-title">
                      “{a.title}”
                    </span>
                  )}
                  {describeOptions(a.technique, a.params, () => a.partnerLabel) || "—"}
                  {a.providerInterpIncluded ? " · sistem yorumu dahil" : ""}
                </span>
                <span className="text-xs tabular-nums text-slate-500">kayıt {fmt(a.analysisAt)}</span>
                <span className={`text-xs tabular-nums ${currentRevision !== null && a.profileRevision !== currentRevision ? "font-medium text-amber-800" : "text-slate-500"}`} title={currentRevision !== null && a.profileRevision !== currentRevision ? `Güncel doğum bilgisi rev ${currentRevision}; bu analiz rev ${a.profileRevision} ile kaydedildi.` : undefined}>
                  doğum rev {a.profileRevision}
                  {currentRevision !== null && a.profileRevision !== currentRevision ? " (eski)" : ""}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>
      </div>
      {page.hasMore && (
        <button type="button" disabled={more} onClick={() => void loadMore()} className="self-start rounded-lg border border-[#d9c9a3] bg-white/80 px-3 py-1 text-xs text-slate-700 hover:border-[#b8954e] disabled:opacity-60" data-testid="astro-analyses-more">
          {more ? "Yükleniyor…" : `Daha fazla göster (${cur.items.length} / ${page.filteredTotal})`}
        </button>
      )}
    </div>
  );
}

export function SavedAnalysisView({
  id,
  previewNoInterp,
  onClose,
  onAddTechnique,
  currentRevision = null,
}: {
  id: string;
  previewNoInterp: boolean;
  onClose: () => void;
  /** D4: aynı danışan için yeni teknik (kayıt değişmez; yeni sonuç çalışma masasında açılır). */
  onAddTechnique?: () => void;
  /** Profilin güncel doğum revizyonu — kayıt daha eski revizyonla yapıldıysa bu AÇIKÇA belirtilir (sonuç yeniden yorumlanmaz). */
  currentRevision?: number | null;
}) {
  const key = `${id}|${previewNoInterp}`;
  const [deskTab, setDeskTab] = useState("harita");
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
  const natal = a.technique === "western.natal" && a.technical ? (a.technical as NatalTechnical) : null;
  const housesAvailable = !!natal && !a.method.timeUnknownMasked && natal.houses.length > 0;
  // D3.1: Solar/Lunar Return, Composite çarkı harita istasyonunda; ayrıntılar sağ panelde ("Teknik ayrıntı").
  const otherWheel = natal ? null : wheelForTechnique(a.technique, a.technical);
  const technicalView = (hideWheel: boolean) => (
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
      hideWheel={hideWheel}
    />
  );
  const tabs: DeskTab[] = [
    ...(natal
      ? ([
          { id: "harita", label: "Harita", tone: "lavender", hint: "Açısal noktalar ve dağılım" },
          { id: "gezegenler", label: "Gezegenler", tone: "blue" },
          ...(housesAvailable ? [{ id: "evler", label: "Evler", tone: "sage" } as DeskTab] : []),
          { id: "acilar", label: "Açılar", tone: "peach", badge: natal.aspects.length },
        ] as DeskTab[])
      : []),
    ...(otherWheel ? ([{ id: "teknik", label: "Teknik ayrıntı", tone: "blue", hint: "Dönüş anı, konum, açılar ve tablolar" }] as DeskTab[]) : []),
    // Yorum sekmesi yalnız içerik gerçekten görünürken (yetki kapalı / dahil değil → sekme yok, içerik yanıtta da yok).
    ...(interp.visible ? ([{ id: "yorum", label: interpretationTitle(interp), tone: "gold", ownHeading: true }] as DeskTab[]) : []),
    { id: "bilgi", label: "Bilgi Bankam", tone: "gold", badge: a.knowledgeBank.length || null, ownHeading: true },
    { id: "not", label: "Kendi Yorumum", tone: "turquoise", badge: a.notes.length || null, ownHeading: true },
  ];
  const tab = tabs.some((t) => t.id === deskTab) ? deskTab : tabs[0].id;
  const opts = describeOptions(a.technique, a.params, () => partner?.label ?? null);
  return (
    <div data-testid="astro-saved-analysis">
      <ResultDesk
        variant="light"
        backLabel="Danışan Dosyası"
        onBack={onClose}
        eyebrow="KAYITLI ANALİZ"
        title={a.title}
        subtitle={
          <>
            <strong className="font-semibold text-[#F6F2EA]">{techniqueLabel(a.technique)}</strong>
            {opts ? ` · ${opts}` : ""} · kayıt {fmt(a.analysisAt)}
          </>
        }
        details={
          <span title={`${zodiacLabel(a.technique)} · ${houseSystemLabel(a.method.houseSystem, HOUSE_SYSTEM_LABELS)} · ${a.method.nodeType ? NODE_TYPE_LABELS[a.method.nodeType] : "—"}`}>
            {partner ? <>1. kişi: {person(a.profile)} · 2. kişi: {person(partner)}</> : person(a.profile)}
          </span>
        }
        meta={[zodiacLabel(a.technique), a.method.houseSystem ? houseSystemLabel(a.method.houseSystem, HOUSE_SYSTEM_LABELS) : null, a.method.nodeType ? NODE_TYPE_LABELS[a.method.nodeType] : null, a.method.timeUnknownMasked ? "Saat bilinmiyor · evler gizli" : null]}
        chips={
          <>
            <DeskChip tone="saved">✓ Kaydedildi · değişmez kayıt</DeskChip>
            {currentRevision !== null && a.profile.revision.revision !== currentRevision && (
              <DeskChip tone="warn">
                Doğum bilgisi rev {a.profile.revision.revision} ile kaydedildi · güncel profil rev {currentRevision}
              </DeskChip>
            )}
            {!interp.visible && interp.reason === "not_included" && <DeskChip tone="muted">Sistem yorumu dahil edilmedi</DeskChip>}
          </>
        }
        actions={
          <>
            <ReportButtons id={a.id} previewNoInterp={previewNoInterp} />
            {onAddTechnique && (
              <button type="button" onClick={onAddTechnique} className={deskGhostLight} title="Bu kayıt değişmez; yeni teknik aynı danışanın çalışma masasında ayrı sekmede açılır." data-testid="atlas-saved-add-technique">
                + Teknik Ekle
              </button>
            )}
          </>
        }
        tabs={tabs}
        active={tab}
        onTab={setDeskTab}
        chartKey={a.id}
        chart={
          natal
            ? (cls: string) => <NatalWheel technical={natal} sizeClassName={cls} tinted />
            : otherWheel
              ? (cls: string) => <NatalWheel technical={otherWheel.wheel} label={otherWheel.label} sizeClassName={cls} tinted />
              : null
        }
        stage={natal ? null : technicalView(!!otherWheel)}
      >
        {tab === "teknik" && otherWheel && technicalView(true)}
        {tab === "harita" && natal && <NatalTechnicalPanel technical={natal} timeUnknown={a.method.timeUnknownMasked} part="overview" />}
        {(tab === "gezegenler" || tab === "evler" || tab === "acilar") && natal && (
          <NatalTechnicalPanel technical={natal} timeUnknown={a.method.timeUnknownMasked} part={tab === "gezegenler" ? "planets" : tab === "evler" ? "houses" : "aspects"} />
        )}
        {tab === "yorum" && interp.visible && <ProviderInterpretationPanel interpretation={interp} />}
        {tab === "bilgi" && (
          <section className="rounded-2xl border border-[#ead9b0] bg-[#FFF8E8] p-5" aria-label="Kayıtlı Bilgi Bankası">
            <h4 className="mb-3 text-base font-semibold text-[#5b4416]">Bilgi Bankam (güncel)</h4>
            {a.knowledgeBank.length === 0 ? (
              <p className="text-sm text-slate-700">Bu analizle eşleşen güncel Bilgi Bankası kaydınız yok.</p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {a.knowledgeBank.map((e) => (
                  <li key={`${e.entryId}-${e.revision}`} className="rounded-xl border border-[#ead9b0] bg-white px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-[#8a6a2a]">{e.topicLabel}</div>
                    <div className="mt-0.5 font-semibold text-slate-900">{e.title}</div>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">{e.body}</p>
                    {e.sourceNote && <p className="mt-2 text-xs text-slate-500">Kaynak: {e.sourceNote}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === "not" && (
          <section className="rounded-2xl border border-teal-200 bg-[#EEF9F7] p-5" aria-label="Kayıtlı danışan yorumu">
            <h4 className="text-base font-semibold text-teal-950">Kendi Yorumum (kayıt anındaki hali)</h4>
            <p className="mb-3 text-sm text-teal-900">
              {a.profile.client?.name ? `Danışan: ${a.profile.client.name} · ` : ""}Profil: {a.profile.label} · Analiz: {techniqueLabel(a.technique)}
            </p>
            {a.notes.length === 0 ? (
              <p className="text-sm text-slate-700">Kayıt anında yorum notu yoktu.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {a.notes.map((n) => (
                  <div key={n.sectionKey} className="rounded-xl border border-teal-100 bg-white px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-teal-800">{n.sectionLabel}</div>
                    <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </ResultDesk>
    </div>
  );
}

/**
 * Aşama 8 — Word / PDF raporu. Dosya SUNUCUDA, yalnız kayıtlı snapshot'tan üretilir (0 Roxy isteği).
 * Mobil (ürün kuralı, DY Word + Anamnez PDF ile aynı): Android'de hiç render edilmez (`useIsAndroid`)
 * ve SSR'da `.no-android` ile gizlidir; telefon genişliğinde (<768px) `hidden md:inline-flex` ile gizlidir.
 * Sunucu da Android isteğini 403 ile reddeder. Masaüstü davranışı etkilenmez.
 */
function ReportButtons({ id, previewNoInterp, dark = false }: { id: string; previewNoInterp: boolean; dark?: boolean }) {
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
      <button type="button" data-testid="astro-report-docx" disabled={busy !== null} onClick={() => void run("docx")} className={`${cls} ${dark ? "border-white/25 bg-white/10 text-[#F6F2EA] hover:border-[#D9B56F]/70" : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>
        {busy === "docx" ? "Hazırlanıyor…" : "Word"}
      </button>
      <button type="button" data-testid="astro-report-pdf" disabled={busy !== null} onClick={() => void run("pdf")} className={`${cls} ${dark ? "border-white/25 bg-white/10 text-[#F6F2EA] hover:border-[#D9B56F]/70" : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"}`}>
        {busy === "pdf" ? "Hazırlanıyor…" : "PDF"}
      </button>
      {err && (
        <span role="alert" className={`hidden w-full text-xs md:block ${dark ? "text-rose-200" : "text-rose-700"}`} data-testid="astro-report-error">
          {err}
        </span>
      )}
    </>
  );
}
