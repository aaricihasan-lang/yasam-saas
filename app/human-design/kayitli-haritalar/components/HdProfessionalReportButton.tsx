"use client";
/**
 * "Profesyonel Word Raporu" — Kayıtlı Harita detayından akış:
 *   (yetkiliyse yorum seçimi) → (Roxy haritasında BodyGraph PNG'si) → snapshot oluştur → DOCX indir.
 * Download başarısız olsa da rapor kaydı korunur (Kayıtlı Raporlar'dan tekrar indirilebilir).
 * Double-submit engellenir (disabled loading state). Ayrı preview sayfası YOK (§47).
 *
 * AŞAMA 4B:
 *   • hd_system_reading yetkisi YOKSA seçim penceresi gösterilmez; uzman bilgileri otomatik dahil.
 *   • Yetki VARSA "Word raporuna hangi yorumlar aktarılsın?" (varsayılan: Her ikisi). Seçim
 *     yalnız tercihtir; yetki SUNUCUDA doğrulanır.
 *   • Roxy haritasında BodyGraph, ekrandaki RESMİ renderer'dan yüksek çözünürlüklü PNG olarak
 *     üretilir; üretilemezse rapor sessizce görselsiz oluşturulmaz — kullanıcı açıkça onaylar.
 * Android kuralı korunur: Word (.docx) indirme UI'si Android'de render edilmez.
 *
 * Satış öncesi akış (analiz ekranı):
 *   • Düğme her zaman "Word İndir". Analizin hazır Word v2 raporu varsa (`existingReportId`)
 *     AYNI donmuş rapor indirilir — yeni kopya / Roxy çağrısı YOK. Yoksa bir kez oluşturulur.
 *   • "Güncel bilgilerle yeni Word oluştur" yalnız bilinçli yeni sürüm içindir.
 *   • `autoStart`: listedeki "Word İndir" analizi açıp akışı bir kez başlatır.
 */
import { useEffect, useRef, useState } from "react";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import type { HdCommentarySelection } from "@/lib/human-design/reporting/reportV2Shared";
import { captureRoxyBodygraphPng } from "@/lib/human-design/reporting/bodygraphCapture";
import {
  createProfessionalReport,
  downloadProfessionalReport,
  HD_REPORT_REDACTED_MESSAGE,
  type CreateResult,
} from "../../kayitli-raporlar/helpers/hdProfessionalReport";
import { canUseHdSystemReading } from "./HdChartKnowledgeTabs";
import { loadRoxyBodygraph } from "./HdRoxyBodygraph";

type Phase = "idle" | "choosing" | "capturing" | "creating" | "downloading" | "done" | "error" | "bodygraph_failed";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Eski tarayıcı yedeği (RFC4122 v4 biçimi).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const CHOICES: { key: HdCommentarySelection; title: string; hint: string }[] = [
  { key: "both", title: "Her ikisi", hint: "Uzman Bilgilerim ve Sistem Yorumu ayrı bölümlerde." },
  { key: "expert", title: "Yalnız Uzman Bilgilerim", hint: "Bilgi Bankanızdaki eşleşen kayıtlar." },
  { key: "system", title: "Yalnız Sistem Yorumu", hint: "Harita hesaplanırken kaydedilen sistem açıklamaları." },
];

function successMessage(created: Extract<CreateResult, { ok: true }>, redacted: boolean): string {
  const notes: string[] = ["Rapor indirildi."];
  if (created.bodygraph === "missing") notes.push("Bu rapor BodyGraph görseli OLMADAN oluşturuldu.");
  else if (created.bodygraph === "uploaded_image") notes.push("BodyGraph yerine danışan profilindeki harita görseli kullanıldı.");
  if (created.systemReading === "unavailable") notes.push("Bu haritada kayıtlı Sistem Yorumu verisi olmadığından yalnız Uzman Bilgilerim eklendi.");
  if (created.expertEntries === 0 && created.systemReading !== "included") notes.push("Bilgi Bankanızda bu haritayla eşleşen kayıt yok; rapor teknik bilgilerle oluşturuldu.");
  if (redacted) notes.push(HD_REPORT_REDACTED_MESSAGE);
  notes.push("Bu analizde “Word İndir” ile veya Kayıtlı Raporlar'dan tekrar indirebilirsiniz.");
  return notes.join(" ");
}

