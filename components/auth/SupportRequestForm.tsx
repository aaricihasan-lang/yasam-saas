"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { CONTACT_EMAIL, buildMailtoHref } from "@/lib/contact/info";

/**
 * Ortak, giriş yapılmadan (public) çalışan destek/iletişim formu.
 * Login modalı içinde state değişimiyle açılır ve iki bağlamı destekler:
 *
 *   - "password_support"  → Şifremi Unuttum / giriş sorunu bildirimi
 *   - "membership_contact" → Üyelik & fiyat bilgisi için doğrudan mesaj
 *
 * Her iki mod da AYNI backend'i kullanır:
 *   POST /api/contact/support-request  →  mevcut support_messages / admin
 *   gelen kutusu (/admin/support). Yeni tablo/endpoint/migration YOK.
 *
 * Güvenlik: subject client'tan GÖNDERİLMEZ; sunucu `context` allowlist'ine
 * göre üretir. Alan + uzunluk validasyonu ve gizli honeypot alanı vardır.
 * Kişisel GSM numarası bu formda YOKTUR.
 */
export type SupportRequestMode = "password_support" | "membership_contact";

const COPY: Record<
  SupportRequestMode,
  {
    messageLabel: string;
    messagePlaceholder: string;
    submitLabel: string;
    backLabel: string;
    successTitle: string;
    successBody: string;
    /**
     * membership_contact: e-posta VEYA telefon'dan en az biri zorunlu (ikisi de
     * tek başına zorunlu değil). password_support: mevcut davranış — e-posta
     * zorunlu, telefon opsiyonel. (Sunucu tarafında da bağlama göre doğrulanır.)
     */
    requireEmail: boolean;
    contactHelper?: string;
  }
> = {
  password_support: {
    messageLabel: "Mesaj",
    messagePlaceholder:
      "Giriş / şifre ile ilgili yaşadığınız durumu kısaca yazın.",
    submitLabel: "Talebi Gönder",
    backLabel: "Giriş ekranına dön",
    successTitle: "Talebiniz alındı",
    successBody:
      "Giriş/şifre desteği talebiniz yöneticimize iletildi. En kısa sürede sizinle iletişime geçilecektir.",
    requireEmail: true,
  },
  membership_contact: {
    messageLabel: "Mesaj",
    messagePlaceholder:
      "Üyelik ve fiyatlandırma hakkında öğrenmek istediklerinizi kısaca yazın.",
    submitLabel: "Mesajı Gönder",
    backLabel: "Üyelik seçeneklerine dön",
    successTitle: "Mesajınız iletildi",
    successBody: "En kısa sürede size dönüş yapılacaktır.",
    requireEmail: false,
    contactHelper:
      "Size dönüş yapabilmemiz için e-posta veya telefon bilgilerinizden en az birini giriniz.",
  },
};

export default function SupportRequestForm({
  mode,
  onBack,
}: {
  mode: SupportRequestMode;
  onBack: () => void;
}) {
  const copy = COPY[mode];

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — kullanıcı doldurmaz
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const inputClass =
    "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
  const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700";

  const submit = async () => {
    setError("");
    if (!fullName.trim() || !message.trim()) {
      setError("Ad Soyad ve mesaj alanları zorunludur.");
      return;
    }
    if (copy.requireEmail) {
      // password_support: mevcut davranış korunur — e-posta zorunlu.
      if (!email.trim()) {
        setError("Ad Soyad, e-posta ve mesaj alanları zorunludur.");
        return;
      }
    } else if (!email.trim() && !phone.trim()) {
      // membership_contact: e-posta VEYA telefon'dan en az biri zorunlu.
      setError("Lütfen e-posta veya telefon bilgilerinizden en az birini girin.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contact/support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Subject sunucuda `context`e göre üretilir; client subject göndermez.
        body: JSON.stringify({
          context: mode,
          fullName,
          email,
          phone,
          message,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data?.error || "Talep gönderilemedi. Lütfen tekrar deneyin.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="relative z-10 mt-5">
        <div className="flex flex-col items-center rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-7 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" strokeWidth={2} />
          <p className="mt-3 text-base font-black text-emerald-800">
            {copy.successTitle}
          </p>
          <p className="mt-1.5 text-sm leading-6 text-emerald-700">
            {copy.successBody}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          {copy.backLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="relative z-10 mt-5 space-y-3.5">
      {/* Honeypot — ekran dışı; yalnız bot'lar doldurur */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div>
        <label className={labelClass}>Ad Soyad</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Adınız Soyadınız"
          className={inputClass}
          autoFocus
        />
      </div>

      <div>
        <label className={labelClass}>E-Posta</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@eposta.com"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>
          Telefon{" "}
          {copy.requireEmail && (
            <span className="font-normal text-slate-400">(opsiyonel)</span>
          )}
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="05xx xxx xx xx"
          className={inputClass}
        />
      </div>

      {copy.contactHelper && (
        <p className="-mt-1 text-[13px] leading-5 text-slate-500">
          {copy.contactHelper}
        </p>
      )}

      <div>
        <label className={labelClass}>{copy.messageLabel}</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={copy.messagePlaceholder}
          rows={4}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Gönderiliyor..." : copy.submitLabel}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        {copy.backLabel}
      </button>

      {mode === "membership_contact" && (
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 border-t border-slate-100 pt-3 text-center text-[13px] text-slate-500">
          <Mail className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.25} />
          <span>Dilerseniz e-posta ile de bize ulaşabilirsiniz.</span>
          <a
            href={buildMailtoHref()}
            className="font-semibold text-violet-700 no-underline hover:text-violet-900 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      )}
    </div>
  );
}
