"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  updateReport,
  type KnowledgeGroup,
} from "../helpers/hdRapor";
import { getReportById } from "../../kayitli-raporlar/helpers/hdKayitliRaporlar";
import type { HumanDesignChart } from "@/lib/human-design/types";
import { GateTechnicalInfo } from "../../components/GateTechnicalInfo";
import { exportHdReportDocx } from "../helpers/exportHdReportDocx";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-2 text-xs font-black uppercase tracking-widest text-indigo-700";

export function HdRaporContent() {
  const { showToast } = useToast();
  const router = useRouter();
  const params = useSearchParams();

  const urlClientId = params.get("clientId") ?? "";
  const urlReportId = params.get("reportId") ?? "";
  // reportId varsa düzenleme modu, yoksa yeni rapor modu
  const isEditMode = !!urlReportId;

  const [clients, setClients] = useState<HdClientRow[]>([]);
  const [clientId, setClientId] = useState(urlClientId);
  // Düzenleme modunda kayıtlı raporun danışan adı
  const [editingClientName, setEditingClientName] = useState<string | null>(null);
  const [chart, setChart] = useState<HumanDesignChart | null>(null);
  const [groups, setGroups] = useState<KnowledgeGroup[]>([]);
  const [matchedCodes, setMatchedCodes] = useState<string[]>([]);
  const [generatedText, setGeneratedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Danışan listesi yalnızca yeni rapor modunda gerekli
  useEffect(() => {
    if (!isEditMode) {
      listHdClients().then(({ rows }) => setClients(rows));
    }
  }, [isEditMode]);

  // ── Yeni rapor modu: chart'tan rapor üret ─────────────────────────────────
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

  // ── Düzenleme modu: kayıtlı raporu yükle ─────────────────────────────────
  const loadExistingReport = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);

      const { row, error } = await getReportById(id);
      if (error || !row) {
        setLoading(false);
        showToast({ message: error ?? "Rapor bulunamadı.", type: "error" });
        return;
      }

      setReportTitle(row.title);
      setEditingClientName(row.client?.name ?? null);

      // edited_content varsa onu aç; yoksa generated_content
      const content = row.edited_content ?? row.generated_content ?? "";
      setEditedText(content);
      setGeneratedText(row.generated_content ?? "");

      // Harita özetini referans için yükle
      if (row.client_id) {
        setClientId(row.client_id);
        const { row: chartRow } = await loadChartForReport(row.client_id);
        if (chartRow) {
          setChart(chartRow);
          const codes = buildCodesFromChart(chartRow);
          const { groups: g, matchedCodes: mc } = await loadKnowledgeForCodes(codes);
          setGroups(g);
          setMatchedCodes(mc);
        }
      }

      setLoading(false);
    },
    [showToast],
  );

  // Yeni rapor modu — clientId değişince yeniden üret
  useEffect(() => {
    if (!isEditMode) {
      buildReport(clientId);
    }
  }, [clientId, buildReport, isEditMode]);

  // Düzenleme modu — mount'ta kayıtlı raporu yükle
  useEffect(() => {
    if (isEditMode) {
      loadExistingReport(urlReportId);
    }
  }, [urlReportId, isEditMode, loadExistingReport]);

  // ── Kaydet ───────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!editedText.trim()) {
      showToast({ message: "Rapor içeriği boş.", type: "warning" });
      return;
    }

    setSaving(true);

    if (isEditMode) {
      // Mevcut raporu UPDATE et
      const { error } = await updateReport({
        id: urlReportId,
        title: reportTitle || "Human Design Raporu",
        editedContent: editedText,
      });
      setSaving(false);
      if (error) {
        showToast({ message: `Güncelleme hatası: ${error}`, type: "error" });
      } else {
        showToast({ message: "Rapor güncellendi.", type: "success" });
        router.push("/human-design/kayitli-raporlar");
      }
      return;
    }

    // Yeni rapor INSERT et
    if (!clientId) {
      setSaving(false);
      showToast({ message: "Danışan seçin.", type: "warning" });
      return;
    }
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
      router.push("/human-design/kayitli-raporlar");
    }
  }

  const selectedClient = clients.find((c) => c.id === clientId);

  async function handleWordExport() {
    if (!editedText.trim()) {
      showToast({ message: "Rapor içeriği boş, önce rapor oluşturun.", type: "warning" });
      return;
    }
    setExporting(true);
    try {
      const clientName = isEditMode
        ? (editingClientName ?? "Danışan")
        : (selectedClient?.name ?? "Danışan");
      await exportHdReportDocx({
        reportTitle: reportTitle || "Human Design Raporu",
        clientName,
        reportText: editedText,
      });
      showToast({ message: "Word raporu indirildi.", type: "success" });
    } catch (err) {
      console.error("[WordExport]", err);
      showToast({ message: "Word dosyası oluşturulamadı.", type: "error" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mod başlığı / Danışan seçimi */}
      {isEditMode ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-5 py-4 ring-1 ring-amber-100/60">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">
            Kayıtlı Rapor Düzenleniyor
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {editingClientName ?? (loading ? "Yükleniyor..." : "—")}
          </p>
        </div>
      ) : (
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
      )}

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
            <p className="mt-2 text-xs text-violet-600">
              {isEditMode ? "Rapor yükleniyor..." : "Bilgi Bankası eşleştiriliyor..."}
            </p>
          )}
          {!loading && !isEditMode && groups.length > 0 && (
            <p className="mt-2 text-xs text-violet-700">
              {matchedCodes.length} yorum eşleşti — {groups.length} kategori
            </p>
          )}
          {!loading && !isEditMode && groups.length === 0 && chart && (
            <p className="mt-2 text-xs text-amber-600">
              Bu harita için Bilgi Bankası'nda eşleşen kayıt bulunamadı.
              Önce Bilgi Bankası ekranından yorum ekleyin.
            </p>
          )}
        </div>
      )}

      {/* Kapı Teknik Bilgileri */}
      {chart && (
        <div className="rounded-2xl border border-indigo-200/80 bg-white/95 p-4 ring-1 ring-indigo-100/60">
          <p className={sectionCls}>Kapı Teknik Bilgileri</p>
          {(chart.gates?.length ?? 0) > 0 || (chart.channels?.length ?? 0) > 0 ? (
            <GateTechnicalInfo gates={chart.gates ?? []} channels={chart.channels ?? []} />
          ) : (
            <p className="text-xs text-slate-400">Kapı kaydı yok.</p>
          )}
        </div>
      )}

      {/* Eşleşen Kategoriler — yalnızca yeni rapor modunda */}
      {!isEditMode && !loading && groups.length > 0 && (
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
            <p className={sectionCls}>
              {isEditMode ? "Kayıtlı Rapor Düzenleyici" : "Rapor Düzenleyici"}
            </p>
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
              {/* Yenile yalnızca yeni rapor modunda — edit modda raporu sıfırdan üretmez */}
              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => buildReport(clientId)}
                  disabled={!clientId || loading}
                  className="mt-5 h-8 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
                >
                  Yenile
                </button>
              )}
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
              {isEditMode
                ? "Kayıtlı rapora yapılan düzenlemeler güncelleme ile korunur."
                : editedText !== generatedText
                ? "* Otomatik metinden farklı düzenlemeler yapıldı."
                : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleWordExport}
                disabled={exporting || !editedText.trim()}
                className="h-9 rounded-xl border border-emerald-300/80 bg-white px-5 text-sm font-black uppercase tracking-wide text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exporting ? "İndiriliyor..." : "Word İndir"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !editedText.trim()}
                className="h-9 rounded-xl border border-indigo-300/80 bg-gradient-to-r from-indigo-600 to-violet-600 px-7 text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_16px_-4px_rgba(79,70,229,0.4)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? isEditMode ? "Güncelleniyor..." : "Kaydediliyor..."
                  : isEditMode ? "Güncelle" : "Raporu Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Boş durum — yalnızca yeni rapor modunda, danışan seçilmemiş */}
      {!isEditMode && !clientId && !loading && (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-indigo-200/80 bg-indigo-50/30 py-16 text-sm text-slate-500">
          Yukarıdan bir danışan seçin.
        </div>
      )}
    </div>
  );
}
