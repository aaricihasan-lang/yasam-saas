"use client";

/**
 * Ayarlar → Dil (I18N-F1-R1, Owner kararı A7). Uzmanın HESABINA kayıtlı arayüz dili.
 * Yalnız yayın kapısı açıkken (lib/i18n/gate.ts) Ayarlar'a eklenir; production'da görünmez.
 * Seçim: cihaz çerezi (setLocale) + hesap tercihi (/api/me/locale). Hesap tercihi saklanamıyorsa
 * (demo hesap, migration uygulanmamış ortam) seçim yalnız bu cihazda geçerli olur ve bu açıkça yazılır.
 */
import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2 } from "lucide-react";
import { ACTIVE_LOCALES, LOCALE_LABELS, type ActiveLocale } from "@/lib/i18n/locales";
import { setLocale } from "@/lib/i18n/setLocale";
import { fetchAccountLocale, saveAccountLocale } from "@/lib/i18n/localePreferenceClient";
import type { AccountPreference } from "@/lib/i18n/localePreference";

type SaveState = "idle" | "account" | "device" | "error";

export default function LanguagePreferenceSection() {
  const t = useTranslations("common.languagePreference");
  const current = useLocale() as ActiveLocale;
  const router = useRouter();
  const [pref, setPref] = useState<AccountPreference | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchAccountLocale(ctrl.signal).then((p) => {
      if (!ctrl.signal.aborted) setPref(p);
    });
    return () => ctrl.abort();
  }, []);

  function choose(locale: ActiveLocale) {
    if (isPending) return;
    startTransition(async () => {
      const cookie = await setLocale(locale);
      if (!cookie.ok) {
        setSaveState("error");
        return;
      }
      const { persisted } = await saveAccountLocale(locale);
      setPref(persisted ? { status: "set", locale } : pref);
      setSaveState(persisted ? "account" : "device");
      router.refresh();
    });
  }

  const accountNote =
    pref === null
      ? null
      : pref.status === "set"
        ? t("accountSaved", { label: LOCALE_LABELS[pref.locale] })
        : pref.status === "unset"
          ? t("accountUnset")
          : t("accountUnavailable");

  return (
    <section className="space-y-4" aria-labelledby="language-pref-title" data-testid="language-preference">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
          <Languages className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 id="language-pref-title" className="text-base font-bold text-slate-900">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{t("description")}</p>
        </div>
      </div>

      <div role="radiogroup" aria-label={t("title")} className="grid gap-2 sm:grid-cols-2">
        {ACTIVE_LOCALES.map((locale) => {
          const selected = locale === current;
          return (
            <button
              key={locale}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isPending}
              onClick={() => choose(locale)}
              className={`flex min-h-[48px] items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-60 ${
                selected ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span lang={locale}>{LOCALE_LABELS[locale]}</span>
              {selected ? <Check className="h-4 w-4" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500" aria-live="polite">
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {saveState === "account" ? t("savedAccount") : saveState === "device" ? t("savedDevice") : saveState === "error" ? t("saveError") : accountNote}
      </p>
    </section>
  );
}
