"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatDateAbsolute, formatDateTimeAbsolute } from "@/lib/i18n/format";
// PERF (C1): html2canvas + jsPDF ağır kütüphaneler; statik import edilirse Analizler sekmesi
// AÇILIR AÇILMAZ chunk'a girip indirilir/parse edilir. Yalnız PDF/snapshot üretimi anında
// dynamic import edilir → sekmenin ilk açılış yükünden çıkarılır. Davranış/çıktı aynıdır.
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useDeleteConfirm } from "@/hooks/useDeleteConfirm";
import { useToast } from "@/components/ui/ToastProvider";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";
import { reportUsageExport, reportUsageClientFailure } from "@/lib/usage/usageBeaconClient";
import { analysisTypeLabel } from "@/lib/clients/analysisLabels";
import { dyp } from "@/app/_premium/danisan-yolculugu/DypUi";

// ─── Types ────────────────────────────────────────────────────────────────────
type AnalizlerTabProps = {
  clientId: string;
  clientName: string;
};

type AnalysisType = "chakra" | "planet";

type ChakraRow = {
  key: string;
  /** i18n anahtarı (görünen etiket). `key` canonical'dır; DEĞİŞMEZ. */
  labelKey: string;
  color: string;
};

type ChakraRowValue = {
  mark: string;
  male: string;
  female: string;
};

type SavedAnalysis = {
  id: string;
  /** DY-03: satır sürümü (atomik CAS). */
  row_version?: number;
  tenant_id: string;
  client_id: string;
  analysis_type: AnalysisType | string | null;
  analysis_data: unknown;
  note: string | null;
  created_at: string;
};

// ─── Data constants ───────────────────────────────────────────────────────────
// `key` = canonical satır kimliği (persisted values anahtarı türetiminde kullanılır) → DEĞİŞMEZ.
// `labelKey` = yalnız görünen etiketin i18n anahtarı (DISPLAY-only).
const energyBodies: ChakraRow[] = [
  { key: "ruhsal",   labelKey: "bodies.ruhsal",   color: "#6d5bd0" },
  { key: "zihinsel", labelKey: "bodies.zihinsel", color: "#43a047" },
  { key: "duygusal", labelKey: "bodies.duygusal", color: "#f2b824" },
  { key: "eterik",   labelKey: "bodies.eterik",   color: "#2196c9" },
  { key: "fiziksel", labelKey: "bodies.fiziksel", color: "#4b5563" },
];

const chakras: ChakraRow[] = [
  { key: "tac",    labelKey: "chakra.tac",    color: "#a78bfa" },
  { key: "goz",    labelKey: "chakra.goz",    color: "#6366f1" },
  { key: "bogaz",  labelKey: "chakra.bogaz",  color: "#38bdf8" },
  { key: "kalp",   labelKey: "chakra.kalp",   color: "#22c55e" },
  { key: "mide",   labelKey: "chakra.mide",   color: "#facc15" },
  { key: "sakral", labelKey: "chakra.sakral", color: "#f97316" },
  { key: "kok",    labelKey: "chakra.kok",    color: "#ef4444" },
];

// ⚠️ P0: planetLabels persisted DATA anahtarıdır (values[`${scope}_${row.key}_${planet}`]).
// ASLA çevrilmez/yeniden adlandırılmaz. Görünen başlık planetDisplayKeys ile i18n'den gelir
// (index hizalı; canonical değer key/veri tarafında aynen kalır).
const planetLabels = ["GÜNEŞ", "AY", "MERKÜR", "MARS", "VENÜS"];
const planetDisplayKeys = ["planet.gunes", "planet.ay", "planet.merkur", "planet.mars", "planet.venus"];
const planetColors = ["#facc15", "#93c5fd", "#86efac", "#fca5a5", "#f9a8d4"];

const planetRows: ChakraRow[] = [
  { key: "tac",    labelKey: "planetRow.tac",    color: "#a78bfa" },
  { key: "goz",    labelKey: "planetRow.goz",    color: "#6366f1" },
  { key: "bogaz",  labelKey: "planetRow.bogaz",  color: "#38bdf8" },
  { key: "kalp",   labelKey: "planetRow.kalp",   color: "#22c55e" },
  { key: "mide",   labelKey: "planetRow.mide",   color: "#facc15" },
  { key: "sakral", labelKey: "planetRow.sakral", color: "#f97316" },
  { key: "kok",    labelKey: "planetRow.kok",    color: "#ef4444" },
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
  return formatDateTimeAbsolute(value);
}


