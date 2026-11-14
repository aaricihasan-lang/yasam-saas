/**
 * AŞAMA 4a — production uygulama metni (tek atomik işlem): migration gövdesi + ledger kaydı AYNI işlemde.
 * Ledger satırı zaten varsa birincil anahtar ihlali → tüm işlem geri alınır (çift uygulama imkânsız).
 * İşlem içi veri bekçisi: gövdeden ÖNCE mevcut kullanıcı satırlarının (yeni archived_at hariç) ve bağlı tabloların
 * parmak izi alınır, gövdeden SONRA aynı işlemde yeniden hesaplanır; fark varsa COMMIT'e varılmadan hata → tam geri alma.
 * (Eşzamanlı canlı etkinlik de farka yol açabilir → güvenli tarafta durur; tekrar denenir.)
 * Bu dosya yalnız metni üretir; hiçbir yere bağlanmaz.
 */
export const MIG_VERSION = "20280101000600";
export const MIG_NAME = "admin_member_archive_state";
export const MIG_CREATED_BY = "pr780-uye-arsiv-4a";

const FINGERPRINT = `SELECT
    (SELECT md5(string_agg((to_jsonb(u) - 'archived_at')::text, E'\\n' ORDER BY u.id)) FROM public.users u) AS users_h,
    (SELECT count(*) FROM public.users) AS users_n,
    (SELECT count(*) FROM public.user_payment_history) AS uph_n,
    (SELECT count(*) FROM public.member_pricing_phases) AS mpp_n,
    (SELECT count(*) FROM public.trial_profiles) AS tp_n,
    (SELECT count(*) FROM public.admin_audit_log) AS aal_n`;

export function buildApplyText(body: string): string {
  return [
    "BEGIN;",
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '120s';",
    `CREATE TEMP TABLE zz4a_veri_bekcisi ON COMMIT DROP AS ${FINGERPRINT};`,
    body,
    `DO $bekci$
BEGIN
  IF EXISTS (SELECT 1 FROM zz4a_veri_bekcisi b, (${FINGERPRINT}) s
              WHERE (b.users_h, b.users_n, b.uph_n, b.mpp_n, b.tp_n, b.aal_n)
                    IS DISTINCT FROM (s.users_h, s.users_n, s.uph_n, s.mpp_n, s.tp_n, s.aal_n)) THEN
    RAISE EXCEPTION '4a veri bekcisi: mevcut kullanici/bagli tablo verisi degisti; uygulanmadi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE archived_at IS NOT NULL) THEN
    RAISE EXCEPTION '4a veri bekcisi: archived_at dolu satir var (backfill olmamali); uygulanmadi';
  END IF;
END
$bekci$;`,
    `INSERT INTO supabase_migrations.schema_migrations(version, name, created_by) VALUES ('${MIG_VERSION}', '${MIG_NAME}', '${MIG_CREATED_BY}');`,
    "COMMIT;",
    "",
  ].join("\n");
}

/** Kuru prova metni: aynı gövde + bekçi + ledger kaydı, ama SONU DAİMA ROLLBACK (COMMIT içermez). */
export function buildRehearsalText(body: string): string {
  return buildApplyText(body).replace(/\nCOMMIT;\n$/, "\nROLLBACK;\n");
}
