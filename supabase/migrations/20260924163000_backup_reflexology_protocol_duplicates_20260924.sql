-- =============================================================================
-- 20260924163000_backup_reflexology_protocol_duplicates_20260924.sql
--
-- Operational production-only backup migration history marker.
-- Production version 20260924163000 created the protected
-- internal_backup.reflexology_protocols_duplicates_20260924 snapshot
-- (116 rows) before controlled duplicate repair on 2026-09-24.
--
-- This repository marker is intentionally NO-OP because the backup is
-- production-specific and must not be recreated in other environments.
--   • Reconciles remote migration history with the repo migration history.
--   • Does NOT create the internal_backup table in staging/clean environments.
--   • Does NOT copy, insert, delete, or modify any user data.
--   • No prod history manipulation / no migration repair.
-- =============================================================================

BEGIN;
SELECT 1;
COMMIT;