// ─── Shared input class strings ───────────────────────────────────────────────
const schemaInputBase =
  "w-full min-h-[44px] md:min-h-[31px] rounded-[8px] border border-slate-300 bg-white px-2 py-[5px] text-[12px] font-bold text-slate-900 outline-none box-border focus:border-[#2c5aa0]";

const planetInputBase =
  "min-h-[44px] md:min-h-[30px] rounded-[8px] border border-slate-300 bg-white px-[7px] py-[5px] text-[11px] font-bold text-slate-900 outline-none w-full box-border focus:border-[#2c5aa0]";

const toolbarBtnBase =
  "cursor-pointer inline-flex items-center justify-center min-h-[44px] md:min-h-0";

// PDF Export ürün kararıyla bu sürümde kullanıcıya gösterilmez (WEB-2 kapanış).
// printPdf()/captureAnalysisNode() kodu tabanda pasif kalır; ileride bu flag
// true yapılınca PDF Al butonu ve export tekrar açılır. Word export etkilenmez.
const PDF_EXPORT_ENABLED = false;

// ─── Main component ───────────────────────────────────────────────────────────
export default function AnalizlerTab({ clientId, clientName }: AnalizlerTabProps) {
  const t = useTranslations("clients.analizler");
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
  // Modalde açık olan kayıtlı analizin id'si — "Word Al" yalnız bu kaydı verir.
  // Yeni (henüz kaydedilmemiş) analizde null kalır.
  const [openedAnalysisId, setOpenedAnalysisId] = useState<string | null>(null);
  // DY-03: açılan kayıtlı analizin sürümü (eski sürümle güncelleme 409 alır).
  const [openedAnalysisVersion, setOpenedAnalysisVersion] = useState<number | null>(null);
  const [exportingWord, setExportingWord]   = useState(false);
  // Kayıtlı analiz "Aç" ile SALT OKUNUR açılır; yalnız "Düzenle" sonrası değiştirilebilir
  // (eski analizin yanlışlıkla üzerine yazılmasını engeller). Yeni analizde false.
  const [readOnly, setReadOnly] = useState(false);
  const savingRef = useRef(false);

  // PERSIST için canonical TR etiket (analysis_data.title kararlı kalır — locale'e bağlı DEĞİL).
  const activeTitle = analysisTypeLabel(activeAnalysis);
  // DISPLAY (modal başlığı, dosya adı) için yerelleştirilmiş etiket.
  const analysisTypeDisplay = (code: string | null | undefined): string =>
    code && t.has(`analysisType.${code}`) ? t(`analysisType.${code}`) : t("analysisType.default");
  const activeTitleDisplay = analysisTypeDisplay(activeAnalysis);

  const todayText = useMemo(() => formatDateAbsolute(new Date()), []);

  useEffect(() => { void getSyncedTenantId().then(setTenantId); }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadSavedAnalyses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, tenantId]);

  async function loadSavedAnalyses() {
    if (!clientId || !tenantId) return;
    setLoadingSaved(true);
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/analyses`, {
      headers: {
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; analyses?: SavedAnalysis[] };
    if (!res.ok || !json.ok) {
      console.error("Analizler yüklenemedi:", json.error);
      showToast({ title: t("toast.failTitle"), message: t("toast.loadFailed") + ": " + (json.error ?? ""), type: "error" });
      setLoadingSaved(false);
      return;
    }
    setSavedAnalyses((json.analyses || []) as SavedAnalysis[]);
    setLoadingSaved(false);
  }

  function openNewAnalysis(type: AnalysisType) {
    setActiveAnalysis(type);
    setOpenedAnalysisId(null);
    setReadOnly(false);
    if (type === "planet") setPlanetValues(makePlanetInitialValues());
    else setChakraValues(makeChakraInitialValues());
    setNote("");
  }

  function openSavedAnalysis(item: SavedAnalysis) {
    const type = item.analysis_type === "planet" ? "planet" : "chakra";
    setActiveAnalysis(type);
    setOpenedAnalysisId(item.id);
    setOpenedAnalysisVersion(item.row_version ?? null);
    setReadOnly(true);
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
      title: t("delete.title"),
      message: t("delete.message"),
    });
    if (!ok) return;
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    const res = await fetch(`/api/clients/${clientId}/analyses`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify({ analysisId: id }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; warnings?: string[] };
    if (!res.ok || !json.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.deleteFailed") + ": " + (json.error ?? ""), type: "error" });
      // D1 (DY-04): 404 = analiz artık yok → bayat satır listeden kalkar.
      if (res.status === 404) setSavedAnalyses((old) => old.filter((item) => item.id !== id));
      return;
    }
    setSavedAnalyses((old) => old.filter((item) => item.id !== id));
    showToast({ title: t("toast.successTitle"), message: t("toast.deleted"), type: "success" });
    // D1 (DY-01): analiz silindi ama görsel temizliği tamamlanamadıysa kullanıcı bilgilendirilir.
    if (Array.isArray(json.warnings) && json.warnings.length > 0) {
      showToast({ title: t("toast.warningTitle"), message: t("toast.imageCleanupWarning"), type: "warning" });
    }
  }

  function closeModal() {
    setActiveAnalysis(null);
    setReadOnly(false);
  }

  function updateChakraValue(key: string, field: keyof ChakraRowValue, value: string) {
    if (readOnly) return; // savunma: salt okunurda değer değişmez
    setChakraValues((old) => ({ ...old, [key]: { ...(old[key] || { mark: "", male: "", female: "" }), [field]: value } }));
  }

  function updatePlanetValue(key: string, value: string) {
    if (readOnly) return;
    setPlanetValues((old) => ({ ...old, [key]: value }));
  }

  async function clearAll() {
    if (readOnly) return;
    const ok = await confirm({ message: t("clearConfirm.message"), tone: "warning", title: t("clearConfirm.title"), confirmText: t("clearConfirm.confirm"), cancelText: t("cancel") });
    if (!ok) return;
    if (activeAnalysis === "planet") setPlanetValues(makePlanetInitialValues());
    else setChakraValues(makeChakraInitialValues());
    setNote("");
  }

  // Tek bir DOM elemanını, overflow kırpması olmadan yüksek çözünürlüklü görüntüye çevirir.
  // Ekran DOM'una dokunmaz; kırpma yalnızca html2canvas klonunda (onclone) nötrlenir.
  async function captureAnalysisNode(node: HTMLElement) {
    const style = getComputedStyle(node);
    const scroller =
      node.scrollWidth > node.clientWidth + 1 ||
      style.overflowX === "auto" ||
      style.overflowX === "scroll";
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(node, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
      // Yatay taşan içeriğin (planet paneli) tamamını yakalamak için tam içerik genişliği.
      width: node.scrollWidth,
      windowWidth: Math.max(node.scrollWidth, document.documentElement.clientWidth),
      ignoreElements: (n) => n instanceof HTMLElement && n.classList.contains("no-pdf"),
      onclone: (_doc, cloned) => {
        cloned.style.overflow = "visible";
        cloned.style.overflowX = "visible";
        if (scroller) {
          // Örn. Çakra-Gezegen panelinde tüm gezegen sütunlarının (GÜNEŞ…VENÜS) gelmesi için
          // kutuyu içeriğe göre genişlet.
          cloned.style.width = "max-content";
          cloned.style.maxWidth = "none";
        }
      },
    });
    return { dataUrl: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
  }

  async function printPdf() {
    const element = document.getElementById("analysis-print-area");
    if (!element) { showToast({ title: t("toast.failTitle"), message: t("toast.pdfAreaNotFound"), type: "error" }); return; }
    try {
      setCreatingPdf(true);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Yakalama birimleri: başlık + her analiz bölümü (+ varsa not).
      // Tek dev görüntü yerine bölüm bölüm yakalanır; her bölüm sayfaya bütün olarak
      // yerleşir (satır/bölüm ikiye bölünmez), dar bölümler sayfa genişliğine büyütülür (okunur yazı).
      const header = element.firstElementChild as HTMLElement | null;
      const sectionNodes = Array.from(element.querySelectorAll("section")) as HTMLElement[];
      const noteNode = note.trim() ? (element.querySelector(".bg-amber-50") as HTMLElement | null) : null;
      const units: HTMLElement[] = [
        ...(header ? [header] : []),
        ...sectionNodes,
        ...(noteNode ? [noteNode] : []),
      ];
      if (units.length === 0) throw new Error(t("error.pdfNoContent"));

      const { default: jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();   // 210
      const pageHeight = pdf.internal.pageSize.getHeight();  // 297
      const margin = 10;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const gap = 4;
      let cursorY = margin;
      let placed = 0;

      for (const node of units) {
        const img = await captureAnalysisNode(node);
        let drawW = usableWidth;
        let drawH = (img.h * drawW) / img.w;
        // Bir bölüm tek sayfaya sığmayacak kadar uzunsa orantılı küçült (bölünmeyi önler).
        if (drawH > usableHeight) {
          drawH = usableHeight;
          drawW = (img.w * drawH) / img.h;
        }
        // Bölüm kalan alana sığmıyorsa önce yeni sayfa aç (satır/bölüm ortadan kesilmez).
        if (placed > 0 && cursorY + drawH > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }
        const x = margin + (usableWidth - drawW) / 2; // dar bölümü yatayda ortala
        pdf.addImage(img.dataUrl, "PNG", x, cursorY, drawW, drawH);
        cursorY += drawH + gap;
        placed++;
      }

      pdf.save(`${safeFileName(clientName || "danisan")}-${safeFileName(activeTitleDisplay)}.pdf`);
      showToast({ title: t("toast.successTitle"), message: t("toast.pdfDownloaded"), type: "success" });
      reportUsageExport("clients", "analysis");
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      reportUsageClientFailure("clients", "client_export", "report_exported", "analysis");
      showToast({ title: t("toast.failTitle"), message: t("toast.pdfFailed"), type: "error" });
    } finally { setCreatingPdf(false); }
  }

  async function saveAnalysis() {
    if (!activeAnalysis) { showToast({ title: t("toast.failTitle"), message: t("toast.selectFirst"), type: "error" }); return; }
    if (readOnly || savingRef.current) return; // salt okunurda kayıt yok · çift tıklama → tek istek
    savingRef.current = true;
    setSavingAnalysis(true);
    try {
      await saveAnalysisInner(activeAnalysis);
    } finally {
      savingRef.current = false;
      setSavingAnalysis(false);
    }
  }

  /**
   * "Kaydet ve Kapat": kayıt BAŞARILI olduktan SONRA modal kapanır; hata/ağ hatasında açık kalır ve
   * hata gösterilir. Çakra görüntüsü modal kapanmadan ÖNCE yakalanır, yükleme arka planda sürer.
   */
  async function saveAnalysisInner(currentType: AnalysisType) {
    const activeAnalysis = currentType;
    const analysisData = { title: activeTitle, values: activeAnalysis === "planet" ? planetValues : chakraValues, saved_at: new Date().toISOString() };
    const userId = readYasamUser()?.id;
    const sessionToken = readSessionToken();
    // Kaydedilmiş bir analiz açıksa GÜNCELLE (aynı id, PATCH) → duplicate kayıt oluşmaz (spec §4).
    // Aksi halde yeni kayıt oluştur (POST).
    const editing = Boolean(openedAnalysisId);
    let res: Response;
    try {
      res = await fetch(`/api/clients/${clientId}/analyses`, {
      method: editing ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId ?? "",
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
      body: JSON.stringify(
        editing
          ? { id: openedAnalysisId, row_version: openedAnalysisVersion, analysis_type: activeAnalysis, analysis_data: analysisData, note }
          : { analysis_type: activeAnalysis, analysis_data: analysisData, note },
      ),
      });
    } catch {
      showToast({ title: t("toast.failTitle"), message: t("toast.saveNetwork"), type: "error" });
      return; // modal AÇIK kalır
    }
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string | null };
    if (editing && (res.status === 409 || res.status === 428)) {
      // DY-03: kayıt başka sekme/cihazda değişti → hiçbir şey yazılmadı; güncel kayıt listesi yüklenir.
      showToast({ title: t("toast.failTitle"), message: t("toast.recordConflict"), type: "warning" });
      closeModal();
      setOpenedAnalysisId(null);
      void loadSavedAnalyses();
      return;
    }
    if (!res.ok || !json.ok) {
      showToast({ title: t("toast.failTitle"), message: t("toast.saveFailed") + ": " + (json.error ?? ""), type: "error" });
      return; // modal AÇIK kalır
    }
    // Güncellemede aynı id korunur; yeni kayıtta dönen id döner.
    const savedId = json.id ?? (editing ? openedAnalysisId : null) ?? undefined;
    // Çakra görüntüsü: DOM modal kapanmadan yakalanır (kayıt zaten başarılı; yakalama hatası kapanmayı engellemez).
    const snapshot = activeAnalysis === "chakra" && savedId && tenantId ? await captureSnapshotBlob() : null;
    closeModal();
    setOpenedAnalysisId(null);
    showToast({ title: t("toast.successTitle"), message: t("toast.saved"), type: "success" });
    void loadSavedAnalyses();
    if (snapshot && savedId) void uploadSnapshot(savedId, snapshot);
  }

  async function captureSnapshotBlob(): Promise<Blob | null> {
    const element = document.getElementById("analysis-print-area");
    if (!element) return null;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        ignoreElements: (node) =>
          node instanceof HTMLElement && node.classList.contains("no-pdf"),
      });
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
    } catch {
      showToast({ title: t("toast.warningTitle"), message: t("toast.imageUploadFailed"), type: "info" });
      return null;
    }
  }

  async function uploadSnapshot(analysisId: string, blob: Blob) {
    try {
      const fd = new FormData();
      fd.append("file", blob, "analysis.png");
      fd.append("analysisId", analysisId);
      const userId = readYasamUser()?.id;
      const sessionToken = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/analyses/upload-image`, {
        method: "POST",
        headers: {
          "x-user-id": userId ?? "",
          "x-session-token": sessionToken ?? "",
        },
        body: fd,
      });
      if (!res.ok) {
        showToast({ title: t("toast.warningTitle"), message: t("toast.imageUploadFailed"), type: "info" });
      } else {
        // DY-03: görsel yolu yazımı satır sürümünü artırır → liste güncel sürümle tazelenir
        // (aksi halde hemen ardından yapılan düzenleme yanlış çakışma alırdı).
        void loadSavedAnalyses();
      }
    } catch {
      showToast({ title: t("toast.warningTitle"), message: t("toast.imageUploadFailed"), type: "info" });
    }
  }

  async function exportWord() {
    if (exportingWord) return;
    // Word çıktısı yalnız KAYITLI analiz için üretilir (tek kayıt).
    if (!openedAnalysisId) {
      showToast({ title: t("toast.infoTitle"), message: t("toast.wordNeedsSave"), type: "info" });
      return;
    }
    if (!tenantId) {
      showToast({ title: t("toast.failTitle"), message: t("toast.sessionInvalid"), type: "error" });
      return;
    }
    const userId = readYasamUser()?.id;
    if (!userId) {
      showToast({ title: t("toast.failTitle"), message: t("toast.sessionInvalid"), type: "error" });
      return;
    }
    try {
      setExportingWord(true);
      const sessionToken = readSessionToken();
      const res = await fetch(`/api/clients/${clientId}/word-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId ?? "",
          "x-session-token": sessionToken ?? "",
        },
        body: JSON.stringify({
          exportMode: "single-analysis",
          analysisId: openedAnalysisId,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        showToast({ title: t("toast.failTitle"), message: json.error || t("toast.wordFailed"), type: "error" });
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `${safeFileName(clientName || "danisan")}-${safeFileName(activeTitleDisplay)}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast({ title: t("toast.successTitle"), message: t("toast.wordDownloaded"), type: "success" });
    } catch (error) {
      console.error("Analiz Word hatası:", error);
      showToast({ title: t("toast.failTitle"), message: t("toast.wordFailedRetry"), type: "error" });
    } finally {
      setExportingWord(false);
    }
  }

  return (
    <div className="w-full relative">
      {/* Header */}
      <div className={`${dyp.kHeader} mb-2.5`}>
        <span className={`${dyp.kEyebrow} inline-flex`}>
          {t("header.badge")}
        </span>
        <h2 className={`${dyp.kTitle} mt-1.5`}>{t("header.title")}</h2>
        <p className={`${dyp.kDesc} mt-1.5`}>
          {t("header.subtitle", { name: clientName })}
        </p>
      </div>

      {/* Analysis type cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3 mt-3.5">
        <AnalysisCard
          badge={t("card.chakra.badge")} title={t("card.chakra.title")}
          text={t("card.chakra.text")}
          gradient="linear-gradient(135deg,#8b5cf6,#6d28d9)" buttonColor="#6d28d9"
          onOpen={() => openNewAnalysis("chakra")}
        />
        <AnalysisCard
          badge={t("card.planet.badge")} title={t("card.planet.title")}
          text={t("card.planet.text")}
          gradient="linear-gradient(135deg,#0ea5e9,#2563eb)" buttonColor="#2563eb"
          onOpen={() => openNewAnalysis("planet")}
        />
      </div>

      {/* Saved analyses */}
      <section className={`${dyp.kCard} mt-3.5`}>
        <div className="flex justify-between gap-3 items-start flex-wrap">
          <div>
            <span className={`${dyp.kEyebrow} inline-flex`}>
              {t("saved.badge")}
            </span>
            <h3 className={`${dyp.kSubtitle} mt-[7px]`}>{t("saved.title")}</h3>
            <p className={`${dyp.kDesc} mt-1`}>{t("saved.subtitle")}</p>
          </div>
          <button
            type="button" onClick={loadSavedAnalyses}
            className={`${dyp.kBtnSecondary} ${dyp.kBtnSm}`}
          >
            {loadingSaved ? t("loading") : t("refresh")}
          </button>
        </div>

        {savedAnalyses.length === 0 ? (
          <div className={`${dyp.kEmpty} mt-3`}>
            {t("saved.empty")}
          </div>
        ) : (
          <div className="mt-3 grid gap-[9px]">
            {savedAnalyses.map((item) => (
              <div key={item.id} className={`${dyp.kCardMuted} flex justify-between gap-3 items-center`}>
                <div>
                  <div className={dyp.kSubtitle}>{analysisTypeDisplay(item.analysis_type)}</div>
                  <div className={`${dyp.kMeta} mt-[3px]`}>{formatDateTimeTR(item.created_at)}</div>
                  {item.note && (
                    <div className={`${dyp.kField} ${dyp.kFieldText} mt-1.5`}>
                      {item.note.slice(0, 90)}{item.note.length > 90 ? "..." : ""}
                    </div>
                  )}
                </div>
                <div className="flex gap-[7px] flex-wrap justify-end">
                  <button type="button" onClick={() => openSavedAnalysis(item)}
                    className={`${dyp.kBtnPrimary} ${dyp.kBtnSm}`}>
                    {t("item.open")}
                  </button>
                  <button type="button" onClick={() => deleteSavedAnalysis(item.id)}
                    className={`${dyp.kBtnDanger} ${dyp.kBtnSm}`}>
                    {t("item.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Analysis modal */}
      {activeAnalysis && (
        <div className={`${dyp.kOverlay} fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-2.5`}>
          <div className={`${dyp.kModal} w-full max-w-[1780px] h-[94vh] overflow-y-auto overflow-x-hidden relative`}>

            {/* PDF capture area — html2canvas reads computed CSS, Tailwind classes work identically to inline styles */}
            <div id="analysis-print-area" className="bg-white">
              {/* Modal header */}
              <div className={`${dyp.kModalHead} flex justify-between gap-2.5 items-start`}>
                <div className="min-w-0">
                  <span className={`${dyp.kEyebrow} inline-flex`}>
                    {t("modal.badge")}
                  </span>
                  <h3 className={`${dyp.kTitle} mt-1.5 break-words`}>{activeTitleDisplay}</h3>
                  <p className={`${dyp.kDesc} mt-[5px] break-words`}>
                    {t("modal.clientLabel")} <strong>{clientName}</strong> · {t("modal.dateLabel")} <strong>{todayText}</strong>
                  </p>
                </div>
                {/* no-pdf: excluded from html2canvas capture */}
                <button
                  type="button"
                  onClick={closeModal}
                  aria-label="Kapat"
                  className="no-pdf shrink-0 w-8 h-8 rounded-full border border-slate-300 bg-white text-slate-600 text-[22px] font-bold cursor-pointer leading-none flex items-center justify-center hover:bg-slate-100 transition-colors"
                >
                  ×
                </button>
              </div>

              {/* Modal body */}
              <div className="p-3 grid gap-[9px] pb-24 md:pb-[18px]">
                {openedAnalysisId ? (
                  <div
                    data-testid="analysis-mode-banner"
                    className={`no-pdf ${readOnly ? dyp.kAlert : dyp.kAlertWarn}`}
                  >
                    {readOnly ? t("modal.readOnlyHint") : t("modal.editingHint")}
                  </div>
                ) : null}
                {/* Salt okunur: tüm alanlar yerel olarak devre dışı (değer/seçim değişemez). */}
                <fieldset disabled={readOnly} data-testid="analysis-fields" className="m-0 grid min-w-0 gap-[9px] border-0 p-0">
                {activeAnalysis === "chakra" ? (
                  <ChakraAnalysis values={chakraValues} updateValue={updateChakraValue} />
                ) : (
                  <PlanetAnalysis values={planetValues} updateValue={updatePlanetValue} />
                )}

                {/* Note */}
                <div className={`${dyp.kField} bg-amber-50`}>
                  <label className={dyp.kLabel}>{t("modal.noteLabel")}</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("modal.notePlaceholder")}
                    className={`${dyp.kInput} w-full min-h-[48px] mt-1 resize-y box-border`}
                  />
                </div>
                </fieldset>
              </div>
            </div>

            {/* Sticky action bar — no-pdf: excluded from html2canvas capture */}
            <div className={`${dyp.kModalFoot} no-pdf sticky bottom-0 z-[3] grid grid-cols-2 md:flex md:justify-end md:flex-wrap gap-2`}>
              {!readOnly && (
              <button type="button" onClick={clearAll}
                className={`${toolbarBtnBase} ${dyp.kBtnSecondary}`}>
                {t("modal.clearAll")}
              </button>
              )}
              {/* PDF Al: ürün kararıyla gizlendi (flag false). printPdf/creatingPdf
                  referansları burada korunur ki kod pasif ama derli toplu kalsın. */}
              {PDF_EXPORT_ENABLED && (
                <button type="button" onClick={printPdf} disabled={creatingPdf}
                  className={`${toolbarBtnBase} ${dyp.kBtnSecondary}`}>
                  {creatingPdf ? t("modal.pdfPreparing") : t("modal.pdf")}
                </button>
              )}
              <button type="button" onClick={exportWord} disabled={exportingWord}
                className={`${toolbarBtnBase} ${dyp.kBtnSecondary}`}>
                {exportingWord ? t("modal.wordPreparing") : t("modal.word")}
              </button>
              {readOnly ? (
                <button type="button" onClick={() => setReadOnly(false)} data-testid="analysis-edit"
                  className={`${toolbarBtnBase} ${dyp.kBtnPrimary}`}>
                  ✏️ {t("modal.edit")}
                </button>
              ) : (
                <button type="button" onClick={saveAnalysis} disabled={savingAnalysis} data-testid="analysis-save-close"
                  className={`${toolbarBtnBase} ${dyp.kBtnSave}`}>
                  {savingAnalysis ? t("modal.saving") : t("modal.saveAndClose")}
                </button>
              )}
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
  const t = useTranslations("clients.analizler");
  return (
    <div className="grid grid-cols-1 gap-[9px] xl:grid-cols-2">
      <ChakraSection title={t("section.beforeEnergy")} scope="before_energy" rows={energyBodies} values={values} updateValue={updateValue} />
      <ChakraSection title={t("section.afterEnergy")}  scope="after_energy"  rows={energyBodies} values={values} updateValue={updateValue} />
      <ChakraSection title={t("section.beforeChakra")} scope="before_chakra" rows={chakras}       values={values} updateValue={updateValue} />
      <ChakraSection title={t("section.afterChakra")}  scope="after_chakra"  rows={chakras}       values={values} updateValue={updateValue} />
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
  const t = useTranslations("clients.analizler");
  return (
    <section className="bg-white border border-slate-200 rounded-[12px] p-2.5">
      <div className="inline-flex text-[#13284b] text-[13px] font-extrabold mb-1.5">
        {title}
      </div>

      {/* Mobil açıklama — dar ekranda kolon başlıkları gizli; +/- işareti · değer (%) anlamı burada verilir (spec §5). */}
      <div className="md:hidden mb-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-slate-600">
        {t("colHeader.mark")} · {t("colHeader.male")} · {t("colHeader.female")}
      </div>

      {/* Header row — mobilde gizli (dar ekranda input placeholder'ları etiket görevi görür) */}
      <div className="hidden md:grid grid-cols-[1fr_132px_132px_132px] gap-[7px] mb-[7px] text-slate-600 text-[10px]">
        <div />
        <strong>{t("colHeader.mark")}</strong>
        <strong>{t("colHeader.male")}</strong>
        <strong>{t("colHeader.female")}</strong>
      </div>

      {rows.map((row) => {
        const key = `${scope}_${row.key}`;
        const rowValue = values[key] || { mark: "", male: "", female: "" };
        return (
          <div key={key} className="grid grid-cols-1 gap-[7px] mb-[7px] md:grid-cols-[1fr_132px_132px_132px] md:items-center">
            {/* Color label — background is a runtime data value, must stay inline */}
            <div
              className="min-h-[31px] rounded-none text-white flex items-center px-[11px] text-[11px] font-black"
              style={{ background: row.color }}
            >
              {t(row.labelKey)}
            </div>

            {/* Değer alanları: mobilde 3 dar kolon, md+ ana ızgaranın parçası (contents) */}
            <div className="grid grid-cols-3 gap-[7px] md:contents">
              <input
                value={rowValue.mark}
                onChange={(e) => updateValue(key, "mark", e.target.value)}
                placeholder={t("input.markPlaceholder")}
                className={`${schemaInputBase} ${valueClass(rowValue.mark)}`}
              />
              <input
                value={rowValue.male}
                onChange={(e) => updateValue(key, "male", e.target.value)}
                placeholder={t("input.malePlaceholder")}
                className={`${schemaInputBase} ${valueClass(rowValue.male)}`}
              />
              <input
                value={rowValue.female}
                onChange={(e) => updateValue(key, "female", e.target.value)}
                placeholder={t("input.femalePlaceholder")}
                className={`${schemaInputBase} ${valueClass(rowValue.female)}`}
              />
            </div>
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
  const t = useTranslations("clients.analizler");
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <PlanetPanel title={t("section.before")} scope="before" values={values} updateValue={updateValue} />
      <PlanetPanel title={t("section.after")}  scope="after"  values={values} updateValue={updateValue} />
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
  const t = useTranslations("clients.analizler");
  return (
    <section className="min-w-0 bg-white border border-slate-200 rounded-[12px] p-2 overflow-x-auto">
      <div className="inline-flex text-[#13284b] text-[13px] font-extrabold mb-1.5">
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
          // key = canonical gezegen değeri (DATA, DEĞİŞMEZ); görünen başlık i18n'den.
          <div
            key={planet}
            className="min-h-[98px] rounded-xl flex items-center justify-center text-sky-800 text-[11px] font-black"
            style={{ background: planetColors[index] }}
          >
            {t(planetDisplayKeys[index])}
          </div>
        ))}

        {planetRows.map((row) => (
          <div key={row.key} className="contents">
            {/* Row label background is a runtime data value — must stay inline */}
            <div
              className="min-h-[30px] rounded-full flex items-center px-2 text-white text-[10px] font-black"
              style={{ background: row.color }}
            >
              {t(row.labelKey)}
            </div>

            {planetLabels.map((planet) => {
              const key = `${scope}_${row.key}_${planet}`;
              const value = values[key] || "";
              return (
                <input
                  key={key}
                  value={value}
                  onChange={(e) => updateValue(key, e.target.value)}
                  placeholder={t("input.planetPlaceholder")}
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
  const t = useTranslations("clients.analizler");
  return (
    // Kurumsal görünüm: gradient/buttonColor prop’ları geriye dönük uyum için korunur, yüzey nötr kCard.
    <div className={dyp.kCard} style={{ outlineColor: buttonColor, ["--dy-card-accent" as string]: gradient }}>
      <div className={dyp.kEyebrow}>{badge}</div>
      <h3 className={`${dyp.kTitle} mt-2`}>{title}</h3>
      <p className={`${dyp.kDesc} mt-2`}>{text}</p>
      {/* Ana eylem: kBtnPrimary (lacivert) */}
      <button
        type="button" onClick={onOpen}
        className={`${dyp.kBtnPrimary} mt-3`}
      >
        {t("card.openButton")}
      </button>
    </div>
  );
}
