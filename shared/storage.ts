import type { Bookmark } from './types';

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
