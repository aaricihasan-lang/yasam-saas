import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

export const runtime = "nodejs";

/**
 * /api/dogaltas/knowledge/categories — stone_knowledge_categories güvenli kapısı.
 *
 * stone_knowledge_categories GLOBAL ortak sistem tablosudur (tenant_id yok).
 * Eskiden Taş Bilgi Kütüphanesi ekranı bu tabloyu tarayıcıdan anon key ile
 * OKUYUP YAZIYORDU (SELECT + INSERT). Artık:
 *   - GET  : giriş yapmış her kullanıcı okuyabilir (verifyUserRequest + service_role).
 *   - POST : yalnız admin yeni global kategori oluşturur (verifyAdminRequest).
 *            Normal expert kullanıcı ve demo hesap yazamaz (admin gate).
 * UPDATE/DELETE bilinçli olarak AÇILMADI. tenant filtresi yok (tablo global);
 * yazma yetkisi yalnız admin doğrulamasıyla verilir.
 */

const TABLE = "stone_knowledge_categories";
const MAX_NAME = 60;
const MAX_ICON = 16;
// Server-side allowlist — frontend COLOR_OPTIONS ile birebir aynı değerler.
// Client allowlist güvenlik katmanı DEĞİLDİR; sunucu bağımsız doğrular.
const ALLOWED_COLORS = new Set([
  "emerald", "blue", "violet", "amber", "slate", "rose",
  "cyan", "orange", "green", "indigo", "teal",
]);

// ─── GET — aktif global kategoriler (sort_order asc, name asc) ─────────────────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { data, error } = await db
    .from(TABLE)
    .select("id, name, slug, icon, color, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, categories: data ?? [] });
}

// ─── POST — yeni global kategori (yalnız admin) ────────────────────────────────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db, adminId } = guard;

  // Demo hesap yazamaz. verifyAdminRequest is_demo bakmaz → doğrulanmış adminId ile
  // kanonik users tablosundan service_role üzerinden okunur. FAIL-CLOSED: sorgu
  // hatası veya kayıt yoksa yazmaya izin verilmez.
  const { data: adminRow, error: adminErr } = await db
    .from("users")
    .select("is_demo_account")
    .eq("id", adminId)
    .maybeSingle();
  if (adminErr) {
    return NextResponse.json({ ok: false, error: "Yetki doğrulanamadı." }, { status: 500 });
  }
  if (!adminRow) {
    return NextResponse.json({ ok: false, error: "Yetki yok." }, { status: 403 });
  }
  if (adminRow.is_demo_account === true) {
    return NextResponse.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  // Yalnız gerekli alanlar kabul edilir; id/slug/sort_order/is_active client'tan ALINMAZ.
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Kategori adı zorunludur." }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ ok: false, error: `Kategori adı en fazla ${MAX_NAME} karakter olabilir.` }, { status: 400 });
  }
  // icon: string olmalı, trim, boş→varsayılan, aşırı uzun→kontrollü 400 (sessiz kesme yok).
  if (body.icon !== undefined && typeof body.icon !== "string") {
    return NextResponse.json({ ok: false, error: "Geçersiz ikon." }, { status: 400 });
  }
  const iconTrim = String(body.icon ?? "").trim();
  if (iconTrim.length > MAX_ICON) {
    return NextResponse.json({ ok: false, error: `İkon en fazla ${MAX_ICON} karakter olabilir.` }, { status: 400 });
  }
  const icon = iconTrim || "📖";

  // color: string olmalı, trim, boş→varsayılan, allowlist dışı→kontrollü 400.
  if (body.color !== undefined && typeof body.color !== "string") {
    return NextResponse.json({ ok: false, error: "Geçersiz renk." }, { status: 400 });
  }
  const color = String(body.color ?? "").trim() || "slate";
  if (!ALLOWED_COLORS.has(color)) {
    return NextResponse.json({ ok: false, error: "Geçersiz renk seçimi." }, { status: 400 });
  }

  // slug SUNUCUDA, deterministik (Türkçe normalize + güvenli karakter seti).
  const slug = normalizeTr(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kategori";

  // Duplicate kontrolü (slug DB'de unique). slug sanitize edildi → filtre güvenli.
  const { data: existing, error: dupErr } = await db
    .from(TABLE)
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (dupErr) return NextResponse.json({ ok: false, error: dupErr.message }, { status: 500 });
  if (existing) return NextResponse.json({ ok: false, error: "Bu isimde kategori zaten var." }, { status: 409 });

  // sort_order SUNUCUDA: mevcut en yüksek + 1.
  const { data: maxRow } = await db
    .from(TABLE)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (Number(maxRow?.sort_order) || 0) + 1;

  const { data, error } = await db
    .from(TABLE)
    .insert({ name, slug, icon, color, sort_order: nextOrder, is_active: true })
    .select("id, name, slug, icon, color, sort_order")
    .single();

  if (error) {
    // Yarış durumunda unique ihlali → kontrollü 409.
    if (error.code === "23505" || String(error.message).toLowerCase().includes("unique")) {
      return NextResponse.json({ ok: false, error: "Bu isimde kategori zaten var." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, category: data });
}
