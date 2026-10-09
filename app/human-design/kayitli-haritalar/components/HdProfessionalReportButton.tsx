"use client";
/**
 * "Profesyonel Word Raporu" — Kayıtlı Harita detayından akış:
 *   (yetkiliyse yorum seçimi) → (Roxy haritasında BodyGraph PNG'si) → snapshot oluştur → DOCX indir.
 * Download başarısız olsa da rapor kaydı korunur (Kayıtlı Raporlar'dan tekrar indirilebilir).
 * Double-submit engellenir (disabled loading state). Ayrı preview sayfası YOK (§47).
 *
 * İçerik seçimi (gizlilik düzenlemesi 2026-10-09):
 *   • Yeni Word her oluşturulduğunda "Word raporuna neler eklensin?" penceresi açılır; iki seçenek
 *     de VARSAYILAN KAPALI gelir (önceki seçim hatırlanmaz):
 *       [ ] Bilgi Bankamdaki Açıklamaları Ekle   [ ] Sistem Yorumunu Ekle (yalnız yetkiliye)
 *     Hiçbiri seçilmezse rapor teknik harita içeriğiyle oluşturulur. Seçim yalnız tercihtir;
 *     yetki ve "Özel Çalışma Notları asla" kuralı SUNUCUDA uygulanır.
 *   • "Raporu Hazırlayan" (isteğe bağlı, her yeni Word'de boş): yalnız bu rapora donar; boşsa
 *     raporda "Hazırlayan" satırı olmaz (profil adı otomatik yazılmaz).
 *   • Bilgi Bankası seçiliyken eşleşen aktif açıklama yoksa pencerede uyarı (Word'e eklenmez).
 *   • Roxy haritasında BodyGraph, ekrandaki RESMİ renderer'dan yüksek çözünürlüklü PNG olarak
 *     üretilir; üretilemezse rapor sessizce görselsiz oluşturulmaz — kullanıcı açıkça onaylar.
 * Android kuralı korunur: Word (.docx) indirme UI'si Android'de render edilmez.
 *
 * Satış öncesi akış (analiz ekranı):
 *   • Analizin kayıtlı Word v2 raporu varsa (`existingReportId`) ana düğme "Kayıtlı Word'ü İndir":
 *     AYNI donmuş rapor indirilir (içerik değiştirilmez; yeni kopya / Roxy çağrısı YOK).
 *     Yoksa ana düğme "Yeni Word Oluştur".
 *   • "Yeni Word oluştur (içerik seçerek)" bilinçli yeni sürüm içindir; kayıtlı Word'den AYRIDIR.
 *   • `autoStart`: listeden gelen istek analizi açıp akışı bir kez başlatır.
 */
import { useEffect, useRef, useState } from "react";
import { useIsAndroid } from "@/hooks/useIsAndroid";
import { commentaryFromFlags, type HdCommentarySelection } from "@/lib/human-design/reporting/reportV2Shared";
import { captureRoxyBodygraphPng } from "@/lib/human-design/reporting/bodygraphCapture";
import {
  createProfessionalReport,
  downloadProfessionalReport,
  fetchKnowledgeMatchCount,
  HD_REPORT_REDACTED_MESSAGE,
  type CreateResult,
} from "../../kayitli-raporlar/helpers/hdProfessionalReport";
import { HD_PREPARED_BY_MAX } from "@/lib/human-design/reporting/reportV2Shared";
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

