export type SearchableVaultRecord = { id: string; name: string; tags?: string[]; favorite?: boolean; savedAt: number };

export function filterVaultRecords<T extends SearchableVaultRecord>(records: T[], query: string, favoritesOnly: boolean): T[] {
  const q = query.trim().toLowerCase();
  return records.filter(record => {
    if (favoritesOnly && !record.favorite) return false;
    if (!q) return true;
    const haystack = [record.name, ...(record.tags ?? [])].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
