"use client";

// FAZ 9D — Hesaplanmış (computed) HD harita detay modalı.
//
// Saklanan computed_result (tam HdChartResult) 9B GET ?id= ile çekilir ve
// <BodyGraph result={computed_result} /> ile RECOMPUTE OLMADAN render edilir.
// Silme 9B DELETE ile. Manuel modal (HdHaritaDetayModal) ve BodyGraph görsel
// katmanı DEĞİŞMEZ; burada yalnız kullanılır.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getComputedChart,
  deleteComputedChart,
  type ComputedChartDetail,
} from "@/lib/human-design/api/chartsClient";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useHdModalA11y } from "../../components/useHdModalA11y";
import { useHdBodyScrollLock } from "../../components/useHdBodyScrollLock";
import { HdPersonalKnowledgePanel } from "./HdPersonalKnowledgePanel";
import { HdProfessionalReportButton } from "./HdProfessionalReportButton";
import { HdComputedChartView } from "./HdComputedChartView";
import { HdExpertKnowledgePanel } from "./HdExpertKnowledgePanel";
import { HdChartKnowledgeTabs, HD_ADMIN_SOURCE_LABELS, canUseHdSystemReading } from "./HdChartKnowledgeTabs";
import { useHdNameOverrides } from "../../bilgi-bankasi/helpers/useHdNameOverrides";
import { computedChartAppCodes } from "@/lib/human-design/chart/computedChart";
import { buildChartSubjectInfo, todayCalendarDate } from "@/lib/human-design/chart/chartSubjectInfo";
import { latestWordReportId } from "@/lib/human-design/reporting/wordReportPick";
import { listReportBriefs } from "../../kayitli-raporlar/helpers/hdKayitliRaporlar";
import { listComputedCharts, previewHdAnalysisDelete } from "@/lib/human-design/api/chartsClient";
import { HdFullDeleteDialog, type HdFullDeleteResult } from "../../danisanlar/components/HdFullDeleteDialog";

type Props = {
  id: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
  /**
   * Danışan (HD profili) bağlamı — ana listeden "Detayı Aç" ile açıldığında verilir. Verilirse:
   * danışanın kayıtlı analizleri arasında geçiş (yeni hesap YOK) + "Human Design Kaydını Tamamen Sil".
   */
  profile?: { hdClientId: string; name: string; firstAnalysisAt?: string | null; showFirstAnalysis?: boolean };
  /** Tüm HD kaydı silindi (liste yenilensin / pencere kapansın). */
  onProfileDeleted?: (r: HdFullDeleteResult) => void;
  /** Listeden "Word İndir" ile açıldı → Word akışı açılışta bir kez başlar. */
  autoWord?: boolean;
};

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return val;
  }
}

