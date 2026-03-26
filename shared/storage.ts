import type { NotionConfig, Bookmark } from './types';

export async function getConfig(): Promise<NotionConfig> {
  return new Promise(resolve => {
    chrome.storage.sync.get('notionConfig', (items: { [key: string]: unknown }) => {
      const notionConfig = items['notionConfig'] as NotionConfig | undefined;
      resolve(notionConfig ?? { apiToken: '', databaseId: '', folderDatabaseId: '' });
    });
  });
}

export async function setConfig(config: NotionConfig): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ notionConfig: config }, resolve);
  });
}

export async function getCachedBookmarks(): Promise<Bookmark[]> {
  return new Promise(resolve => {
    chrome.storage.local.get('recentBookmarks', (items: { [key: string]: unknown }) => {
      const recentBookmarks = items['recentBookmarks'] as Bookmark[] | undefined;
      resolve(recentBookmarks ?? []);
    });
  });
}

export async function setCachedBookmarks(bookmarks: Bookmark[]): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.set({ recentBookmarks: bookmarks }, resolve);
  });
}

export async function clearCache(): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.remove('recentBookmarks', resolve);
  });
}