export function HdProfessionalReportButton({
  chartId,
  label,
  roxyRender,
  existingReportId = null,
  lookupPending = false,
  autoStart = false,
}: {
  chartId: string;
  label?: string;
  /** Roxy haritasının KAYITLI yapısal render yükü (varsa BodyGraph PNG'si bundan üretilir). */
  roxyRender?: Record<string, unknown> | null;
  /** Bu analizin hazır Word v2 raporu (varsa "Word İndir" onu indirir; yeni kopya oluşmaz). */
  existingReportId?: string | null;
  /** Hazır rapor araması sürüyor → düğme kısa süre bekler (yanlışlıkla kopya oluşmasın). */
  lookupPending?: boolean;
  /** Açılışta akışı bir kez başlat (listedeki "Word İndir"). */
  autoStart?: boolean;
}) {
  const isAndroid = useIsAndroid();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  // Görünürlük için istemci kapısı; asıl karar sunucuda (hd_system_reading).
  const [canSystem] = useState(canUseHdSystemReading);
  const [choice, setChoice] = useState<HdCommentarySelection>("both");
  // P2-2: bir kullanıcı eylemi = bir istek kimliği. Hata sonrası tekrar denemede AYNI kimlik
  // kullanılır (sunucu ikinci satır oluşturmaz). Başarıdan sonra aynı rapor yeniden indirilir;
  // yeni rapor yalnız bilinçli "Yeni sürüm oluştur" ile (yeni kimlik) oluşur.
  const requestIdRef = useRef<string | null>(null);
  const pendingModeRef = useRef<"default" | "newVersion">("default");
  const [createdReportId, setCreatedReportId] = useState<string | null>(existingReportId);
  // Hazır rapor kimliği sonradan (asenkron arama) gelirse benimsenir; oluşturulmuş rapor ezilmez.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dış (sunucu) rapor kimliği senkronu
    if (existingReportId) setCreatedReportId((cur) => cur ?? existingReportId);
  }, [existingReportId]);
  const busyRef = useRef(false);
  const busy = phase === "capturing" || phase === "creating" || phase === "downloading";
  const systemAvailable = !!roxyRender;

  async function download(reportId: string, created: Extract<CreateResult, { ok: true }> | null) {
    setPhase("downloading");
    const dl = await downloadProfessionalReport(reportId);
    if (!dl.ok) {
      setPhase("error");
      setMessage(`Rapor kaydedildi ancak indirilemedi: ${dl.error} Tekrar indirmeyi deneyin veya Kayıtlı Raporlar'ı kullanın.`);
      return;
    }
    setPhase("done");
    setMessage(
      created
        ? successMessage(created, dl.systemReadingRedacted)
        : dl.systemReadingRedacted
          ? `Rapor indirildi. ${HD_REPORT_REDACTED_MESSAGE}`
          : "Word raporu indirildi (kayıtlı rapor; yeni hesaplama yapılmadı).",
    );
  }

  async function run(opts: { commentary?: HdCommentarySelection; allowMissingBodygraph?: boolean }) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setMessage("");
      if (pendingModeRef.current === "newVersion" || !requestIdRef.current) requestIdRef.current = newRequestId();
      pendingModeRef.current = "default";

      let bodygraphPng: string | undefined;
      if (roxyRender && !opts.allowMissingBodygraph) {
        setPhase("capturing");
        const cap = await captureRoxyBodygraphPng(roxyRender, loadRoxyBodygraph);
        if (!cap.ok) {
          setPhase("bodygraph_failed");
          setMessage(`${cap.error} Tekrar deneyebilir ya da raporu BodyGraph görseli olmadan oluşturabilirsiniz.`);
          return;
        }
        bodygraphPng = cap.dataUrl;
      }

      setPhase("creating");
      const created = await createProfessionalReport(chartId, requestIdRef.current ?? undefined, {
        commentary: opts.commentary,
        bodygraphPng,
        allowMissingBodygraph: opts.allowMissingBodygraph,
      });
      if (!created.ok) {
        setPhase(created.code === "BODYGRAPH_REQUIRED" ? "bodygraph_failed" : "error");
        setMessage(created.error);
        return; // requestId korunur → tekrar deneme aynı rapor kimliğini kullanır
      }
      setCreatedReportId(created.id);
      await download(created.id, created);
    } finally {
      busyRef.current = false;
    }
  }

  // Son kullanıcı seçimi (yeniden deneme / görselsiz onay aynı seçimle sürer).
  const lastCommentaryRef = useRef<HdCommentarySelection | undefined>(undefined);

  function start(mode: "default" | "newVersion") {
    if (busyRef.current) return;
    // Rapor zaten oluşturulduysa varsayılan eylem AYNI raporu yeniden indirmektir.
    if (mode === "default" && createdReportId) {
      busyRef.current = true;
      setMessage("");
      void download(createdReportId, null).finally(() => {
        busyRef.current = false;
      });
      return;
    }
    pendingModeRef.current = mode;
    if (canSystem) {
      setChoice(systemAvailable ? "both" : "expert");
      setPhase("choosing");
      return;
    }
    lastCommentaryRef.current = undefined;
    void run({});
  }

  function confirmChoice() {
    const c: HdCommentarySelection = systemAvailable ? choice : "expert";
    lastCommentaryRef.current = c;
    void run({ commentary: c });
  }

  // Listeden "Word İndir": hazır rapor araması bitince akış BİR KEZ başlar.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || lookupPending || isAndroid || autoStartedRef.current) return;
    autoStartedRef.current = true;
    start("default");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız hazır olunca bir kez
  }, [autoStart, lookupPending, isAndroid]);

  if (isAndroid) return null;
  return (
    <div className="no-android flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => start("default")}
        disabled={busy || lookupPending}
        aria-busy={busy || lookupPending}
        data-hd-word-download
        className="flex h-9 items-center rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-sm font-black uppercase tracking-wide text-white no-underline shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === "capturing"
          ? "BodyGraph hazırlanıyor…"
          : phase === "creating"
            ? "Rapor hazırlanıyor…"
            : phase === "downloading"
              ? "İndiriliyor…"
              : createdReportId
                ? "Word İndir"
                : label ?? "Word İndir"}
      </button>
      {createdReportId && !busy ? (
        <button
          type="button"
          onClick={() => start("newVersion")}
          className="self-start text-[11px] font-bold text-emerald-700 underline-offset-2 hover:underline"
        >
          Güncel bilgilerle yeni Word oluştur
        </button>
      ) : null}
      {phase === "bodygraph_failed" ? (
        <div className="flex flex-wrap gap-2" data-hd-bodygraph-failed>
          <button
            type="button"
            onClick={() => void run({ commentary: lastCommentaryRef.current })}
            className="h-8 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
          >
            Tekrar dene
          </button>
          <button
            type="button"
            onClick={() => void run({ commentary: lastCommentaryRef.current, allowMissingBodygraph: true })}
            className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            BodyGraph olmadan oluştur
          </button>
        </div>
      ) : null}
      {message ? (
        <p
          className={`max-w-md text-xs font-semibold ${phase === "error" || phase === "bodygraph_failed" ? "text-rose-600" : "text-emerald-700"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}

      {phase === "choosing" ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhase("idle");
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hd-word-commentary-title"
            data-hd-word-commentary
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation(); // dış harita modalı kapanmasın
                setPhase("idle");
              }
            }}
            className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5"
          >
            <h3 id="hd-word-commentary-title" className="text-base font-black text-slate-900">
              Word raporuna hangi yorumlar aktarılsın?
            </h3>
            {!systemAvailable ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" data-hd-system-unavailable>
                Bu haritada kayıtlı Sistem Yorumu verisi yok (manuel ya da eski kayıt). Rapor yalnız Uzman Bilgilerim ile oluşturulabilir.
              </p>
            ) : null}
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">Yorum kaynağı</legend>
              {CHOICES.map((c) => {
                const disabled = !systemAvailable && c.key !== "expert";
                const checked = (systemAvailable ? choice : "expert") === c.key;
                return (
                  <label
                    key={c.key}
                    className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
                      checked ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`hd-word-commentary-${chartId}`}
                      value={c.key}
                      checked={checked}
                      disabled={disabled}
                      autoFocus={checked}
                      onChange={() => setChoice(c.key)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{c.title}</span>
                      <span className="block text-xs text-slate-500">{c.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={confirmChoice}
                className="h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 text-sm font-black text-white shadow-sm hover:brightness-105"
              >
                Raporu oluştur
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
