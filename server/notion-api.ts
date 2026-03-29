import { Client, APIResponseError } from '@notionhq/client';
import { GoogleGenAI, createPartFromUri, mcpToTool } from '@google/genai';
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ExtendedClient = Client & {
  dataSources: {
    retrieve(params: { 'data_source_id': string }): Promise<unknown>;
    query(params: {
      data_source_id: string;
      start_cursor?: string;
      page_size?: number;
      sorts?: Array<{ timestamp: string; direction: string }>;
    }): Promise<{ results: unknown[]; has_more: boolean; next_cursor: string | null }>;
  };
};

function createClient(apiToken: string): Client {
  return new Client({ auth: apiToken });
}

export { APIResponseError };

export interface CreateBookmarkParams {
  apiToken: string;
  databaseId: string;
  title: string;
  url: string;
  notes?: string;
  prompt?: string;
  folderPageId?: string;
}

export async function createBookmark({
  apiToken,
  databaseId,
  title,
  url,
  notes = '',
  prompt = '',
  folderPageId,
}: CreateBookmarkParams): Promise<unknown> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  let generatedContent = '';
  if (prompt) {
    const response = await ai.models.generateContent({
      model,
      contents: [
        createPartFromUri(url, 'text/html'),
        { text: prompt },
      ],
    });
    generatedContent = response.text ?? '';
  }

  const notion = createClient(apiToken);
  const properties: Record<string, unknown> = {
    Title: { title: [{ text: { content: title } }] },
    URL: { url },
    Notes: { rich_text: notes ? [{ text: { content: notes } }] : [] },
    'Date Added': { date: { start: new Date().toISOString() } },
  };
  if (folderPageId) {
    properties['Folder'] = { relation: [{ id: folderPageId }] };
  }

  const children: unknown[] = generatedContent
    ? generatedContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => ({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: line } }] },
        }))
    : [];

  return notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as Parameters<typeof notion.pages.create>[0]['properties'],
    children: children as Parameters<typeof notion.pages.create>[0]['children'],
  });
}

export interface QueryRecentBookmarksParams {
  apiToken: string;
  databaseId: string;
}

export async function queryRecentBookmarks({
  apiToken,
  databaseId,
}: QueryRecentBookmarksParams): Promise<unknown> {
  const notion = createClient(apiToken) as ExtendedClient;
  const database = await notion.databases.retrieve({ database_id: databaseId }) as unknown as {
    data_sources: Array<{ id: string }>;
  };
  const datasourceId = database.data_sources[0].id;

  const results: unknown[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.dataSources.query({
      data_source_id: datasourceId,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return { results };
}

export interface QueryFoldersParams {
  apiToken: string;
  databaseId: string;
}

export async function queryFolders({
  apiToken,
  databaseId,
}: QueryFoldersParams): Promise<{ pages: unknown[]; }> {
  const notion = createClient(apiToken) as ExtendedClient;
  const database = await notion.databases.retrieve({ database_id: databaseId }) as unknown as {
    data_sources: Array<{ id: string }>;
  };

  const datasourceId = database.data_sources[0].id;
  const datasource = await notion.dataSources.retrieve({ 'data_source_id': datasourceId })as unknown as {
    properties: Record<string, { type: string }>;
    id: string
  };

  const pages: unknown[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.dataSources.query({
      data_source_id: datasource.id,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return { pages };
}

export interface CreateFolderParams {
  apiToken: string;
  databaseId: string;
  name: string;
  parentPageId?: string | null;
}

export async function createFolder({
  apiToken,
  databaseId,
  name,
  parentPageId}: CreateFolderParams): Promise<unknown> {
  const titlePropName = 'Name';
  const parentPropName = 'Parent ID';
  const uniqueIdPropName = "ID";
  const notion = createClient(apiToken);
  

  let properties: Record<string, unknown> = {
    [titlePropName]: { title: [{ text: { content: name } }] }
  };

  let parentPage = null;
  if (parentPageId) {
    parentPage = await notion.pages.retrieve({ page_id: parentPageId });
    properties[parentPropName] = { number: parentPage?.properties[uniqueIdPropName].unique_id.number };
  }

  return notion.pages.create({
    parent: { database_id: databaseId },
    properties: properties as Parameters<typeof notion.pages.create>[0]['properties']
  });
}

export interface DeleteFolderParams {
  apiToken: string;
  pageId: string;
}

export async function deleteFolder({ apiToken, pageId }: DeleteFolderParams): Promise<unknown> {
  const notion = createClient(apiToken);
  return notion.pages.update({ page_id: pageId, archived: true });
}

export interface RenameFolderParams {
  apiToken: string;
  pageId: string;
  name: string;
  titlePropName?: string;
}

export async function renameFolder({
  apiToken,
  pageId,
  name,
  titlePropName = 'Name',
}: RenameFolderParams): Promise<unknown> {
  const notion = createClient(apiToken);
  return notion.pages.update({
    page_id: pageId,
    properties: {
      [titlePropName]: { title: [{ text: { content: name } }] }
    } as Parameters<typeof notion.pages.update>[0]['properties']
  });
}

export interface MoveFolderParams {
  apiToken: string;
  pageId: string;
  parentPageId?: string | null;
  parentPropName?: string;
}

export async function moveFolder({
  apiToken,
  pageId,
  parentPageId,
  parentPropName = 'Parent ID',
}: MoveFolderParams): Promise<unknown> {
  const notion = createClient(apiToken);
  return notion.pages.update({
    page_id: pageId,
    properties: {
      [parentPropName]: parentPageId
        ? { relation: [{ id: parentPageId }] }
        : { relation: [] }
    } as Parameters<typeof notion.pages.update>[0]['properties']
  });
}

export interface SearchBookmarkParams {
  apiToken: string;
  databaseId: string;
  keyword: string;
}

export async function searchBookmark({
  apiToken,
  databaseId,
  keyword,
}: SearchBookmarkParams): Promise<unknown> {


  const ai = new GoogleGenAI({});

  const notionClient = new McpClient({ name: "notion-client", version: "1.0.0" });

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"],
    env: {
      NOTION_TOKEN: process.env.NOTION_API_KEY
    },
  });

  await notionClient.connect(transport);

  const prompt = `Search for pages under the database with the ID ${databaseId} mentioning '${keyword}'.
For each matching page, retrieve its URL property and read its content.
Format your response as a list. For each result:
- Write the page name as a markdown link using its URL property: [Page Name](https://...)
- On the next line, include a single short sentence (max 20 words) highlighting the most relevant part of the page content related to '${keyword}'
If a page has no URL property, mention the name as plain text. If there is no relevant highlight, omit that line.`;
  
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
    contents: prompt,
    config: {
      tools: [mcpToTool(notionClient)],
    },
  });

  console.log('response', response.text);
  return { text: response.text ?? '' };
}

export interface ValidateCredentialsParams {
  apiToken: string;
  databaseId: string;
}

export async function validateCredentials({
  apiToken,
  databaseId,
}: ValidateCredentialsParams): Promise<{ valid: boolean; databaseTitle: string }> {
  const notion = createClient(apiToken);
  const db = await notion.databases.retrieve({ database_id: databaseId }) as unknown as {
    title?: Array<{ plain_text?: string }>;
  };
  return {
    valid: true,
    databaseTitle: db.title?.[0]?.plain_text ?? 'Untitled'
  };
}
