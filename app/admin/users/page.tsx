"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  Pencil,
  Shield,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  clearYasamUser,
  isAdminUser,
  normalizeRole,
  readYasamUser,
} from "@/lib/auth/yasamUser";
import { supabase } from "@/lib/supabase";

type ManagedUserRole = "admin" | "expert";

type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: ManagedUserRole;
  active: boolean;
  createdAt?: string;
};

function mapDbUser(row: Record<string, unknown>): ManagedUser | null {
  const role = normalizeRole(row.role);
  if (role !== "admin" && role !== "expert") return null;
  const id = row.id != null ? String(row.id).trim() : "";
  if (!id) return null;
  return {
    id,
    fullName: String(row.full_name ?? "").trim(),
    email: String(row.email ?? "").trim(),
    role,
    active: row.active === false ? false : Boolean(row.active ?? true),
    createdAt: row.created_at != null ? String(row.created_at) : undefined,
  };
}

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const inputClass =
  "mt-2 h-14 w-full rounded-2xl border-2 border-indigo-100 bg-white px-4 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100";

const labelClass = "block text-sm font-black text-slate-700";

const navBtn =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-2 px-6 text-base font-black shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[60px]";

const saveBtnClass =
  "inline-flex h-14 w-full items-center justify-center rounded-2xl border-2 border-violet-400 bg-gradient-to-r from-violet-100 via-fuchsia-100 to-rose-100 px-8 text-base font-black text-violet-950 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50";

function PastelLoader({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-4 border-violet-200/90" />
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-violet-500 border-r-fuchsia-400" />
        <Loader2 className="relative h-7 w-7 animate-spin text-violet-600" aria-hidden />
      </div>
      <p className="text-sm font-bold text-slate-600">{label}</p>
    </div>
  );
}

function UsersTopNav({ onLogout }: { onLogout: () => void }) {
  return (
    <nav
      className="sticky top-0 z-50 mb-8 grid gap-3 sm:grid-cols-2"
      aria-label="Üst navigasyon"
    >
      <Link
        href="/"
        className={`${navBtn} border-emerald-300/80 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950 hover:border-emerald-400 hover:from-emerald-100 hover:to-teal-100 no-underline`}
      >
        <span className="text-xl" aria-hidden>
          🏠
        </span>
        Ana Panele Dön
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className={`${navBtn} border-rose-300/80 bg-gradient-to-r from-rose-50 to-orange-50 text-rose-950 hover:border-rose-400 hover:from-rose-100 hover:to-orange-100`}
      >
        <span className="text-xl" aria-hidden>
          🚪
        </span>
        Çıkış Yap
      </button>
    </nav>
  );
}

function RoleBadge({ role }: { role: ManagedUserRole }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
        isAdmin
          ? "bg-violet-100 text-violet-900 ring-1 ring-violet-200"
          : "bg-sky-100 text-sky-900 ring-1 ring-sky-200"
      }`}
    >
      {isAdmin ? "Admin" : "Uzman"}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${
        active
          ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
          : "bg-slate-200 text-slate-700 ring-1 ring-slate-300"
      }`}
    >
      {active ? "Aktif" : "Pasif"}
    </span>
  );
}

type EmptyForm = {
  fullName: string;
  email: string;
  password: string;
  role: ManagedUserRole;
  active: boolean;
};

