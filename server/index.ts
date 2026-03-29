import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  createBookmark,
  queryRecentBookmarks,
  queryFolders,
  createFolder,
  deleteFolder,
  renameFolder,
  moveFolder,
  validateCredentials,
} from './notion-api';
import type { Folder, FolderMeta } from '../shared/types';
import { QUERY_PAGE_SIZE } from '../shared/constants';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3456;

function getApiToken(): string {
  const v = process.env.NOTION_INTERNAL_INTEGRATION_SECRET;
  if (!v) throw new Error('NOTION_INTERNAL_INTEGRATION_SECRET is not set in .env');
  return v;
}

function getBookmarkDatabaseId(): string {
  const v = process.env.NOTION_BOOKMARKS_DATABASE_ID;
  if (!v) throw new Error('NOTION_BOOKMARKS_DATABASE_ID is not set in .env');
  return v;
}

function getFolderDatabaseId(): string {
  const v = process.env.NOTION_FOLDERS_DATABASE_ID;
  if (!v) throw new Error('NOTION_FOLDERS_DATABASE_ID is not set in .env');
  return v;
}

// ─── Tool parameter interfaces ────────────────────────────────────────────────

interface SaveBookmarkArgs {
  title: string;
  url: string;
  notes?: string;
  prompt?: string;
  folderPageId?: string;
}

interface FetchRecentArgs {
  pageSize?: number;
}

interface CreateFolderArgs {
  name: string;
  parentPageId?: string | null;
  titlePropName?: string;
  parentPropName?: string;
}

interface RenameFolderArgs {
  pageId: string;
  name: string;
  titlePropName?: string;
}

interface MoveFolderArgs {
  pageId: string;
  parentPageId?: string | null;
  parentPropName?: string;
}

interface DeleteFolderArgs {
  pageId: string;
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<Record<string, unknown>>> = {
  async save_bookmark(args) {
    const { title, url, notes = '', prompt, folderPageId } = args as SaveBookmarkArgs;
    const page = await createBookmark({
      apiToken: getApiToken(),
      databaseId: getBookmarkDatabaseId(),
      title, url, notes, prompt, folderPageId,
    }) as { id: string };
    console.log('page', page);
    return { success: true, pageId: page.id };
  },

  async fetch_recent_bookmarks(args) {
    const { pageSize = QUERY_PAGE_SIZE } = args as FetchRecentArgs;
    const result = await queryRecentBookmarks({
      apiToken: getApiToken(),
      databaseId: getBookmarkDatabaseId(),
      pageSize,
    }) as {
      results: Array<{
        id: string;
        properties: {
          Title?: { title?: Array<{ plain_text?: string }> };
          URL?: { url?: string | null };
          Notes?: { rich_text?: Array<{ plain_text?: string }> };
          'Date Added'?: { date?: { start?: string } };
        };
        created_time: string;
      }>;
    };
    const bookmarks = result.results.map(page => ({
      notionPageId: page.id,
      title: page.properties.Title?.title?.[0]?.plain_text ?? '',
      url: page.properties.URL?.url ?? '',
      notes: page.properties.Notes?.rich_text?.[0]?.plain_text ?? '',
      dateAdded: page.properties['Date Added']?.date?.start ?? page.created_time,
    }));
    return { success: true, bookmarks };
  },

  async fetch_folders(_args) {
    const { pages, titlePropName, parentPropName } = await queryFolders({
      apiToken: getApiToken(),
      databaseId: getFolderDatabaseId(),
    });

    const folders: Folder[] = (pages as Array<{
      id: string;
      properties: Record<string, {
        type: string;
        title?: Array<{ plain_text?: string }>;
        relation?: Array<{ id: string }>;
        unique_id?: { number?: number };
      }>;
    }>).map(page => {
      const titleProp = page.properties[titlePropName];
      const parentProp = page.properties[parentPropName];
      const uniqueIdProp = Object.values(page.properties).find(p => p.type === 'unique_id');
      return {
        pageId: page.id,
        name: titleProp?.title?.[0]?.plain_text ?? '',
        parentId: parentProp?.number ?? null,
        id: uniqueIdProp?.unique_id?.number ?? null,
      };
    });

    const meta: FolderMeta = { titlePropName, parentPropName };
    return { success: true, folders, ...meta };
  },

  async create_folder(args) {
    const { name, parentPageId, titlePropName, parentPropName } = args as CreateFolderArgs;
    await createFolder({
      apiToken: getApiToken(),
      databaseId: getFolderDatabaseId(),
      name, parentPageId, titlePropName, parentPropName,
    });
    return { success: true };
  },

  async rename_folder(args) {
    const { pageId, name, titlePropName } = args as RenameFolderArgs;
    await renameFolder({ apiToken: getApiToken(), pageId, name, titlePropName });
    return { success: true };
  },

  async move_folder(args) {
    const { pageId, parentPageId, parentPropName } = args as MoveFolderArgs;
    await moveFolder({ apiToken: getApiToken(), pageId, parentPageId, parentPropName });
    return { success: true };
  },

  async delete_folder(args) {
    const { pageId } = args as DeleteFolderArgs;
    await deleteFolder({ apiToken: getApiToken(), pageId });
    return { success: true };
  },
};

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post('/call', async (req: Request, res: Response) => {
  const { tool, arguments: args } = req.body as { tool: string; arguments: unknown };

  const handler = TOOL_HANDLERS[tool];
  if (!handler) {
    res.status(400).json({ success: false, error: `Unknown tool: ${tool}` });
    return;
  }

  try {
    const result = await handler(args);
    res.json(result);
  } catch (err) {
    const error = err as Error & { code?: string };
    res.status(500).json({ success: false, error: error.message, code: error.code });
  }
});

app.post('/test', async (_req: Request, res: Response) => {
  try {
    const apiToken = getApiToken();
    const tests: Promise<{ databaseTitle: string }>[] = [
      validateCredentials({ apiToken, databaseId: getBookmarkDatabaseId() }),
    ];
    const folderDbId = process.env.NOTION_FOLDERS_DATABASE_ID;
    if (folderDbId) tests.push(validateCredentials({ apiToken, databaseId: folderDbId }));

    const [bookmarkResult, folderResult] = await Promise.all(tests);
    res.json({ success: true, bookmarkTitle: bookmarkResult.databaseTitle, folderTitle: folderResult?.databaseTitle });
  } catch (err) {
    const error = err as Error & { code?: string };
    res.status(500).json({ success: false, error: error.message, code: error.code });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`MCP bridge server running on http://localhost:${PORT}`);
});
