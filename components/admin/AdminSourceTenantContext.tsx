"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ADMIN_SOURCE_TENANT_MISSING_MESSAGE,
  resolveSourceAdminTenantId,
} from "@/lib/admin/adminSourceTenant";

type AdminSourceTenantContextValue = {
  tenantId: string | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AdminSourceTenantContext = createContext<AdminSourceTenantContextValue | null>(
  null,
);

export function AdminSourceTenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const resolved = await resolveSourceAdminTenantId();
    setTenantId(resolved.tenantId);
    setError(
      resolved.error ??
        (resolved.tenantId ? null : ADMIN_SOURCE_TENANT_MISSING_MESSAGE),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AdminSourceTenantContext.Provider
      value={{ tenantId, error, loading, refresh }}
    >
      {children}
    </AdminSourceTenantContext.Provider>
  );
}

export function useAdminSourceTenant(): AdminSourceTenantContextValue {
  const ctx = useContext(AdminSourceTenantContext);
  if (!ctx) {
    throw new Error("useAdminSourceTenant AdminSourceTenantProvider içinde kullanılmalı");
  }
  return ctx;
}

/** Import / paylaşım ekranlarında canlı tenant doğrulama */
export function AdminSourceTenantDebug({
  className = "",
}: {
  className?: string;
}) {
  const { tenantId, error, loading } = useAdminSourceTenant();

  return (
    <p
      className={`rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 py-2 font-mono text-xs text-amber-950 ${className}`}
      role="status"
    >
      Admin kaynak tenant_id:{" "}
      {loading ? "yükleniyor…" : tenantId ?? "—"}
      {error ? ` · ${error}` : ""}
    </p>
  );
}
