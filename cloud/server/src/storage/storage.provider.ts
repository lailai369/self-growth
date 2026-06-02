import { config } from '../config';

export type StorageProvider = 'local' | 'oss' | 's3';

export function getStorageProvider(): StorageProvider {
  return config.storage.provider as StorageProvider;
}

export function isCloudStorage(): boolean {
  return getStorageProvider() !== 'local';
}