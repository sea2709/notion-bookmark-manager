import { createBookmark, queryRecentBookmarks, queryFolders } from '../shared/notion-api';
import { getConfig, getCachedBookmarks, setCachedBookmarks } from '../shared/storage';
import { CACHE_SIZE, QUERY_PAGE_SIZE } from '../shared/constants';
import type { Bookmark, Folder } from '../shared/types';

interface SaveBookmarkPayload {
  title: string;
  url: string;
  tags: string[];
  notes: string;
  folderPageId?: string | null;
}

interface FetchRecentPayload {
  forceRefresh?: boolean;
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
    return true; // Keep channel open for async response
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
});

async function handleSaveBookmark({ title, url, tags, notes, folderPageId }: SaveBookmarkPayload): Promise<MessageResponse> {
  const config = await getConfig();
  if (!config.apiToken || !config.databaseId) {
    return { success: false, error: 'NOT_CONFIGURED' };
  }

  const page = await createBookmark({ ...config, title, url, tags, notes, folderPageId });

  const cached = await getCachedBookmarks();
  const newEntry: Bookmark = {
    notionPageId: page.id,
    title,
    url,
    tags,
    notes,
    dateAdded: new Date().toISOString()
  };
  await setCachedBookmarks([newEntry, ...cached].slice(0, CACHE_SIZE));

  // Visual feedback badge
  chrome.action.setBadgeText({ text: '✓' });
  chrome.action.setBadgeBackgroundColor({ color: '#00b894' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  return { success: true, pageId: page.id };
}

async function handleFetchFolders(): Promise<MessageResponse> {
  const config = await getConfig();
  if (!config.apiToken || !config.folderDatabaseId) {
    return { success: false, error: 'NO_FOLDER_DATABASE' };
  }
  const pages = await queryFolders({ apiToken: config.apiToken, databaseId: config.folderDatabaseId });
  const folders: Folder[] = pages.pages.map(page => {
    const props = page.properties as Record<string, any>;

    const titleProp = Object.values(props).find((p: any) => p.type === 'title');
    const name: string = titleProp?.title?.[0]?.plain_text ?? 'Untitled';

    const idProp = Object.values(props).find((p: any) => p.type === 'unique_id');
    const id: number | null = idProp?.unique_id?.number ?? null;

    const parentProp: any =
      props['Parent ID'] ??
      Object.entries(props).find(([k, v]: [string, any]) =>
        v.type === 'relation' && k.toLowerCase().includes('parent')
      )?.[1];
    const parentId: string | null = parentProp?.number ?? null;

    return { pageId: page.id as string, name, parentId, id };
  });
  return { success: true, folders };
}

async function handleFetchRecent({ forceRefresh = false }: FetchRecentPayload): Promise<MessageResponse> {
  const config = await getConfig();
  if (!config.apiToken || !config.databaseId) {
    return { success: false, error: 'NOT_CONFIGURED' };
  }

  if (!forceRefresh) {
    const cached = await getCachedBookmarks();
    if (cached.length > 0) return { success: true, bookmarks: cached, source: 'cache' };
  }

  const data = await queryRecentBookmarks({ ...config, pageSize: QUERY_PAGE_SIZE });
  const bookmarks: Bookmark[] = (data.results as any[]).map(page => ({
    notionPageId: page.id,
    title: page.properties?.Title?.title?.[0]?.plain_text ?? 'Untitled',
    url: page.properties?.URL?.url ?? '',
    tags: page.properties?.Tags?.multi_select?.map((t: { name: string }) => t.name) ?? [],
    notes: page.properties?.Notes?.rich_text?.[0]?.plain_text ?? '',
    dateAdded: page.properties?.['Date Added']?.date?.start ?? page.created_time
  }));

  await setCachedBookmarks(bookmarks);
  return { success: true, bookmarks, source: 'api' };
}
