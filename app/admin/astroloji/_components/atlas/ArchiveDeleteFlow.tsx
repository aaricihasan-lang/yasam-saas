"use client";

/**
 * Analiz Arşivi — SİLME AKIŞI (çok katmanlı onay). Bu bileşen veri silmez; mevcut sunucu protokolünü kullanır:
 *   önizleme  POST /profiles/delete/preview → SUNUCUNUN hesapladığı profil / analiz / korunacak ortak analiz sayıları
 *             + onay özeti (confirmToken). İstemci sayısına güvenilmez.
 *   silme     POST /profiles/delete { mode, scope, profileIds, confirmToken, confirmations } → tekli 2, toplu 3 onay
 *             SUNUCUDA zorunlu; kapsam (scope) onay özetine yazılıdır, farklıysa 409; onaylanan durum RPC'de KİLİT
 *             ALTINDA yeniden doğrulanır (tek işlem, kısmi silme yok); başka uzmanın / tenant'ın profili → 404.
 *
 * Seçenekler:
 *   A) Yalnızca analizleri sil (scope "analyses") — seçilen profillerin KENDİ kayıtlı analizleri (+ notları) silinir;
 *      doğum profili, doğum bilgileri, Danışan Yolculuğu bağı ve çalışma notları KORUNUR (astro_profile_analyses_delete).
 *      Analizsiz kalan profil arşiv listesinden düşer, Yeni Analiz'de kullanılmaya devam eder.
 *   B) Danışanı ve bütün analizlerini sil — astroloji doğum profili + kendi analizleri (+ notları). Danışan Yolculuğu
 *      kaydı ve diğer modüller ETKİLENMEZ (FK SET NULL); astrolojiye özel eşleştirme bağı profille birlikte kalkar;
 *      başka profillerin ortak (karşı taraf) analizleri snapshot'larıyla KORUNUR.
 *
 * Katmanlar: tekli 2 (tür + özet → adla son onay); çoklu (≥2) ve Tümünü Sil 3 (tür → ayrıntılı uyarı → elle yazılan
 * ifade). Başarı mesajı YALNIZ sunucu başarı döndükten sonra.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { astroFetch } from "../../_lib/api";

type Kind = "A" | "B";
type Preview = {
  mode: "single" | "bulk";
  scope: "profile" | "analyses";
  requiredConfirmations: number;
  profileCount: number;
  totals: { ownAnalyses: number; sharedPreserved: number };
  profiles: { id: string; label: string; archived: boolean; ownAnalyses: number; sharedPreserved: number }[];
  confirmToken: string;
};
type Result = { deletedProfiles: number; deletedAnalyses: number; preservedSharedAnalyses: number; verified?: boolean; remaining?: { profiles: number; ownAnalyses: number } };
const scopeOf = (k: Kind | null): Preview["scope"] => (k === "A" ? "analyses" : "profile");

const OPTION_A =
  "Seçtiğiniz danışanın/danışanların kayıtlı astroloji analizleri silinecek. Adı, doğum tarihi, saati, yeri ve diğer doğum profili bilgileri korunacaktır.";
// 2026-10-14 owner kararı: güçlü uyarı. Metin gerçek davranışla ÇELİŞMEZ: astro_profile_delete profil + revizyonlar +
// kendi analizleri + notları + sonuç önbelleği + sağlayıcı yorumlarını siler; Danışan Yolculuğu (clients) kaydı silinmez.
const DELETE_WARNING_B =
  "DİKKAT! Bu danışanı silerseniz danışana ait astroloji doğum profili, kayıtlı analizler, analiz notları ve ilişkili hesaplama bilgileri de silinecektir. Bu işlem geri alınamaz.";
const OPTION_B = `${DELETE_WARNING_B} Danışan Yolculuğu'ndaki danışan kaydı ve diğer modüllerdeki kayıtlar bu işlemle silinmez.`;
const MAX = 100;

export default function ArchiveDeleteFlow({
  scope,
  ids: initialIds,
  onClose,
  onDeleted,
}: {
  scope: "single" | "selected" | "all";
  ids: string[];
  onClose: () => void;
  /** deletedProfileIds: yalnız B'de dolu (A'da profiller korunur → boş). */
  onDeleted: (r: Result, deletedProfileIds: string[]) => void;
}) {
  const multi = scope !== "single";
  const steps = multi ? 3 : 2;
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<Kind | null>(null);
  const [ids, setIds] = useState<string[] | null>(scope === "all" ? null : initialIds);
  const [allTotal, setAllTotal] = useState<number | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState<Result | null>(null);

  // Tümünü Sil: kapsam SUNUCUDA hesaplanır (arama/sıralamadan bağımsız tüm arşiv).
  useEffect(() => {
    if (scope !== "all") return;
    let alive = true;
    void astroFetch<{ total: number; ids: string[] }>("/api/admin/astroloji/profiles?view=archive&scope=ids").then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.error);
      setAllTotal(r.data.total);
      setIds(r.data.total > MAX ? [] : r.data.ids);
    });
    return () => {
      alive = false;
    };
  }, [scope]);

  // Önizleme (sunucu sayıları + onay özeti). Onay özeti seçilen KAPSAMA bağlıdır → tür değişince yeniden alınır;
  // ileri / sil düğmeleri yalnız özet seçilen türle eşleşince açılır.
  const wantScope = scopeOf(kind);
  useEffect(() => {
    if (!ids || ids.length === 0) return;
    let alive = true;
    void astroFetch<Preview>("/api/admin/astroloji/profiles/delete/preview", { method: "POST", body: { mode: ids.length === 1 ? "single" : "bulk", scope: wantScope, profileIds: ids } }).then((r) => {
      if (!alive) return;
      if (r.ok) setPv(r.data);
      else setErr(r.error);
    });
    return () => {
      alive = false;
    };
  }, [ids, wantScope]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Kayıtlı analizi olmayan profil (Yeni Analiz → "Profili Sil"): A anlamsızdır (silinecek analiz yok) → yalnız B.
  const noAnalyses = !!pv && pv.totals.ownAnalyses === 0;
  const isA = kind === "A";
  const n = pv?.profileCount ?? ids?.length ?? 0;
  const phrase = isA ? (scope === "all" ? "TÜM ANALİZLERİ SİL" : `${n} DANIŞANIN ANALİZLERİNİ SİL`) : scope === "all" ? "TÜM ARŞİVİ SİL" : `${n} DANIŞANI SİL`;
  const pvReady = !!pv && !!kind && pv.scope === wantScope && !(noAnalyses && kind === "A");
  const typedOk = typed.trim().toLocaleUpperCase("tr-TR") === phrase;
  const tooMany = scope === "all" && allTotal !== null && allTotal > MAX;

  async function run() {
    if (!pv || !ids || !pvReady) return;
    setBusy(true);
    setErr(null);
    const r = await astroFetch<Result>("/api/admin/astroloji/profiles/delete", {
      method: "POST",
      body: { mode: pv.mode, scope: pv.scope, profileIds: ids, confirmToken: pv.confirmToken, confirmations: pv.requiredConfirmations },
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    // Başarı YALNIZ sunucu silinen kayıtları geri okuyup doğruladıysa gösterilir (2026-10-12).
    if (r.data.verified !== true) {
      onDeleted(r.data, pv.scope === "profile" ? ids : []);
      setErr(
        `Silme isteği işlendi ancak sunucudan doğrulanamadı${r.data.remaining ? ` (kalan profil: ${r.data.remaining.profiles}, kalan analiz: ${r.data.remaining.ownAnalyses})` : ""}. Listeyi yenileyip kontrol edin; gerekirse işlemi tekrarlayın.`,
      );
      return;
    }
    setDone(r.data);
    onDeleted(r.data, pv.scope === "profile" ? ids : []);
  }

  const title = scope === "all" ? "Tümünü sil" : scope === "selected" ? "Seçilenleri sil" : "Danışanı sil";
  const singleLabel = pv?.profiles[0]?.label ?? "";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-[#050816]/70 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} data-testid="astro-archive-delete-flow" data-step={step}>
      <div className="w-full max-w-lg rounded-2xl border border-[#D9B56F]/45 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95),0_0_0_4px_rgba(217,181,111,0.08)] bg-[#FBF8F2] text-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">{title}</p>
            <p className="text-xs text-slate-500">{done ? "Tamamlandı" : `Adım ${step} / ${steps}`}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 text-sm">
          {done ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900" role="status" data-testid="astro-archive-delete-done">
              {pv?.scope === "analyses" ? (
                <>
                  {done.deletedAnalyses} kayıtlı analiz kalıcı olarak silindi. {pv.profileCount} doğum profili ve doğum bilgileri korundu; Yeni Analiz&apos;de kullanılabilir.
                </>
              ) : (
                <>{done.deletedProfiles} danışan profili ve {done.deletedAnalyses} kayıtlı analiz kalıcı olarak silindi.</>
              )}
              {done.preservedSharedAnalyses > 0 ? ` Başka profillerin ${done.preservedSharedAnalyses} ortak analizi korundu.` : ""} Danışan Yolculuğu kayıtları etkilenmedi.
            </div>
          ) : (
            <>
              {err && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800" role="alert" data-testid="astro-archive-delete-error">
                  {err}
                </p>
              )}
              {tooMany && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" role="alert">
                  Arşivinizde {allTotal} danışan var. Güvenlik gereği tek işlemde en çok {MAX} danışan silinebilir; lütfen seçerek parça parça silin.
                </p>
              )}
              {step === 1 && (
                <>
                  <p className="font-medium">Silme türünü seçin</p>
                  <label
                    className={`flex items-start gap-2 rounded-lg border p-3 ${noAnalyses ? "cursor-not-allowed border-slate-200 opacity-55" : kind === "A" ? "cursor-pointer border-rose-400 bg-rose-50/60" : "cursor-pointer border-slate-200 hover:border-rose-300"}`}
                    data-testid="astro-delete-option-a"
                    aria-disabled={noAnalyses}
                  >
                    <input type="radio" name="astro-delete-kind" className="mt-1" checked={kind === "A"} disabled={noAnalyses} onChange={() => setKind("A")} />
                    <span>
                      <span className="block font-medium">Yalnızca analizleri sil</span>
                      <span className="block text-xs text-slate-600">{noAnalyses ? "Bu profilin kayıtlı analizi yok; silinecek analiz bulunmadığı için bu seçenek kullanılamaz." : OPTION_A}</span>
                    </span>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${kind === "B" ? "border-rose-400 bg-rose-50/60" : "border-slate-200 hover:border-rose-300"}`} data-testid="astro-delete-option-b">
                    <input type="radio" name="astro-delete-kind" className="mt-1" checked={kind === "B"} onChange={() => setKind("B")} />
                    <span>
                      <span className="block font-medium">Danışanı ve bütün analizlerini sil</span>
                      <span className="block text-xs text-slate-600">{OPTION_B}</span>
                    </span>
                  </label>
                  {/* Tekli: 1. katman türle birlikte etkilenecek kayıtların özetini gösterir. */}
                  {!multi && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="astro-delete-summary">
                      {!pv ? (
                        err ? null : <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Etkilenecek kayıtlar hesaplanıyor…</span>
                      ) : (
                        <>
                          <strong>{singleLabel}</strong>: {pv.totals.ownAnalyses} kayıtlı analiz silinecek
                          {kind === "A" ? "; doğum profili korunacak" : kind === "B" ? "; doğum profili de silinecek" : ""}
                          {pv.totals.sharedPreserved > 0 ? `; başka profillerin ${pv.totals.sharedPreserved} ortak analizi korunacak` : ""}.
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              {multi && step === 2 && pv && (
                <div className="flex flex-col gap-2" data-testid="astro-delete-detail">
                  <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {scope === "all" ? (
                        <>
                          Kapsam: Analiz Arşivi&apos;ndeki <strong>TÜM</strong> danışanlar (ekrandaki arama veya sıralamadan BAĞIMSIZ).{" "}
                        </>
                      ) : (
                        <>Kapsam: yalnız seçtiğiniz danışanlar. </>
                      )}
                      {isA ? (
                        <>
                          <strong>{pv.profileCount}</strong> danışanın <strong>{pv.totals.ownAnalyses}</strong> kayıtlı analizi kalıcı olarak silinecek. Doğum profilleri ve doğum bilgileri KORUNUR.
                        </>
                      ) : (
                        <>
                          <strong>DİKKAT!</strong> <strong>{pv.profileCount}</strong> danışanın astroloji doğum profili, <strong>{pv.totals.ownAnalyses}</strong> kayıtlı analizi, analiz notları ve ilişkili hesaplama bilgileri kalıcı olarak silinecek. Bu işlem geri alınamaz.
                        </>
                      )}
                      {pv.totals.sharedPreserved > 0 ? ` Başka profillerin ${pv.totals.sharedPreserved} ortak analizi korunacak.` : ""} Danışan Yolculuğu kayıtları silinmez.
                    </span>
                  </p>
                  <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 text-xs">
                    {pv.profiles.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 border-b border-slate-100 px-3 py-1 last:border-b-0">
                        <span className="min-w-0 truncate">{p.label}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{p.ownAnalyses} analiz</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!multi && step === 2 && pv && (
                <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900" data-testid="astro-delete-final">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {isA ? (
                      <>
                        <strong>“{singleLabel}”</strong> danışanının {pv.totals.ownAnalyses} kayıtlı analizi kalıcı olarak silinecek; doğum profili ve doğum bilgileri korunur. Bu işlem geri alınamaz.
                      </>
                    ) : (
                      <>
                        <strong>DİKKAT!</strong> <strong>“{singleLabel}”</strong> danışanına ait astroloji doğum profili, {pv.totals.ownAnalyses} kayıtlı analiz, analiz notları ve ilişkili hesaplama bilgileri kalıcı olarak silinecek. Bu işlem geri alınamaz. Danışan Yolculuğu kaydı bu işlemle silinmez.
                      </>
                    )}
                  </span>
                </p>
              )}
              {multi && step === 3 && pv && (
                <div className="flex flex-col gap-2" data-testid="astro-delete-typed">
                  <p>
                    Son doğrulama: işlemi kesinleştirmek için aşağıdaki ifadeyi aynen yazın — <strong className="font-mono">{phrase}</strong>
                  </p>
                  <input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Onay ifadesi" autoComplete="off" className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" data-testid="astro-delete-phrase" />
                  {typed && !typedOk && <p className="text-xs text-rose-700">İfade eşleşmiyor; silme başlatılmaz.</p>}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {done ? (
            <button type="button" onClick={onClose} className="rounded-lg bg-[#0b1430] px-3 py-1.5 text-sm text-white" data-testid="astro-archive-delete-close">
              Kapat
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" data-testid="astro-archive-delete-cancel">
                Vazgeç
              </button>
              {step < steps ? (
                <button type="button" disabled={!pvReady || tooMany} onClick={() => setStep((s) => s + 1)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40" data-testid="astro-archive-delete-next">
                  Devam
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !pvReady || tooMany || (multi && !typedOk)}
                  onClick={() => void run()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                  data-testid="astro-archive-delete-confirm"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {multi ? (isA ? "Analizleri kalıcı olarak sil" : "Kalıcı olarak sil") : isA ? `“${singleLabel}” analizlerini kalıcı olarak sil` : `“${singleLabel}” kalıcı olarak sil`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