function successMessage(created: Extract<CreateResult, { ok: true }>, redacted: boolean, requested: HdCommentarySelection): string {
  const notes: string[] = ["Yeni Word raporu oluşturuldu ve indirildi."];
  if (created.bodygraph === "missing") notes.push("Bu rapor BodyGraph görseli OLMADAN oluşturuldu.");
  else if (created.bodygraph === "uploaded_image") notes.push("BodyGraph yerine danışan profilindeki harita görseli kullanıldı.");
  const wantedKnowledge = requested === "expert" || requested === "both";
  const wantedSystem = requested === "system" || requested === "both";
  if (wantedSystem && created.systemReading === "unavailable") notes.push("Bu analizde kayıtlı Sistem Yorumu olmadığından Sistem Yorumu eklenmedi.");
  if (wantedKnowledge && created.expertEntries === 0) notes.push("Bilgi Bankanızda bu analizle eşleşen aktif açıklama bulunmadığından açıklama eklenmedi.");
  if (!wantedKnowledge && !wantedSystem) notes.push("Rapor teknik harita bilgileriyle oluşturuldu (açıklama / sistem yorumu seçilmedi).");
  if (redacted) notes.push(HD_REPORT_REDACTED_MESSAGE);
  notes.push("Bu analizde “Kayıtlı Word'ü İndir” ile veya Kayıtlı Raporlar'dan tekrar indirebilirsiniz.");
  return notes.join(" ");
}

