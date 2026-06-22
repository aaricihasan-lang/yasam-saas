import { readYasamUser } from "@/lib/auth/yasamUser";

export function useDemoGuard() {
  const user = readYasamUser();
  const isDemo = user?.is_demo_account === true;

  return {
    isDemo,
    /** Liste index'ine göre koruma: ilk kayıt (index 0) açık, diğerleri korumalı */
    shouldProtect: (index: number) => isDemo && index > 0,
  };
}
