"use client";

import { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
type AnalizlerTabProps = {
  clientId: string;
  clientName: string;
};

type AnalysisType = "chakra" | "planet";

type ChakraRow = {
  key: string;
  label: string;
  color: string;
};

type ChakraRowValue = {
  mark: string;
  male: string;
  female: string;
};

type SavedAnalysis = {
  id: string;
  tenant_id: string;
  client_id: string;
  analysis_type: AnalysisType | string | null;
  analysis_data: unknown;
  note: string | null;
  created_at: string;
};

// ─── Data constants ───────────────────────────────────────────────────────────
const energyBodies: ChakraRow[] = [
  { key: "ruhsal",   label: "RUHSAL ENERJİ BEDENİ",   color: "#6d5bd0" },
  { key: "zihinsel", label: "ZİHİNSEL ENERJİ BEDENİ", color: "#43a047" },
  { key: "duygusal", label: "DUYGUSAL ENERJİ BEDENİ", color: "#f2b824" },
  { key: "eterik",   label: "ETERİK ENERJİ BEDENİ",   color: "#2196c9" },
  { key: "fiziksel", label: "FİZİKSEL ENERJİ BEDENİ", color: "#4b5563" },
];

const chakras: ChakraRow[] = [
  { key: "tac",    label: "TEPE / TAÇ ÇAKRASI",     color: "#a78bfa" },
  { key: "goz",    label: "3. GÖZ ÇAKRASI",          color: "#6366f1" },
  { key: "bogaz",  label: "BOĞAZ ÇAKRASI",            color: "#38bdf8" },
  { key: "kalp",   label: "KALP ÇAKRASI",             color: "#22c55e" },
  { key: "mide",   label: "MİDE ÇAKRASI",             color: "#facc15" },
  { key: "sakral", label: "SAKRAL (KARIN) ÇAKRASI",   color: "#f97316" },
  { key: "kok",    label: "KÖK ÇAKRASI",              color: "#ef4444" },
];

const planetLabels = ["GÜNEŞ", "AY", "MERKÜR", "MARS", "VENÜS"];
const planetColors = ["#facc15", "#93c5fd", "#86efac", "#fca5a5", "#f9a8d4"];

const planetRows: ChakraRow[] = [
  { key: "tac",    label: "TEPE / TAÇ",        color: "#a78bfa" },
  { key: "goz",    label: "3. GÖZ",             color: "#6366f1" },
  { key: "bogaz",  label: "BOĞAZ",              color: "#38bdf8" },
  { key: "kalp",   label: "KALP",               color: "#22c55e" },
  { key: "mide",   label: "MİDE",               color: "#facc15" },
  { key: "sakral", label: "SAKRAL (KARIN)",      color: "#f97316" },
  { key: "kok",    label: "KÖK",                color: "#ef4444" },
];

// ─── Init helpers ─────────────────────────────────────────────────────────────
function makeChakraInitialValues() {
  const values: Record<string, ChakraRowValue> = {};
  ["before_energy", "after_energy"].forEach((scope) => {
    energyBodies.forEach((row) => { values[`${scope}_${row.key}`] = { mark: "", male: "", female: "" }; });
  });
  ["before_chakra", "after_chakra"].forEach((scope) => {
    chakras.forEach((row) => { values[`${scope}_${row.key}`] = { mark: "", male: "", female: "" }; });
  });
  return values;
}

function makePlanetInitialValues() {
  const values: Record<string, string> = {};
  ["before", "after"].forEach((scope) => {
    planetRows.forEach((row) => {
      planetLabels.forEach((planet) => { values[`${scope}_${row.key}_${planet}`] = ""; });
    });
  });
  return values;
}

function safeFileName(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
    .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ─── valueClass — dynamic input highlight based on +/- prefix ────────────────
// Stays as a function (not static Tailwind) because value is runtime state.
function valueClass(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return "border-green-400 bg-green-50 text-green-800 ring-2 ring-green-100";
  if (trimmed.startsWith("-")) return "border-red-400 bg-red-50 text-red-800 ring-2 ring-red-100";
  return "";
}

function formatDateTimeTR(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getAnalysisLabel(type: string | null | undefined) {
  if (type === "planet") return "Ç.Gezegen Analizi";
  return "Çakra Analizi";
}

// ─── Shared input class strings ───────────────────────────────────────────────
const schemaInputBase =
  "w-full min-h-[31px] rounded-[9px] border border-blue-200 bg-white px-2 py-[5px] text-[12px] font-extrabold outline-none box-border";

const planetInputBase =
  "min-h-[30px] rounded-[9px] border border-blue-200 bg-white px-[7px] py-[5px] text-[11px] font-extrabold outline-none w-full box-border";

const toolbarBtnBase =
  "rounded-xl px-[13px] py-2 font-black text-[12px] cursor-pointer transition-colors";

// ─── Main component ───────────────────────────────────────────────────────────
export default function AnalizlerTab({ clientId, clientName }: AnalizlerTabProps) {
  const [tenantId, setTenantId]     = useState<string | null>(null);
  const { confirm }                  = useConfirm();
  const deleteConfirm                = useDeleteConfirm();
  const { showToast }                = useToast();
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisType | null>(null);
  const [chakraValues, setChakraValues]     = useState<Record<string, ChakraRowValue>>(() => makeChakraInitialValues());
  const [planetValues, setPlanetValues]     = useState<Record<string, string>>(() => makePlanetInitialValues());
  const [note, setNote]             = useState("");
  const [creatingPdf, setCreatingPdf]       = useState(false);
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [loadingSaved, setLoadingSaved]     = useState(false);
  const [savedAnalyses, setSavedAnalyses]   = useState<SavedAnalysis[]>([]);

  const activeTitle = activeAnalysis === "planet" ? "Ç.Gezegen Analizi" : "Çakra Analizi";

  const todayText = useMemo(() => new Date().toLocaleDateString("tr-TR"), []);

  useEffect(() => { void getSyncedTenantId().then(setTenantId); }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadSavedAnalyses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  async function loadSavedAnalyses() {
    if (!clientId || !tenantId) return;
    setLoadingSaved(true);
    const { data, error } = await supabase
      .from("client_analyses").select("*")
      .eq("tenant_id", tenantId).eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Analizler yüklenemedi:", error);
      showToast({ title: "İşlem başarısız", message: "Analizler yüklenemedi: " + error.message, type: "error" });
      setLoadingSaved(false);
      return;
    }
    setSavedAnalyses((data || []) as SavedAnalysis[]);
    setLoadingSaved(false);
  }

  function openNewAnalysis(type: AnalysisType) {
    setActiveAnalysis(type);
    if (type === "planet") setPlanetValues(makePlanetInitialValues());
    else setChakraValues(makeChakraInitialValues());
    setNote("");
  }

  function openSavedAnalysis(item: SavedAnalysis) {
    const type = item.analysis_type === "planet" ? "planet" : "chakra";
    setActiveAnalysis(type);
    setNote(item.note || "");
    if (type === "planet") {
      const data = item.analysis_data as { values?: Record<string, string> } | null | undefined;
      setPlanetValues(data?.values || makePlanetInitialValues());
    } else {
      const data = item.analysis_data as { values?: Record<string, ChakraRowValue> } | null | undefined;
      setChakraValues(data?.values || makeChakraInitialValues());
    }
  }

  async function deleteSavedAnalysis(id: string) {
    const ok = await deleteConfirm({
      title: "Analizi sil",
      message: "Bu analiz kaydı silinsin mi?",
    });
    if (!ok) return;
    const { error } = await supabase.from("client_analyses").delete().eq("id", id).eq("tenant_id", tenantId).eq("client_id", clientId);
    if (error) { showToast({ title: "İşlem başarısız", message: "Analiz silinemedi: " + error.message, type: "error" }); return; }
    setSavedAnalyses((old) => old.filter((item) => item.id !== id));
    showToast({ title: "Başarılı", message: "Analiz silindi.", type: "success" });
  }

  function updateChakraValue(key: string, field: keyof ChakraRowValue, value: string) {
    setChakraValues((old) => ({ ...old, [key]: { ...(old[key] || { mark: "", male: "", female: "" }), [field]: value } }));
  }

  function updatePlanetValue(key: string, value: string) {
    setPlanetValues((old) => ({ ...old, [key]: value }));
  }

  async function clearAll() {
    const ok = await confirm({ message: "Bu analizdeki tüm alanlar temizlensin mi?", tone: "warning", title: "Alanları temizle", confirmText: "Temizle", cancelText: "Vazgeç" });
    if (!ok) return;
    if (activeAnalysis === "planet") setPlanetValues(makePlanetInitialValues());
    else setChakraValues(makeChakraInitialValues());
    setNote("");
  }

  async function printPdf() {
    const element = document.getElementById("analysis-print-area");
    if (!element) { showToast({ title: "İşlem başarısız", message: "PDF alanı bulunamadı.", type: "error" }); return; }
    try {
      setCreatingPdf(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const canvas = await html2canvas(element, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff",
        ignoreElements: (node) => node instanceof HTMLElement && node.classList.contains("no-pdf"),
      });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const imageWidth = usableWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      let heightLeft = imageHeight;
      let position = margin;
      pdf.addImage(imageData, "PNG", margin, position, imageWidth, imageHeight);
      heightLeft -= usableHeight;
      while (heightLeft > 0) {
        position = margin + heightLeft - imageHeight;
        pdf.addPage();
        pdf.addImage(imageData, "PNG", margin, position, imageWidth, imageHeight);
        heightLeft -= usableHeight;
      }
      pdf.save(`${safeFileName(clientName || "danisan")}-${safeFileName(activeTitle)}.pdf`);
      showToast({ title: "Başarılı", message: "PDF dosyası indirildi.", type: "success" });
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      showToast({ title: "İşlem başarısız", message: "PDF oluşturulamadı. Konsolu kontrol edelim.", type: "error" });
    } finally { setCreatingPdf(false); }
  }

  async function saveAnalysis() {
    if (!activeAnalysis) { showToast({ title: "İşlem başarısız", message: "Önce analiz seçmelisiniz.", type: "error" }); return; }
    setSavingAnalysis(true);
    const analysisData = { title: activeTitle, values: activeAnalysis === "planet" ? planetValues : chakraValues, saved_at: new Date().toISOString() };
    const { data: insertData, error } = await supabase
      .from("client_analyses")
      .insert({ tenant_id: tenantId, client_id: clientId, analysis_type: activeAnalysis, analysis_data: analysisData, note })
      .select("id")
      .single();
    if (error) {
      showToast({ title: "İşlem başarısız", message: "Analiz kaydedilemedi: " + error.message, type: "error" });
      setSavingAnalysis(false);
      return;
    }
    const newId = (insertData as { id: string } | null)?.id;
    await loadSavedAnalyses();
    showToast({ title: "Başarılı", message: "Analiz kaydedildi.", type: "success" });
    setSavingAnalysis(false);
    // Fire-and-forget snapshot — only for chakra analyses; failure doesn't affect the saved record
    if (activeAnalysis === "chakra" && newId && tenantId) {
      void captureAndUploadSnapshot(newId);
    }
  }

  async function captureAndUploadSnapshot(analysisId: string) {
    const element = document.getElementById("analysis-print-area");
    if (!element) return;
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (node) =>
          node instanceof HTMLElement && node.classList.contains("no-pdf"),
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) return;
      const fd = new FormData();
      fd.append("file", blob, "analysis.png");
      fd.append("analysisId", analysisId);
      fd.append("tenantId", tenantId!);
      const res = await fetch(`/api/clients/${clientId}/analyses/upload-image`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        showToast({ title: "Uyarı", message: "Analiz kaydedildi, görsel eklenemedi.", type: "info" });
      }
    } catch {
      showToast({ title: "Uyarı", message: "Analiz kaydedildi, görsel eklenemedi.", type: "info" });
    }
  }

  function exportWord() {
    showToast({ title: "Bilgi", message: "Word çıktısını bir sonraki aşamada ekleyeceğiz. Önce PDF ve kayıt düzenini kilitliyoruz.", type: "info" });
  }

  return (
    <div className="w-full relative">
      {/* Header */}
      <div className="mb-2.5">
        <span className="inline-flex bg-purple-100 text-purple-800 px-2.5 py-[5px] rounded-full text-[11px] font-black">
          Enerji &amp; Analiz Merkezi
        </span>
        <h2 className="mt-1.5 text-[20px] font-black text-slate-950">Danışan Analizleri</h2>
        <p className="mt-1.5 text-slate-500 text-[13px]">
          {clientName} için çakra, Ç.Gezegen, numeroloji ve Human Design analizleri burada toplanacak.
        </p>
      </div>

      {/* Analysis type cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3 mt-3.5">
        <AnalysisCard
          badge="Enerji Analizi" title="Çakra Analizi"
          text="Seans öncesi ve sonrası enerji değişimlerini çakra düzeni üzerinden takip edin."
          gradient="linear-gradient(135deg,#8b5cf6,#6d28d9)" buttonColor="#6d28d9"
          onOpen={() => openNewAnalysis("chakra")}
        />
        <AnalysisCard
          badge="Gezegen Analizi" title="Ç.Gezegen Analizi"
          text="Çakraların gezegensel enerji dengesini seans bazlı değerlendirin."
          gradient="linear-gradient(135deg,#0ea5e9,#2563eb)" buttonColor="#2563eb"
          onOpen={() => openNewAnalysis("planet")}
        />
      </div>

      {/* Saved analyses */}
      <section className="mt-3.5 bg-white border border-slate-200 rounded-[18px] p-3.5 shadow-sm">
        <div className="flex justify-between gap-3 items-start flex-wrap">
          <div>
            <span className="inline-flex bg-sky-100 text-sky-700 px-2.5 py-[5px] rounded-full text-[11px] font-black">
              Kayıtlı Analizler
            </span>
            <h3 className="mt-[7px] text-[18px] font-black text-slate-950">Analiz Geçmişi</h3>
            <p className="mt-1 text-slate-500 text-[12px]">Kaydedilen analizleri buradan tekrar açabilir veya silebilirsin.</p>
          </div>
          <button
            type="button" onClick={loadSavedAnalyses}
            className="border border-slate-300 bg-slate-50 text-slate-700 rounded-xl px-3 py-2 font-black text-[12px] cursor-pointer hover:bg-slate-100 transition-colors"
          >
            {loadingSaved ? "Yükleniyor..." : "Yenile"}
          </button>
        </div>

        {savedAnalyses.length === 0 ? (
          <div className="mt-3 border border-dashed border-slate-300 bg-slate-50 rounded-[14px] p-3.5 text-slate-500 text-[13px] font-bold">
            Henüz kayıtlı analiz yok.
          </div>
        ) : (
          <div className="mt-3 grid gap-[9px]">
            {savedAnalyses.map((item) => (
              <div key={item.id} className="border border-slate-200 bg-gradient-to-br from-white to-slate-50 rounded-[14px] p-3 flex justify-between gap-3 items-center">
                <div>
                  <div className="text-[14px] font-black text-slate-950">{getAnalysisLabel(item.analysis_type)}</div>
                  <div className="mt-[3px] text-[11px] font-bold text-slate-500">{formatDateTimeTR(item.created_at)}</div>
                  {item.note && (
                    <div className="mt-1.5 text-[11px] text-slate-600 bg-slate-100 rounded-xl px-2 py-1.5">
                      {item.note.slice(0, 90)}{item.note.length > 90 ? "..." : ""}
                    </div>
                  )}
                </div>
                <div className="flex gap-[7px] flex-wrap justify-end">
                  <button type="button" onClick={() => openSavedAnalysis(item)}
                    className="border-0 bg-blue-600 text-white rounded-xl px-[11px] py-[7px] text-[12px] font-black cursor-pointer hover:bg-blue-700 transition-colors">
                    Aç
                  </button>
                  <button type="button" onClick={() => deleteSavedAnalysis(item.id)}
                    className="border border-red-200 bg-red-50 text-red-600 rounded-xl px-[11px] py-[7px] text-[12px] font-black cursor-pointer hover:bg-red-100 transition-colors">
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Analysis modal */}
      {activeAnalysis && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/58 backdrop-blur-[7px] flex items-center justify-center p-2.5">
          <div className="w-[min(98vw,1780px)] h-[94vh] overflow-y-auto bg-gradient-to-br from-white to-slate-50 rounded-[20px] border border-white/85 shadow-[0_24px_70px_rgba(15,23,42,0.34)] relative">

            {/* PDF capture area — html2canvas reads computed CSS, Tailwind classes work identically to inline styles */}
            <div id="analysis-print-area" className="bg-white">
              {/* Modal header */}
              <div className="bg-gradient-to-r from-[#111827] via-[#4c1d95] to-[#be185d] text-white p-3.5 flex justify-between gap-2.5 items-start">
                <div>
                  <span className="inline-flex bg-white/16 text-white px-2 py-[3px] rounded-full text-[10px] font-black">
                    Analiz Formu
                  </span>
                  <h3 className="mt-1.5 text-[22px] font-black">{activeTitle}</h3>
                  <p className="mt-[5px] text-[12px] opacity-[0.92]">
                    Danışan: <strong>{clientName}</strong> · Tarih: <strong>{todayText}</strong>
                  </p>
                </div>
                {/* no-pdf: excluded from html2canvas capture */}
                <button
                  type="button"
                  onClick={() => setActiveAnalysis(null)}
                  className="no-pdf w-8 h-8 rounded-full border border-white/22 bg-white/14 text-white text-[22px] font-black cursor-pointer leading-none flex items-center justify-center hover:bg-white/25 transition-colors"
                >
                  ×
                </button>
              </div>

              {/* Modal body */}
              <div className="p-3 grid gap-[9px] pb-[18px]">
                {activeAnalysis === "chakra" ? (
                  <ChakraAnalysis values={chakraValues} updateValue={updateChakraValue} />
                ) : (
                  <PlanetAnalysis values={planetValues} updateValue={updatePlanetValue} />
                )}

                {/* Note */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-[7px]">
                  <label className="text-[10px] font-black text-amber-800">Analiz Notu</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Analiz yorumu, seans gözlemi veya danışana özel not..."
                    className="w-full min-h-[48px] mt-1 rounded-[9px] border border-amber-300 p-1.5 text-[10px] outline-none resize-y bg-white box-border"
                  />
                </div>
              </div>
            </div>

            {/* Sticky action bar — no-pdf: excluded from html2canvas capture */}
            <div className="no-pdf sticky bottom-0 z-[3] flex justify-end gap-2 flex-wrap bg-slate-50/95 border-t border-slate-200 px-3 py-[9px] backdrop-blur-[10px]">
              <button type="button" onClick={clearAll}
                className={`${toolbarBtnBase} border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200`}>
                Tümünü Temizle
              </button>
              <button type="button" onClick={printPdf} disabled={creatingPdf}
                className={`${toolbarBtnBase} bg-red-500 text-white hover:bg-red-600 disabled:opacity-60`}>
                {creatingPdf ? "PDF Hazırlanıyor..." : "PDF Al"}
              </button>
              <button type="button" onClick={exportWord}
                className={`${toolbarBtnBase} bg-blue-600 text-white hover:bg-blue-700`}>
                Word Al
              </button>
              <button type="button" onClick={saveAnalysis} disabled={savingAnalysis}
                className={`${toolbarBtnBase} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>
                {savingAnalysis ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ChakraAnalysis ───────────────────────────────────────────────────────────
function ChakraAnalysis({
  values, updateValue,
}: {
  values: Record<string, ChakraRowValue>;
  updateValue: (key: string, field: keyof ChakraRowValue, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-[9px]">
      <ChakraSection title="Seans Öncesi — Enerji Bedenleri" scope="before_energy" rows={energyBodies} values={values} updateValue={updateValue} />
      <ChakraSection title="Seans Sonrası — Enerji Bedenleri" scope="after_energy"  rows={energyBodies} values={values} updateValue={updateValue} />
      <ChakraSection title="Çakralar — Seans Öncesi"          scope="before_chakra" rows={chakras}       values={values} updateValue={updateValue} />
      <ChakraSection title="Çakralar — Seans Sonrası"         scope="after_chakra"  rows={chakras}       values={values} updateValue={updateValue} />
    </div>
  );
}

// ─── ChakraSection ────────────────────────────────────────────────────────────
function ChakraSection({
  title, scope, rows, values, updateValue,
}: {
  title: string;
  scope: string;
  rows: ChakraRow[];
  values: Record<string, ChakraRowValue>;
  updateValue: (key: string, field: keyof ChakraRowValue, value: string) => void;
}) {
  return (
    <section className="bg-white border border-blue-200 rounded-[15px] p-2.5 shadow-sm">
      <div className="inline-flex bg-blue-50 text-blue-600 px-2.5 py-[5px] rounded-full text-[12px] font-black mb-1.5">
        {title}
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_132px_132px_132px] gap-[7px] mb-[7px] text-blue-600 text-[10px]">
        <div />
        <strong>İŞARET +/- · SAYI %</strong>
        <strong>ERİL ENERJİ</strong>
        <strong>DİŞİL ENERJİ</strong>
      </div>

      {rows.map((row) => {
        const key = `${scope}_${row.key}`;
        const rowValue = values[key] || { mark: "", male: "", female: "" };
        return (
          <div key={key} className="grid grid-cols-[1fr_132px_132px_132px] gap-[7px] mb-[7px] items-center">
            {/* Color label — background is a runtime data value, must stay inline */}
            <div
              className="min-h-[31px] rounded-none text-white flex items-center px-[11px] text-[11px] font-black"
              style={{ background: row.color }}
            >
              {row.label}
            </div>

            <input
              value={rowValue.mark}
              onChange={(e) => updateValue(key, "mark", e.target.value)}
              placeholder="+10 / -20"
              className={`${schemaInputBase} ${valueClass(rowValue.mark)}`}
            />
            <input
              value={rowValue.male}
              onChange={(e) => updateValue(key, "male", e.target.value)}
              placeholder="Eril"
              className={`${schemaInputBase} ${valueClass(rowValue.male)}`}
            />
            <input
              value={rowValue.female}
              onChange={(e) => updateValue(key, "female", e.target.value)}
              placeholder="Dişil"
              className={`${schemaInputBase} ${valueClass(rowValue.female)}`}
            />
          </div>
        );
      })}
    </section>
  );
}

// ─── PlanetAnalysis ───────────────────────────────────────────────────────────
function PlanetAnalysis({
  values, updateValue,
}: {
  values: Record<string, string>;
  updateValue: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PlanetPanel title="Seans Öncesi"  scope="before" values={values} updateValue={updateValue} />
      <PlanetPanel title="Seans Sonrası" scope="after"  values={values} updateValue={updateValue} />
    </div>
  );
}

// ─── PlanetPanel ──────────────────────────────────────────────────────────────
function PlanetPanel({
  title, scope, values, updateValue,
}: {
  title: string;
  scope: string;
  values: Record<string, string>;
  updateValue: (key: string, value: string) => void;
}) {
  return (
    <section className="bg-white border border-blue-200 rounded-[13px] p-2 shadow-sm overflow-x-auto">
      <div className="inline-flex bg-blue-50 text-blue-600 px-2.5 py-[5px] rounded-full text-[12px] font-black mb-1.5">
        {title}
      </div>

      {/* planetGrid gridTemplateColumns is dynamic (computed from planetLabels.length),
          cannot be a static Tailwind class — intentionally kept as inline style */}
      <div
        className="grid gap-[6px] min-w-[620px]"
        style={{ gridTemplateColumns: `132px repeat(${planetLabels.length}, minmax(86px, 1fr))` }}
      >
        <div className="bg-slate-50 rounded-xl min-h-[98px]" />

        {planetLabels.map((planet, index) => (
          // Header cell background is a runtime array value — must stay inline
          <div
            key={planet}
            className="min-h-[98px] rounded-xl flex items-center justify-center text-sky-800 text-[11px] font-black"
            style={{ background: planetColors[index] }}
          >
            {planet}
          </div>
        ))}

        {planetRows.map((row) => (
          <div key={row.key} className="contents">
            {/* Row label background is a runtime data value — must stay inline */}
            <div
              className="min-h-[30px] rounded-full flex items-center px-2 text-white text-[10px] font-black"
              style={{ background: row.color }}
            >
              {row.label}
            </div>

            {planetLabels.map((planet) => {
              const key = `${scope}_${row.key}_${planet}`;
              const value = values[key] || "";
              return (
                <input
                  key={key}
                  value={value}
                  onChange={(e) => updateValue(key, e.target.value)}
                  placeholder="+30 / -20"
                  className={`${planetInputBase} ${valueClass(value)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── AnalysisCard ─────────────────────────────────────────────────────────────
function AnalysisCard({
  badge, title, text, gradient, buttonColor, onOpen,
}: {
  badge: string;
  title: string;
  text: string;
  gradient: string;
  buttonColor: string;
  onOpen: () => void;
}) {
  return (
    // gradient is a runtime prop (inline-gradient string) — must stay inline
    <div className="rounded-[18px] p-4 text-white shadow-[0_14px_30px_rgba(15,23,42,0.14)]" style={{ background: gradient }}>
      <div className="text-[12px] font-extrabold opacity-[0.85]">{badge}</div>
      <h3 className="mt-2 text-[22px] font-black">{title}</h3>
      <p className="mt-2 leading-[1.45] opacity-[0.9] text-[13px]">{text}</p>
      {/* buttonColor is a runtime prop — must stay inline */}
      <button
        type="button" onClick={onOpen}
        className="mt-3 border-0 bg-white px-3 py-2 rounded-xl font-black cursor-pointer hover:opacity-90 transition-opacity"
        style={{ color: buttonColor }}
      >
        Analizi Aç
      </button>
    </div>
  );
}
