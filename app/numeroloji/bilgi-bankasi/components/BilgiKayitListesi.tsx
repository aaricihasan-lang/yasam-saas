"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { requiresBulkDeleteGuard, runBulkDeleteConfirm } from "@/lib/ui/bulkDeleteGuard";
import AdminTransferBadge from "@/components/provenance/AdminTransferBadge";
import { useToast } from "@/components/ui/ToastProvider";
import { ANALIZ_TURU_FILTER_OPTIONS } from "../helpers/bilgiBankaLabels";
import { isMobileViewport, mobileKayitKimligi } from "../../helpers/mobileUxLogic";
import {
  deleteBilgiBankaKayit,
  deleteBilgiBankaKayitlari,
  listBilgiBankaKayitlari,
  type BilgiBankaListeSatir,
} from "../helpers/bilgiBankaKayit";
import { KayitDetayModal } from "./KayitDetayModal";
import { MobileSilmeDialog } from "./MobileSilmeDialog";
import { gorunenSeciliSatirlar, hesaplaKbSilmeEtkisi, kbSilmeEtkisiMetni, kbSilmeOnayMetni, type KbSilmeEtkisi } from "../helpers/kbDeleteImpact";
import { listAllSourceEntries } from "../helpers/sourceEntriesApi";
import { listAllRecordSources } from "../helpers/sourcesApi";
import { WordSectionPicker } from "./WordSectionPicker";
import type { WordSections } from "../helpers/wordSectionLogic";
import { downloadFileResponse } from "@/lib/http/downloadResponse";
import { reportFileDate } from "@/lib/time/reportTime";
import { kbValueDisplay, type KbValueT } from "../helpers/kbValueDisplay";

type KayitTuru = BilgiBankaListeSatir["kayitTuru"];

// I18N: filtre değerleri kanonik koddur (kayitTuru); görünen ad numerology.knowledge.list.* (TR birebir).
const KAYIT_TURU_FILTRE = [
  { value: "" },
  { value: "aciklama" },
  { value: "dogaltas" },
] as const;

// NKB-V2-H: premium-kompakt yoğunluk (dev padding/font/min-h/blur küçültüldü; butonlar ≥44px).
const filterLabelClass = "mb-2 block text-sm font-bold text-slate-800";

const filterFieldClass =
  "h-11 w-full rounded-xl border-2 border-violet-200/90 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-purple-200 transition focus:border-violet-400 focus:ring-2 focus:ring-violet-300/50";

const searchInputClass = `${filterFieldClass} min-w-0 placeholder:text-sm placeholder:text-slate-400 xl:min-w-[380px]`;

const refreshButtonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-5 text-sm font-bold text-white shadow-md ring-2 ring-violet-300/40 transition hover:brightness-105 xl:w-auto xl:shrink-0";

const checkboxClass =
  "h-5 w-5 cursor-pointer rounded-md border-2 border-violet-400/90 bg-white text-violet-600 shadow-sm ring-1 ring-violet-100/70 transition focus:ring-violet-500";

const detayBtnClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-violet-500/90 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:brightness-110 hover:shadow-md";

const silBtnClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-rose-500/90 bg-gradient-to-r from-rose-600 to-red-600 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:brightness-110 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50";

const tableThClass =
  "border-b-2 border-violet-200/90 bg-violet-100/80 px-4 py-2.5 text-xs font-black tracking-[0.1em] text-violet-800";

const tableTdClass =
  "border-b border-violet-200/70 px-4 py-3 text-sm font-semibold leading-6 text-slate-700 transition group-hover:border-violet-300";

const bilgiKolonMetinClass =
  "line-clamp-2 text-sm font-medium leading-6 text-slate-700";

const kayitTuruRozetClass =
  "inline-block rounded-full px-3 py-1 text-xs font-black shadow-sm ring-1";

const secilileriSilBtnClass =
  "inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-rose-400/90 bg-gradient-to-r from-rose-600 to-red-700 px-5 py-2 text-sm font-bold text-white shadow-md ring-2 ring-rose-200/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-slate-300 disabled:from-slate-400 disabled:to-slate-500 disabled:text-slate-100 disabled:opacity-60 disabled:shadow-none";

