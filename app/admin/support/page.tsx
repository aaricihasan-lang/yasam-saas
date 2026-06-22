"use client";

import Link from "next/link";
import { useBfcacheRefresh } from "@/hooks/useBfcacheRefresh";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { clearYasamUser, isAdminUser, readYasamUser, type YasamUser } from "@/lib/auth/yasamUser";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/ToastProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type SupportMsg = {
  id: string;
  subject: string;
  message: string;
  priority: "normal" | "urgent";
  status: "open" | "read" | "replied" | "closed";
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  users?: { full_name?: string; email?: string } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open:    "Açık",
  read:    "Okundu",
  replied: "Yanıtlandı",
  closed:  "Kapatıldı",
};

const STATUS_COLORS: Record<string, string> = {
  open:    "bg-amber-100 text-amber-800 border-amber-200",
  read:    "bg-sky-100 text-sky-800 border-sky-200",
  replied: "bg-emerald-100 text-emerald-800 border-emerald-200",
  closed:  "bg-slate-100 text-slate-600 border-slate-200",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Components ───────────────────────────────────────────────────────────────

function MessageCard({
  msg,
  adminId,
  onUpdated,
}: {
  msg: SupportMsg;
  adminId: string;
  onUpdated: () => void;
}) {
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [note,     setNote]     = useState(msg.admin_note ?? "");
  const [status,   setStatus]   = useState(msg.status);
  const [saving,   setSaving]   = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-id": adminId,
        },
        body: JSON.stringify({ id: msg.id, status, admin_note: note }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showToast({ message: json.error ?? "Güncellenemedi.", type: "error" });
      } else {
        showToast({ title: "Kaydedildi", message: "Mesaj güncellendi.", type: "success" });
        onUpdated();
      }
    } catch {
      showToast({ message: "Bağlantı hatası.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const userName = msg.users?.full_name || msg.users?.email || "Kullanıcı";

  return (
    <div className={`rounded-2xl border bg-white/90 shadow-sm transition-all ${msg.priority === "urgent" ? "border-rose-200" : "border-slate-100"}`}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-900">{msg.subject}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[msg.status] ?? STATUS_COLORS.closed}`}>
              {STATUS_LABELS[msg.status] ?? msg.status}
            </span>
            {msg.priority === "urgent" && (
              <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">⚡ Acil</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {userName} · {fmtDate(msg.created_at)}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400 mt-1" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 mt-1" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {/* Message */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">Mesaj</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{msg.message}</p>
          </div>

          {/* Status update */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Durum
            </label>
            <div className="flex flex-wrap gap-2">
              {(["open", "read", "replied", "closed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    status === s
                      ? STATUS_COLORS[s]
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Admin note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Admin Notu
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Kullanıcıya görünecek dahili not…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-9 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-xs font-bold text-white shadow transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminSupportPage() {
  useBfcacheRefresh();
  const router = useRouter();
  const [user,     setUser]     = useState<YasamUser | null>(null);
  const [checked,  setChecked]  = useState(false);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState<string>("all");

  useEffect(() => {
    setUser(readYasamUser());
    setChecked(true);
  }, []);

  const fetchMessages = useCallback(async (adminId: string) => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/support${params}`, {
        headers: { "x-admin-id": adminId },
      });
      const json = (await res.json()) as { messages?: SupportMsg[] };
      setMessages(json.messages ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (checked && user && isAdminUser(user)) {
      void fetchMessages(user.id);
    }
  }, [checked, user, fetchMessages]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_100%)]">
        <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
      </main>
    );
  }

  if (!isAdminUser(user)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_100%)]">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-8 text-center shadow-xl">
          <p className="text-base font-bold text-slate-800">Erişim reddedildi.</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 text-sm font-semibold text-rose-600 hover:underline"
          >
            Çıkış Yap
          </button>
        </div>
      </main>
    );
  }

  const openCount = messages.filter((m) => m.status === "open").length;
  const urgentCount = messages.filter((m) => m.priority === "urgent" && m.status !== "closed").length;

  return (
    <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-violet-300/25 blur-[140px]" aria-hidden />
      <div className="pointer-events-none absolute -right-24 top-24 h-[480px] w-[480px] rounded-full bg-rose-200/20 blur-[130px]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link
            href="/admin"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/80 text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700"
            aria-label="Admin paneline dön"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-slate-900 sm:text-2xl">Destek Mesajları</h1>
            <p className="mt-0.5 text-xs text-slate-500">Uzmanlardan gelen mesaj ve destek talepleri</p>
          </div>
          <button
            type="button"
            onClick={() => { if (user) void fetchMessages(user.id); }}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Toplam", value: messages.length, color: "text-slate-800" },
            { label: "Açık",   value: openCount,       color: "text-amber-700"  },
            { label: "Acil",   value: urgentCount,      color: "text-rose-700"   },
            { label: "Kapalı", value: messages.filter((m) => m.status === "closed").length, color: "text-slate-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
              <p className={`mt-1 text-2xl font-black tabular-nums ${color}`}>{loading ? "…" : value}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { key: "all",     label: "Tümü"        },
            { key: "open",    label: "Açık"        },
            { key: "read",    label: "Okundu"      },
            { key: "replied", label: "Yanıtlandı"  },
            { key: "closed",  label: "Kapatıldı"   },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                filter === key
                  ? "border-violet-400 bg-violet-50 text-violet-700"
                  : "border-slate-200 bg-white/80 text-slate-500 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {loading ? (
          <div className="flex items-center gap-3 py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Yükleniyor…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 py-16 text-center">
            <MessageSquare className="mb-3 h-10 w-10 text-slate-200" />
            <p className="text-sm font-bold text-slate-600">Henüz mesaj yok</p>
            <p className="mt-1 text-xs text-slate-400">Uzmanlardan yeni mesaj geldiğinde burada görünecek.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageCard
                key={msg.id}
                msg={msg}
                adminId={user!.id}
                onUpdated={() => { if (user) void fetchMessages(user.id); }}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