export function HdComputedChartModal({ id: initialId, onClose, onDeleted, autoWord = false, profile, onProfileDeleted }: Props) {
  // Gösterilen analiz: açılışta verilen; profil bağlamında danışanın DİĞER kayıtlı analizleri seçilebilir
  // (yalnız kayıtlı satır okunur — Roxy çağrısı / yeni hesap YOK).
  const [id, setId] = useState(initialId);
  const [siblings, setSiblings] = useState<Array<{ id: string; created_at: string; birth_time: string | null }>>([]);
  const [fullDelete, setFullDelete] = useState(false);
  const { confirm } = useConfirm();
  const dialogRef = useRef<HTMLDivElement>(null);
  useHdModalA11y(dialogRef, onClose);
  // Arka sayfa kaydırması kilitli → tek dikey scroll (içerik alanı). Kapanınca/unmount'ta geri gelir.
  useHdBodyScrollLock();
  const [row, setRow] = useState<ComputedChartDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Yaş için görüntüleyenin takvim günü (modal açılışında bir kez).
  const [today] = useState(todayCalendarDate);
  // AŞAMA 2B: "Sistem Yorumu" sekmesi yalnız human_design + hd_system_reading yetkili uzmana görünür
  // (erişim ayrıca sunucuda zorlanır).
  const [canSystemReading] = useState(canUseHdSystemReading);
  // Hesabın kapı/kanal görünen adları (yalnız sunum; teknik veri/eşleşme etkilenmez).
  const nameOverrides = useHdNameOverrides();
  // "Word İndir": bu analizin hazır Word v2 raporu (varsa aynısı indirilir; yeni kopya YOK).
  // undefined = arama sürüyor. Arama başarısızsa null → ilk tıklamada rapor oluşturulur.
  const [wordReportId, setWordReportId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- id başına hazır rapor araması
    setWordReportId(undefined);
    void listReportBriefs({ chartId: id }).then(({ rows }) => {
      if (alive) setWordReportId(latestWordReportId(rows, id));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!profile?.hdClientId) return;
    let alive = true;
    void listComputedCharts({ clientId: profile.hdClientId }).then(({ rows }) => {
      if (!alive) return;
      setSiblings(
        [...rows]
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map((r) => ({ id: r.id, created_at: r.created_at, birth_time: r.birth_time ?? null })),
      );
    });
    return () => {
      alive = false;
    };
  }, [profile?.hdClientId, id]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- id başına yeniden yükleme (mevcut davranış korunur)
    setLoading(true);
    setLoadError("");
    getComputedChart(id).then(({ row: r, error }) => {
      if (!alive) return;
      setLoading(false);
      if (error) setLoadError(error);
      else setRow(r);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // "ANALİZİ SİL": yalnız bu analiz + ona ait Word raporları. Önce sunucudan KESİN kapsam; onayda analiz
  // tarihi/saati ve rapor sayısı gösterilir; sunucu onaydan fazla rapor bulursa hiçbir şey silmez (409).
  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    const { scope, error: scopeErr } = await previewHdAnalysisDelete(id);
    if (!scope) {
      setDeleting(false);
      setDeleteError(`Silinecek kayıtlar belirlenemedi; hiçbir şey silinmedi. ${scopeErr ?? ""}`.trim());
      return;
    }
    const when = `${formatDate(scope.createdAt)} tarihli analiz (${formatDate(scope.birthDate)}${scope.birthTime ? ` • ${scope.birthTime.slice(0, 5)}` : ""} doğum bilgileriyle)`;
    const confirmed = await confirm({
      title: "Analizi sil",
      message: [
        `${displayName || "Bu danışan"} — ${when} kalıcı olarak silinecek.`,
        `Bu analize ait ${scope.reports} Word raporu da silinir.`,
        "Danışanın diğer analizleri, Human Design profili, Danışan Yolculuğu kaydı ve diğer modüllerdeki verileri KORUNUR. Bu işlem geri alınamaz.",
      ].join("\n\n"),
      confirmText: "Analizi Sil",
      cancelText: "Vazgeç",
      tone: "danger",
    });
    if (!confirmed) {
      setDeleting(false);
      return;
    }
    const { ok, error } = await deleteComputedChart(id, scope.reports);
    setDeleting(false);
    if (ok) onDeleted(id);
    else setDeleteError(error ?? "Silinemedi.");
  }

  const result = row?.computed_result ?? null;
  // HD-24: ekranda ve yeni Word'de GÜNCEL danışan adı. Analiz anındaki ad farklıysa açıkça belirtilir
  // (önceden oluşturulmuş Word, oluşturulduğu andaki adı taşır — kayıt değiştirilmez).
  const displayName = row?.current_client_name || row?.client_name || null;
  const renamedFrom =
    row?.current_client_name && row.client_name && row.client_name.trim() !== row.current_client_name.trim() ? row.client_name : null;
  // Danışan bilgi bloğu: YALNIZ kayıtlı satırdan (yeni hesap / sağlayıcı çağrısı yok). UTC anı hesap
  // anında sunucuda (DST-güvenli) üretilip computed_result.timing'e kaydedilmiş değerdir.
  const input = (row?.input ?? null) as { latitude?: unknown; longitude?: unknown } | null;
  const subject =
    row && result
      ? buildChartSubjectInfo(
          {
            clientName: displayName,
            birthDate: row.birth_date,
            birthTime: row.birth_time,
            birthPlace: row.birth_place,
            timezone: row.timezone,
            latitude: input?.latitude,
            longitude: input?.longitude,
            birthUtcIso: result.timing?.birthUtcIso ?? null,
            locationId: row.location_id ?? null,
          },
          today,
        )
      : null;

  // Tam ekran profesyonel çalışma görünümü: üst bar (kimlik + eylemler) sabit, içerik kendi içinde
  // kayar. Masaüstünde BodyGraph + Design 13 + Personality 13 tek bakışta (HdComputedChartView).
  // PORTAL (document.body): modal sayfa içindeki bir üst öğenin yığın bağlamında (stacking context)
  // kalırsa z-[70] işe yaramıyor ve uygulama header'ı (fixed z-50) masaüstünde araç çubuğunu
  // (Word / Sil / Kapat) tamamen örtüyordu. body'ye taşınınca z-[70] header'ın üstündedir.
  if (typeof document === "undefined") return null;
  return createPortal(
    // z-[70]: uygulama header'ı (fixed top-0 z-50) çalışma alanının üstüne binip toolbar'ı KIRPMASIN.
    // backdrop-blur YOK: tam ekran opak zemin (blur gereksiz GPU yükü + ekran yakalamayı donduruyordu).
    <div className="fixed inset-0 z-[70] bg-slate-50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hd-computed-detay-title"
        tabIndex={-1}
        className="flex h-[100dvh] w-full flex-col focus:outline-none"
      >
        {/* Üst bar */}
        <div className="flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-indigo-100 bg-white px-4 py-2 shadow-sm sm:px-6" data-hd-toolbar>
          <div className="min-w-0">
            <h2 id="hd-computed-detay-title" className="truncate text-base font-black leading-tight text-slate-900">
              <span className="mr-2 text-[10px] font-black uppercase tracking-widest text-indigo-500">Human Design</span>
              {displayName || "Kişisel Kayıt"}
            </h2>
            {renamedFrom ? (
              <p className="truncate text-[11px] font-semibold text-amber-700" data-hd-renamed>
                Analizdeki ad: {renamedFrom}. Yeni Word güncel adı kullanır; daha önce oluşturulmuş Word eski adı içerir.
              </p>
            ) : null}
            <p className="truncate text-xs text-slate-500">
              {formatDate(row?.birth_date)}
              {row?.birth_time ? ` • ${row.birth_time.slice(0, 5)}` : ""}
              {row?.birth_place ? ` • ${row.birth_place}` : ""}
              {row?.timezone ? ` (${row.timezone})` : ""}
            </p>
            {profile?.showFirstAnalysis && profile.firstAnalysisAt ? (
              <p className="truncate text-[11px] text-slate-500" data-hd-first-analysis>İlk analiz: {formatDate(profile.firstAnalysisAt)}</p>
            ) : null}
            {siblings.length > 1 ? (
              <label className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <span>Analiz:</span>
                <select
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="h-8 max-w-[16rem] rounded-lg border border-indigo-200 bg-white px-2 text-xs font-semibold text-slate-800"
                  data-hd-analysis-switch
                >
                  {siblings.map((sb, i) => (
                    <option key={sb.id} value={sb.id}>
                      {formatDate(sb.created_at)}
                      {sb.birth_time ? ` • ${sb.birth_time.slice(0, 5)}` : ""}
                      {i === 0 ? " (en güncel)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {deleteError ? (
              <span role="alert" className="text-xs font-semibold text-rose-600">
                {deleteError}
              </span>
            ) : null}
            {/* FAZ 2.1: mevcut Profesyonel Word butonu REUSE (chartId = kayıtlı computed row.id). */}
            {!loading && !loadError && row ? (
              <HdProfessionalReportButton
                chartId={id}
                roxyRender={row.roxy_render ?? null}
                existingReportId={wordReportId ?? null}
                lookupPending={wordReportId === undefined}
                autoStart={autoWord}
              />
            ) : null}
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="h-9 rounded-xl border border-rose-200 bg-white px-4 text-sm font-black uppercase tracking-wide text-rose-600 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 disabled:opacity-50"
            >
              {deleting ? "Siliniyor..." : "Analizi Sil"}
            </button>
            {profile ? (
              <button
                type="button"
                onClick={() => setFullDelete(true)}
                className="h-9 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-black text-rose-700 shadow-sm transition hover:bg-rose-100"
                data-hd-full-delete-open
              >
                Human Design Kaydını Tamamen Sil
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black uppercase tracking-wide text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Kapat ✕
            </button>
          </div>
        </div>

        {/* İçerik */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* hdwide: bilgi kolonu eklendiği için harita alanı genişler; alttaki bilgi panelleri 1600px'de kalır. */}
          <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 lg:px-6 hdwide:max-w-[1880px]">
            {loading ? (
                <p className="py-10 text-center text-sm text-slate-500">Yükleniyor...</p>
              ) : loadError ? (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {loadError}
                </p>
              ) : result ? (
                <div className="space-y-6">
                  <HdComputedChartView
                    result={result}
                    roxyRender={(row?.roxy_render as Record<string, unknown> | null | undefined) ?? null}
                    subject={subject}
                    nameOverrides={nameOverrides}
                  />
                  <HdChartKnowledgeTabs
                    chartId={id}
                    allowed={canSystemReading}
                    adminSources={{
                      expert: (
                        <div className="mx-auto max-w-[1552px] border-t border-emerald-100 pt-5">
                          <HdExpertKnowledgePanel chart={computedChartAppCodes(result)} />
                        </div>
                      ),
                      central: (
                        <div className="mx-auto max-w-[1552px] border-t border-indigo-100/80 pt-5">
                          <p className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-700">{HD_ADMIN_SOURCE_LABELS.central}</p>
                          <HdPersonalKnowledgePanel chartId={id} />
                        </div>
                      ),
                    }}
                  >
                    <div className="mx-auto max-w-[1552px] border-t border-emerald-100 pt-5">
                      <HdExpertKnowledgePanel chart={computedChartAppCodes(result)} />
                    </div>
                    <div className="mx-auto max-w-[1552px] border-t border-indigo-100/80 pt-5">
                      <p className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-700">Kişinin <span lang="en">Human Design</span> Bilgileri</p>
                      <HdPersonalKnowledgePanel chartId={id} />
                    </div>
                  </HdChartKnowledgeTabs>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-slate-500">Kayıt bulunamadı.</p>
              )}
          </div>
        </div>
      </div>
      {fullDelete && profile ? (
        <HdFullDeleteDialog
          hdClientId={profile.hdClientId}
          name={profile.name}
          onCancel={() => setFullDelete(false)}
          onDeleted={(r) => {
            setFullDelete(false);
            onProfileDeleted?.(r);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}
