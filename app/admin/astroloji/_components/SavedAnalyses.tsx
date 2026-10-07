"use client";

/**
 * Kayıtlı analizler — liste + salt-okunur SNAPSHOT görünümü. Açmak yalnız snapshot okur
 * (0 sağlayıcı isteği). Katmanlar ayrı bölümlerde: profil · yöntem · teknik · Bilgi Bankası (o anki) ·
 * danışan yorumu (o anki) · Roxy yorumu (dahil edildiyse VE güncel yetki izin veriyorsa) · sürümler.
 */

import { useEffect, useState } from "react";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { astroFetch } from "../_lib/api";
import { describeOptions, techniqueLabel } from "../_lib/techniques";
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

export function SavedAnalysesList({ profileId, reloadKey, onOpen, openId }: { profileId: string; reloadKey: number; onOpen: (id: string) => void; openId: string | null }) {
  const [state, setState] = useState<{ key: string; items: ListItem[] } | null>(null);
  const key = `${profileId}|${reloadKey}`;
  useEffect(() => {
    let alive = true;
    void astroFetch<{ analyses: ListItem[] }>(`/api/admin/astroloji/analyses?profileId=${profileId}`).then((r) => {
      if (alive) setState({ key, items: r.ok ? r.data.analyses : [] });
    });
    return () => {
      alive = false;
    };
  }, [key, profileId]);
  const items = state && state.key === key ? state.items : null;
  if (!items) return <p className="text-xs text-slate-400">Kayıtlı analizler yükleniyor…</p>;
  if (items.length === 0) return <p className="text-xs text-slate-500">Bu profil için kayıtlı analiz yok.</p>;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onOpen(a.id)}
            className={`w-full rounded-lg border px-3 py-1.5 text-left text-sm ${openId === a.id ? "border-slate-500 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-400"}`}
          >
            <div className="font-medium text-slate-800">{a.title}</div>
            <div className="text-xs text-slate-500">
              <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{techniqueLabel(a.technique)}</span>
              {describeOptions(a.technique, a.params, () => a.partnerLabel)} · {fmt(a.analysisAt)} · rev {a.profileRevision}
              {a.providerInterpIncluded ? " · Roxy yorumu dahil" : ""}
            </div>
          </button>
        </li>
      ))}
    </ul>
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
              Tropikal · {a.method.houseSystem ? HOUSE_SYSTEM_LABELS[a.method.houseSystem] : "ev sistemi yok"} · {a.method.nodeType ? NODE_TYPE_LABELS[a.method.nodeType] : "—"} · sağlayıcı {String(a.versions.provider)} ({String(a.versions.providerApiVersion)}) ·
              adaptör {String(a.versions.adapterVersion)} · projeksiyon {String(a.versions.projectionVersion)}
            </p>
          </div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>
            Kapat
          </button>
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
        />
      </section>

      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4" aria-label="Kayıtlı Bilgi Bankası">
        <h4 className="mb-2 text-base font-semibold text-indigo-900">Bilgi Bankam (kayıt anındaki hali)</h4>
        {a.knowledgeBank.length === 0 ? (
          <p className="text-sm text-slate-600">Kayıt anında eşleşen Bilgi Bankası notu yoktu.</p>
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