function kayitTuruBadge(tur: KayitTuru) {
  if (tur === "aciklama") {
    return "bg-violet-100 text-violet-900 ring-violet-200/80";
  }
  return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
}

type ListT = ReturnType<typeof useTranslations>;

/**
 * I18N — EN silme onay/etki metinleri. TR'de helpers/kbDeleteImpact (kbSilmeOnayMetni / kbSilmeEtkisiMetni)
 * AYNEN kullanılır (TR birebir); bu iki saf yardımcı aynı yapıyı (≤10 madde + "+N", etki, geri alınamaz) EN'de kurar.
 */
const OZET_LIMIT = 10;
function enSatirEtiketi(t: ListT, r: BilgiBankaListeSatir): string {
  return t("list.confirm.rowLabel", { type: analizTuruGoster(t, r), value: kbValueDisplay(r.deger, ((k, x) => t(`valueDisplay.${k}` as never, x as never)) as KbValueT), kind: t(`list.confirm.rowKind.${r.kayitTuru}`) });
}
function enSilmeEtkisiMetni(t: ListT, satirlar: readonly BilgiBankaListeSatir[], etki: KbSilmeEtkisi): string {
  if (!satirlar.some((r) => r.kayitTuru === "aciklama")) return "";
  if (etki.notSayisi === null || etki.baglantiSayisi === null) return t("list.confirm.impactUnknown");
  if (etki.notSayisi === 0 && etki.baglantiSayisi === 0) return "";
  return t("list.confirm.impact", { notes: etki.notSayisi, links: etki.baglantiSayisi });
}
function enSilmeOnayMetni(t: ListT, satirlar: readonly BilgiBankaListeSatir[], etki: KbSilmeEtkisi): string {
  const n = satirlar.length;
  const lines: string[] = [];
  if (n === 1) lines.push(t("list.confirm.one", { label: enSatirEtiketi(t, satirlar[0]) }));
  else {
    lines.push(t("list.confirm.many", { count: n }));
    for (const r of satirlar.slice(0, OZET_LIMIT)) lines.push(`• ${enSatirEtiketi(t, r)}`);
    if (n > OZET_LIMIT) lines.push(t("list.confirm.more", { count: n - OZET_LIMIT }));
  }
  const etkiMetni = enSilmeEtkisiMetni(t, satirlar, etki);
  if (etkiMetni) lines.push("", etkiMetni);
  lines.push("", t("list.confirm.irreversible"));
  return lines.join("\n");
}

/** Analiz türü gösterimi: kod biliniyorsa katalogdan (TR değerleri ANALIZ_TURU_LABELS ile birebir), yoksa satırdaki etiket. */
function analizTuruGoster(t: ListT, r: Pick<BilgiBankaListeSatir, "analizTuruKey" | "analizTuru">): string {
  return t.has(`shared.analysisTypes.${r.analizTuruKey}`) ? t(`shared.analysisTypes.${r.analizTuruKey}`) : r.analizTuru;
}

