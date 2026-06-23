"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  hdTypeLabelFromCode,
  hdAuthorityLabelFromCode,
  hdProfileLabelFromCode,
  hdDefinitionLabelFromCode,
  hdCenterLabelFromCode,
  hdChannelLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { HUMAN_DESIGN_GATES } from "@/lib/human-design/constants";
import { GateTechnicalInfo } from "../../components/GateTechnicalInfo";
import { GateKnowledgeNotes } from "../../components/GateKnowledgeNotes";
import {
  buildCodesFromChart,
  loadKnowledgeForCodes,
  type KnowledgeGroup,
} from "../../rapor-olustur/helpers/hdRapor";
import type { HdChartWithClient } from "../helpers/hdKayitliHaritalar";

type Props = {
  row: HdChartWithClient;
  onClose: () => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-indigo-700">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-2.5">
      <span className="w-24 shrink-0 text-xs font-bold text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value || "—"}</span>
    </div>
  );
}

function BadgeList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) return <p className="text-xs text-slate-400">{emptyText}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return val; }
}

export function HdHaritaDetayModal({ row, onClose }: Props) {
  const clientName = row.client?.name ?? row.client_name ?? "—";
  const clientId = row.client_id ?? "";

  const [knowledgeGroups, setKnowledgeGroups] = useState<KnowledgeGroup[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);

  useEffect(() => {
    const codes = buildCodesFromChart(row);
    loadKnowledgeForCodes(codes).then(({ groups }) => {
      setKnowledgeGroups(groups);
      setLoadingNotes(false);
    });
  }, [row]);

  const activeCenterLabels = (row.active_centers ?? []).map((c) => hdCenterLabelFromCode(c));
  const openCenterLabels = (row.open_centers ?? []).map((c) => hdCenterLabelFromCode(c));
  const channelLabels = (row.channels ?? []).map((c) => hdChannelLabelFromCode(c));

  const gateLabels = (row.gates ?? [])
    .sort((a, b) => a - b)
    .map((g) => HUMAN_DESIGN_GATES.find((gate) => gate.code === g)?.label ?? `${g}. Kapı`);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-6">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-md"
      />

      <div className="relative z-10 w-full max-w-2xl rounded-[28px] border-2 border-indigo-200/80 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 rounded-t-[26px] border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50 to-violet-50/60 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Harita Detayı</p>
            <h2 className="mt-0.5 text-lg font-black text-slate-900">{clientName}</h2>
            {row.client && (
              <p className="text-xs text-slate-500">
                {formatDate(row.client.birth_date)}
                {row.client.birth_time ? ` · ${row.client.birth_time}` : ""}
                {row.client.birth_place ? ` · ${row.client.birth_place}` : ""}
              </p>
            )}
            {row.client?.external_chart_url && (
              <a
                href={row.client.external_chart_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex max-w-full items-center gap-1 rounded-lg border border-indigo-200/80 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <span className="truncate">Haritayı Dış Sitede Aç</span>
                <span aria-hidden className="shrink-0">↗</span>
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[68vh] overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Temel Değerler */}
            <Section title="Temel Değerler">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Tip" value={hdTypeLabelFromCode(row.type_code)} />
                <Field label="Otorite" value={hdAuthorityLabelFromCode(row.authority_code)} />
                <Field label="Profil" value={hdProfileLabelFromCode(row.profile_code)} />
                <Field label="Tanım" value={hdDefinitionLabelFromCode(row.definition_code)} />
              </div>
            </Section>

            {/* Tanımlı Merkezler */}
            <Section title="Tanımlı Merkezler">
              <BadgeList items={activeCenterLabels} emptyText="Tanımlı merkez yok." />
            </Section>

            {/* Açık Merkezler */}
            <Section title="Açık Merkezler">
              <BadgeList
                items={openCenterLabels}
                emptyText="Açık merkez yok."
              />
            </Section>

            {/* Kanallar */}
            <Section title={`Kanallar (${channelLabels.length})`}>
              <BadgeList items={channelLabels} emptyText="Kanal kaydı yok." />
            </Section>

            {/* Kapılar */}
            <Section title={`Kapılar (${gateLabels.length})`}>
              {gateLabels.length === 0 ? (
                <p className="text-xs text-slate-400">Kapı kaydı yok.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {gateLabels.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {/* Kapı Teknik Bilgileri + Bilgi Bankası Yorumları */}
            <Section title="Kapı Teknik Bilgileri">
              {((row.gates ?? []).length > 0 || (row.channels ?? []).length > 0) ? (
                <GateTechnicalInfo gates={row.gates ?? []} channels={row.channels ?? []} />
              ) : (
                <p className="text-xs text-slate-400">Kapı kaydı yok.</p>
              )}
              <GateKnowledgeNotes groups={knowledgeGroups} loading={loadingNotes} />
            </Section>

            {/* Notlar */}
            {row.notes && (
              <Section title="Notlar">
                <p className="rounded-xl border border-indigo-100/80 bg-indigo-50/30 px-4 py-3 text-sm leading-relaxed text-slate-700">
                  {row.notes}
                </p>
              </Section>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-[26px] border-t border-indigo-100/80 bg-slate-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Kapat
          </button>
          {clientId && (
            <>
              <Link
                href={`/human-design/harita-kaydi?clientId=${clientId}`}
                className="flex h-9 items-center rounded-xl border border-indigo-200 bg-white px-5 text-sm font-black uppercase tracking-wide text-indigo-700 no-underline shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
                onClick={onClose}
              >
                Düzenle
              </Link>
              <Link
                href={`/human-design/rapor-olustur?clientId=${clientId}`}
                className="flex h-9 items-center rounded-xl border border-violet-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-black uppercase tracking-wide text-white no-underline shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105"
                onClick={onClose}
              >
                Rapor Oluştur
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
