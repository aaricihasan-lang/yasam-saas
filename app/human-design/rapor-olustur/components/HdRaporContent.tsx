"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";
import { useConfirm } from "@/components/ui/ConfirmProvider";
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
  getClientReportCount,
  type KnowledgeGroup,
} from "../helpers/hdRapor";
import { getReportById } from "../../kayitli-raporlar/helpers/hdKayitliRaporlar";
import type { HumanDesignChart } from "@/lib/human-design/types";
import { GateTechnicalInfo } from "../../components/GateTechnicalInfo";
import { exportHdReportDocx } from "../helpers/exportHdReportDocx";
import { HdUnsavedChangesDialog, type UnsavedAction } from "./HdUnsavedChangesDialog";
import { useUnsavedGuard } from "../hooks/useUnsavedGuard";
import { runInEffect } from "@/lib/runInEffect";

const fieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
const labelCls = "mb-1.5 block text-xs font-bold text-slate-700";
const sectionCls = "mb-2 text-xs font-black uppercase tracking-widest text-indigo-700";

// Son kaydedilen (veya edit'te yüklenen) hâlin referansı — dirty hesabı buna dayanır.
type SavedSnapshot = { title: string; editedText: string; reportId: string | null };

type UnsavedPrompt = {
  title: string;
  message: string;
  actions: UnsavedAction[];
  resolve: (key: string) => void;
};