export function BilgiKayitListesi() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const t = useTranslations("numerology.knowledge");
  // I18N: TR'de yardımcı ve sunucu metinleri birebir (isSourceLocale); EN'de katalog / modül genel hata metni.
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const turGoster = (r: Pick<BilgiBankaListeSatir, "analizTuruKey" | "analizTuru">): string =>
    isSourceLocale ? r.analizTuru : analizTuruGoster(t, r);
  // I18N-F1-R5: kanonik değer (DB eşleşme anahtarı) DEĞİŞMEZ; yalnız görünen etiket ekran dilinde.
  const kbView = (v: string): string => (isSourceLocale ? v : kbValueDisplay(v, ((k, x) => t(`valueDisplay.${k}` as never, x as never)) as KbValueT));
  const onayMetni = (satirlar: BilgiBankaListeSatir[], etki: KbSilmeEtkisi): string =>
    isSourceLocale ? kbSilmeOnayMetni(satirlar, etki) : enSilmeOnayMetni(t, satirlar, etki);
  const etkiMetni = (satirlar: BilgiBankaListeSatir[], etki: KbSilmeEtkisi): string =>
    isSourceLocale ? kbSilmeEtkisiMetni(satirlar, etki) : enSilmeEtkisiMetni(t, satirlar, etki);
  const [kayitTuruFiltre, setKayitTuruFiltre] = useState("");
  const [analizTuruFiltre, setAnalizTuruFiltre] = useState("");
  const [arama, setArama] = useState("");
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set());
  const [tumSatirlar, setTumSatirlar] = useState<BilgiBankaListeSatir[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [detayRow, setDetayRow] = useState<BilgiBankaListeSatir | null>(null);
  const [siliniyorId, setSiliniyorId] = useState<string | null>(null);
  const [topluSiliniyor, setTopluSiliniyor] = useState(false);
  const topluSilBusyRef = useRef(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [wordPicker, setWordPicker] = useState<{ mode: "all" | "filtered" } | null>(null);
  // NUM-MOB-1: mobil iki-aşamalı silme hedefi (masaüstü confirm akışı değişmez).
  const [mobilSilHedef, setMobilSilHedef] = useState<
    { mode: "tek"; row: BilgiBankaListeSatir } | { mode: "toplu" } | null
  >(null);
  const [mobilSilEk, setMobilSilEk] = useState("");

  const yukleListe = useCallback(async () => {
    setYukleniyor(true);
    const { rows, error } = await listBilgiBankaKayitlari();
    setYukleniyor(false);
    if (error) {
      // AŞAMA 1 P3: okuma hatası "boş bilgi bankası" gibi görünmesin; doğru mesaj.
      showToast({ message: t("list.loadError"), type: "error" });
      setTumSatirlar([]);
      return;
    }
    setTumSatirlar(rows);
    setSeciliIds(new Set());
  }, [showToast, t]);

  const detayGuncelleVeYenile = useCallback(async () => {
    const { rows, error } = await listBilgiBankaKayitlari();
    if (error) {
      showToast({ message: t("list.refreshError"), type: "error" });
      return;
    }
    setTumSatirlar(rows);
    setDetayRow((prev) => (prev ? rows.find((r) => r.id === prev.id) ?? null : null));
  }, [showToast, t]);

  useEffect(() => {
    // Standart "external data load" effect'i (HEAD'de de aynı eslint hatası vardı; davranış değişmedi).
    // Repo genelindeki bilinçli suppression deseni (bkz. KaynakNotlariYonetimi / useKulvarSources).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void yukleListe();
  }, [yukleListe]);

  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return tumSatirlar.filter((row) => {
      if (kayitTuruFiltre && row.kayitTuru !== kayitTuruFiltre) return false;
      if (analizTuruFiltre && row.analizTuruKey !== analizTuruFiltre) return false;
      if (q && !row.aramaMetni.includes(q)) return false;
      return true;
    });
  }, [tumSatirlar, kayitTuruFiltre, analizTuruFiltre, arama]);

  const hicKayitYok = !yukleniyor && tumSatirlar.length === 0;
  const filtreBos = !yukleniyor && !hicKayitYok && filtrelenmis.length === 0;

  // NUM-F07: silme/sayım YALNIZ görünen (filtreden geçen) ∩ seçili satırlar üzerinden yapılır;
  // filtre yüzünden ekranda olmayan seçili kayıt ASLA silinmez.
  const seciliSatirlar = useMemo(
    () => gorunenSeciliSatirlar(filtrelenmis, seciliIds),
    [filtrelenmis, seciliIds],
  );
  const seciliSayisi = seciliSatirlar.length;

  const filtrelenmisHepsiSecili = useMemo(() => {
    if (filtrelenmis.length === 0) return false;
    return filtrelenmis.every((r) => seciliIds.has(r.id));
  }, [filtrelenmis, seciliIds]);

  function toggleSec(id: string) {
    setSeciliIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTumunu() {
    if (filtrelenmisHepsiSecili) {
      setSeciliIds((prev) => {
        const next = new Set(prev);
        for (const r of filtrelenmis) next.delete(r.id);
        return next;
      });
    } else {
      setSeciliIds((prev) => {
        const next = new Set(prev);
        for (const r of filtrelenmis) next.add(r.id);
        return next;
      });
    }
  }

  // Toplu silme çekirdeği (onay UI'sından bağımsız). Masaüstü confirm ve mobil
  // iki-kapılı dialog aynı çekirdeği çağırır → tek delete API çağrısı.
  async function silTopluUygula() {
    const knowledgeIds = seciliSatirlar
      .filter((r) => r.kayitTuru === "aciklama")
      .map((r) => r.recordId);
    const stoneIds = seciliSatirlar
      .filter((r) => r.kayitTuru === "dogaltas")
      .map((r) => r.recordId);

    setTopluSiliniyor(true);
    const { error } = await deleteBilgiBankaKayitlari(knowledgeIds, stoneIds);
    setTopluSiliniyor(false);

    if (error) {
      showToast({ message: isSourceLocale ? t("list.bulkDeleteFailed", { error: String(error) }) : t("list.bulkDeleteFailedGeneric"), type: "error" });
      // İki aşamalı silmede bir kısmı silinmiş olabilir → liste sunucudan tazelenir (bayat satır kalmaz).
      void yukleListe();
      return;
    }

    showToast({ message: t("list.bulkDeleted"), type: "success" });
    if (detayRow && seciliIds.has(detayRow.id)) setDetayRow(null);
    setSeciliIds(new Set());
    void yukleListe();
  }

  // NUM-F08: açıklama kaydı silinince bağlı kaynak notları + bağlantılar DB cascade ile silinir;
  // onaydan ÖNCE etkisi sayılır ve kullanıcıya açıkça gösterilir.
  async function silmeEtkisiGetir(satirlar: BilgiBankaListeSatir[]): Promise<KbSilmeEtkisi> {
    if (!satirlar.some((r) => r.kayitTuru === "aciklama")) return { notSayisi: 0, baglantiSayisi: 0 };
    const [notlar, baglantilar] = await Promise.all([listAllSourceEntries(), listAllRecordSources()]);
    return hesaplaKbSilmeEtkisi(
      satirlar,
      notlar.error ? null : notlar.rows,
      baglantilar.error ? null : baglantilar.rows,
    );
  }

  async function mobilSilAc(hedef: { mode: "tek"; row: BilgiBankaListeSatir } | { mode: "toplu" }) {
    const satirlar = hedef.mode === "tek" ? [hedef.row] : seciliSatirlar;
    const etki = await silmeEtkisiGetir(satirlar);
    setMobilSilEk(etkiMetni(satirlar, etki));
    setMobilSilHedef(hedef);
  }

  async function handleSecilileriSil() {
    if (seciliSayisi === 0 || topluSilBusyRef.current) return;
    topluSilBusyRef.current = true;
    try {
      const hedef = seciliSatirlar;
      const etki = await silmeEtkisiGetir(hedef);

      // 3+ kayıt → sistem geneli 3 aşamalı toplu silme (masaüstü + mobil aynı akış).
      const ok = requiresBulkDeleteGuard(hedef.length)
        ? await runBulkDeleteConfirm(confirm, { count: hedef.length, detail: onayMetni(hedef, etki) })
        : await confirm({
            title: t("list.deleteSelectedTitle"),
            message: onayMetni(hedef, etki),
            tone: "danger",
            confirmText: t("shared.delete"),
            cancelText: t("shared.cancel"),
          });
      if (!ok) return;
      await silTopluUygula();
    } finally {
      topluSilBusyRef.current = false;
    }
  }

  /**
   * Toplu silme tetikleyici: yalnız viewport genişliğine göre (PWA'dan bağımsız).
   * 1–2 kayıt: mobilde (<768) iki-kapılı dialog, md+ masaüstünde mevcut confirm akışı.
   * 3+ kayıt: her cihazda 3 aşamalı toplu silme akışı.
   */
  function topluSilTetikle() {
    if (seciliSayisi === 0) return;
    const mobil = typeof window !== "undefined" && isMobileViewport(window.innerWidth);
    if (mobil && !requiresBulkDeleteGuard(seciliSayisi)) void mobilSilAc({ mode: "toplu" });
    else void handleSecilileriSil();
  }

  async function exportKnowledgeWord(mode: "all" | "filtered", sections: WordSections) {
    const { resolveNumerolojiUserAndTenant } = await import("../../helpers/numerolojiKayit");
    const { authHeaders } = await import("../../helpers/numApiClient");
    const session = await resolveNumerolojiUserAndTenant();
    if (!session) {
      showToast({ title: t("list.errorTitle"), message: t("list.noSession"), type: "error" });
      return;
    }

    setWordBusy(true);
    try {
      // NUM-001: kimlik/tenant body'ye KONMAZ; sunucu oturumdan çözer (authHeaders).
      const body: Record<string, unknown> = { exportMode: mode, sections };
      if (mode === "filtered") {
        body.knowledgeIds = filtrelenmis.filter((r) => r.kayitTuru === "aciklama").map((r) => r.recordId);
        body.stoneIds = filtrelenmis.filter((r) => r.kayitTuru === "dogaltas").map((r) => r.recordId);
      }
      const res = await fetch("/api/numeroloji/knowledge-report", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        showToast({ title: t("list.errorTitle"), message: (isSourceLocale ? err.error : undefined) || t("list.reportFailed"), type: "error" });
        return;
      }
      await downloadFileResponse(res, `numeroloji-bilgi-bankasi-${mode === "filtered" ? "filtreli" : "tumu"}-${reportFileDate()}.docx`);
      showToast({ title: t("list.successTitle"), message: t("list.reportDownloaded"), type: "success" });
      setWordPicker(null);
    } catch (err) {
      showToast({ title: t("list.errorTitle"), message: err instanceof Error ? err.message : t("shared.unknownError"), type: "error" });
    } finally {
      setWordBusy(false);
    }
  }

  // Tek kayıt silme çekirdeği (onay UI'sından bağımsız).
  async function silTekUygula(row: BilgiBankaListeSatir) {
    setSiliniyorId(row.id);
    const { error } = await deleteBilgiBankaKayit(row.kayitTuru, row.recordId);
    setSiliniyorId(null);

    if (error) {
      showToast({ message: isSourceLocale ? t("list.deleteFailed", { error: String(error) }) : t("list.deleteFailedGeneric"), type: "error" });
      void yukleListe();
      return;
    }

    showToast({ message: t("list.deleted"), type: "success" });
    if (detayRow?.id === row.id) setDetayRow(null);
    void yukleListe();
  }

  async function handleSil(row: BilgiBankaListeSatir) {
    const etki = await silmeEtkisiGetir([row]);
    const ok = await confirm({
      title: t("list.deleteOneTitle"),
      message: onayMetni([row], etki),
      tone: "danger",
      confirmText: t("shared.delete"),
      cancelText: t("shared.cancel"),
    });
    if (!ok) return;
    await silTekUygula(row);
  }

  return (
    <div className="space-y-8">
      {/* NUM-MOB-2-FIX1: mobilde filtre kabı kutusuz (form kontrolleri sınırını korur); md+ kart. */}
      <div className="px-[clamp(8px,2.5vw,14px)] py-0 md:rounded-2xl md:border-2 md:border-violet-200/80 md:bg-white/95 md:p-5 md:shadow-lg md:ring-1 md:ring-purple-200 md:backdrop-blur-md">
        <div className="grid grid-cols-1 gap-3 md:gap-4 xl:grid-cols-2 xl:items-end 2xl:grid-cols-[1.1fr_1.1fr_2fr_auto_1.3fr]">
          {/* NUM-MOB-1: Kayıt türü filtresi mobilde gizli (veri/mantık korunur, yalnız sunum). */}
          <div className="hidden min-w-0 md:block">
            <label htmlFor="liste-kayit-turu" className={filterLabelClass}>
              {t("list.filterRecordType")}
            </label>
            <select
              id="liste-kayit-turu"
              value={kayitTuruFiltre}
              onChange={(e) => setKayitTuruFiltre(e.target.value)}
              className={filterFieldClass}
            >
              {KAYIT_TURU_FILTRE.map((opt) => (
                <option key={opt.value || "tum"} value={opt.value}>
                  {opt.value ? t(`list.recordTypes.${opt.value}`) : t("list.recordTypeAll")}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="liste-analiz-turu" className={filterLabelClass}>
              {t("list.filterAnalysisType")}
            </label>
            <select
              id="liste-analiz-turu"
              value={analizTuruFiltre}
              onChange={(e) => setAnalizTuruFiltre(e.target.value)}
              className={filterFieldClass}
            >
              {ANALIZ_TURU_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || "tum"} value={opt.value}>
                  {isSourceLocale
                    ? opt.label
                    : opt.value
                      ? analizTuruGoster(t, { analizTuruKey: opt.value, analizTuru: opt.label })
                      : t("list.analysisTypeAll")}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="liste-arama" className={filterLabelClass}>
              {t("list.filterSearch")}
            </label>
            <input
              id="liste-arama"
              type="search"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              className={searchInputClass}
            />
          </div>

          <div className="min-w-0">
            <span className="mb-2.5 hidden text-base font-bold text-transparent xl:block" aria-hidden>
              {t("list.refreshSpacer")}
            </span>
            <button
              type="button"
              disabled={yukleniyor}
              onClick={() => void yukleListe()}
              className={refreshButtonClass}
            >
              {yukleniyor ? t("shared.loading") : t("list.refresh")}
            </button>
          </div>

          <div className="min-w-0">
            <span className="mb-2.5 block text-base font-bold text-slate-800">{t("list.bulkActions")}</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={seciliSayisi === 0 || topluSiliniyor || yukleniyor}
                onClick={topluSilTetikle}
                className={secilileriSilBtnClass}
              >
                {topluSiliniyor
                  ? t("shared.deleting")
                  : seciliSayisi > 0
                    ? t("list.deleteSelectedCount", { count: seciliSayisi })
                    : t("list.deleteSelected")}
              </button>
              {/* Word butonları Android dahil tüm cihazlarda ve telefon genişliğinde görünür (2026-10-14 owner kararı;
                  HD ve Astroloji kendi kurallarını korur). */}
              <button
                type="button"
                disabled={wordBusy || yukleniyor || tumSatirlar.length === 0}
                onClick={() => setWordPicker({ mode: "all" })}
                className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-blue-300/80 bg-blue-600 px-5 py-2 text-base font-bold text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {wordBusy ? t("list.wordPreparing") : t("list.wordAll")}
              </button>
              {(kayitTuruFiltre || analizTuruFiltre || arama) && (
                <button
                  type="button"
                  disabled={wordBusy || filtrelenmis.length === 0}
                  onClick={() => setWordPicker({ mode: "filtered" })}
                  className="inline-flex min-h-[3.25rem] items-center justify-center rounded-2xl border-2 border-violet-300/80 bg-violet-600 px-5 py-2 text-base font-bold text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {wordBusy ? t("list.wordBusyShort") : t("list.wordFiltered", { count: filtrelenmis.length })}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {yukleniyor ? (
        <div className="rounded-[32px] border-2 border-violet-200/80 bg-white/95 px-10 py-20 text-center shadow-xl ring-1 ring-purple-200">
          <p className="text-lg font-medium text-slate-600">{t("list.loadingRecords")}</p>
        </div>
      ) : hicKayitYok ? (
        <div className="rounded-[32px] border-2 border-dashed border-violet-300/80 bg-gradient-to-br from-violet-50/50 to-white/95 px-10 py-20 text-center shadow-xl ring-1 ring-purple-200 backdrop-blur-md sm:py-24">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-violet-200/80 bg-violet-100/70 text-3xl text-violet-700 shadow-inner" aria-hidden>
            ✦
          </div>
          <h3 className="mt-5 text-2xl font-black text-violet-950">{t("list.emptyTitle")}</h3>
          <p className="mx-auto mt-3 max-w-2xl text-base font-medium leading-relaxed text-slate-600 sm:text-lg">
            {t("list.emptyBody")}
          </p>
          <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200/80 bg-white/80 px-5 py-2 text-sm font-bold text-violet-800 shadow-sm">
            {t.rich("list.emptyCta", { tab: (c) => <span className="rounded-md bg-violet-100 px-2 py-0.5 text-violet-900">{c}</span> })}
          </p>
        </div>
      ) : filtreBos ? (
        <div className="rounded-[32px] border-2 border-dashed border-amber-200/80 bg-amber-50/40 px-10 py-16 text-center shadow-lg ring-1 ring-amber-100/60">
          <p className="text-lg font-medium text-amber-950/85">{t("list.filterEmpty")}</p>
        </div>
      ) : (
        <>
        {/* NUM-MOB-1: MOBİL kart listesi — tam genişlik, yatay taşma yok, Kayıt Türü/kaynak/rozet yok. */}
        {/* NUM-MOB-2-FIX1: kutusuz düz satırlar — kart/radius/shadow/border yok, ince alt ayraç. */}
        <div className="md:hidden">
          {filtrelenmis.map((row) => {
            const secili = seciliIds.has(row.id);
            return (
              <div
                key={row.id}
                className={`space-y-2 border-b border-violet-100/70 px-1 py-3 transition last:border-b-0 ${
                  secili ? "bg-violet-50/60" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={secili}
                    onChange={() => toggleSec(row.id)}
                    className={`${checkboxClass} shrink-0`}
                    aria-label={t("list.selectRowAria", { label: mobileKayitKimligi({ analizTuru: turGoster(row), deger: kbView(row.deger) }) })}
                  />
                  <p className="min-w-0 flex-1 break-words text-sm font-black leading-snug text-violet-900">
                    {mobileKayitKimligi({ analizTuru: turGoster(row), deger: kbView(row.deger) })}
                  </p>
                </div>
                <AdminTransferBadge originType={row.origin_type} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${detayBtnClass} flex-1`}
                    onClick={() => setDetayRow(row)}
                  >
                    {t("list.detail")}
                  </button>
                  <button
                    type="button"
                    className={`${silBtnClass} flex-1`}
                    disabled={siliniyorId === row.id || topluSiliniyor}
                    onClick={() => void mobilSilAc({ mode: "tek", row })}
                  >
                    {siliniyorId === row.id ? t("shared.deleting") : t("shared.delete")}
                  </button>
                </div>
              </div>
            );
          })}
          <p className="px-1 py-1 text-xs font-medium text-slate-500">
            {t("list.showing", { count: filtrelenmis.length })}
            {tumSatirlar.length !== filtrelenmis.length ? t("list.showingTotal", { total: tumSatirlar.length }) : null}
          </p>
        </div>

        {/* MASAÜSTÜ tablo — md ve üzeri (mevcut tasarım korunur). */}
        <div className="hidden overflow-hidden rounded-2xl border-2 border-violet-200/80 bg-white/95 shadow-lg ring-1 ring-purple-200 backdrop-blur-md md:block">
          <div className="overflow-x-auto p-3 sm:p-4">
            <table className="w-full min-w-[960px] border-separate border-spacing-y-2 text-left">
              <thead>
                <tr>
                  <th className={`w-16 rounded-l-2xl border-2 border-violet-200/90 bg-violet-100/80 ${tableThClass}`}>
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={filtrelenmisHepsiSecili}
                        onChange={toggleTumunu}
                        className={checkboxClass}
                        aria-label={t("list.selectAllAria")}
                      />
                    </div>
                  </th>
                  <th className={tableThClass}>{t("list.colRecordType")}</th>
                  <th className={tableThClass}>{t("list.colAnalysisType")}</th>
                  <th className={tableThClass}>{t("list.colValue")}</th>
                  <th className={`min-w-[220px] ${tableThClass}`}>{t("list.colInfo")}</th>
                  <th className={`rounded-r-2xl border-2 border-violet-200/90 bg-violet-100/80 text-right ${tableThClass}`}>
                    {t("list.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrelenmis.map((row) => {
                  const secili = seciliIds.has(row.id);
                  return (
                  <tr key={row.id} className="group">
                    <td className="rounded-l-xl border-b border-violet-200/70 bg-white/95 px-4 py-3 transition group-hover:border-violet-300 group-hover:bg-violet-50/90">
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={secili}
                          onChange={() => toggleSec(row.id)}
                          className={checkboxClass}
                          aria-label={t("list.selectRowAria", { label: `${turGoster(row)} ${kbView(row.deger)}` })}
                        />
                      </div>
                    </td>
                    <td
                      className={`${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      <span className={`${kayitTuruRozetClass} ${kayitTuruBadge(row.kayitTuru)}`}>
                        {t(`list.recordTypes.${row.kayitTuru}`)}
                      </span>
                      <AdminTransferBadge originType={row.origin_type} className="mt-1 block w-fit" />
                    </td>
                    <td
                      className={`${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      {turGoster(row)}
                    </td>
                    <td
                      className={`${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      {kbView(row.deger)}
                    </td>
                    <td
                      className={`max-w-md ${tableTdClass} ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      <span className={bilgiKolonMetinClass}>{row.bilgiVeyaAciklama}</span>
                    </td>
                    <td
                      className={`rounded-r-xl border-b border-violet-200/70 px-4 py-3 transition group-hover:border-violet-300 ${
                        secili ? "bg-violet-100/70" : "bg-white/95 group-hover:bg-violet-50/90"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          className={detayBtnClass}
                          onClick={() => setDetayRow(row)}
                        >
                          {t("list.detail")}
                        </button>
                        <button
                          type="button"
                          className={silBtnClass}
                          disabled={siliniyorId === row.id || topluSiliniyor}
                          onClick={() => void handleSil(row)}
                        >
                          {siliniyorId === row.id ? t("shared.deleting") : t("shared.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-violet-100/90 px-6 py-4 text-base font-medium text-slate-500">
            {t("list.showing", { count: filtrelenmis.length })}
            {tumSatirlar.length !== filtrelenmis.length
              ? t("list.showingTotal", { total: tumSatirlar.length })
              : null}
          </p>
        </div>
        </>
      )}

      {detayRow ? (
        <KayitDetayModal
          row={detayRow}
          onClose={() => setDetayRow(null)}
          onSaved={detayGuncelleVeYenile}
        />
      ) : null}

      {/* NKB-V2: Word bölüm seçici — en az bir bölüm zorunlu; seçim server'a uygulanır. */}
      <WordSectionPicker
        open={wordPicker !== null}
        busy={wordBusy}
        onCancel={() => setWordPicker(null)}
        onConfirm={(sections) => {
          if (wordPicker) void exportKnowledgeWord(wordPicker.mode, sections);
        }}
      />

      {/* NUM-MOB-1: mobil iki-aşamalı silme onayı (tek + toplu). API yalnız nihai onayda bir kez. */}
      {mobilSilHedef !== null ? (
        <MobileSilmeDialog
          baslik={mobilSilHedef.mode === "toplu" ? t("list.deleteSelectedTitle") : t("list.deleteOneTitle")}
          kimlik={
            mobilSilHedef.mode === "toplu"
              ? t("list.recordCount", { count: seciliSayisi })
              : mobileKayitKimligi({ analizTuru: turGoster(mobilSilHedef.row), deger: kbView(mobilSilHedef.row.deger) })
          }
          ek={mobilSilEk}
          onClose={() => setMobilSilHedef(null)}
          onConfirm={async () => {
            if (mobilSilHedef.mode === "toplu") await silTopluUygula();
            else await silTekUygula(mobilSilHedef.row);
            setMobilSilHedef(null);
          }}
        />
      ) : null}
    </div>
  );
}
