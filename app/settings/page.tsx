"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  FileJson,
  FileText,
  KeyRound,
  Loader2,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  Shield,
} from "lucide-react";
import { readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { CUSTOMER_SERVICE_DISPLAY, buildTelHref } from "@/lib/contact/info";
import {
  WHATSAPP_CONTACT_ENABLED,
  WHATSAPP_DISPLAY_NUMBER,
  WHATSAPP_SUPPORT_MESSAGE,
  buildWhatsAppUrl,
} from "@/lib/contact/whatsapp";
import { useToast } from "@/components/ui/ToastProvider";
import PasswordInput from "@/components/ui/PasswordInput";
import { PASSWORD_HINT, newPasswordPolicyMessage } from "@/lib/auth/passwordPolicy";
import { searchLocations, type Location } from "@/lib/location";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { getUserLocationPref, saveUserLocationPref, type UserLocationPref } from "@/lib/location/userLocationPref";
import { BackupTab, ExportTab, RestoreTab } from "./BackupSections";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "security" | "location" | "contact" | "export" | "backup" | "restore";

type SupportMessage = {
  id: string;
  subject: string;
  message: string;
  priority: "normal" | "urgent";
  status: "open" | "read" | "replied" | "closed";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "security",  label: "Hesap Güvenliği",    icon: KeyRound      },
  { id: "location",  label: "Konum",               icon: MapPin        },
  { id: "contact",   label: "Admin ile İrtibat",   icon: MessageSquare },
  { id: "export",    label: "Dışa Aktarım",        icon: FileText      },
  { id: "backup",    label: "Sistem Yedeği",        icon: FileJson      },
  { id: "restore",   label: "Geri Yükleme",         icon: RotateCcw     },
];

const STATUS_LABELS: Record<string, string> = {
  open:    "Açık",
  read:    "Okundu",
  replied: "Yanıtlandı",
  closed:  "Kapatıldı",
};

const STATUS_COLORS: Record<string, string> = {
  open:    "bg-amber-100 text-amber-800",
  read:    "bg-sky-100 text-sky-800",
  replied: "bg-emerald-100 text-emerald-800",
  closed:  "bg-slate-100 text-slate-600",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete: "current-password" | "new-password";
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-slate-700">{label}</label>
      <PasswordInput
        id={id}
        wrapperClassName="mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />
    </div>
  );
}

// ─── Tab: Hesap Güvenliği ─────────────────────────────────────────────────────

function SecurityTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const [oldPw,     setOldPw]     = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [success,   setSuccess]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPw || !newPw || !confirmPw) {
      showToast({ message: "Tüm alanları doldurun.", type: "warning" });
      return;
    }
    if (newPw !== confirmPw) {
      showToast({ message: "Yeni parola tekrarı eşleşmiyor.", type: "warning" });
      return;
    }
    const policyError = newPasswordPolicyMessage(newPw.trim(), user.email ?? "");
    if (policyError) {
      showToast({ message: policyError, type: "warning" });
      return;
    }

    setLoading(true);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/change-password", {
        method: "POST",
        headers: {
          "Content-Type":   "application/json",
          "x-user-id":      user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; sessions_revoked?: boolean };
      if (!res.ok || !json.ok) {
        showToast({ message: json.error ?? "Parola değiştirilemedi.", type: "error" });
      } else {
        setSuccess(true);
        setOldPw(""); setNewPw(""); setConfirmPw("");
        if (json.sessions_revoked === false) {
          showToast({
            title: "Parola güncellendi",
            message: "Ancak diğer cihazlardaki oturumlar kapatılamadı. Lütfen tekrar deneyin veya yöneticiye bildirin.",
            type: "warning",
            duration: 10000,
          });
        } else {
          showToast({ title: "Başarılı", message: "Parolanız güncellendi; diğer cihazlardaki oturumlar kapatıldı.", type: "success" });
        }
      }
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-violet-700">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          Parola değiştiğinde diğer cihazlardaki oturumlar otomatik kapatılır.
        </p>
      </div>

      <PasswordField id="settings-current-password" label="Mevcut Parola"     value={oldPw}     onChange={(v) => { setOldPw(v); setSuccess(false); }}     placeholder="Mevcut parolanızı girin"      autoComplete="current-password" />
      <PasswordField id="settings-new-password"     label="Yeni Parola"       value={newPw}     onChange={setNewPw}     placeholder="En az 6 karakter"             autoComplete="new-password" />
      <p className="-mt-2 text-xs font-medium text-slate-500">{PASSWORD_HINT}</p>
      <PasswordField id="settings-new-password-2"   label="Yeni Parola Tekrar" value={confirmPw} onChange={setConfirmPw} placeholder="Yeni parolanızı tekrar girin" autoComplete="new-password" />

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : success ? (
          <Check className="h-4 w-4" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
        {loading ? "Güncelleniyor…" : success ? "Güncellendi" : "Parolayı Güncelle"}
      </button>
    </form>
  );
}

