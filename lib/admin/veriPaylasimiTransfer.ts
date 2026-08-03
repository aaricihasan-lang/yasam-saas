/**
 * Admin "Veri Paylaşımı / Kütüphane Aktarım Merkezi" — istemci yardımcısı.
 *
 * FAZ 1 / P4: Aktarım artık tarayıcıdan DOĞRUDAN tabloya INSERT YAPMAZ. Eski akış
 * anon/authenticated Supabase client ile `stones` vb. tablolara insert ediyordu;
 * modül lock migration'ları (20260627120000_dogaltas_lock_anon …) bu yetkiyi revoke
 * ettiği için `permission denied for table stones` alınıyordu. Tüm yazma tek bir
 * service-role server route'una taşındı: POST /api/admin/veri-paylasimi/transfer.
 *
 * Bu dosya yalnız: seçim → istek gövdesi hazırlama + güvenli sonuç/mesaj üretimi.
 * Kaynak admin tenant'ı SUNUCUDA çözülür (burada gönderilmez).
 */
import { readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import { EMPTY_SOURCE_ADMIN_MESSAGE } from "@/lib/admin/adminSourceTenant";

export { resolveSourceAdminTenantId } from "@/lib/admin/adminSourceTenant";
export { EMPTY_SOURCE_ADMIN_MESSAGE } from "@/lib/admin/adminSourceTenant";

export const TRANSFER_BATCH_SIZE = 100;

/** UI seçim anahtarı → server registry ile aynı grup anahtarları. */
export type TransferGroupKey =
  | "stones"
  | "minerals"
  | "combinations"
  | "bioenergy_symbols"
  | "bioenergy_imaginations"
  | "bioenergy_chakras"
  | "bioenergy_energy_bodies"
  | "bioenergy_subconscious_causes"
  | "reflexology_protocols"
  | "numerology_knowledge_records"
  | "numerology_stone_assignments";

export type TransferTableName = TransferGroupKey;

export type TransferResultCounts = Record<TransferGroupKey, number>;

export type LibraryTransferResult = {
  counts: TransferResultCounts;
  error?: string;
  /** Başarı toast metni — sayfa `successMessage ?? formatTransferResultLines(...)` kullanabilir */
  successMessage?: string;
  /** İdempotent replay ise true (aynı batch ikinci kez kopya üretmedi). */
  replayed?: boolean;
};

/** Her TransferGroupKey için opsiyonel id filtresi. Tanımsız bırakılırsa tüm kayıtlar kopyalanır. */
export type FilterMap = Partial<Record<TransferGroupKey, string[]>>;

export function emptyTransferCounts(): TransferResultCounts {
  return {
    stones: 0,
    minerals: 0,
    combinations: 0,
    bioenergy_symbols: 0,
    bioenergy_imaginations: 0,
    bioenergy_chakras: 0,
    bioenergy_energy_bodies: 0,
    bioenergy_subconscious_causes: 0,
    reflexology_protocols: 0,
    numerology_knowledge_records: 0,
    numerology_stone_assignments: 0,
  };
}

function adminHeaders(): Record<string, string> {
  const u = readYasamUser();
  const t = readSessionToken();
  return {
    "Content-Type": "application/json",
    "x-admin-id": u?.id ?? "",
    ...(t ? { "x-session-token": t } : {}),
  };
}

function newBatchId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // crypto yoksa (çok eski tarayıcı) — sunucu yine batch_id'yi doğrular.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function sumSelectedCounts(
  counts: TransferResultCounts,
  groups: TransferGroupKey[],
): number {
  return groups.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

function buildTransferSuccessMessage(
  counts: TransferResultCounts,
  groups: TransferGroupKey[],
  targetEmail?: string,
): string | null {
  const account = targetEmail?.trim() || "hedef hesap";
  const lines: string[] = [];

  if (groups.includes("stones") && counts.stones > 0) {
    lines.push(`${counts.stones} Doğaltaş kaydı ${account} hesabına eklendi`);
  }
  if (groups.includes("combinations") && counts.combinations > 0) {
    lines.push(`${counts.combinations} Kombinasyon kaydı ${account} hesabına eklendi`);
  }
  if (groups.includes("minerals") && counts.minerals > 0) {
    lines.push(`${counts.minerals} Mineral kaydı ${account} hesabına eklendi`);
  }

  const bio =
    (groups.includes("bioenergy_symbols") ? counts.bioenergy_symbols : 0) +
    (groups.includes("bioenergy_imaginations") ? counts.bioenergy_imaginations : 0) +
    (groups.includes("bioenergy_chakras") ? counts.bioenergy_chakras : 0) +
    (groups.includes("bioenergy_energy_bodies") ? counts.bioenergy_energy_bodies : 0) +
    (groups.includes("bioenergy_subconscious_causes")
      ? counts.bioenergy_subconscious_causes
      : 0);
  if (bio > 0) lines.push(`${bio} Biyoenerji kaydı ${account} hesabına eklendi`);

  if (groups.includes("reflexology_protocols") && counts.reflexology_protocols > 0) {
    lines.push(
      `${counts.reflexology_protocols} Refleksoloji kaydı ${account} hesabına eklendi`,
    );
  }

  const num =
    (groups.includes("numerology_knowledge_records")
      ? counts.numerology_knowledge_records
      : 0) +
    (groups.includes("numerology_stone_assignments")
      ? counts.numerology_stone_assignments
      : 0);
  if (num > 0) lines.push(`${num} Numeroloji kaydı ${account} hesabına eklendi`);

  if (lines.length === 0) return null;
  return lines.join("\n");
}

/**
 * Seçili grupları hedef uzmana bağımsız kopya (snapshot) olarak aktarır.
 * Tüm yazma service-role server route'unda yapılır; burada yalnız istek + sonuç.
 */
export async function runLibraryTransfer(
  groups: TransferGroupKey[],
  targetUserId: string,
  targetTenantId: string,
  targetExpertEmail?: string,
  filterMap?: FilterMap,
): Promise<LibraryTransferResult> {
  const target = targetTenantId.trim();
  const uniqueGroups = [...new Set(groups)];
  const counts = emptyTransferCounts();

  if (!targetUserId.trim() || !target) {
    return { counts, error: "Hedef kullanıcı bilgisi geçersiz." };
  }
  if (uniqueGroups.length === 0) {
    return { counts, error: "Aktarılacak en az bir veri grubu seçin." };
  }

  const batchId = newBatchId();

  let res: Response;
  try {
    res = await fetch("/api/admin/veri-paylasimi/transfer", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({
        batchId,
        targetUserId: targetUserId.trim(),
        targetTenantId: target,
        groups: uniqueGroups,
        filterMap: filterMap ?? {},
      }),
    });
  } catch {
    return { counts, error: "Bağlantı hatası. Hiçbir kayıt aktarılmadı." };
  }

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    counts?: Partial<TransferResultCounts>;
    replayed?: boolean;
  };

  if (!res.ok || json.ok === false) {
    const msg =
      typeof json.error === "string" && json.error.trim()
        ? json.error
        : `Aktarım tamamlanamadı (HTTP ${res.status}).`;
    return { counts, error: msg };
  }

  // Sunucu sayımlarını güvenle birleştir (yalnız bilinen anahtarlar).
  if (json.counts && typeof json.counts === "object") {
    for (const key of uniqueGroups) {
      const v = json.counts[key];
      if (typeof v === "number" && Number.isFinite(v)) counts[key] = v;
    }
  }

  const totalInserted = sumSelectedCounts(counts, uniqueGroups);
  if (totalInserted === 0 && !json.replayed) {
    return { counts, error: EMPTY_SOURCE_ADMIN_MESSAGE, replayed: json.replayed };
  }

  const successMessage = buildTransferSuccessMessage(
    counts,
    uniqueGroups,
    targetExpertEmail,
  );

  return {
    counts,
    successMessage: successMessage ?? undefined,
    replayed: json.replayed,
  };
}

