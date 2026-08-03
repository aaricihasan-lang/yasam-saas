export type ReflexologyProtocolRecord = {
  id: string;
  tenant_id: string;
  source_uid: string | null;
  title: string | null;
  target_problem: string | null;
  organs: string | null;
  application_notes: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: string;
  /** P4 provenance — 'admin_transfer' ise "Admin Kütüphanesi" rozeti (yalnız DB kaynaklı). */
  origin_type?: string | null;
};
