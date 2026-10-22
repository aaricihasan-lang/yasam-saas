"use client";

// AŞAMA 3C — Yeni danışan: merkezî Danışan Yolculuğu danışanı + bağlı Human Design profili.
// Ad ve soyad ayrı ve ZORUNLU (merkezî kayıttan gelir); doğum tarihi/saati/yeri zorunlu. Yer yalnız
// listeden (Location Search) seçilir — saat dilimi/koordinat kullanıcıya gösterilmez, sunucu çözer.
// Çift tık/ağ tekrarı aynı request_id ile aynı kaydı döndürür (çift danışan yok).
//
// Owner kararı 2026-10-17 — "Danışanı Oluştur ve Analiz Et" TEK kullanıcı eylemidir:
//   doğrula → (mükerrer kontrolü) danışanı oluştur → MEVCUT Roxy hesaplama hattı (POST /api/hd/charts/roxy,
//   kayıtlı doğum yeri "client") → profesyonel harita doğrudan açılır (onAnalyzed). Ara sayfa / ikinci
//   "Haritayı Hesapla" düğmesi YOK. Bu düğmeye basmak yeni BodyGraph hesabının açık onayıdır; formu açmak,
//   alan doldurmak hiçbir API/kredi çağrısı yapmaz.
//   • Çift tıklama: tek istek (busyRef). Sunucu ayrıca girdi-özeti idempotency + kimlik kilidi uygular.
//   • Hesap başarısız → sahte başarı yok; danışan kaydı korunur, bilgiler kaybolmaz; "Analizi Tekrar Dene"
//     YALNIZ hesabı yeniden ister (danışan tekrar oluşturulmaz). Sunucu "sürüyor" (IN_PROGRESS) derse
//     kör ikinci ücretli istek yerine kısa aralıkla sonucu sorar (tamamlanan hesap yeniden kullanılır).

import { useCallback, useRef, useState } from "react";
import { computeRoxyChartSettled } from "@/lib/human-design/api/chartsClient";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useHdLeaveGuard } from "../../hooks/useHdLeaveGuard";
import { useToast } from "@/components/ui/ToastProvider";
import { readYasamUser } from "@/lib/auth/yasamUser";
import { journeyAction } from "@/lib/human-design/api/journeyClient";
import { HdBirthLocationPicker, type HdPickedLocation } from "../../components/HdBirthLocationPicker";
import { HdBirthDateInput } from "../../components/HdBirthDateInput";
import { HdBirthTimeInput } from "../../components/HdBirthTimeInput";
import type { HdDuplicateCandidate } from "@/lib/human-design/api/hdIdentity";
import { HdDuplicateDialog } from "./HdDuplicateDialog";
import { ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import s from "@/app/_premium/human-design/calismaAlani.module.css";

export const hdFieldBase =
  "w-full rounded-xl border border-indigo-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none ring-1 ring-indigo-100/60 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200/50 placeholder:text-slate-400";
export const hdLabelCls = "mb-1.5 block text-xs font-bold text-slate-700";

const empty = { ad: "", soyad: "", dogum: "", birth_time: "" };

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
}

export type HdAnalyzedResult = { chartId: string; hdClientId: string | null; name: string };