/** Önceden oluşturulmuş kayıtlı raporun indirildiğini açıkça söyler. */
export const HD_SAVED_WORD_MESSAGE = "Önceden oluşturulmuş kayıtlı Word raporu indirildi; içeriği değiştirilmedi.";

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
  // İçerik seçimi: pencere her açıldığında İKİSİ DE KAPALI başlar (önceki seçim hatırlanmaz).
  const [addKnowledge, setAddKnowledge] = useState(false);
  const [addSystem, setAddSystem] = useState(false);
  // "Raporu Hazırlayan": her yeni Word için BOŞ başlar (başka rapora / danışana taşınmaz).
  const [preparedBy, setPreparedBy] = useState("");
  // Bu analizle eşleşen aktif Bilgi Bankası açıklaması sayısı (pencere açılınca okunur; yalnız sayı).
  const [kbMatch, setKbMatch] = useState<number | null | "loading">(null);
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
  // Son kullanıcı seçimi (yeniden deneme / görselsiz onay aynı seçimle sürer).
  const lastCommentaryRef = useRef<HdCommentarySelection | undefined>(undefined);
  const lastPreparedByRef = useRef<string>("");
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
        ? successMessage(created, dl.systemReadingRedacted, lastCommentaryRef.current ?? "none")
        : dl.systemReadingRedacted
          ? `${HD_SAVED_WORD_MESSAGE} ${HD_REPORT_REDACTED_MESSAGE}`
          : HD_SAVED_WORD_MESSAGE,
    );
  }

  async function run(opts: { commentary?: HdCommentarySelection; allowMissingBodygraph?: boolean; preparedBy?: string }) {
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
        preparedBy: opts.preparedBy,
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
    // Yeni Word: içerik seçimi HER SEFERİNDE kapalı başlar (tüm uzmanlar); hazırlayan boş.
    setAddKnowledge(false);
    setAddSystem(false);
    setPreparedBy("");
    setKbMatch("loading");
    setPhase("choosing");
    void fetchKnowledgeMatchCount(chartId).then((n) => setKbMatch(n));
  }

  function confirmChoice() {
    const c = commentaryFromFlags(addKnowledge, canSystem && systemAvailable && addSystem);
    lastCommentaryRef.current = c;
    lastPreparedByRef.current = preparedBy.trim();
    void run({ commentary: c, preparedBy: lastPreparedByRef.current });
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
                ? "Kayıtlı Word'ü İndir"
                : label ?? "Yeni Word Oluştur"}
      </button>
      {createdReportId && !busy ? (
        <button
          type="button"
          onClick={() => start("newVersion")}
          data-hd-word-new
          className="self-start text-[11px] font-bold text-emerald-700 underline-offset-2 hover:underline"
        >
          Yeni Word oluştur (içerik seçerek)
        </button>
      ) : null}
      {phase === "bodygraph_failed" ? (
        <div className="flex flex-wrap gap-2" data-hd-bodygraph-failed>
          <button
            type="button"
            onClick={() => void run({ commentary: lastCommentaryRef.current, preparedBy: lastPreparedByRef.current })}
            className="h-8 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
          >
            Tekrar dene
          </button>
          <button
            type="button"
            onClick={() => void run({ commentary: lastCommentaryRef.current, allowMissingBodygraph: true, preparedBy: lastPreparedByRef.current })}
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
              Word raporuna neler eklensin?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Teknik harita bilgileri her raporda yer alır. Aşağıdakiler yalnız siz işaretlerseniz eklenir.
              <span className="font-bold"> Özel Çalışma Notlarınız hiçbir durumda rapora eklenmez.</span>
            </p>
            <fieldset className="mt-3 space-y-2">
              <legend className="sr-only">Rapora eklenecek içerik</legend>
              <label
                className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${
                  addKnowledge ? "border-emerald-400 bg-emerald-50/60" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={addKnowledge}
                  onChange={(e) => setAddKnowledge(e.target.checked)}
                  autoFocus
                  data-hd-word-opt-knowledge
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Bilgi Bankamdaki Açıklamaları Ekle</span>
                  <span className="block text-xs text-slate-500">
                    İlgili Human Design özellikleri için Bilgi Bankası&apos;na yazdığınız açıklamalar Word raporuna eklenir.
                  </span>
                  {addKnowledge && kbMatch === 0 ? (
                    <span className="mt-1 block text-xs font-semibold text-amber-700" role="status" data-hd-kb-no-match>
                      Bu analizle eşleşen aktif Bilgi Bankası açıklaması bulunamadı.
                    </span>
                  ) : addKnowledge && typeof kbMatch === "number" && kbMatch > 0 ? (
                    <span className="mt-1 block text-xs font-semibold text-emerald-700" data-hd-kb-match>
                      Bu analizle eşleşen {kbMatch} aktif açıklama eklenecek.
                    </span>
                  ) : null}
                </span>
              </label>
              {canSystem ? (
                <label
                  className={`flex min-h-[48px] items-start gap-3 rounded-xl border px-3 py-2.5 ${
                    !systemAvailable ? "cursor-not-allowed border-slate-200 opacity-60" : addSystem ? "cursor-pointer border-emerald-400 bg-emerald-50/60" : "cursor-pointer border-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={systemAvailable && addSystem}
                    disabled={!systemAvailable}
                    onChange={(e) => setAddSystem(e.target.checked)}
                    data-hd-word-opt-system
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-bold text-slate-800">Sistem Yorumunu Ekle</span>
                    <span className="block text-xs text-slate-500">
                      Bu analiz için mevcut ve kullanılabilir sistem yorumları Word raporuna eklenir.
                    </span>
                    {!systemAvailable ? (
                      <span className="mt-1 block text-xs font-semibold text-amber-700" data-hd-system-unavailable>
                        Bu analizde kayıtlı sistem yorumu yok (manuel ya da eski kayıt).
                      </span>
                    ) : null}
                  </span>
                </label>
              ) : null}
            </fieldset>
            <label className="mt-3 block" htmlFor={`hd-word-prepared-by-${chartId}`}>
              <span className="block text-sm font-bold text-slate-800">Raporu Hazırlayan</span>
              <span className="block text-xs text-slate-500">Raporda görünmesini istediğiniz ad ve unvanı yazabilirsiniz.</span>
              <input
                id={`hd-word-prepared-by-${chartId}`}
                type="text"
                value={preparedBy}
                maxLength={HD_PREPARED_BY_MAX}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Örn. Human Design Uzmanı Ahmet Yılmaz"
                autoComplete="off"
                data-hd-word-prepared-by
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <span className="mt-1 block text-[11px] text-slate-400">Boş bırakırsanız raporda “Hazırlayan” satırı yer almaz.</span>
            </label>
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
                Word&apos;ü oluştur
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
