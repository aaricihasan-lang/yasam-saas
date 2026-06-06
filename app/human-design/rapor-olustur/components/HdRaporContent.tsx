"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import {
  hdTypeLabelFromCode,
  hdAuthorityLabelFromCode,
  hdProfileLabelFromCode,
  hdDefinitionLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { listHdClients, type HdClientRow } from "../../danisanlar/helpers/hdClients";
import {
  loadChartForReport,
  buildCodesFromChart,
  loadKnowledgeForCodes,
  buildReportText,
  saveReport,
  type KnowledgeGroup,
} from "../helpers/hdRapor";
import type { HumanDesignChart } from "@/lib/human-design/types";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-2 text-xs font-black uppercase tracking-widest text-indigo-700";

export function HdRaporContent() {
  const { showToast } = useToast();
  const params = useSearchParams();
  const urlClientId = params.get("clientId") ?? "";

  const [clients, setClients] = useState<HdClientRow[]>([]);
  const [clientId, setClientId] = useState(urlClientId);
  const [chart, setChart] = useState<HumanDesignChart | null>(null);
  const [groups, setGroups] = useState<KnowledgeGroup[]>([]);
  const [matchedCodes, setMatchedCodes] = useState<string[]>([]);
  const [generatedText, setGeneratedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listHdClients().then(({ rows }) => setClients(rows));
  }, []);

  const buildReport = useCallback(
    async (id: string) => {
      if (!id) {
        setChart(null);
        setGroups([]);
        setGeneratedText("");
        setEditedText("");
        setMatchedCodes([]);
        return;
      }
      setLoading(true);

      const { row: chartRow, error: chartErr } = await loadChartForReport(id);
      if (chartErr || !chartRow) {
        setLoading(false);
        showToast({
          message: chartErr
            ? `Harita yüklenemedi: ${chartErr}`
            : "Bu danışana ait harita kaydı bulunamadı. Önce Harita Kaydı ekranında değerleri girin.",
          type: "warning",
        });
        setChart(null);
        setGroups([]);
        setGeneratedText("");
        setEditedText("");
        return;
      }
      setChart(chartRow);

      const codes = buildCodesFromChart(chartRow);
      const { groups: g, matchedCodes: mc, error: kErr } = await loadKnowledgeForCodes(codes);
      setLoading(false);

      if (kErr) {
        showToast({ message: `Bilgi Bankası yüklenemedi: ${kErr}`, type: "error" });
        return;
      }

      setGroups(g);
      setMatchedCodes(mc);

      const text = buildReportText(g);
      setGeneratedText(text);
      setEditedText(text);

      const client = clients.find((c) => c.id === id);
      const clientName = client?.name ?? "Danışan";
      setReportTitle(`${clientName} — Human Design Raporu`);
    },
    [showToast, clients],
  );

  useEffect(() => {
    buildReport(clientId);
  }, [clientId, buildReport]);

  async function handleSave() {
    if (!clientId) {
      showToast({ message: "Danışan seçin.", type: "warning" });
      return;
    }
    if (!editedText.trim()) {
      showToast({ message: "Rapor içeriği boş.", type: "warning" });
      return;
    }
    setSaving(true);
    const { error } = await saveReport({
      clientId,
      chartId: chart?.id ?? null,
      title: reportTitle || "Human Design Raporu",
      selectedCodes: matchedCodes,
      generatedContent: generatedText,
      editedContent: editedText,
    });
    setSaving(false);
    if (error) {
      showToast({ message: `Kayıt hatası: ${error}`, type: "error" });
    } else {
      showToast({ message: "Rapor kaydedildi.", type: "success" });
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  return (
    <div className="space-y-4">
      {/* Danışan Seçimi */}
      <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 shadow-sm ring-1 ring-indigo-100/60">
        <label className={labelCls}>Danışan Seç *</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={`h-10 ${fieldBase}`}
        >
          <option value="">— Danışan seçin —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.birth_date ? ` · ${c.birth_date}` : ""}
              {c.birth_place ? ` · ${c.birth_place}` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Harita Özeti */}
      {chart && (
        <div className="rounded-2xl border border-violet-200/80 bg-violet-50/60 px-5 py-4 ring-1 ring-violet-100/60">
          <p className={sectionCls}>Harita Özeti</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Tip", val: hdTypeLabelFromCode(chart.type_code) },
              { label: "Otorite", val: hdAuthorityLabelFromCode(chart.authority_code) },
              { label: "Profil", val: hdProfileLabelFromCode(chart.profile_code) },
              { label: "Tanım", val: hdDefinitionLabelFromCode(chart.definition_code) },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-xl border border-violet-200/80 bg-white px-3 py-1.5">
                <span className="text-[10px] font-black uppercase tracking-wide text-violet-500">{label}</span>
                <span className="text-xs font-semibold text-slate-800">{val}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 rounded-xl border border-violet-200/80 bg-white px-3 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-wide text-violet-500">Kapılar</span>
              <span className="text-xs font-semibold text-slate-800">{chart.gates?.length ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-violet-200/80 bg-white px-3 py-1.5">
              <span className="text-[10px] font-black uppercase tracking-wide text-violet-500">Kanallar</span>
              <span className="text-xs font-semibold text-slate-800">{chart.channels?.length ?? 0}</span>
            </div>
          </div>
          {loading && (
            <p className="mt-2 text-xs text-violet-600">Bilgi Bankası eşleştiriliyor...</p>
          )}
          {!loading && groups.length > 0 && (
            <p className="mt-2 text-xs text-violet-700">
              {matchedCodes.length} yorum eşleşti — {groups.length} kategori
            </p>
          )}
          {!loading && groups.length === 0 && chart && (
            <p className="mt-2 text-xs text-amber-600">
              Bu harita için Bilgi Bankası'nda eşleşen kayıt bulunamadı.
              Önce Bilgi Bankası ekranından yorum ekleyin.
            </p>
          )}
        </div>
      )}

      {/* Gruplar Önizleme */}
      {!loading && groups.length > 0 && (
        <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 ring-1 ring-indigo-100/60">
          <p className={sectionCls}>Eşleşen Kategoriler</p>
          <div className="flex flex-wrap gap-2">
            {groups.map(({ category, records }) => (
              <span
                key={category}
                className="rounded-full border border-indigo-200/80 bg-indigo-50 px-3 py-0.5 text-xs font-semibold text-indigo-800"
              >
                {category} ({records.length})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rapor Düzenleyici */}
      {(editedText || (chart && !loading)) && (
        <div className="overflow-hidden rounded-2xl border border-indigo-200/80 bg-white/95 shadow-sm ring-1 ring-indigo-100/60">
          <div className="border-b border-indigo-100/80 bg-white/75 px-4 py-3">
            <p className={sectionCls}>Rapor Düzenleyici</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[10px] font-bold text-slate-500">RAPOR BAŞLIĞI</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Rapor başlığı..."
                  className="h-8 w-full rounded-lg border border-indigo-200/90 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50"
                />
              </div>
              <button
                type="button"
                onClick={() => buildReport(clientId)}
                disabled={!clientId || loading}
                className="mt-5 h-8 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
              >
                Yenile
              </button>
            </div>
          </div>

          <div className="p-4">
            {editedText ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={24}
                className="w-full rounded-xl border border-indigo-200/90 bg-white/70 px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50"
              />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-indigo-200/80 bg-indigo-50/30 py-12 text-sm text-slate-500">
                Eşleşen Bilgi Bankası kaydı bulunamadı. Önce harita değerlerini ve yorum içeriklerini ekleyin.
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-indigo-100/80 bg-slate-50/60 px-4 py-3">
            <p className="text-xs text-slate-500">
              {editedText !== generatedText && "* Otomatik metinden farklı düzenlemeler yapıldı."}
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !clientId || !editedText.trim()}
              className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Kaydediliyor..." : "Raporu Kaydet"}
            </button>
          </div>
        </div>
      )}

      {/* Boş durum — danışan seçilmemiş */}
      {!clientId && !loading && (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-indigo-200/80 bg-indigo-50/30 py-16 text-sm text-slate-500">
          Yukarıdan bir danışan seçin.
        </div>
      )}
    </div>
  );
}