export function sumBioenergyCounts(counts: TransferResultCounts): number {
  return (
    counts.bioenergy_symbols +
    counts.bioenergy_imaginations +
    counts.bioenergy_chakras +
    counts.bioenergy_energy_bodies +
    counts.bioenergy_subconscious_causes
  );
}

export function sumReflexologyCounts(counts: TransferResultCounts): number {
  return counts.reflexology_protocols;
}

export function sumNumerologyCounts(counts: TransferResultCounts): number {
  return counts.numerology_knowledge_records + counts.numerology_stone_assignments;
}

export function formatTransferResultLines(
  counts: TransferResultCounts,
  targetEmail?: string | null,
): string[] {
  const account = targetEmail?.trim();
  const lines: string[] = [];

  if (counts.stones > 0) {
    lines.push(
      account
        ? `${counts.stones} Doğaltaş kaydı ${account} hesabına eklendi`
        : `${counts.stones} Doğaltaş`,
    );
  }
  if (counts.combinations > 0) {
    lines.push(
      account
        ? `${counts.combinations} Kombinasyon kaydı ${account} hesabına eklendi`
        : `${counts.combinations} Kombinasyon`,
    );
  }
  if (counts.minerals > 0) {
    lines.push(
      account
        ? `${counts.minerals} Mineral kaydı ${account} hesabına eklendi`
        : `${counts.minerals} Mineral`,
    );
  }

  const bio = sumBioenergyCounts(counts);
  if (bio > 0) {
    lines.push(
      account ? `${bio} Biyoenerji kaydı ${account} hesabına eklendi` : `${bio} Biyoenerji`,
    );
  }

  const ref = sumReflexologyCounts(counts);
  if (ref > 0) {
    lines.push(
      account
        ? `${ref} Refleksoloji kaydı ${account} hesabına eklendi`
        : `${ref} Refleksoloji`,
    );
  }

  const num = sumNumerologyCounts(counts);
  if (num > 0) {
    lines.push(
      account ? `${num} Numeroloji kaydı ${account} hesabına eklendi` : `${num} Numeroloji`,
    );
  }

  return lines;
}
