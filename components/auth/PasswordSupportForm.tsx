"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

/**
 * "Şifremi Unuttum" → giriş yapılmadan doğrudan admin'e şifre/giriş desteği
 * mesajı bırakma formu. Login modalı içinde state değişimiyle açılır.
 * POST /api/contact/support-request → mevcut support_messages / admin gelen
 * kutusu akışına düşer (yeni sistem yok). Kişisel GSM görünmez.
 */
export default function PasswordSupportForm({ onBack }: { onBack: () => void }) {
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
    if (!fullName.trim() || !email.trim() || !message.trim()) {
      setError("Ad Soyad, e-posta ve mesaj alanları zorunludur.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/contact/support-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, message, website }),
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
          <p className="mt-3 text-base font-black text-emerald-800">Talebiniz alındı</p>
          <p className="mt-1.5 text-sm leading-6 text-emerald-700">
            Giriş/şifre desteği talebiniz yöneticimize iletildi. En kısa sürede
            sizinle iletişime geçilecektir.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Giriş ekranına dön
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
          Telefon <span className="font-normal text-slate-400">(opsiyonel)</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="05xx xxx xx xx"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Mesaj</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Giriş / şifre ile ilgili yaşadığınız durumu kısaca yazın."
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
        {loading ? "Gönderiliyor..." : "Talebi Gönder"}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-slate-600 transition hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        Giriş ekranına dön
      </button>
    </div>
  );
}