export function HdClientForm({ onAnalyzed }: { onAnalyzed: (r: HdAnalyzedResult) => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [form, setForm] = useState(empty);
  const [birthLoc, setBirthLoc] = useState<HdPickedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<"idle" | "creating" | "computing">("idle");
  const busyRef = useRef(false);
  const requestIdRef = useRef<string>("");
  // Olası mükerrer uyarısı (sunucu 409 POSSIBLE_DUPLICATE_CLIENT) — karar uzmanda.
  const [dup, setDup] = useState<HdDuplicateCandidate[] | null>(null);
  // Danışan oluşturuldu ama analiz tamamlanamadı → yeniden deneme YALNIZ hesabı ister.
  const [created, setCreated] = useState<{ hdClientId: string; name: string } | null>(null);
  const [computeError, setComputeError] = useState<string | null>(null);
  // Başka profilde aynı kişi + aynı girdiyle kayıtlı analiz (sunucu 409; ücretli çağrı yapılmadı).
  const [dupCharts, setDupCharts] = useState<HdDuplicateCandidate[] | null>(null);

  const dirty = !created && (Object.values(form).some((v) => v.trim() !== "") || !!birthLoc);
  const confirmLeave = useCallback(
    () =>
      confirm({
        title: "Kaydedilmemiş danışan",
        message: "Girdiğiniz danışan bilgileri henüz kaydedilmedi. Sayfadan ayrılmak istiyor musunuz?",
        confirmText: "Bilgileri At ve Çık",
        cancelText: "Sayfada Kal",
        tone: "danger",
      }),
    [confirm],
  );
  useHdLeaveGuard(dirty && !saving, confirmLeave);

  function set(field: keyof typeof empty) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      requestIdRef.current = ""; // içerik değişti → yeni deneme yeni istek kimliği
      setForm((p) => ({ ...p, [field]: e.target.value }));
    };
  }

  /** Kayıtlı profil için MEVCUT Roxy hattı (yalnız bu kullanıcı eylemiyle). Başarıda harita açılır. */
  async function analyze(target: { hdClientId: string; name: string }, acknowledged: string[] = []) {
    setPhase("computing");
    setComputeError(null);
    const r = await computeRoxyChartSettled(target.hdClientId, acknowledged);
    setPhase("idle");
    if (!r.ok && r.code === "POSSIBLE_DUPLICATE_CHART" && r.candidates && r.candidates.length > 0) {
      setCreated(target);
      setDupCharts(r.candidates);
      return;
    }
    setDupCharts(null);
    if (!r.ok) {
      setCreated(target);
      setComputeError(`Danışan kaydedildi ancak Human Design analizi oluşturulamadı: ${r.error}`);
      return;
    }
    setCreated(null);
    setForm(empty);
    setBirthLoc(null);
    requestIdRef.current = "";
    onAnalyzed({ chartId: r.id, hdClientId: target.hdClientId, name: target.name });
  }

  async function retryAnalyze(acknowledged: string[] = []) {
    if (!created || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await analyze(created, acknowledged);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function handleSave(acknowledged: string[] = []) {
    if (created) return retryAnalyze();
    if (busyRef.current) return;
    if (readYasamUser()?.is_demo_account === true) {
      showToast({ message: "Demo hesabında danışan eklenemez.", type: "info" });
      return;
    }
    const missing = [
      !form.ad.trim() && "Ad",
      !form.soyad.trim() && "Soyad",
      !form.dogum && "Doğum Tarihi (GG.AA.YYYY)",
      !form.birth_time && "Doğum Saati (SS:DD)",
      !birthLoc && "Doğum Yeri (listeden seçin)",
    ].filter(Boolean);
    if (missing.length > 0) {
      showToast({ message: `Zorunlu alanlar: ${missing.join(", ")}.`, type: "warning" });
      return;
    }
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    busyRef.current = true;
    setSaving(true);
    try {
      await createAndAnalyze(acknowledged);
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function createAndAnalyze(acknowledged: string[]) {
    setPhase("creating");
    const r = await journeyAction("create_new", {
      ad: form.ad.trim(),
      soyad: form.soyad.trim(),
      dogum: form.dogum,
      birth_time: form.birth_time,
      birth_location_ref: birthLoc!.id,
      ...(requestIdRef.current ? { request_id: requestIdRef.current } : {}),
      ...(acknowledged.length ? { acknowledged_duplicate_keys: acknowledged } : {}),
    });
    if (!r.ok && r.code === "POSSIBLE_DUPLICATE_CLIENT" && r.candidates && r.candidates.length > 0) {
      setPhase("idle");
      setDup(r.candidates); // kayıt OLUŞMADI; uzman karar verir
      return;
    }
    setDup(null);
    if (!r.ok || !r.hdClientId) {
      setPhase("idle");
      showToast({ message: r.ok ? "Danışan oluşturulamadı." : r.error, type: "error" });
      return;
    }
    await analyze({ hdClientId: r.hdClientId, name: `${form.ad.trim()} ${form.soyad.trim()}` });
  }

  /** "Mevcut Danışanı Aç / Seç": yeni kayıt OLUŞTURMAZ (Danışan Yolculuğu-yalnız aday: o danışana profil açar). */
  async function openExisting(c: HdDuplicateCandidate) {
    if (c.hdClientId && c.chartId) {
      // Kayıtlı analiz DOĞRUDAN açılır (Roxy çağrısı yok).
      setDup(null);
      onAnalyzed({ chartId: c.chartId, hdClientId: c.hdClientId, name: c.name ?? "" });
      return;
    }
    if (c.hdClientId) {
      setDup(null);
      router.push(`/human-design/danisanlar/${c.hdClientId}`);
      return;
    }
    if (!c.hdClientId && c.chartId) {
      // Profilsiz eski (manuel) analiz: yalnız açılır, hiçbir kayda bağlanmaz.
      setDup(null);
      router.push(`/human-design/kayitli-haritalar/${c.chartId}`);
      return;
    }
    if (c.kind === "journey_client" && c.journeyClientId && birthLoc) {
      if (busyRef.current) return;
      busyRef.current = true;
      setSaving(true);
      setPhase("creating");
      const r = await journeyAction("create_for_existing", {
        journey_client_id: c.journeyClientId,
        birth_time: form.birth_time,
        birth_location_ref: birthLoc.id,
        birth_date: form.dogum,
      });
      if (r.ok && r.hdClientId) {
        setDup(null);
        try {
          // Danışan Yolculuğu kaydına HD profili açıldı → aynı eylemle analiz.
          await analyze({ hdClientId: r.hdClientId, name: c.name ?? `${form.ad.trim()} ${form.soyad.trim()}` });
        } finally {
          busyRef.current = false;
          setSaving(false);
        }
        return;
      }
      busyRef.current = false;
      setSaving(false);
      setPhase("idle");
      if (!r.ok && r.code === "HD_PROFILE_EXISTS" && r.hdClientId) {
        setDup(null);
        router.push(`/human-design/danisanlar/${r.hdClientId}`);
        return;
      }
      if (!r.ok && r.code === "POSSIBLE_DUPLICATE_CLIENT" && r.candidates?.length) {
        setDup(r.candidates);
        return;
      }
      showToast({ message: r.ok ? "Human Design profili oluşturulamadı." : r.error, type: "error" });
    }
  }

  return (
    // 2026-10-20 premium yerleşim (owner GÖRSEL PASS prototipi human-design-calisma-alani): etiket solda, alan sağda;
    // alan kimlikleri, zorunluluk, biçim denetimi ve kilitleme (created/saving) aynen.
    <div data-hd-new-client-form>
      <div className={s.fGrid}>
        <div className={s.fRow}>
          <label htmlFor="hd-new-ad" className={s.fLbl}>Ad *</label>
          <span className={s.inWrap}>
            <input id="hd-new-ad" type="text" autoComplete="off" disabled={!!created || saving} value={form.ad} onChange={set("ad")} placeholder="Ali Kaan" className={s.input} />
          </span>
        </div>
        <div className={s.fRow}>
          <label htmlFor="hd-new-soyad" className={s.fLbl}>Soyad *</label>
          <span className={s.inWrap}>
            <input id="hd-new-soyad" type="text" autoComplete="off" disabled={!!created || saving} value={form.soyad} onChange={set("soyad")} placeholder="Arıcı" className={s.input} />
          </span>
        </div>
        <div className={`${s.fRow} ${s.fRowTop}`}>
          <label htmlFor="hd-new-dogum" className={s.fLbl}>Doğum Tarihi *</label>
          <span className={s.inWrap}>
            <HdBirthDateInput id="hd-new-dogum" disabled={!!created || saving} value={form.dogum} onChange={(v) => { requestIdRef.current = ""; setForm((p) => ({ ...p, dogum: v })); }} className={s.input} />
            <CalendarDays className={s.inIcon} strokeWidth={2} aria-hidden />
          </span>
        </div>
        <div className={`${s.fRow} ${s.fRowTop}`}>
          <label htmlFor="hd-new-saat" className={s.fLbl}>Doğum Saati *</label>
          <span className={s.inWrap}>
            <HdBirthTimeInput id="hd-new-saat" disabled={!!created || saving} value={form.birth_time} onChange={(v) => { requestIdRef.current = ""; setForm((p) => ({ ...p, birth_time: v })); }} className={s.input} />
            <Clock3 className={s.inIcon} strokeWidth={2} aria-hidden />
          </span>
        </div>
        <div className={`${s.fRow} ${s.fRowTop}`}>
          <label htmlFor="hd-new-client-birth-place" className={s.fLbl}>Doğum Yeri *</label>
          <div className={s.inWrap}>
            <HdBirthLocationPicker
              id="hd-new-client-birth-place"
              disabled={!!created || saving}
              value={birthLoc}
              onChange={(loc) => {
                requestIdRef.current = "";
                setBirthLoc(loc);
              }}
            />
            <MapPin className={s.inIcon} strokeWidth={2} aria-hidden />
            <p className={s.hint}>İl, ilçe veya şehir yazıp listeden seçin.</p>
          </div>
        </div>
      </div>
      <p className={s.note}>
        Danışan, Danışan Yolculuğu&apos;nda da oluşturulur; Human Design analizleri bu danışanın geçmişinde görünür.
      </p>
      {phase === "computing" ? (
        <p role="status" className="m-0 mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800" data-hd-new-computing>
          Human Design haritası hesaplanıyor… Lütfen bekleyin; sayfayı kapatmayın.
        </p>
      ) : null}
      {computeError ? (
        <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700" data-hd-new-compute-error>
          <p className="m-0">{computeError}</p>
          {created ? (
            <p className="m-0 mt-1 font-normal text-rose-700/90">
              Bilgiler kaydedildi. “Analizi Tekrar Dene” yalnız hesaplamayı yeniden ister; danışan tekrar oluşturulmaz.
            </p>
          ) : null}
        </div>
      ) : null}
      <div>
        <button
          type="button"
          onClick={() => void handleSave()}
          data-hd-new-client-save
          disabled={saving}
          aria-busy={saving}
          className={s.start}
        >
          {phase === "creating"
            ? "Danışan oluşturuluyor…"
            : phase === "computing"
              ? "Harita hesaplanıyor…"
              : created
                ? "Analizi Tekrar Dene"
                : "Danışanı Oluştur ve Analiz Et"}
          {phase === "idle" ? <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden /> : null}
        </button>
        <p className={s.fNote}>Kayıtlı bir danışan için Danışan Listesi&apos;nden <b>Yeni Analiz</b> seçin.</p>
      </div>
      {dup ? (
        <HdDuplicateDialog
          mode="client"
          candidates={dup}
          busy={saving}
          onOpen={(c) => void openExisting(c)}
          onProceed={() => void handleSave(dup.map((c) => c.key))}
          onCancel={() => setDup(null)}
        />
      ) : null}
      {dupCharts && created ? (
        <HdDuplicateDialog
          mode="chart"
          candidates={dupCharts}
          busy={saving}
          onOpen={(c) => {
            // Başka profilin analizi YALNIZ açılır (salt okuma); bu profile bağlanmaz, kopyalanmaz.
            setDupCharts(null);
            if (c.chartId) onAnalyzed({ chartId: c.chartId, hdClientId: c.hdClientId ?? null, name: c.name ?? "" });
          }}
          onProceed={() => {
            const keys = dupCharts.map((c) => c.key);
            setDupCharts(null);
            void retryAnalyze(keys);
          }}
          onCancel={() => {
            setDupCharts(null);
            setComputeError("Danışan kaydedildi; analiz başlatılmadı. İsterseniz “Analizi Tekrar Dene” ile devam edebilirsiniz.");
          }}
        />
      ) : null}
    </div>
  );
}