// ─── Tab: Admin ile İrtibat ───────────────────────────────────────────────────

function ContactTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const [subject,  setSubject]  = useState("");
  const [message,  setMessage]  = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [loading,  setLoading]  = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(true);

  // Spinner durumu effect gövdesinde senkron set edilmez (react-hooks/set-state-in-effect):
  // ilk yüklemede loadingMsgs zaten true; gönderim sonrası yenilemede spinner gerekmez.
  const loadMessages = useCallback(async () => {
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/support", {
        headers: {
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: SupportMessage[] };
      if (res.ok) setMessages(json.messages ?? []);
    } catch {
      /* liste yenilenemedi — mevcut liste korunur */
    } finally {
      setLoadingMsgs(false);
    }
  }, [user.id]);

  useEffect(() => {
    // İlk yükleme bir mikro-görevde başlar (effect gövdesinde senkron state güncellemesi yok);
    // unmount sonrası başlatılmaz.
    let alive = true;
    void Promise.resolve().then(() => (alive ? loadMessages() : undefined));
    return () => { alive = false; };
  }, [loadMessages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) { showToast({ message: "Konu giriniz.", type: "warning" }); return; }
    if (!message.trim()) { showToast({ message: "Mesaj giriniz.", type: "warning" }); return; }

    setLoading(true);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ subject, message, priority }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast({ message: json.error ?? "Gönderilemedi.", type: "error" });
      } else {
        showToast({ title: "Gönderildi", message: "Mesajınız admin'e iletildi.", type: "success" });
        setSubject(""); setMessage(""); setPriority("normal");
        void loadMessages();
      }
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 w-full">
      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label htmlFor="settings-contact-subject" className="block text-sm font-bold text-slate-700">Konu</label>
          <input
            id="settings-contact-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Mesaj konusu"
            maxLength={200}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        <div>
          <label htmlFor="settings-contact-message" className="block text-sm font-bold text-slate-700">Mesaj</label>
          <textarea
            id="settings-contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mesajınızı buraya yazın…"
            rows={5}
            maxLength={5000}
            className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <p className="mt-0.5 text-right text-[11px] text-slate-400">{message.length}/5000</p>
        </div>

        <div>
          <p id="settings-contact-priority" className="block text-sm font-bold text-slate-700">Öncelik</p>
          <div className="mt-1.5 flex gap-2" role="group" aria-labelledby="settings-contact-priority">
            {(["normal", "urgent"] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={priority === p}
                onClick={() => setPriority(p)}
                className={`flex-1 rounded-xl border py-2 text-sm font-semibold transition ${
                  priority === p
                    ? p === "urgent"
                      ? "border-rose-400 bg-rose-50 text-rose-700"
                      : "border-violet-400 bg-violet-50 text-violet-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                {p === "normal" ? "Normal" : "⚡ Acil"}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {loading ? "Gönderiliyor…" : "Gönder"}
        </button>
      </form>

      <DirectContactOptions />

      {loadingMsgs ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Mesajlar yükleniyor…
        </div>
      ) : messages.length > 0 ? (
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Önceki Mesajlar</p>
          <div className="space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className="rounded-xl border border-slate-100 bg-white/80 shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpanded((e) => (e === msg.id ? null : msg.id))}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">{msg.subject}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[msg.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {STATUS_LABELS[msg.status] ?? msg.status}
                      </span>
                      {msg.priority === "urgent" && (
                        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">Acil</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{fmtDate(msg.created_at)}</p>
                  </div>
                  {expanded === msg.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                </button>
                {expanded === msg.id && (
                  <div className="border-t border-slate-100 px-4 py-3 space-y-3">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.message}</p>
                    {msg.admin_note && (
                      <div className="rounded-lg bg-emerald-50 px-3 py-2 border border-emerald-200">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-1">Admin Notu</p>
                        <p className="text-sm text-emerald-800 whitespace-pre-wrap">{msg.admin_note}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sistem mesajına ek doğrudan iletişim yolları (WhatsApp click-to-chat + telefon).
 * Numaralar YALNIZ merkezî kaynaklardan gelir: WhatsApp → lib/contact/whatsapp.ts,
 * telefon → lib/contact/info.ts. WhatsApp kartı mevcut default-deny gate'e
 * (WHATSAPP_CONTACT_ENABLED) bağlıdır; kapalıyken link üretilmez/gösterilmez.
 */
function DirectContactOptions() {
  const ctaBase =
    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold no-underline shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  return (
    <section aria-labelledby="settings-direct-contact" className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <h3 id="settings-direct-contact" className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Daha hızlı iletişim için
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Mesajınıza geç dönüş alırsanız bize WhatsApp veya telefonla da ulaşabilirsiniz.
      </p>
      <div className={`mt-3 grid grid-cols-1 gap-3 ${WHATSAPP_CONTACT_ENABLED ? "sm:grid-cols-2" : ""}`}>
        {WHATSAPP_CONTACT_ENABLED && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm" aria-hidden>
                <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-emerald-900">WhatsApp</p>
                <p className="text-base font-black tracking-tight text-emerald-800">{WHATSAPP_DISPLAY_NUMBER}</p>
              </div>
            </div>
            <a
              href={buildWhatsAppUrl(WHATSAPP_SUPPORT_MESSAGE)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp’tan yaz: ${WHATSAPP_DISPLAY_NUMBER} (yeni sekmede açılır)`}
              className={`${ctaBase} bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400`}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              WhatsApp’tan Yaz
            </a>
          </div>
        )}
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm" aria-hidden>
              <Phone className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">Telefon</p>
              <p className="text-base font-black tracking-tight text-violet-800">{CUSTOMER_SERVICE_DISPLAY}</p>
            </div>
          </div>
          <a
            href={buildTelHref()}
            aria-label={`Telefonla ara: ${CUSTOMER_SERVICE_DISPLAY}`}
            className={`${ctaBase} bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-400`}
          >
            <Phone className="h-4 w-4" aria-hidden />
            Telefonla Ara
          </a>
        </div>
      </div>
    </section>
  );
}

