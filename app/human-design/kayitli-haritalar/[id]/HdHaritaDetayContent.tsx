"use client";

/**
 * Kayıtlı Harita — TAM SAYFA detay (modal DEĞİL). Yaşam Sistemi shell içinde,
 * geniş, responsive, doğal sayfa scroll'u. İki sekme: Özet + "Kişinin Human Design
 * Bilgileri" (canonical panel). Read-only; canonical edit/publish/delete YOK.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { HumanDesignShell } from "../../components/HumanDesignShell";
import {
  hdTypeLabelFromCode, hdAuthorityLabelFromCode, hdProfileLabelFromCode,
  hdDefinitionLabelFromCode, hdCenterLabelFromCode, hdChannelLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HUMAN_DESIGN_GATES } from "@/lib/human-design/constants";
import { GateTechnicalInfo } from "../../components/GateTechnicalInfo";
import { listChartsWithClients } from "../helpers/hdKayitliHaritalar";
import type { HdChartWithClient } from "../helpers/hdKayitliHaritalar";
import { HdPersonalKnowledgePanel } from "../components/HdPersonalKnowledgePanel";
import { HdProfessionalReportButton } from "../components/HdProfessionalReportButton";

type State =
  | { phase: "loading" }
  | { phase: "notfound" }
  | { phase: "error"; message: string }
  | { phase: "ready"; row: HdChartWithClient };

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return v; }
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-2.5">
      <span className="w-24 shrink-0 text-xs font-bold text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value || "—"}</span>
    </div>
  );
}
function Badges({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => <span key={i} className="rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">{i}</span>)}
    </div>
  );
}
function SumSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-2 text-xs font-black uppercase tracking-widest text-indigo-700">{title}</p>{children}</div>;
}

export function HdHaritaDetayContent({ chartId }: { chartId: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [tab, setTab] = useState<"summary" | "knowledge">("summary");

  useEffect(() => {
    let alive = true;
    listChartsWithClients().then(({ rows, error }) => {
      if (!alive) return;
      if (error) { setState({ phase: "error", message: error }); return; }
      const row = rows.find((r) => r.id === chartId);
      setState(row ? { phase: "ready", row } : { phase: "notfound" });
    });
    return () => { alive = false; };
  }, [chartId]);

  return (
    <HumanDesignShell maxWidthClass="max-w-[1200px]">
      <Link href="/human-design/kayitli-haritalar" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
        ← Kayıtlı Haritalara Dön
      </Link>

      {state.phase === "loading" ? (
        <div className="animate-pulse space-y-4"><div className="h-8 w-64 rounded bg-slate-100" /><div className="h-40 rounded-2xl bg-slate-100" /></div>
      ) : state.phase === "notfound" ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">Harita bulunamadı.</p>
      ) : state.phase === "error" ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-100">{state.message}</p>
      ) : (
        <Detail row={state.row} tab={tab} setTab={setTab} chartId={chartId} />
      )}
    </HumanDesignShell>
  );
}

function Detail({ row, tab, setTab, chartId }: { row: HdChartWithClient; tab: "summary" | "knowledge"; setTab: (t: "summary" | "knowledge") => void; chartId: string }) {
  const clientName = row.client?.name ?? row.client_name ?? "—";
  const clientId = row.client_id ?? "";
  const activeCenters = (row.active_centers ?? []).map((c) => hdCenterLabelFromCode(c));
  const openCenters = (row.open_centers ?? []).map((c) => hdCenterLabelFromCode(c));
  const channels = (row.channels ?? []).map((c) => hdChannelLabelFromCode(c));
  const gates = (row.gates ?? []).map((g) => (HUMAN_DESIGN_GATES.find((x) => x.code === g)?.label as string) ?? `Kapı ${g}`);

  return (
    <div>
      {/* Header */}
      <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 to-violet-50/60 px-6 py-5">
        <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Harita Detayı</p>
        <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">{clientName}</h1>
        {row.client ? (
          <p className="mt-1 text-sm text-slate-500">
            {fmtDate(row.client.birth_date)}
            {row.client.birth_time ? ` · ${row.client.birth_time}` : ""}
            {row.client.birth_place ? ` · ${row.client.birth_place}` : ""}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-start gap-2">
          {clientId ? (
            <>
              <Link href={`/human-design/harita-kaydi?clientId=${clientId}`} className="flex h-9 items-center rounded-xl border border-indigo-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-indigo-700 no-underline shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50">Düzenle</Link>
              <Link href={`/human-design/rapor-olustur?clientId=${clientId}`} className="flex h-9 items-center rounded-xl border border-violet-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black uppercase tracking-wide text-white no-underline shadow-sm transition hover:brightness-105">Rapor Oluştur</Link>
            </>
          ) : null}
          {/* FAZ 2: DONMUŞ canonical içerikten profesyonel Word raporu (chart bazlı). */}
          <HdProfessionalReportButton chartId={chartId} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-5 flex gap-1.5 border-b border-indigo-100/80">
        {([["summary", "Özet"], ["knowledge", "Kişinin Human Design Bilgileri"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-black uppercase tracking-wide transition ${tab === id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "summary" ? (
          <div className="space-y-6">
            <SumSection title="Temel Değerler">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Tip" value={hdTypeLabelFromCode(row.type_code)} />
                <Field label="Otorite" value={hdAuthorityLabelFromCode(row.authority_code)} />
                <Field label="Profil" value={hdProfileLabelFromCode(row.profile_code)} />
                <Field label="Tanım" value={hdDefinitionLabelFromCode(row.definition_code)} />
              </div>
            </SumSection>
            <div className="grid gap-6 md:grid-cols-2">
              <SumSection title="Tanımlı Merkezler"><Badges items={activeCenters} empty="Tanımlı merkez yok." /></SumSection>
              <SumSection title="Açık Merkezler"><Badges items={openCenters} empty="Açık merkez yok." /></SumSection>
            </div>
            <SumSection title={`Kanallar (${channels.length})`}><Badges items={channels} empty="Kanal kaydı yok." /></SumSection>
            <SumSection title={`Kapılar (${gates.length})`}><Badges items={gates} empty="Kapı kaydı yok." /></SumSection>
            <SumSection title="Kapı Teknik Bilgileri">
              {((row.gates ?? []).length > 0 || (row.channels ?? []).length > 0) ? (
                <GateTechnicalInfo gates={row.gates ?? []} channels={row.channels ?? []} />
              ) : <p className="text-xs text-slate-400">Kapı kaydı yok.</p>}
            </SumSection>
            {row.notes ? (
              <SumSection title="Notlar">
                <p className="whitespace-pre-wrap rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-3 text-sm leading-relaxed text-slate-700">{row.notes}</p>
              </SumSection>
            ) : null}
          </div>
        ) : (
          <HdPersonalKnowledgePanel chartId={chartId} />
        )}
      </div>
    </div>
  );
}
