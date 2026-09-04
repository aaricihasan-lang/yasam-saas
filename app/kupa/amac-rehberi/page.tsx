import { redirect } from "next/navigation";

/**
 * FAZ 4 — ürün sadeleştirme (owner FINAL): bağımsız "Amaç / Rahatsızlık Rehberi"
 * kullanıcı akışı KALDIRILDI. Konu/rahatsızlık bilgisi artık TEK yerde — Hacamat
 * Protokolleri — girilir ve yönetilir. Bu rota doğrudan URL ile eski CRUD/okuma
 * çalışma alanını AÇMAZ; /kupa/protokoller'e yönlendirir.
 *
 * NOT: Legacy veri (cupping_topics / cupping_point_topics / cupping_topic_notes /
 * cupping_topic_sources / cupping_point_topic_sources vb.) DB'de DORMANT korunur —
 * silinmez, taşınmaz, Migren protokolüne otomatik dönüştürülmez.
 */
export default function AmacRehberiPage() {
  redirect("/kupa/protokoller");
}