// Dışa Aktarım / Sistem Yedeği / Geri Yükleme sekmeleri: ./BackupSections.tsx (PAKET BACKUP).

// ─── Tab: Konum ───────────────────────────────────────────────────────────────

function LocationTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const isDemo = user.is_demo_account === true;
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [current,  setCurrent]  = useState<UserLocationPref | null>(null);
  const [selected, setSelected] = useState<Location | null>(null);
  const [query,    setQuery]    = useState("");
  const [open,     setOpen]     = useState(false);

  const results = useMemo(
    () => searchLocations(query, { dataset: TR_LOCATIONS, limit: 8 }),
    [query],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const pref = await getUserLocationPref();
      if (!alive) return;
      if (pref) {
        setCurrent(pref);
        setSelected(TR_LOCATIONS.find((l) => l.id === pref.location_id) ?? null);
        setQuery(pref.name);
      } else {
        const ankara = TR_LOCATIONS.find((l) => l.name === "Ankara") ?? null;
        setSelected(ankara);
        setQuery(ankara?.name ?? "");
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function handleSave() {
    if (!selected) { showToast({ message: "Önce bir şehir seçin.", type: "warning" }); return; }
    setSaving(true);
    const res = await saveUserLocationPref(selected);
    setSaving(false);
    if (res.ok) {
      showToast({ title: "Kaydedildi", message: `Varsayılan konum: ${selected.name}`, type: "success" });
      setCurrent({
        location_id: selected.id, name: selected.name, country_code: selected.countryCode,
        lat: selected.lat, lon: selected.lon, elev: selected.elev, tz: selected.tz, source: selected.source,
      });
    } else {
      showToast({ message: res.error ?? "Kaydedilemedi.", type: "error" });
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Mevcut varsayılan konum</p>
        <p className="mt-0.5 text-sm font-black text-slate-800">
          {current ? `${current.name} (${current.country_code})` : "Kayıtlı değil — varsayılan: Ankara"}
        </p>
      </div>

      {isDemo && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3.5 py-2.5" role="note">
          <span className="mt-0.5 shrink-0 text-sm leading-none" aria-hidden>⚠️</span>
          <p className="text-[11px] font-semibold leading-relaxed text-amber-800">
            Demo hesabında varsayılan konum kaydedilemez.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="loc-search" className="mb-1 block text-[11px] font-bold text-slate-600">Şehir ara (81 il)</label>
        <div className="relative max-w-xs">
          <input
            id="loc-search"
            type="text"
            value={query}
            autoComplete="off"
            aria-label="Varsayılan konum için şehir ara"
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Örn. Manisa, İzmir…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:border-violet-300 focus:outline-none"
          />
          {open && results.length > 0 && (
            <ul className="absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {results.map((loc) => (
                <li key={loc.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setSelected(loc); setQuery(loc.name); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-violet-50 ${selected?.id === loc.id ? "bg-violet-50 font-bold text-violet-700" : "text-slate-700"}`}
                  >
                    <span className="truncate">{loc.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{loc.country}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selected && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            Seçili: <span className="font-semibold text-slate-600">{selected.name}</span> · {selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !selected}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Varsayılan konumu kaydet
      </button>

      <p className="text-[11px] leading-relaxed text-slate-400">
        Varsayılan konum, Kozmik Ajanda tutulma görünürlüğü gibi konuma bağlı hesaplarda başlangıç şehri olarak kullanılır.
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// localStorage oturumu — useSyncExternalStore (SSR'da null; hydration uyumsuzluğu yok).
const noopSubscribe = () => () => {};
const readStoredUserRaw = () => {
  try {
    return localStorage.getItem("yasam_user");
  } catch {
    return null;
  }
};
const serverUserRaw = () => null;

export default function SettingsPage() {
  const storedUserRaw = useSyncExternalStore(noopSubscribe, readStoredUserRaw, serverUserRaw);
  const checked = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // storedUserRaw değişince yeniden ayrıştır (readYasamUser şema doğrulamasını yapar).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const user = useMemo<YasamUser | null>(() => (checked ? readYasamUser() : null), [checked, storedUserRaw]);
  const [tab,     setTab]     = useState<Tab>("security");

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef2ff_0%,#f0fdfa_100%)]">
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#eef2ff_0%,#f0fdfa_100%)]">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-8 text-center shadow-xl">
          <Shield className="mx-auto mb-3 h-10 w-10 text-violet-400" />
          <p className="text-base font-bold text-slate-800">Giriş yapmanız gerekiyor.</p>
          <Link href="/?login=1" className="mt-4 inline-block text-sm font-semibold text-violet-600 hover:underline">
            Giriş Yap →
          </Link>
        </div>
      </main>
    );
  }

  const activeTabDef = TABS.find((t) => t.id === tab)!;
  const isDemo = user.is_demo_account === true;
  const DEMO_LOCKED_TABS: Tab[] = ["security", "export", "backup", "restore"];
  const isDemoLockedTab = isDemo && DEMO_LOCKED_TABS.includes(tab);

  return (
    <main className="relative min-h-screen w-full overflow-x-clip bg-[linear-gradient(160deg,#eef5ff_0%,#f6f3ff_45%,#fff8fb_100%)] text-slate-950 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[140px]" aria-hidden />
      <div className="pointer-events-none absolute -right-20 top-20 h-[420px] w-[420px] rounded-full bg-fuchsia-200/20 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-sky-200/15 blur-[110px]" aria-hidden />

      <div className="relative mx-auto w-full lg:max-w-[1400px] 2xl:max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">

        {/* Premium header — admin panel çizgisini takip eder */}
        <header className="relative mb-6 overflow-clip rounded-2xl border border-white/30 bg-gradient-to-r from-slate-900 via-violet-900 to-fuchsia-900 px-6 py-5 text-white shadow-[0_12px_40px_rgba(88,28,135,0.18)] sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5 blur-2xl" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <Shield className="h-5 w-5 text-white/90" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Ayarlar & Güvenlik</h1>
                <p className="mt-0.5 text-xs text-white/55">Parola, iletişim, yedekleme ve dışa aktarma</p>
              </div>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white/80 ring-1 ring-white/20 transition hover:bg-white/20 hover:text-white"
              aria-label="Ana sayfaya dön"
            >
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ana Sayfa
            </Link>
          </div>
        </header>

        {/* Mobil: 2 sütun · tablet (md): 3 sütun · lg+: tek satır eşit genişlikte sekmeler.
            (md'de tek satır 768–1000px arasında son sekmeyi ekran dışına itiyordu.) */}
        <div className="mb-5">
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-md backdrop-blur-xl md:grid-cols-3 lg:flex lg:gap-1.5">
            {TABS.map((t, idx) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setTab(t.id)}
                  className={[
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200",
                    "md:text-sm lg:flex-1 lg:whitespace-nowrap",
                    idx === TABS.length - 1 ? "col-span-2 mx-auto w-1/2 md:col-span-1 md:mx-0 md:w-auto" : "",
                    isActive
                      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md"
                      : "text-slate-500 hover:bg-violet-50 hover:text-violet-700",
                  ].filter(Boolean).join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {isDemo && (
          <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-amber-300/80 bg-amber-50/90 px-4 py-3">
            <span className="mt-0.5 text-base leading-none" aria-hidden>⚠️</span>
            <p className="text-xs font-semibold text-amber-800 leading-relaxed">
              Demo hesabında yedekleme, geri yükleme, dışa aktarma ve parola değiştirme işlemleri kapalıdır.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-white/80 bg-white/80 p-6 shadow-[0_8px_30px_rgba(0,0,0,0.07)] backdrop-blur-xl lg:p-8">
          <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
            {(() => {
              const Icon = activeTabDef.icon;
              return (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
                  <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                </div>
              );
            })()}
            <h2 className="text-base font-black text-slate-900 sm:text-lg">{activeTabDef.label}</h2>
          </div>

          {isDemoLockedTab ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <Shield className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
              <p className="text-sm font-bold text-slate-600">Bu işlem demo hesabında kapalıdır.</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Yedekleme, geri yükleme, dışa aktarma ve parola değiştirme yalnızca kayıtlı hesaplarda kullanılabilir.
              </p>
            </div>
          ) : (
            <>
              {tab === "security"  && <SecurityTab user={user} />}
              {tab === "location"  && <LocationTab user={user} />}
              {tab === "contact"   && <ContactTab  user={user} />}
              {tab === "export"    && <ExportTab   user={user} />}
              {tab === "backup"    && <BackupTab   user={user} />}
              {tab === "restore"   && <RestoreTab  user={user} />}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