const emptyForm: EmptyForm = {
  fullName: "",
  email: "",
  password: "",
  role: "expert",
  active: true,
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const [form, setForm] = useState<EmptyForm>(emptyForm);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EmptyForm>(emptyForm);

  const [passwordUserId, setPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Kullanıcı listesi hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Kullanıcılar yüklenemedi: " + error.message,
        type: "error",
      });
      setListLoading(false);
      return;
    }

    const mapped = (data ?? [])
      .map((row) => mapDbUser(row as Record<string, unknown>))
      .filter((u): u is ManagedUser => u != null);

    setUsers(mapped);
    setListLoading(false);
  }, [showToast]);

  useEffect(() => {
    const user = readYasamUser();
    setAllowed(isAdminUser(user));
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (!sessionChecked || !allowed) return;
    loadUsers();
  }, [sessionChecked, allowed, loadUsers]);

  function handleLogout() {
    clearYasamUser();
    router.push("/");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    if (!fullName || !email || !form.password.trim()) {
      showToast({
        title: "İşlem başarısız",
        message: "Ad soyad, e-posta ve şifre zorunludur.",
        type: "error",
      });
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === email)) {
      showToast({
        title: "İşlem başarısız",
        message: "Bu e-posta adresi zaten kayıtlı.",
        type: "error",
      });
      return;
    }

    setCreating(true);
    const { error } = await supabase.from("users").insert({
      full_name: fullName,
      email,
      password: form.password.trim(),
      role: form.role,
      active: form.active,
    });

    if (error) {
      console.error("Kullanıcı ekleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Kayıt hatası: " + error.message,
        type: "error",
      });
      setCreating(false);
      return;
    }

    setForm(emptyForm);
    setCreating(false);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı eklendi.",
      type: "success",
    });
    await loadUsers();
  }

  function startEdit(user: ManagedUser) {
    setEditingId(user.id);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      password: "",
      role: user.role,
      active: user.active,
    });
    setPasswordUserId(null);
  }

  async function saveEdit() {
    if (!editingId) return;
    const fullName = editForm.fullName.trim();
    const email = editForm.email.trim().toLowerCase();
    if (!fullName || !email) {
      showToast({
        title: "İşlem başarısız",
        message: "Düzenleme: ad ve e-posta zorunludur.",
        type: "error",
      });
      return;
    }
    if (users.some((u) => u.id !== editingId && u.email.toLowerCase() === email)) {
      showToast({
        title: "İşlem başarısız",
        message: "Bu e-posta başka bir kullanıcıda kayıtlı.",
        type: "error",
      });
      return;
    }

    setSavingEdit(true);
    const { error } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        email,
        role: editForm.role,
        active: editForm.active,
      })
      .eq("id", editingId);

    if (error) {
      console.error("Kullanıcı güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Güncelleme hatası: " + error.message,
        type: "error",
      });
      setSavingEdit(false);
      return;
    }

    setEditingId(null);
    setSavingEdit(false);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı güncellendi.",
      type: "success",
    });
    await loadUsers();
  }

  async function savePassword() {
    if (!passwordUserId || !newPassword.trim()) {
      showToast({
        title: "İşlem başarısız",
        message: "Yeni şifre giriniz.",
        type: "error",
      });
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase
      .from("users")
      .update({ password: newPassword.trim() })
      .eq("id", passwordUserId);

    if (error) {
      console.error("Şifre güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Şifre güncellenemedi: " + error.message,
        type: "error",
      });
      setSavingPassword(false);
      return;
    }

    setPasswordUserId(null);
    setNewPassword("");
    setSavingPassword(false);
    showToast({
      title: "Başarılı",
      message: "Şifre güncellendi.",
      type: "success",
    });
  }

  async function toggleActive(user: ManagedUser) {
    const nextActive = !user.active;
    setActionUserId(user.id);
    const { error } = await supabase
      .from("users")
      .update({ active: nextActive })
      .eq("id", user.id);

    if (error) {
      console.error("Durum güncelleme hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "Durum güncellenemedi: " + error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: nextActive ? "Kullanıcı aktif yapıldı." : "Kullanıcı pasif yapıldı.",
      type: "success",
    });
    await loadUsers();
  }

  async function softDelete(id: string) {
    setActionUserId(id);
    const { error } = await supabase.from("users").update({ active: false }).eq("id", id);

    if (error) {
      console.error("Pasif yapma hatası:", error);
      showToast({
        title: "İşlem başarısız",
        message: "İşlem başarısız: " + error.message,
        type: "error",
      });
      setActionUserId(null);
      return;
    }

    setActionUserId(null);
    showToast({
      title: "Başarılı",
      message: "Kullanıcı silinmedi; pasif yapıldı.",
      type: "success",
    });
    await loadUsers();
  }

  if (!sessionChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#f0fdfa_100%)]">
        <PastelLoader label="Oturum kontrol ediliyor…" />
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="relative min-h-screen bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_50%,#fff1f2_100%)] px-6 py-12">
        <div className="mx-auto max-w-lg rounded-[28px] border border-rose-200 bg-white/90 p-10 text-center shadow-xl">
          <Shield className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-2xl font-black">Erişim reddedildi</h1>
          <p className="mt-2 text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
          <Link href="/" className="mt-6 inline-block font-black text-violet-700 no-underline">
            Ana panele dön
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(135deg,#fdf4ff_0%,#eef2ff_42%,#f0fdfa_100%)] text-slate-900 antialiased">
      <div className="pointer-events-none absolute -left-32 top-0 h-[480px] w-[480px] rounded-full bg-violet-300/20 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-24 h-[420px] w-[420px] rounded-full bg-rose-200/15 blur-[120px]" />

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
        <UsersTopNav onLogout={handleLogout} />

        <header className="mb-8">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-violet-700">
            Admin · Üye Yönetimi
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-[2.75rem]">
            Kullanıcı / Üye Yönetimi
          </h1>
          <p className="mt-2 text-base font-medium text-slate-600 sm:text-lg">
            Sistemdeki uzmanları ve üyeleri yönetin
          </p>
          <Link
            href="/admin"
            className="mt-4 inline-flex text-sm font-black text-violet-700 no-underline hover:text-violet-900"
          >
            ← Admin Yönetim Merkezi
          </Link>
        </header>

        <section className={`${panelClass} mb-8 border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/80`}>
          <h2 className="text-2xl font-black text-indigo-950">+ Yeni Uzman Ekle</h2>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Kayıtlar Supabase users tablosuna kaydedilir.
          </p>

          <form onSubmit={handleCreate} className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelClass}>Ad Soyad</span>
              <input
                className={inputClass}
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="Örn. Ayşe Yılmaz"
              />
            </label>
            <label className="block">
              <span className={labelClass}>E-posta</span>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="uzman@yasam.com"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Şifre</span>
              <input
                type="password"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Rol</span>
              <select
                className={inputClass}
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value as ManagedUserRole }))
                }
              >
                <option value="expert">expert</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label className="flex items-center gap-4 rounded-2xl border-2 border-indigo-100 bg-white px-4 py-4">
              <span className={labelClass}>Aktif / Pasif</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                className={`relative h-9 w-16 shrink-0 rounded-full transition ${
                  form.active ? "bg-emerald-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition ${
                    form.active ? "left-8" : "left-1"
                  }`}
                />
              </button>
              <span className="text-sm font-bold text-slate-700">
                {form.active ? "Aktif" : "Pasif"}
              </span>
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={creating} className={saveBtnClass}>
                {creating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Kaydediliyor…
                  </span>
                ) : (
                  "Kaydet"
                )}
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-xl font-black text-slate-900 sm:text-2xl">Kullanıcı Listesi</h2>
          {listLoading ? (
            <div className={`${panelClass} border-slate-200/80`}>
              <PastelLoader label="Kullanıcılar yükleniyor…" />
            </div>
          ) : users.length === 0 ? (
            <div className={`${panelClass} border-dashed border-slate-300 text-center`}>
              <p className="text-base font-black text-slate-800">Henüz kullanıcı yok</p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                Yukarıdaki formdan yeni uzman ekleyebilirsiniz.
              </p>
            </div>
          ) : (
          <div className="space-y-4">
            {users.map((user) => {
              const isEditing = editingId === user.id;
              return (
                <article
                  key={user.id}
                  className={`${panelClass} border-slate-200/80 ${
                    !user.active ? "opacity-80" : ""
                  }`}
                >
                  {isEditing ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block sm:col-span-2">
                        <span className={labelClass}>Ad Soyad</span>
                        <input
                          className={inputClass}
                          value={editForm.fullName}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, fullName: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>E-posta</span>
                        <input
                          type="email"
                          className={inputClass}
                          value={editForm.email}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, email: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Rol</span>
                        <select
                          className={inputClass}
                          value={editForm.role}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              role: e.target.value as ManagedUserRole,
                            }))
                          }
                        >
                          <option value="expert">expert</option>
                          <option value="admin">admin</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-4 sm:col-span-2">
                        <span className={labelClass}>Aktif</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={editForm.active}
                          onClick={() =>
                            setEditForm((f) => ({ ...f, active: !f.active }))
                          }
                          className={`relative h-9 w-16 rounded-full ${
                            editForm.active ? "bg-emerald-500" : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow ${
                              editForm.active ? "left-8" : "left-1"
                            }`}
                          />
                        </button>
                      </label>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          disabled={savingEdit}
                          className={saveBtnClass}
                        >
                          {savingEdit ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                              Kaydediliyor…
                            </span>
                          ) : (
                            "Kaydet"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="inline-flex h-14 flex-1 items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 px-6 font-black text-slate-800"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-xl font-black text-slate-900">{user.fullName}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{user.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <RoleBadge role={user.role} />
                          <StatusBadge active={user.active} />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordUserId(user.id);
                            setNewPassword("");
                            setEditingId(null);
                          }}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-950 transition hover:bg-amber-100"
                        >
                          <KeyRound className="h-4 w-4" />
                          Şifre Güncelle
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(user)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-violet-200 bg-violet-50 px-4 text-sm font-black text-violet-950 transition hover:bg-violet-100"
                        >
                          <Pencil className="h-4 w-4" />
                          Düzenle
                        </button>
                        <button
                          type="button"
                          disabled={actionUserId === user.id}
                          onClick={() => toggleActive(user)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 text-sm font-black text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.active ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                          {user.active ? "Pasif Yap" : "Aktif Yap"}
                        </button>
                        <button
                          type="button"
                          disabled={actionUserId === user.id}
                          onClick={() => softDelete(user.id)}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-950 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Kayıt silinmez, pasif yapılır"
                        >
                          <Trash2 className="h-4 w-4" />
                          Sil
                        </button>
                      </div>
                    </div>
                  )}

                  {passwordUserId === user.id ? (
                    <div className="mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-4">
                      <p className="text-sm font-black text-amber-950">Yeni şifre</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="password"
                          className={`${inputClass} mt-0 flex-1`}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Yeni şifre"
                        />
                        <button
                          type="button"
                          onClick={savePassword}
                          disabled={savingPassword}
                          className="inline-flex h-14 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-100 px-6 font-black text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingPassword ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              Kaydediliyor…
                            </span>
                          ) : (
                            "Onayla"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasswordUserId(null)}
                          className="inline-flex h-14 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white px-6 font-black text-slate-700"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          )}
        </section>
      </div>
    </main>
  );
}
