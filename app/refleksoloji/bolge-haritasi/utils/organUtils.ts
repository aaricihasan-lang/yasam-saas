export function organKey(name: string): string {
  return name.trim().toLocaleLowerCase("tr");
}

export function isDuplicateOrgan(name: string, organs: string[]): boolean {
  const key = organKey(name);
  if (!key) return true;
  return organs.some((o) => organKey(o) === key);
}
