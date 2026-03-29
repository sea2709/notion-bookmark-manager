import { getCachedBookmarks, setCachedBookmarks } from '../shared/storage';
import { CACHE_SIZE } from '../shared/constants';
import type { Bookmark } from '../shared/types';

const SERVER_URL = 'http://localhost:3456';

async function callServer<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SERVER_URL}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, arguments: args }),
  });
  const data = await res.json() as T & { success: boolean; error?: string; code?: string };
  if (!data.success) {
    throw Object.assign(new Error(data.error ?? 'Server error'), { code: data.code });
  }
  return data;
}

interface SaveBookmarkPayload {
  title: string;
  url: string;
  notes: string;
  prompt?: string;
  folderPageId?: string | null;
}

interface FetchRecentPayload {
  forceRefresh?: boolean;
}

interface SearchBookmarksPayload {
  keyword: string;
}

interface CreateFolderPayload {
  name: string;
  parentPageId?: string | null;
}

interface MessageResponse {
  success: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SAVE_BOOKMARK') {
    handleSaveBookmark(message.payload as SaveBookmarkPayload)
      .then(sendResponse)
      .catch((err: Error & { code?: string }) =>
        sendResponse({ success: false, error: err.message, code: err.code })
      );
    return true;
  }

  if (message.type === 'FETCH_RECENT') {
    handleFetchRecent((message.payload ?? {}) as FetchRecentPayload)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'FETCH_FOLDERS') {
    handleFetchFolders()
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'SEARCH_BOOKMARKS') {
    handleSearchBookmarks(message.payload as SearchBookmarksPayload)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'CREATE_FOLDER') {
    handleCreateFolder(message.payload as CreateFolderPayload)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleSaveBookmark({ title, url, notes, prompt, folderPageId }: SaveBookmarkPayload): Promise<MessageResponse> {
  const result = await callServer<{ pageId: string }>('save_bookmark', {
    title, url, notes,
    ...(prompt ? { prompt } : {}),
    ...(folderPageId ? { folderPageId } : {}),
  });

  const cached = await getCachedBookmarks();
  const newEntry: Bookmark = {
    notionPageId: result.pageId,
    title, url, notes,
    dateAdded: new Date().toISOString(),
  };
  await setCachedBookmarks([newEntry, ...cached].slice(0, CACHE_SIZE));

  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#00b894' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  return { success: true, pageId: result.pageId };
}

async function handleFetchFolders(): Promise<MessageResponse> {
  return callServer('fetch_folders');
}

async function handleSearchBookmarks({ keyword }: SearchBookmarksPayload): Promise<MessageResponse> {
  return callServer('search_bookmarks', { keyword });
}

async function handleCreateFolder({ name, parentPageId }: CreateFolderPayload): Promise<MessageResponse> {
  return callServer('create_folder', { name, ...(parentPageId ? { parentPageId } : {}) });
}

async function handleFetchRecent({ forceRefresh = false }: FetchRecentPayload): Promise<MessageResponse> {
  if (!forceRefresh) {
    const cached = await getCachedBookmarks();
    if (cached.length > 0) return { success: true, bookmarks: cached, source: 'cache' };
  }

  const result = await callServer<{ bookmarks: Bookmark[] }>('fetch_recent_bookmarks');
  await setCachedBookmarks(result.bookmarks);
  return { success: true, bookmarks: result.bookmarks, source: 'api' };
}
