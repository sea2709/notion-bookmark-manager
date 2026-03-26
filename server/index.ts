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
} from '../shared/notion-api';
import type { Folder, FolderMeta } from '../shared/types';
import { QUERY_PAGE_SIZE } from '../shared/constants';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3456;

// ─── Tool parameter interfaces ────────────────────────────────────────────────

interface SaveBookmarkArgs {
  apiToken: string;
  databaseId: string;
  title: string;
  url: string;
  tags?: string[];
  notes?: string;
  folderPageId?: string;
}

interface FetchRecentArgs {
  apiToken: string;
  databaseId: string;
  pageSize?: number;
}

interface FetchFoldersArgs {
  apiToken: string;
  databaseId: string;
}

interface CreateFolderArgs {
  apiToken: string;
  databaseId: string;
  name: string;
  parentPageId?: string | null;
  titlePropName?: string;
  parentPropName?: string;
}

interface RenameFolderArgs {
  apiToken: string;
  pageId: string;
  name: string;
  titlePropName?: string;
}

interface MoveFolderArgs {
  apiToken: string;
  pageId: string;
  parentPageId?: string | null;
  parentPropName?: string;
}

interface DeleteFolderArgs {
  apiToken: string;
  pageId: string;
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<Record<string, unknown>>> = {
  async save_bookmark(args) {
    const { apiToken, databaseId, title, url, tags = [], notes = '', folderPageId } = args as SaveBookmarkArgs;
    const page = await createBookmark({ apiToken, databaseId, title, url, tags, notes, folderPageId }) as { id: string };
    return { success: true, pageId: page.id };
  },

  async fetch_recent_bookmarks(args) {
    const { apiToken, databaseId, pageSize = QUERY_PAGE_SIZE } = args as FetchRecentArgs;
    const result = await queryRecentBookmarks({ apiToken, databaseId, pageSize }) as {
      results: Array<{
        id: string;
        properties: {
          Title?: { title?: Array<{ plain_text?: string }> };
          URL?: { url?: string | null };
          Tags?: { multi_select?: Array<{ name: string }> };
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
      tags: page.properties.Tags?.multi_select?.map(t => t.name) ?? [],
      notes: page.properties.Notes?.rich_text?.[0]?.plain_text ?? '',
      dateAdded: page.properties['Date Added']?.date?.start ?? page.created_time,
    }));
    return { success: true, bookmarks };
  },

  async fetch_folders(args) {
    const { apiToken, databaseId } = args as FetchFoldersArgs;
    const { pages, titlePropName, parentPropName } = await queryFolders({ apiToken, databaseId });

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
        parentId: parentProp?.relation?.[0]?.id ?? null,
        id: uniqueIdProp?.unique_id?.number ?? null,
      };
    });

    const meta: FolderMeta = { titlePropName, parentPropName };
    return { success: true, folders, ...meta };
  },

  async create_folder(args) {
    const { apiToken, databaseId, name, parentPageId, titlePropName, parentPropName } = args as CreateFolderArgs;
    await createFolder({ apiToken, databaseId, name, parentPageId, titlePropName, parentPropName });
    return { success: true };
  },

  async rename_folder(args) {
    const { apiToken, pageId, name, titlePropName } = args as RenameFolderArgs;
    await renameFolder({ apiToken, pageId, name, titlePropName });
    return { success: true };
  },

  async move_folder(args) {
    const { apiToken, pageId, parentPageId, parentPropName } = args as MoveFolderArgs;
    await moveFolder({ apiToken, pageId, parentPageId, parentPropName });
    return { success: true };
  },

  async delete_folder(args) {
    const { apiToken, pageId } = args as DeleteFolderArgs;
    await deleteFolder({ apiToken, pageId });
    return { success: true };
  },
};

// ─── Route ────────────────────────────────────────────────────────────────────

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

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`MCP bridge server running on http://localhost:${PORT}`);
});