export function HdRaporContent() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const params = useSearchParams();

  const urlClientId = params.get("clientId") ?? "";
  const urlReportId = params.get("reportId") ?? "";
  const isEditMode = !!urlReportId;

  const [clients, setClients] = useState<HdClientRow[]>([]);
  const [clientId, setClientId] = useState(urlClientId);
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

  // HD-1A: kaydedilmemiş-değişiklik takibi + eşzamanlılık guard'ları.
  const [savedSnapshot, setSavedSnapshot] = useState<SavedSnapshot | null>(null);
  // Aktif rapor kimliği — INSERT/UPDATE kararı YALNIZ buna dayanır (urlReportId/isEditMode DEĞİL).
  // Ref senkron kaynaktır: ilk INSERT sonrası router.push'tan ÖNCE yazılır ki aynı ekranda
  // tetiklenen ikinci Kaydet duplicate INSERT değil UPDATE yoluna girsin.
  const [activeReportId, setActiveReportId] = useState<string | null>(urlReportId || null);
  const activeReportIdRef = useRef<string | null>(urlReportId || null);
  // İçerikten BAĞIMSIZ yaşam-döngüsü işareti: kaydedilmemiş yeni rapor (metin boş olsa da dirty kalır).
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [prompt, setPrompt] = useState<UnsavedPrompt | null>(null);
  const buildGuard = useRef(false); // eşzamanlı build engeli
  const saveGuard = useRef(false); // kaydet yeniden-giriş engeli
  const didInit = useRef(false); // ilk build/edit-load yalnız mount'ta

  // Gerçek dirty: kaydedilmiş baseline'dan sapma; baseline yoksa içerikten bağımsız yaşam-döngüsü işareti.
  // ESKİ metin-uzunluğu modeli (editedText.trim().length) KULLANILMAZ — boş metin veri kaybına yol açardı.
  const dirty = useMemo(() => {
    if (savedSnapshot) {
      return reportTitle !== savedSnapshot.title || editedText !== savedSnapshot.editedText;
    }
    return hasUnsavedDraft;
  }, [savedSnapshot, reportTitle, editedText, hasUnsavedDraft]);

  // Save butonu etiketi: aktif kimlik varsa (edit URL veya ilk INSERT sonrası) UPDATE göster.
  const isUpdateTarget = activeReportId !== null;

  // Çıkış koruması — yalnız dirty iken beforeunload bağlı.
  useUnsavedGuard(dirty);

  // Promise-tabanlı çoklu-seçenek onay.
  const askUnsaved = useCallback(
    (cfg: Omit<UnsavedPrompt, "resolve">): Promise<string> =>
      new Promise((resolve) => {
        setPrompt({ ...cfg, resolve });
      }),
    [],
  );

  // Danışan listesi (yalnız yeni rapor modu)
  useEffect(() => {
    if (!isEditMode) {
      listHdClients().then(({ rows }) => setClients(rows));
    }
  }, [isEditMode]);

  // ── Transactional build: tüm adımlar başarıyla tamamlanmadan state'e DOKUNULMAZ ──
  // mode="replace": generated + edited + title yeni metinle değiştirilir.
  // mode="keepEdited": yalnız generated + referans veriler güncellenir; edited/title KORUNUR.
  const runBuild = useCallback(
    async (
      id: string,
      mode: "replace" | "keepEdited",
      opts?: { applyClientId?: boolean },
    ): Promise<boolean> => {
      if (!id || buildGuard.current) return false;
      buildGuard.current = true;
      setLoading(true);
      try {
        const { row: chartRow, error: chartErr } = await loadChartForReport(id);
        if (chartErr || !chartRow) {
          showToast({
            message: chartErr
              ? `Harita yüklenemedi: ${chartErr}`
              : "Bu danışana ait harita kaydı bulunamadı. Önce Harita Kaydı ekranında değerleri girin.",
            type: "warning",
          });
          return false; // mevcut state KORUNUR
        }
        const codes = buildCodesFromChart(chartRow);
        const { groups: g, matchedCodes: mc, error: kErr } = await loadKnowledgeForCodes(codes);
        if (kErr) {
          showToast({ message: `Bilgi Bankası yüklenemedi: ${kErr}`, type: "error" });
          return false; // mevcut state KORUNUR
        }

        // Tüm adımlar başarılı → state'e atomik uygula.
        const text = buildReportText(g);
        const client = clients.find((c) => c.id === id);
        const newTitle = `${client?.name ?? "Danışan"} — Human Design Raporu`;

        if (opts?.applyClientId) {
          // Danışan değişimi: yeni danışan = yeni, kaydedilmemiş rapor. Eski danışanın rapor
          // kimliği/baseline'ı yeni danışana TAŞINMAZ — yalnız build BAŞARILI olunca sıfırlanır.
          setClientId(id);
          activeReportIdRef.current = null;
          setActiveReportId(null);
          setSavedSnapshot(null);
        }
        setChart(chartRow);
        setGroups(g);
        setMatchedCodes(mc);
        setGeneratedText(text);
        if (mode === "replace") {
          setEditedText(text);
          setReportTitle(newTitle);
          // Yeni üretilen içerik henüz kaydedilmedi → dirty=true. Baseline varsa (kayıtlı rapor
          // Yenile) dirty zaten metin sapmasından gelir; bu işaret yeni/kaydedilmemiş dalını korur.
          setHasUnsavedDraft(true);
        }
        return true;
      } catch {
        showToast({ message: "Rapor oluşturulurken hata oluştu.", type: "error" });
        return false; // mevcut state KORUNUR
      } finally {
        setLoading(false);
        buildGuard.current = false;
      }
    },
    [showToast, clients],
  );

  // ── Edit modu: kayıtlı raporu yükle (baseline snapshot kurar) ──
  const loadExistingReport = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      try {
        const { row, error } = await getReportById(id);
        if (error || !row) {
          showToast({ message: error ?? "Rapor bulunamadı.", type: "error" });
          return; // mevcut state KORUNUR
        }
        const content = row.edited_content ?? row.generated_content ?? "";
        setReportTitle(row.title);
        setEditingClientName(row.client?.name ?? null);
        setEditedText(content);
        setGeneratedText(row.generated_content ?? "");
        // Baseline: ilk açılışta dirty=false. Aktif kimlik = yüklenen rapor id (save → UPDATE).
        setSavedSnapshot({ title: row.title, editedText: content, reportId: id });
        activeReportIdRef.current = id;
        setActiveReportId(id);
        setHasUnsavedDraft(false);

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
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  // Mount: edit → kayıtlı raporu yükle; yeni → url clientId için ilk build (bir kez).
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // runInEffect: setState effect gövdesinde senkron çağrılmasın (proje deseni).
    runInEffect(() => {
      if (isEditMode) {
        loadExistingReport(urlReportId);
      } else if (urlClientId) {
        runBuild(urlClientId, "replace");
      }
    });
    // Mount-only: sonraki danışan değişimleri handleClientChange üzerinden yürür.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── "Yenile": dirty ise üç seçenekli onay ──
  async function handleRefresh() {
    if (!clientId || loading || buildGuard.current) return;
    if (!dirty) {
      await runBuild(clientId, "replace");
      return;
    }
    const choice = await askUnsaved({
      title: "Kaydedilmemiş değişiklikler var",
      message:
        "Rapor metninde henüz kaydedilmemiş değişiklikler bulunuyor. Bilgileri yeniden oluşturmak istediğinizden emin misiniz?",
      actions: [
        { key: "cancel", label: "Vazgeç", tone: "safe" },
        { key: "keep", label: "Mevcut Metni Koru", tone: "primary" },
        { key: "discard", label: "Değişiklikleri At ve Yeniden Oluştur", tone: "danger" },
      ],
    });
    if (choice === "cancel") return;
    if (choice === "keep") {
      const ok = await runBuild(clientId, "keepEdited");
      if (ok) {
        showToast({ message: "Mevcut metniniz korundu; referans bilgiler güncellendi.", type: "info" });
      }
      return;
    }
    // discard → tam yeniden oluştur (başarısızsa eski metin korunur)
    await runBuild(clientId, "replace");
  }

  // ── Danışan değişimi: pendingClientId modeli — eski metin yeni danışana TAŞINMAZ ──
  async function handleClientChange(newId: string) {
    if (newId === clientId || loading || buildGuard.current) return;

    if (!dirty) {
      if (!newId) {
        setClientId("");
        setChart(null);
        setGroups([]);
        setMatchedCodes([]);
        setGeneratedText("");
        setEditedText("");
        activeReportIdRef.current = null;
        setActiveReportId(null);
        setSavedSnapshot(null);
        setHasUnsavedDraft(false);
        return;
      }
      await runBuild(newId, "replace", { applyClientId: true });
      return;
    }

    const choice = await askUnsaved({
      title: "Kaydedilmemiş rapor değişiklikleri",
      message:
        "Başka bir danışana geçerseniz mevcut rapordaki kaydedilmemiş değişiklikler kaybolacaktır.",
      actions: [
        { key: "cancel", label: "Vazgeç", tone: "safe" },
        { key: "discard", label: "Değişiklikleri At ve Danışanı Değiştir", tone: "danger" },
      ],
    });
    // Vazgeç → select kontrollü olduğundan eski danışanda kalır; metin korunur.
    if (choice !== "discard") return;

    if (!newId) {
      setClientId("");
      setChart(null);
      setGroups([]);
      setMatchedCodes([]);
      setGeneratedText("");
      setEditedText("");
      activeReportIdRef.current = null;
      setActiveReportId(null);
      setSavedSnapshot(null);
      setHasUnsavedDraft(false);
      return;
    }
    // Yeni danışan verisi BAŞARIYLA oluşmadan clientId/metin/kimlik değişmez (runBuild atomik).
    await runBuild(newId, "replace", { applyClientId: true });
  }

  // ── Kaydet (yeniden-giriş guard'lı) ──
  // INSERT/UPDATE kararı YALNIZ activeReportIdRef.current üzerinden verilir (urlReportId/isEditMode DEĞİL).
  async function handleSave() {
    if (saveGuard.current) return;
    if (!editedText.trim()) {
      showToast({ message: "Rapor içeriği boş.", type: "warning" });
      return;
    }
    saveGuard.current = true;
    setSaving(true);
    try {
      const currentReportId = activeReportIdRef.current;

      // Aktif kimlik VARSA → UPDATE. Duplicate count/confirm/INSERT yolu ÇALIŞMAZ.
      if (currentReportId) {
        const { error } = await updateReport({
          id: currentReportId,
          title: reportTitle || "Human Design Raporu",
          editedContent: editedText,
        });
        if (error) {
          showToast({ message: "Rapor güncellenemedi. Lütfen tekrar deneyin.", type: "error" });
          return; // kimlik + baseline + metin/başlık KORUNUR, dirty kalır
        }
        // active id DEĞİŞMEZ; yalnız baseline yenilenir.
        setSavedSnapshot({ title: reportTitle || "Human Design Raporu", editedText, reportId: currentReportId });
        setHasUnsavedDraft(false);
        showToast({ message: "Rapor güncellendi.", type: "success" });
        router.push("/human-design/kayitli-raporlar");
        return;
      }

      // Aktif kimlik YOKSA → gerçek yeni INSERT yolu.
      if (!clientId) {
        showToast({ message: "Danışan seçin.", type: "warning" });
        return;
      }

      // Aynı danışana ikinci rapor uyarısı — YALNIZ gerçek yeni INSERT öncesi (guard confirm boyunca açık).
      const { count } = await getClientReportCount(clientId);
      if (count > 0) {
        const ok = await confirm({
          title: "Bu danışanın raporu var",
          message:
            count === 1
              ? "Bu danışanın 1 kayıtlı raporu bulunuyor. Devam ederseniz ayrı bir rapor oluşturulacak. Kayıtlı Raporlar ekranından mevcut raporu düzenleyebilirsiniz."
              : `Bu danışanın ${count} kayıtlı raporu bulunuyor. Devam ederseniz ayrı bir rapor oluşturulacak. Kayıtlı Raporlar ekranından mevcut raporları düzenleyebilirsiniz.`,
          confirmText: "Yine de Oluştur",
          cancelText: "Vazgeç",
          tone: "warning",
        });
        if (!ok) return;
      }

      const { id, error } = await saveReport({
        clientId,
        chartId: chart?.id ?? null,
        title: reportTitle || "Human Design Raporu",
        selectedCodes: matchedCodes,
        generatedContent: generatedText,
        editedContent: editedText,
      });
      if (error || !id) {
        showToast({ message: "Rapor kaydedilemedi. Lütfen tekrar deneyin.", type: "error" });
        return; // kimlik null kalır, metin/başlık KORUNUR, dirty kalır
      }
      // Başarılı INSERT: router.push'tan ÖNCE aktif kimliği SENKRON ref'e yaz — aynı ekranda
      // tetiklenebilecek ikinci Kaydet artık UPDATE yoluna girer (duplicate INSERT engellenir).
      activeReportIdRef.current = id;
      setActiveReportId(id);
      setSavedSnapshot({ title: reportTitle || "Human Design Raporu", editedText, reportId: id });
      setHasUnsavedDraft(false);
      showToast({ message: "Rapor kaydedildi.", type: "success" });
      router.push("/human-design/kayitli-raporlar");
    } catch {
      showToast({ message: "Kayıt sırasında hata oluştu.", type: "error" });
    } finally {
      setSaving(false);
      saveGuard.current = false;
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

  const autoTextEdited = editedText !== generatedText;

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
            onChange={(e) => handleClientChange(e.target.value)}
            disabled={loading}
            className={`h-10 ${fieldBase} disabled:opacity-60`}
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
              Bu harita için Bilgi Bankası&apos;nda eşleşen kayıt bulunamadı.
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
              {/* Yenile — dirty ise üç seçenekli onay akışından geçer */}
              {!isEditMode && (
                <button
                  type="button"
                  onClick={handleRefresh}
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
                rows={32}
                className="w-full rounded-xl border border-indigo-200/90 bg-white/70 px-4 py-3 font-mono text-sm leading-relaxed text-slate-800 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50"
              />
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-indigo-200/80 bg-indigo-50/30 py-12 text-sm text-slate-500">
                Eşleşen Bilgi Bankası kaydı bulunamadı. Önce harita değerlerini ve yorum içeriklerini ekleyin.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-indigo-100/80 bg-slate-50/60 px-4 py-3">
            {/* Kaydetme durumu göstergesi (dirty vs kaydedildi) — otomatik-metin bilgisinden ayrı */}
            <div className="flex flex-col gap-0.5">
              {dirty ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Kaydedilmemiş değişiklikler var
                </span>
              ) : savedSnapshot ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Değişiklikler kaydedildi
                </span>
              ) : null}
              {autoTextEdited && (
                <span className="text-[11px] text-slate-400">Otomatik metin düzenlendi</span>
              )}
            </div>
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
                  ? isUpdateTarget ? "Güncelleniyor..." : "Kaydediliyor..."
                  : isUpdateTarget ? "Güncelle" : "Raporu Kaydet"}
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

      {/* Kaydedilmemiş-değişiklik onay dialog'u */}
      {prompt && (
        <HdUnsavedChangesDialog
          title={prompt.title}
          message={prompt.message}
          actions={prompt.actions}
          onAction={(key) => {
            const r = prompt.resolve;
            setPrompt(null);
            r(key);
          }}
        />
      )}
    </div>
  );
}
