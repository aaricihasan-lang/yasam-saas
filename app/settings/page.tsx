"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquare,
  RotateCcw,
  Send,
  Shield,
  Upload,
} from "lucide-react";
import { readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { readSessionToken } from "@/lib/auth/yasamUser";
import { useToast } from "@/components/ui/ToastProvider";
import { searchLocations, type Location } from "@/lib/location";
import { TR_LOCATIONS } from "@/lib/location/tr";
import { getUserLocationPref, saveUserLocationPref, type UserLocationPref } from "@/lib/location/userLocationPref";

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

type ExportModule = {
  key: string;
  label: string;
  desc: string;
  tableCount: number;
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

const EXPORT_MODULES: ExportModule[] = [
  { key: "clients",        label: "Danışan Yolculuğu",              desc: "Danışanlar, notlar, randevular, seanslar, ödevler, analizler, taş eşleşmeleri", tableCount: 7 },
  { key: "numerology",     label: "Numeroloji",                     desc: "Analiz kayıtları, bilgi bankası, taş atamaları",                                tableCount: 3 },
  { key: "human_design",   label: "Human Design",                   desc: "Danışanlar, haritalar, raporlar, bilgi bankası",                                tableCount: 4 },
  { key: "dogaltas",       label: "Doğaltaş",                       desc: "Taşlar, mineraller, kombinasyonlar, stok",                                      tableCount: 4 },
  { key: "dijital_icerik", label: "Dijital İçerik",                 desc: "Kişisel arşivler ve dosya listesi (metadata)",                                  tableCount: 2 },
  { key: "bioenerji",      label: "Biyoenerji & Enerji Bedenleri",  desc: "Seanslar, semboller, imajinasyonlar, çakralar, enerji bedenleri, bilinçaltı",   tableCount: 6 },
  { key: "refleksoloji",   label: "Refleksoloji",                   desc: "Tüm protokol kayıtları",                                                        tableCount: 1 },
  { key: "aromaterapi",    label: "Aromaterapi",                    desc: "Yağ kayıtları, bilgi bankası, referans sayfaları",                              tableCount: 3 },
  { key: "sifa_rehberi",   label: "Şifa Rehberi",                   desc: "Tüm rehber kayıtları",                                                          tableCount: 1 },
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

function isMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-bold text-slate-700">{label}</label>
      <div className="relative mt-1.5">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-11 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
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
      showToast({ message: "Yeni şifre tekrarı eşleşmiyor.", type: "warning" });
      return;
    }
    if (newPw.length < 6) {
      showToast({ message: "Yeni şifre en az 6 karakter olmalı.", type: "warning" });
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast({ message: json.error ?? "Şifre değiştirilemedi.", type: "error" });
      } else {
        setSuccess(true);
        setOldPw(""); setNewPw(""); setConfirmPw("");
        showToast({ title: "Başarılı", message: "Şifreniz güncellendi.", type: "success" });
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
          Şifre değiştiğinde diğer cihazlardaki oturumlar otomatik kapatılır.
        </p>
      </div>

      <PasswordInput label="Mevcut Şifre"     value={oldPw}     onChange={setOldPw}     placeholder="Mevcut şifrenizi girin"      />
      <PasswordInput label="Yeni Şifre"        value={newPw}     onChange={setNewPw}     placeholder="En az 6 karakter"            />
      <PasswordInput label="Yeni Şifre Tekrar" value={confirmPw} onChange={setConfirmPw} placeholder="Yeni şifrenizi tekrar girin" />

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
        {loading ? "Güncelleniyor…" : success ? "Güncellendi" : "Şifreyi Güncelle"}
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

  async function loadMessages() {
    setLoadingMsgs(true);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/support", {
        headers: {
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
      });
      const json = (await res.json()) as { messages?: SupportMessage[] };
      setMessages(json.messages ?? []);
    } catch {
      /* silent */
    } finally {
      setLoadingMsgs(false);
    }
  }

  useEffect(() => { void loadMessages(); }, []);

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
      const json = (await res.json()) as { ok?: boolean; error?: string };
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
          <label className="block text-sm font-bold text-slate-700">Konu</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Mesaj konusu"
            maxLength={200}
            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700">Mesaj</label>
          <textarea
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
          <label className="block text-sm font-bold text-slate-700">Öncelik</label>
          <div className="mt-1.5 flex gap-2">
            {(["normal", "urgent"] as const).map((p) => (
              <button
                key={p}
                type="button"
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

// ─── Tab: Dışa Aktarım ────────────────────────────────────────────────────────

function ExportTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const [loadingModule, setLoadingModule] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  async function handleExport(moduleKey: string, label: string) {
    if (loadingModule) return;
    setLoadingModule(moduleKey);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ module: moduleKey }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        showToast({ message: json.error ?? "Dışa aktarılamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${moduleKey}-arsiv-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast({ title: "İndirildi", message: `${label} raporu hazır.`, type: "success" });
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoadingModule(null);
    }
  }

  const isLoading = loadingModule !== null;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
        <p className="text-xs font-semibold text-emerald-800">
          Word dışa aktarım, Yaşam Sistemi dışında da okunabilir tam arşiv rapordur.
          Tüm kayıtlar dahildir. Geri yüklenebilir sistem yedeği için <strong>Sistem Yedeği</strong> sekmesini kullanın.
        </p>
      </div>

      {mobile && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700">
            Büyük raporları masaüstü tarayıcıdan indirmeniz önerilir.
          </p>
        </div>
      )}

      {/* Toplu indirme butonu */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-black text-violet-900">Tüm Verilerimi Word Olarak İndir</p>
            <p className="mt-0.5 text-xs text-violet-600">
              9 modül · 31 tablo · Tüm kayıtlar tek belgede
            </p>
          </div>
          <button
            type="button"
            onClick={() => { void handleExport("all", "Tüm Veriler"); }}
            disabled={isLoading}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
          >
            {loadingModule === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {loadingModule === "all" ? "Hazırlanıyor…" : "Tümünü İndir"}
          </button>
        </div>
      </div>

      {/* Modül bazlı butonlar */}
      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Modül Bazlı İndir</p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {EXPORT_MODULES.map((mod) => (
            <div
              key={mod.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{mod.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-400 truncate">{mod.tableCount} tablo · {mod.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => { void handleExport(mod.key, mod.label); }}
                disabled={isLoading}
                className="flex shrink-0 h-8 w-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                title={`${mod.label} Word İndir`}
              >
                {loadingModule === mod.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Sistem Yedeği ───────────────────────────────────────────────────────

function BackupTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleBackup() {
    if (loading) return;
    setLoading(true);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/backup", {
        headers: {
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
      });
      if (!res.ok) {
        showToast({ message: "Yedek alınamadı.", type: "error" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yasam-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast({ title: "Yedek Alındı", message: "JSON yedek dosyanız indirildi.", type: "success" });
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 w-full">
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 shadow-sm">
        <FileJson className="h-10 w-10 text-slate-400 mb-3" />
        <h3 className="text-base font-bold text-slate-900">Sistem Yedeği — Eksiksiz JSON</h3>
        <p className="mt-1.5 text-sm text-slate-600">
          Tüm modüllerdeki verilerinizi <strong>eksiksiz ve geri yüklenebilir</strong> JSON formatında indirin.
          Bu dosya Geri Yükleme sekmesi ile sisteme aktarılabilir.
        </p>
        <ul className="mt-3 space-y-1">
          {[
            "Danışan yolculuğu (7 tablo)",
            "Numeroloji (3 tablo)",
            "Human Design (4 tablo)",
            "Doğaltaş & stok (4 tablo)",
            "Dijital içerik metadata (2 tablo)",
            "Biyoenerji (6 tablo)",
            "Refleksoloji (1 tablo)",
            "Aromaterapi (3 tablo — yağlar, bilgi, referans)",
            "Şifa Rehberi (1 tablo)",
            "Destek mesajları (1 tablo)",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-slate-500">
              <Check className="h-3 w-3 shrink-0 text-emerald-500" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-400 italic">
          Storage dosyaları (resim, ses, belge) dahil değildir — yalnızca veritabanı kayıtları.
        </p>
        <button
          type="button"
          onClick={handleBackup}
          disabled={loading}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Hazırlanıyor…" : "Sistem Yedeği İndir"}
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Geri Yükleme ────────────────────────────────────────────────────────

type RestoreSummary = Record<string, { inserted: number; skipped: number; error: string | null }>;

function RestoreTab({ user }: { user: YasamUser }) {
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileInfo, setFileInfo]       = useState<{ name: string; size: string } | null>(null);
  const [validated, setValidated]     = useState<{ ok: boolean; message: string } | null>(null);
  const [parsedBackup, setParsedBackup] = useState<unknown>(null);
  const [confirmed, setConfirmed]     = useState(false);
  const [loading, setLoading]         = useState(false);
  const [summary, setSummary]         = useState<RestoreSummary | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileInfo({ name: file.name, size: (file.size / 1024).toFixed(1) + " KB" });
    setValidated(null);
    setParsedBackup(null);
    setConfirmed(false);
    setSummary(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        if (typeof parsed !== "object" || parsed === null) throw new Error("Geçersiz yapı");
        const ver = parsed.version as string;
        if (ver !== "1.0" && ver !== "2.0") throw new Error("Desteklenmeyen versiyon: " + ver);
        if (!parsed.tables || typeof parsed.tables !== "object") throw new Error("'tables' alanı eksik");
        const tableCount = Object.keys(parsed.tables as object).length;
        setParsedBackup(parsed);
        setValidated({ ok: true, message: `✓ v${ver} — ${tableCount} tablo, format geçerli.` });
      } catch (err) {
        setValidated({ ok: false, message: (err as Error).message });
      }
    };
    reader.readAsText(file);
  }

  async function handleRestore() {
    if (!parsedBackup || !confirmed || loading) return;
    setLoading(true);
    setSummary(null);
    const sessionToken = readSessionToken();
    try {
      const res = await fetch("/api/settings/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          ...(sessionToken ? { "x-session-token": sessionToken } : {}),
        },
        body: JSON.stringify({ backup: parsedBackup }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; summary?: RestoreSummary };
      if (!res.ok || !json.ok) {
        showToast({ message: json.error ?? "Geri yükleme başarısız.", type: "error" });
      } else {
        setSummary(json.summary ?? {});
        showToast({ title: "Tamamlandı", message: "Geri yükleme işlemi tamamlandı.", type: "success" });
      }
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 w-full">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
        <p className="text-xs font-semibold text-amber-700">
          Güvenli Mod: Mevcut veriler silinmez. Çakışan kayıtlar atlanır, yeni kayıtlar eklenir.
          v1.0 ve v2.0 yedek formatları desteklenir.
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700">JSON Yedek Dosyası</label>
        <div
          className="mt-1.5 flex min-h-[100px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center transition hover:border-violet-300 hover:bg-violet-50/30"
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); }
          }}
          aria-label="Yedek dosyası seç"
        >
          <Upload className="h-8 w-8 text-slate-300 mb-2" />
          {fileInfo ? (
            <>
              <p className="text-sm font-bold text-slate-700">{fileInfo.name}</p>
              <p className="text-xs text-slate-400">{fileInfo.size}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Dosyayı buraya sürükleyin veya tıklayın</p>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={handleFileChange} />
      </div>

      {validated && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${validated.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {validated.message}
        </div>
      )}

      {validated?.ok && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span className="text-xs font-semibold text-amber-800">
            Onaylıyorum: Bu işlem mevcut verilerimi silmez, yalnızca eksik kayıtları ekler. Çakışan kayıtlar atlanır.
          </span>
        </label>
      )}

      {summary && (
        <div className="rounded-xl border border-slate-100 bg-white/80 p-4">
          <p className="text-sm font-bold text-slate-700 mb-3">İçe Aktarım Sonucu</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.entries(summary).map(([table, s]) => (
              <div key={table} className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 truncate">{table}</span>
                <div className="flex shrink-0 gap-2 text-[11px]">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">{s.inserted} eklendi</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">{s.skipped} atlandı</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleRestore}
        disabled={!parsedBackup || !validated?.ok || !confirmed || loading}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {loading ? "Geri Yükleniyor…" : "Yedeği İçe Aktar"}
      </button>
    </div>
  );
}

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

export default function SettingsPage() {
  const [user,    setUser]    = useState<YasamUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab,     setTab]     = useState<Tab>("security");

  useEffect(() => {
    setUser(readYasamUser());
    setChecked(true);
  }, []);

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
    <main className="relative min-h-screen w-full overflow-x-hidden bg-[linear-gradient(160deg,#eef5ff_0%,#f6f3ff_45%,#fff8fb_100%)] text-slate-950 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/20 blur-[140px]" aria-hidden />
      <div className="pointer-events-none absolute -right-20 top-20 h-[420px] w-[420px] rounded-full bg-fuchsia-200/20 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-sky-200/15 blur-[110px]" aria-hidden />

      <div className="relative mx-auto w-full lg:max-w-[1400px] 2xl:max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">

        {/* Premium header — admin panel çizgisini takip eder */}
        <header className="relative mb-6 overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-r from-slate-900 via-violet-900 to-fuchsia-900 px-6 py-5 text-white shadow-[0_12px_40px_rgba(88,28,135,0.18)] sm:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5 blur-2xl" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <Shield className="h-5 w-5 text-white/90" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight sm:text-2xl">Ayarlar & Güvenlik</h1>
                <p className="mt-0.5 text-xs text-white/55">Şifre, iletişim, yedekleme ve dışa aktarma</p>
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

        {/* Mobile: 2-sütun grid; md+: eşit genişlikte flex sekmeler */}
        <div className="mb-5">
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-md backdrop-blur-xl md:flex md:gap-1.5">
            {TABS.map((t, idx) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={[
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200",
                    "md:flex-1 md:whitespace-nowrap md:text-sm",
                    idx === TABS.length - 1 ? "col-span-2 mx-auto w-1/2 md:mx-0 md:w-auto" : "",
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
              Demo hesabında yedekleme, geri yükleme, dışa aktarma ve şifre değiştirme işlemleri kapalıdır.
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
                Yedekleme, geri yükleme, dışa aktarma ve şifre değiştirme yalnızca kayıtlı hesaplarda kullanılabilir.
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
