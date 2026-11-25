"use client";
/**
 * Beslenme — geri alınamaz TOPLU / kişisel emeği silen işlemler için 3 AŞAMALI onay.
 *
 *   AŞAMA 1 — Kapsam: neyin, kaç kaydın etkileneceği (SUNUCUNUN hesapladığı sayı/ad listesi).
 *   AŞAMA 2 — İkinci güçlü uyarı: "Bu işlem geri alınamaz" (ayrı adım, ayrı onay).
 *   AŞAMA 3 — 4 haneli kod: sunucu üretir, ekranda gösterilir; kullanıcı elle yazmadan son
 *             buton AKTİF OLMAZ. Kod sunucuda da doğrulanır (tek kullanımlık, 5 dk, kapsam özeti);
 *             modal atlanıp endpoint doğrudan çağrılsa bile işlem çalışmaz.
 *
 * Tek tıkla çalışmaz: en az 3 ayrı kullanıcı eylemi + kodun elle girilmesi gerekir.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localeTag } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isActiveLocale } from "@/lib/i18n/locales";
import { AlertTriangle, KeyRound, ListChecks, RefreshCw } from "lucide-react";
import { Modal } from "../planlar/_components/planUi";
import { DangerButton, GhostButton, InlineSpinner, PrimaryButton, StatusMessage } from "./primitives";

export type ChallengeInfo = {
  challenge_id: string;
  code: string;
  expires_at: string;
  count: number;
  names?: string[];
  more?: number;
};

export type ChallengeRequest = () => Promise<{ ok: true; value: ChallengeInfo } | { ok: false; message: string }>;
export type ChallengeConfirm = (challengeId: string, code: string) => Promise<{ ok: true } | { ok: false; message: string; refresh?: boolean }>;

export function DestructiveChallengeDialog({
  open,
  title,
  scopeIntro,
  itemNoun,
  extra,
  warning,
  confirmLabel,
  tone = "danger",
  requestChallenge,
  confirm,
  onDone,
  onClose,
}: {
  open: boolean;
  title: string;
  /** Aşama 1 açıklaması (ör. "Yalnızca Elma Suyu için yaptığınız değişiklikler…"). */
  scopeIntro: ReactNode;
  /** Sayım ismi: "besin", "öğün" … */
  itemNoun: string;
  /** Aşama 1'de ek bilgi (ör. kapsam dışı kalanlar). */
  extra?: ReactNode;
  /** Aşama 2 uyarı metni. */
  warning: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "reset";
  requestChallenge: ChallengeRequest;
  confirm: ChallengeConfirm;
  onDone: () => void;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [info, setInfo] = useState<ChallengeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  // Çağıranın fonksiyon kimliği her render değişebilir → ref ile sabitle (yeniden kod üretme döngüsü yok).
  const requestRef = useRef(requestChallenge);
  useEffect(() => {
    requestRef.current = requestChallenge;
  }, [requestChallenge]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setTyped("");
    const r = await requestRef.current();
    setLoading(false);
    if (r.ok) setInfo(r.value);
    else {
      setInfo(null);
      setErr(r.message);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const r = await requestRef.current();
      if (!alive) return;
      setLoading(false);
      if (r.ok) setInfo(r.value);
      else setErr(r.message);
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const t = useTranslations("beslenme.challenge");
  const locale = useLocale();
  const numTag = locale === DEFAULT_LOCALE ? "tr-TR" : localeTag(isActiveLocale(locale) ? locale : DEFAULT_LOCALE);
  const codeMatches = !!info && typed === info.code;

  async function finish() {
    if (!info || !codeMatches || busy) return;
    setBusy(true);
    setErr("");
    const r = await confirm(info.challenge_id, typed);
    setBusy(false);
    if (r.ok) {
      onDone();
      return;
    }
    setErr(r.message);
    if (r.refresh) {
      // Kod süresi dolmuş / kullanılmış / kapsam değişmiş → baştan (kapsam yeniden gösterilir).
      setStage(1);
      await load();
    }
  }

  const accent = tone === "reset" ? "text-amber-700" : "text-rose-700";
  const stepBadge = (n: number, label: string, icon: ReactNode) => (
    <div className={`flex items-center gap-1.5 text-[11px] font-black ${stage === n ? accent : "text-slate-400"}`}>
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
          stage === n ? (tone === "reset" ? "bg-amber-100" : "bg-rose-100") : "bg-slate-100"
        }`}
      >
        {n}
      </span>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={title} maxWidthClass="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
          {stepBadge(1, t("stepScope"), <ListChecks className="h-3.5 w-3.5" aria-hidden />)}
          {stepBadge(2, t("stepWarning"), <AlertTriangle className="h-3.5 w-3.5" aria-hidden />)}
          {stepBadge(3, t("stepCode"), <KeyRound className="h-3.5 w-3.5" aria-hidden />)}
        </div>

        {loading ? <InlineSpinner label={t("computing")} /> : null}
        {err ? <StatusMessage type="error">{err}</StatusMessage> : null}

        {!loading && info && stage === 1 ? (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-medium leading-relaxed text-slate-700">{scopeIntro}</div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[12px] font-black text-slate-500">{t("affected")}</p>
              <p className={`text-2xl font-black ${accent}`}>
                {info.count.toLocaleString(numTag)} {itemNoun}
              </p>
              {info.names && info.names.length > 0 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto text-[12px] font-bold text-slate-600">
                  {info.names.map((n, i) => (
                    <li key={`${n}-${i}`} className="truncate">
                      • {n}
                    </li>
                  ))}
                  {info.more ? <li className="text-slate-400">{t("more", { count: info.more })}</li> : null}
                </ul>
              ) : null}
            </div>
            {extra}
            <div className="flex flex-wrap justify-end gap-2">
              <GhostButton onClick={onClose}>{t("cancel")}</GhostButton>
              <PrimaryButton onClick={() => setStage(2)}>{t("continue")}</PrimaryButton>
            </div>
          </div>
        ) : null}

        {!loading && info && stage === 2 ? (
          <div className="flex flex-col gap-3">
            <div
              className={`flex gap-3 rounded-xl border p-3 ${
                tone === "reset" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"
              }`}
            >
              <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${accent}`} aria-hidden />
              <div className={`text-[13px] font-bold leading-relaxed ${accent}`}>
                <p className="font-black">{t("irreversible")}</p>
                <div className="mt-1 font-medium">{warning}</div>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <GhostButton onClick={onClose}>{t("cancel")}</GhostButton>
              <PrimaryButton onClick={() => setStage(3)}>{t("understood")}</PrimaryButton>
            </div>
          </div>
        ) : null}

        {!loading && info && stage === 3 ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-slate-700">
              {t("codeIntro")}
            </p>
            <div
              className="select-none rounded-2xl border border-slate-200 bg-slate-50 py-3 text-center font-mono text-3xl font-black tracking-[0.5em] text-slate-800"
              aria-label={t("codeAria", { digits: info.code.split("").join(" ") })}
            >
              {info.code}
            </div>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={typed}
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={t("codePlaceholder")}
              aria-label={t("codeInputAria")}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center font-mono text-xl font-black tracking-[0.4em] focus:border-emerald-400 focus:outline-none"
            />
            <p className="text-[11px] font-medium text-slate-400">{t("codeHint")}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <GhostButton icon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()} disabled={busy}>
                {t("newCode")}
              </GhostButton>
              <div className="flex gap-2">
                <GhostButton onClick={onClose} disabled={busy}>
                  {t("cancel")}
                </GhostButton>
                <DangerButton loading={busy} disabled={!codeMatches} onClick={() => void finish()}>
                  {confirmLabel}
                </DangerButton>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

