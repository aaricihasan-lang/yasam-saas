import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * POST /api/contact/support-request
 *
 * Public (giriş yapılmadan) şifre/giriş desteği talebi. Ziyaretçi login
 * modalındaki "Şifremi Unuttum" formundan gönderir. Yeni tablo/migration YOK:
 * mevcut `support_messages` + admin destek gelen-kutusu (/admin/support) reuse
 * edilir. `support_messages.user_id/tenant_id NOT NULL` olduğundan talep bir
 * admin/sistem hesabına iliştirilir; ziyaretçinin bilgileri konu + gövdeye
 * yazılır ve konu "Şifre Desteği" ile otomatik etiketlenir.
 *
 * Kişisel GSM / hassas veri sunucuya gömülmez. Anonim spam'e karşı: alan
 * validasyonu + uzunluk sınırı + gizli honeypot alanı (aşırı altyapı yok).
 */
const SUBJECT_PREFIX = "Şifre Desteği";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: {
    fullName?: unknown;
    email?: unknown;
    phone?: unknown;
    message?: unknown;
    website?: unknown; // honeypot
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  // Honeypot: gerçek kullanıcı bu gizli alanı doldurmaz. Doluysa sessizce kabul
  // et (bot'a hata sinyali verme) ama hiçbir şey yazma.
  if (String(body.website ?? "").trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!fullName || !email || !message) {
    return NextResponse.json(
      { error: "Ad Soyad, e-posta ve mesaj alanları zorunludur." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
  }
  if (fullName.length > 120) {
    return NextResponse.json({ error: "Ad Soyad en fazla 120 karakter." }, { status: 400 });
  }
  if (email.length > 200) {
    return NextResponse.json({ error: "E-posta en fazla 200 karakter." }, { status: 400 });
  }
  if (phone.length > 40) {
    return NextResponse.json({ error: "Telefon en fazla 40 karakter." }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Mesaj en fazla 4000 karakter." }, { status: 400 });
  }

  let db: ReturnType<typeof getServerDb>;
  try {
    db = getServerDb();
  } catch {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 });
  }

  // Anonim talebi iliştireceğimiz admin/sistem hesabı (FK + NOT NULL için).
  const { data: admin, error: adminError } = await db
    .from("users")
    .select("id, tenant_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (adminError || !admin?.id || !admin?.tenant_id) {
    return NextResponse.json({ error: "Talep şu an alınamıyor. Lütfen sonra tekrar deneyin." }, { status: 503 });
  }

  const subject = `${SUBJECT_PREFIX} — ${fullName}`.slice(0, 200);
  const composed = [
    "Giriş/şifre desteği talebi (ziyaretçi — giriş yapılmadan gönderildi).",
    "",
    `Ad Soyad: ${fullName}`,
    `E-posta: ${email}`,
    ...(phone ? [`Telefon: ${phone}`] : []),
    "",
    "Mesaj:",
    message,
  ]
    .join("\n")
    .slice(0, 5000);

  const { error: insertError } = await db.from("support_messages").insert({
    user_id: admin.id,
    tenant_id: admin.tenant_id,
    subject,
    message: composed,
    priority: "normal",
  });

  if (insertError) {
    return NextResponse.json({ error: "Talep gönderilemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
