/**
 * Sistem geneli TOPLU SİLME güvenlik standardı — SAF (pure), test edilebilir çekirdek.
 *
 * HASAN HOCA'NIN NİHAİ KURALI:
 *   - 1–2 kayıt: mevcut tekli/çift silme onayı korunur (en az bir açık destructive onay).
 *   - 3 VEYA DAHA FAZLA kayıt: en az 3 AYRI açık onay aşaması zorunlu.
 *   - "TÜMÜNÜ SİL": kayıt sayısı ne olursa olsun en az 3 ayrı onay aşaması zorunlu.
 *
 * Aşamalar (her biri AYRI pencere; birinin altına gizlenmiş ikinci alan YOK):
 *   1) Açık uyarı — "X kayıt kalıcı olarak silinecek. Bu işlem geri alınamaz." → "Devam Et"
 *   2) Elle doğrulama — "X KAYDI SİL" / "TÜMÜNÜ SİL" ifadesi birebir yazılmadan ilerlenmez
 *   3) Son onay — "Son Onay — Bu işlem geri alınamaz." + sayı tekrar → "Kalıcı Olarak Sil"
 * Üçüncü onay verilmeden çağıran gerçek DELETE isteğini GÖNDERMEZ (fonksiyon false döner).
 */

/** 3+ kayıt toplu silmede 3 aşamalı onay zorunludur. */
export const BULK_DELETE_THRESHOLD = 3;

export const BULK_DELETE_ALL_PHRASE = "TÜMÜNÜ SİL";

/** Bu silme 3 aşamalı güvenlik akışı gerektiriyor mu? */
export function requiresBulkDeleteGuard(count: number, deleteAll = false): boolean {
  if (deleteAll) return true;
  return Number.isFinite(count) && count >= BULK_DELETE_THRESHOLD;
}

/** Aşama 2'de kullanıcının birebir yazması gereken ifade. */
export function bulkDeletePhrase(count: number, deleteAll = false): string {
  return deleteAll ? BULK_DELETE_ALL_PHRASE : `${count} KAYDI SİL`;
}

/**
 * Doğrulama ifadesi karşılaştırması.
 *
 * Bilinçli ve kullanıcıya AÇIKÇA söylenen kural: büyük/küçük harf ve Türkçe ı/İ ↔ i/I farkı
 * önemsizdir (Türkçe olmayan klavyede "3 kaydi sil" de kabul edilir); SAYI ve kelimeler birebir
 * olmalıdır. Baş/son boşluk ve çoklu boşluk yok sayılır.
 */
export function normalizeBulkPhrase(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I");
}

export function bulkPhraseMatches(typed: string, expected: string): boolean {
  if (!expected) return false;
  return normalizeBulkPhrase(typed) === normalizeBulkPhrase(expected);
}

export const BULK_PHRASE_HINT = "Büyük/küçük harf ve ı/i farkı önemsizdir; sayı ve kelimeler aynen yazılmalıdır.";

/** ConfirmProvider ile uyumlu minimal onay sözleşmesi (test edilebilirlik için soyut). */
export type BulkConfirmFn = (options: {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "info" | "success" | "warning";
  requireText?: string;
  requireTextLabel?: string;
  requireTextMatcher?: (typed: string) => boolean;
}) => Promise<boolean>;

export type BulkDeleteFlowOptions = {
  /** Silinecek kayıt sayısı (tümünü silde toplam kayıt). */
  count: number;
  /** "Tümünü Sil" mi? (sayıdan bağımsız 3 aşama) */
  deleteAll?: boolean;
  /** Aşama 1'de gösterilecek bağlam (ad listesi, kapsam satırları…). */
  detail?: string;
  /** Kalıcı silme değil de kaldırma/gizleme ise false (metinler yumuşar, aşama sayısı DEĞİŞMEZ). */
  irreversible?: boolean;
  /** Kayıt türü — "kayıt" varsayılan (ör. "danışan", "taş"). */
  noun?: string;
  cancelText?: string;
};

/** Aşama metinleri — saf; UI ve testler aynı kaynağı kullanır. */
export function buildBulkDeleteStages(opts: BulkDeleteFlowOptions) {
  const noun = opts.noun?.trim() || "kayıt";
  const irreversible = opts.irreversible ?? true;
  const phrase = bulkDeletePhrase(opts.count, opts.deleteAll);
  const scope = opts.deleteAll ? `TÜM ${opts.count} ${noun}` : `${opts.count} ${noun}`;
  const verb = irreversible ? "kalıcı olarak silinecek" : "kaldırılacak";
  const warn = irreversible ? "Bu işlem geri alınamaz." : "Lütfen kapsamı kontrol edin.";
  const head = `${scope} ${verb}. ${warn}`;
  const detail = opts.detail?.trim();
  return {
    phrase,
    stage1: {
      title: opts.deleteAll ? "Tümünü Sil — Adım 1/3" : "Toplu Silme — Adım 1/3",
      message: detail ? `${head}\n\n${detail}` : head,
      confirmText: "Devam Et",
    },
    stage2: {
      title: "Doğrulama — Adım 2/3",
      message: `Yanlışlıkla toplu silmeyi önlemek için aşağıdaki ifadeyi yazın:\n\n${phrase}`,
      requireText: phrase,
      requireTextLabel: `“${phrase}” yazın. ${BULK_PHRASE_HINT}`,
      confirmText: "Devam Et",
    },
    stage3: {
      title: irreversible ? "Son Onay — Bu işlem geri alınamaz." : "Son Onay",
      message: irreversible
        ? `${scope} kalıcı olarak silinecek.\n\nSilinen kayıtlar geri getirilemez. Onaylıyor musunuz?`
        : `${scope} kaldırılacak. Onaylıyor musunuz?`,
      confirmText: irreversible ? `Kalıcı Olarak Sil (${opts.count})` : `Onayla (${opts.count})`,
    },
  };
}

/**
 * 3 aşamalı akışı verilen onay fonksiyonuyla yürütür. Herhangi bir aşamada iptal (Vazgeç/ESC/
 * dışarı tıklama/yanlış ifade) → false; çağıran DELETE göndermez. Yalnız üç aşama da
 * onaylanırsa true döner.
 */
export async function runBulkDeleteConfirm(confirm: BulkConfirmFn, opts: BulkDeleteFlowOptions): Promise<boolean> {
  const s = buildBulkDeleteStages(opts);
  const cancelText = opts.cancelText ?? "Vazgeç";
  const ok1 = await confirm({ ...s.stage1, tone: "danger", cancelText });
  if (!ok1) return false;
  const ok2 = await confirm({
    ...s.stage2,
    tone: "danger",
    cancelText,
    requireTextMatcher: (typed) => bulkPhraseMatches(typed, s.phrase),
  });
  if (!ok2) return false;
  const ok3 = await confirm({ ...s.stage3, tone: "danger", cancelText });
  return ok3 === true;
}
