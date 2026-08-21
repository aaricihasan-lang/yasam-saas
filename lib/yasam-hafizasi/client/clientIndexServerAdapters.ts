import "server-only";

/**
 * PRIVATE MEMORY — Client Index IO Adapter'ları (server-only; TEK Supabase-bağımlı dosya).
 *
 * clientEventProcessor'ın enjekte ettiği üç primitifi gerçek Supabase ile uygular:
 *   - fetchSourceRow: tenant+client SCOPED kaynak satırı (yalnız allowlist kolonları; `*` YOK)
 *   - upsertUnit:     yasam_hafizasi_client_index upsert (onConflict → identity refresh)
 *   - deindex:        tenant+client scoped fiziksel silme (count:"exact"; fail-closed)
 *
 * KANONİK:
 *   - Tablo/kolon adları YALNIZ statik ClientSourceConfig'ten; kullanıcı girdisi yok → injection yok.
 *   - Builder yalnız allowlist okur → doğrudan kimlik kolonları (adres/fee...) FETCH EDİLMEZ.
 *   - Ham DB mesajı DIŞARI TAŞINMAZ; yalnız güvenli boolean/sayısal meta.
 */
import type { ClientSourceConfig } from "./clientSources";
import type {
  ClientDeindexResult,
  ClientEventProcessorDeps,
  ClientOwnershipKey,
} from "./clientEventProcessor";

const CLIENT_INDEX_TABLE = "yasam_hafizasi_client_index";
const CLIENT_INDEX_CONFLICT_KEY = "source_table,source_id,section_ref";

// ─── Dar yapısal DB client (getServerDb bununla uyumludur; `any` yok) ─────────
type DbRow = Record<string, unknown>;
interface DbSelectResult {
  readonly data: DbRow[] | null;
  readonly error: { readonly message: string } | null;
}
interface DbSelectBuilder extends PromiseLike<DbSelectResult> {
  eq(column: string, value: unknown): DbSelectBuilder;
  limit(count: number): DbSelectBuilder;
}
interface DbDeleteResult {
  readonly error: boolean;
  readonly count: number | null;
}
export interface ClientIndexDbClient {
  select(table: string, columns: string): DbSelectBuilder;
  upsert(table: string, rows: readonly DbRow[], onConflict: string): Promise<{ error: boolean }>;
  deleteExact(table: string, filters: ReadonlyArray<readonly [string, string]>): Promise<DbDeleteResult>;
}

/** Kaynak için MİNİMAL allowlist select kolon listesi (denylist HARİÇ; `*` YOK). */
export function clientSourceSelectColumns(config: ClientSourceConfig): string[] {
  const cols = new Set<string>();
  cols.add(config.primaryKey);
  cols.add(config.tenantColumn);
  cols.add(config.clientColumn);
  if (config.occurredAtColumn) cols.add(config.occurredAtColumn);
  if (config.updatedAtColumn) cols.add(config.updatedAtColumn);
  for (const c of config.titleColumns) cols.add(c);
  for (const c of config.searchTextColumns) cols.add(c);
  for (const c of config.snippetColumns) cols.add(c);
  for (const c of config.topicTagsColumns) cols.add(c);
  return [...cols];
}

/** clientEventProcessor deps'inin IO parçalarını (fetch/upsert/deindex) üretir. */
export function createClientIndexAdapters(
  db: ClientIndexDbClient,
): Pick<ClientEventProcessorDeps, "fetchSourceRow" | "upsertUnit" | "deindex"> {
  return {
    fetchSourceRow: async ({ config, sourceId, tenantId, clientId }: ClientOwnershipKey) => {
      const columns = clientSourceSelectColumns(config).join(",");
      const { data, error } = await db
        .select(config.tableName, columns)
        .eq(config.primaryKey, sourceId)
        .eq(config.tenantColumn, tenantId) // tenant SCOPED (ownership)
        .eq(config.clientColumn, clientId) // client SCOPED (ownership)
        .limit(2);
      if (error) throw new Error("client-source-read-failed"); // ham mesaj taşınmaz
      const rows = data ?? [];
      if (rows.length === 0) return null; // artık tenant+client'a ait değil/silinmiş
      // PK tekil → 1 satır beklenir; >1 anomali → fail-closed null (upsert yerine defensive deindex).
      if (rows.length > 1) return null;
      return { ...rows[0] };
    },

    upsertUnit: async (dbRow: DbRow) => {
      const { error } = await db.upsert(CLIENT_INDEX_TABLE, [dbRow], CLIENT_INDEX_CONFLICT_KEY);
      return { ok: error === false };
    },

    deindex: async ({ config, sourceId, tenantId, clientId }: ClientOwnershipKey): Promise<ClientDeindexResult> => {
      const { error, count } = await db.deleteExact(CLIENT_INDEX_TABLE, [
        ["source_table", config.tableName],
        ["source_id", sourceId],
        ["tenant_id", tenantId],
        ["client_id", clientId], // tenant+client birlikte → yanlış scope ASLA silinmez
      ]);
      if (error) return { status: "delete-failed" };
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        return { status: "delete-failed" }; // count:"exact" istenmişken doğrulanamadı → fail-closed
      }
      if (count === 0) return { status: "no-op" };
      if (count === 1) return { status: "ok" };
      return { status: "multi-row-anomaly" };
    },
  };
}
