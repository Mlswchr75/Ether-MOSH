import type { OverlayAsset } from "./types";

const DB_NAME = "ether-mosh-overlay-vault";
const DB_VERSION = 1;
const STORE = "assets";

export type OverlayVaultRecord = {
  id: string;
  name: string;
  kind: OverlayAsset["kind"];
  mimeType: string;
  width?: number;
  height?: number;
  animated: boolean;
  createdAt: number;
  savedAt: number;
  blob: Blob;
  favorite?: boolean;
  tags?: string[];
};

function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Sticker Vault is not supported in this browser.")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open Sticker Vault."));
  });
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: unknown) => void) => void): Promise<T> {
  return openVault().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Sticker Vault transaction failed.")); };
    run(store, resolve, reject);
  }));
}

async function blobForAsset(asset: OverlayAsset): Promise<Blob> {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Could not read ${asset.name || "sticker"} for the Vault.`);
  return response.blob();
}

export async function saveOverlayAsset(asset: OverlayAsset): Promise<OverlayVaultRecord> {
  const existing = await getOverlayVaultRecord(asset.id).catch(() => null);
  const record: OverlayVaultRecord = {
    id: asset.id,
    name: existing?.name || asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    animated: asset.animated,
    createdAt: asset.createdAt,
    savedAt: Date.now(),
    blob: await blobForAsset(asset),
    favorite: existing?.favorite ?? false,
    tags: existing?.tags ?? [],
  };
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return record;
}

export async function getOverlayVaultRecord(id: string): Promise<OverlayVaultRecord | null> {
  return transact<OverlayVaultRecord | null>("readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as OverlayVaultRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function updateOverlayVaultMeta(id: string, patch: { name?: string; favorite?: boolean; tags?: string[] }): Promise<OverlayVaultRecord> {
  const current = await getOverlayVaultRecord(id);
  if (!current) throw new Error("Vault item no longer exists.");
  const next: OverlayVaultRecord = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim() || current.name } : {}),
    ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
    ...(patch.tags !== undefined ? { tags: [...new Set(patch.tags.map(tag => tag.trim()).filter(Boolean))].slice(0, 12) } : {}),
  };
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(next);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return next;
}

export async function removeOverlayAsset(id: string): Promise<void> {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listOverlayVault(): Promise<OverlayVaultRecord[]> {
  return transact<OverlayVaultRecord[]>("readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result as OverlayVaultRecord[]).sort((a, b) => b.savedAt - a.savedAt));
    request.onerror = () => reject(request.error);
  });
}

export function assetFromVaultRecord(record: OverlayVaultRecord): OverlayAsset {
  return { id: record.id, name: record.name, kind: record.kind, url: URL.createObjectURL(record.blob), mimeType: record.mimeType, width: record.width, height: record.height, animated: record.animated, createdAt: record.createdAt, objectUrl: true };
}

export async function loadOverlayVaultAssets(): Promise<OverlayAsset[]> { const records = await listOverlayVault(); return records.map(assetFromVaultRecord); }
export function disposeOverlayAssets(assets: OverlayAsset[]): void { for (const asset of assets) if (asset.objectUrl && asset.url.startsWith("blob:")) URL.revokeObjectURL(asset.url); }
