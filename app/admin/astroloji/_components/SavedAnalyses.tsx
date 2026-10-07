"use client";

/**
 * Kayıtlı analizler — liste + salt-okunur SNAPSHOT görünümü. Açmak yalnız snapshot okur
 * (0 sağlayıcı isteği). Katmanlar ayrı bölümlerde: profil · yöntem · teknik · Bilgi Bankası (o anki) ·
 * danışan yorumu (o anki) · Roxy yorumu (dahil edildiyse VE güncel yetki izin veriyorsa) · sürümler.
 */

import { useEffect, useState } from "react";
import type { NatalTechnical } from "@/lib/astrology/model/western";
import type { NatalView } from "@/lib/astrology/view/natalView";
import { HOUSE_SYSTEM_LABELS, NODE_TYPE_LABELS } from "@/lib/astrology/labels/tr";
import { astroFetch } from "../_lib/api";
import NatalWheel from "./NatalWheel";
import NatalTechnicalPanel from "./NatalTechnicalPanel";
import ProviderInterpretationPanel from "./ProviderInterpretationPanel";

type ListItem = { id: string; title: string; analysisAt: string; profileRevision: number; houseSystem: string | null; providerInterpIncluded: boolean };

type KbSnap = { entryId: string; topicKey: string; topicLabel: string; title: string; body: string; sourceNote: string | null; tags: string[]; revision: number; updatedAt: string };

type Analysis = {
  id: string;
  title: string;
  analysisAt: string;
  profile: { label: string; client: { name: string | null } | null; revision: { revision: number; birthDate: string; birthTime: string | null; locationLabel: string; timezone: string; timeAccuracyLabel: string } };
  method: { houseSystem: keyof typeof HOUSE_SYSTEM_LABELS; nodeType: "true" | "mean"; timeUnknownMasked: boolean };
  technical: NatalTechnical;
  knowledgeBank: KbSnap[];
  notes: { sectionKey: string; sectionLabel: string; body: string }[];
  interpretation: NatalView["interpretation"] | { visible: false; reason: "not_included" };
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
              {fmt(a.analysisAt)} · rev {a.profileRevision} · {a.houseSystem ?? "—"} {a.providerInterpIncluded ? "· Roxy yorumu dahil" : ""}
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
  return (
    <div className="flex flex-col gap-4" data-testid="astro-saved-analysis">
      <section className="rounded-2xl border-2 border-slate-400 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white">Kayıtlı analiz · değişmez</span>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{a.title}</h3>
            <p className="text-sm text-slate-600">
              {fmt(a.analysisAt)} · {a.profile.client?.name ? `Danışan: ${a.profile.client.name} · ` : ""}
              {a.profile.label} · rev {a.profile.revision.revision} · {a.profile.revision.birthDate}{" "}
              {a.profile.revision.birthTime ? a.profile.revision.birthTime.slice(0, 5) : "(saat bilinmiyor)"} · {a.profile.revision.locationLabel}
            </p>
            <p className="text-xs text-slate-500">
              Tropikal · {HOUSE_SYSTEM_LABELS[a.method.houseSystem]} · {NODE_TYPE_LABELS[a.method.nodeType]} · sağlayıcı {String(a.versions.provider)} ({String(a.versions.providerApiVersion)}) ·
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
        <NatalWheel technical={a.technical} />
        <NatalTechnicalPanel technical={a.technical} timeUnknown={a.method.timeUnknownMasked} />
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

      {interp.visible ? (
        <ProviderInterpretationPanel interpretation={interp} />
      ) : (interp as { reason: string }).reason === "not_included" ? (
        <p className="rounded-xl border border-dashed border-violet-200 px-3 py-2 text-sm text-slate-500">Roxy otomatik yorumu bu analize dahil edilmedi.</p>
      ) : (
        <ProviderInterpretationPanel interpretation={interp as NatalView["interpretation"]} />
      )}
    </div>
  );
}
