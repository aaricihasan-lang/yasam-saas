/**
 * Silme onayı — kayıt-adı sertleştirmesi regresyon kalkanı (#6 / #13 red-team).
 *
 * buildNumerolojiDeleteConfirm SAF davranışını deterministik doğrular:
 *   • 0/boş isim + tek kayıt → generic tekil metin (çökmez).
 *   • 1 kayıt → ad tırnak içinde gösterilir.
 *   • 2+ kayıt → adet + satır-satır isim listesi; kalanlar "+N kayıt daha".
 *   • İsim sayısı adetten AZ (çözülemeyen id) → "+N" toplam adete göre doğru.
 *   • MAX_DELETE_CONFIRM_NAMES üstünde → dev listeye dönüşmez, kapaklanır.
 *   • Ad-soyad boşluk normalizasyonu.
 *   • Metin literal kalır (enjeksiyon/format kaçışı yok — düz metin diyalog).
 *
 * Çalıştır:  tsx scripts/numeroloji-presale/delete-confirm.harness.ts
 */
import {
  buildNumerolojiDeleteConfirm,
  MAX_DELETE_CONFIRM_NAMES,
} from "@/app/numeroloji/utils/deleteConfirmMessage";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string): void {
  if (cond) pass += 1;
  else {
    fail += 1;
    failures.push(`  ✗ ${label}`);
  }
}

// ── Tekil (0 isim) — generic, çökmez ─────────────────────────────────────────
{
  const c = buildNumerolojiDeleteConfirm(1, []);
  ok(c.title === "Analizi sil", "tek/0-isim başlık");
  ok(c.message === "Bu numeroloji analizini kalıcı olarak silmek istiyor musunuz?", "tek/0-isim generic mesaj");
  ok(c.message.includes("kalıcı"), "tek/0-isim kalıcı uyarısı");
  ok(c.secondMessage.includes("geri alınamaz"), "tek/0-isim ikinci onay");
}

// ── Tekil (1 isim) — ad tırnakta ─────────────────────────────────────────────
{
  const c = buildNumerolojiDeleteConfirm(1, ["Ayşe Yılmaz"]);
  ok(c.title === "Analizi sil", "1-isim başlık");
  ok(c.message === `"Ayşe Yılmaz" adlı numeroloji analizini kalıcı olarak silmek istiyor musunuz?`, "1-isim tırnaklı mesaj");
  ok(!c.message.includes("•"), "1-isim madde işareti YOK");
}

// ── İkili — adet + 2 satır, "daha" YOK ───────────────────────────────────────
{
  const c = buildNumerolojiDeleteConfirm(2, ["Ayşe Yılmaz", "Mehmet Demir"]);
  ok(c.title === "Seçili analizleri sil", "2-isim başlık");
  ok(c.message.startsWith("2 numeroloji analizini kalıcı olarak silmek üzeresiniz:"), "2-isim adet başlığı");
  ok(c.message.includes("• Ayşe Yılmaz"), "2-isim satır 1");
  ok(c.message.includes("• Mehmet Demir"), "2-isim satır 2");
  ok(!c.message.includes("kayıt daha"), "2-isim 'daha' YOK");
  ok(c.message.split("\n").length === 3, "2-isim 3 satır (başlık + 2 isim)");
}

// ── Üçlü — talimattaki örnek ─────────────────────────────────────────────────
{
  const c = buildNumerolojiDeleteConfirm(3, ["AYŞE YILMAZ", "MEHMET DEMİR", "ZEYNEP KAYA"]);
  ok(c.message.includes("• AYŞE YILMAZ") && c.message.includes("• MEHMET DEMİR") && c.message.includes("• ZEYNEP KAYA"), "3-isim tüm satırlar");
  ok(!c.message.includes("daha"), "3-isim 'daha' YOK");
}

// ── Kapak (MAX üstü) — dev listeye dönüşmez ──────────────────────────────────
{
  const many = Array.from({ length: 15 }, (_, i) => `Kişi ${i + 1}`);
  const c = buildNumerolojiDeleteConfirm(15, many);
  const bulletLines = c.message.split("\n").filter((l) => l.startsWith("• "));
  ok(bulletLines.length === MAX_DELETE_CONFIRM_NAMES + 1, `15-isim → ${MAX_DELETE_CONFIRM_NAMES} isim + 1 'daha' satırı`);
  ok(c.message.includes(`• +${15 - MAX_DELETE_CONFIRM_NAMES} kayıt daha`), "15-isim doğru kalan sayısı");
  ok(c.message.startsWith("15 numeroloji analizini"), "15-isim adet doğru");
}

// ── Çözülemeyen id (isim < adet) — "+N" TOPLAM adete göre ────────────────────
{
  // 5 seçildi ama yalnız 2 isim çözülebildi → 2 satır + "+3 kayıt daha"
  const c = buildNumerolojiDeleteConfirm(5, ["Ali Veli", "Can Su"]);
  const bulletLines = c.message.split("\n").filter((l) => l.startsWith("• "));
  ok(bulletLines.length === 3, "kısmi-isim → 2 isim + 1 'daha'");
  ok(c.message.includes("• +3 kayıt daha"), "kısmi-isim kalan = adet - gösterilen");
  ok(c.message.startsWith("5 numeroloji analizini"), "kısmi-isim adet = totalCount");
}

// ── Boşluk normalizasyonu ────────────────────────────────────────────────────
{
  const c = buildNumerolojiDeleteConfirm(1, ["  Ayşe    Yılmaz  "]);
  ok(c.message.includes(`"Ayşe Yılmaz"`), "boşluk normalize (tekil)");
}
{
  const c = buildNumerolojiDeleteConfirm(2, ["  Ayşe   Yılmaz ", " Mehmet  Demir "]);
  ok(c.message.includes("• Ayşe Yılmaz") && c.message.includes("• Mehmet Demir"), "boşluk normalize (çoklu)");
}

// ── Boş/whitespace isimler elenir, adet korunur ──────────────────────────────
{
  // 3 adet, isimlerden biri whitespace → 2 gösterilir + "+1 daha"
  const c = buildNumerolojiDeleteConfirm(3, ["Ada Lovelace", "   ", "Alan Turing"]);
  ok(c.message.includes("• Ada Lovelace") && c.message.includes("• Alan Turing"), "boş isim elendi, diğerleri var");
  ok(c.message.includes("• +1 kayıt daha"), "boş isim → adet farkı 'daha'ya yansır");
}

// ── totalCount <= 0 güvenli (defensive; çağıran zaten 0'da erken döner) ───────
{
  const c = buildNumerolojiDeleteConfirm(0, []);
  ok(c.title === "Analizi sil" && c.message.length > 0, "0 adet → çökmez, tekil generic");
}

console.log(`\nDelete-Confirm Harness: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