type ChallengeErrorKey = "invalidCode" | "expired" | "used" | "locked" | "scopeChanged" | "rateLimited" | "generic";

/** Sunucu challenge hata kodu → katalog anahtarı (beslenme.challenge.errors.*) + baştan başlatılmalı mı. */
function challengeErrorKey(code?: string): { key: ChallengeErrorKey; refresh: boolean } {
  switch (code) {
    case "CHALLENGE_INVALID_CODE":
      return { key: "invalidCode", refresh: false };
    case "CHALLENGE_EXPIRED":
      return { key: "expired", refresh: true };
    case "CHALLENGE_USED":
    case "CHALLENGE_NOT_FOUND":
    case "CHALLENGE_REQUIRED":
      return { key: "used", refresh: true };
    case "CHALLENGE_LOCKED":
      return { key: "locked", refresh: true };
    case "CHALLENGE_SCOPE_CHANGED":
      return { key: "scopeChanged", refresh: true };
    case "CHALLENGE_RATE_LIMITED":
      return { key: "rateLimited", refresh: false };
    default:
      return { key: "generic", refresh: false };
  }
}

/** Kaynak dil (TR) metinleri — messages/tr/beslenme.json beslenme.challenge.errors ile birebir. */
const CHALLENGE_ERROR_TR: Record<ChallengeErrorKey, string> = {
  invalidCode: "Kod hatalı. Ekrandaki kodu aynen yazın.",
  expired: "Kodun süresi doldu. Yeni kod oluşturuldu; kapsamı tekrar kontrol edin.",
  used: "Bu kod artık geçerli değil. Yeni kod oluşturuldu.",
  locked: "Çok fazla hatalı deneme. Yeni kod oluşturuldu.",
  scopeChanged: "Etkilenecek kayıtlar değişti. Güncel kapsam yeniden gösteriliyor.",
  rateLimited: "Çok sık deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.",
  generic: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
};

/**
 * Sunucu challenge hata kodları → kullanıcı mesajı (+ baştan başlatılmalı mı).
 * `t` = useTranslations("beslenme.challenge") verilirse mesaj ekran dilinde; verilmezse kaynak dil (TR).
 */
export function challengeErrorMessage(code?: string, t?: (key: string) => string): { message: string; refresh: boolean } {
  const { key, refresh } = challengeErrorKey(code);
  return { message: t ? t(`errors.${key}`) : CHALLENGE_ERROR_TR[key], refresh };
}
