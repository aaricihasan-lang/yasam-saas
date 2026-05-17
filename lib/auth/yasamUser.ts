export type YasamUser = {
  id: string;
  tenant_id?: string;
  name?: string;
  email?: string;
  role: string;
  status?: string;
};

export function readYasamUser(): YasamUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("yasam_user");
    if (!raw) return null;
    return JSON.parse(raw) as YasamUser;
  } catch {
    return null;
  }
}

export function isAdminUser(user: YasamUser | null | undefined): boolean {
  return user?.role === "admin";
}
