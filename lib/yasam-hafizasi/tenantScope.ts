/**
 * Yaşam Hafızası™ — zorunlu tenant/güvenlik kapsamı (Sprint 1 / A1).
 *
 * AMAÇ: İleride retrieval/indexer tarafından kullanılacak güvenlik kapsamını
 * TEK yerde tanımlamak. Bu sprintte retrieval YOKTUR; burada yalnızca yeniden
 * kullanılabilir, güvenli scope yapısı kurulur (gerçek arama yapılmaz).
 *
 * DEĞİŞMEZ KURALLAR (INV-TENANT):
 *   - session tenant ZORUNLU; body/query üzerinden tenant KABUL EDİLMEZ.
 *   - allowShared açık DEĞİLSE NULL tenant (shared referans) DAHİL EDİLMEZ.
 *   - Ana indeks sorgusunda is_client_pii HER ZAMAN false (PII fiziksel olarak ayrı — F5).
 *   - Demo tenant indeksleme/sorguda hariç tutulur (indexer demo satırı üretmez;
 *     scope demo tenant'ı işaretler, üst katman politikayı uygular).
 */

import { YH_DEMO_TENANT_ID } from "./config";

export interface TenantScope {
  /** Oturumdan çözülmüş tenant kimliği. */
  tenantId: string;
  /** true ise shared (tenant_id IS NULL) referans kayıtları da dahil edilir. */
  allowShared: boolean;
  /** Demo tenant mı? (üst katman politika kararı için işaret). */
  isDemo: boolean;
}

/**
 * Güvenli tenant kapsamı kurar. tenantId boşsa hata fırlatır — bu, tenant'ın
 * yanlışlıkla body/query'den boş gelmesine karşı sert bir kapıdır.
 */
export function buildTenantScope(input: {
  tenantId: string;
  allowShared?: boolean;
}): TenantScope {
  const tenantId = (input.tenantId ?? "").trim();
  if (!tenantId) {
    throw new Error(
      "Yaşam Hafızası: tenant kimliği zorunlu (yalnızca oturumdan çözülmelidir).",
    );
  }
  return {
    tenantId,
    allowShared: input.allowShared === true,
    isDemo: tenantId === YH_DEMO_TENANT_ID,
  };
}

/** applyMainIndexScope'un ihtiyaç duyduğu minimal sorgu-builder arayüzü. */
interface ScopableQuery {
  eq(column: string, value: unknown): this;
  or(filters: string): this;
}

/**
 * Ana indeks (PII-DIŞI) sorgusuna zorunlu güvenlik kapsamını uygular.
 *
 * NOT: Bu yardımcı Sprint 1'de HİÇBİR YERDE ÇAĞRILMAZ (retrieval Sprint 2'dedir).
 * Yalnızca tek-kaynak, yeniden kullanılabilir scope yapısı olarak sağlanır.
 */
export function applyMainIndexScope<T extends ScopableQuery>(
  query: T,
  scope: TenantScope,
): T {
  // Ana indekste is_client_pii her zaman false.
  let q = query.eq("is_client_pii", false);

  if (scope.allowShared) {
    // Tenant kayıtları + shared (NULL) referans.
    q = q.or(`tenant_id.eq.${scope.tenantId},tenant_id.is.null`);
  } else {
    // Yalnız tenant kayıtları.
    q = q.eq("tenant_id", scope.tenantId);
  }

  return q;
}
