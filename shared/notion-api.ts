import { Client, APIResponseError } from '@notionhq/client';

type ExtendedClient = Client & {
  dataSources: {
    query(params: {
      data_source_id: string;
      start_cursor?: string;
      page_size?: number;
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
  tags?: string[];
  notes?: string;
  folderPageId?: string;
}

export async function createBookmark({
  apiToken,
  databaseId,
  title,
  url,
  tags = [],
  notes = '',
  folderPageId,
}: CreateBookmarkParams): Promise<unknown> {
  // const notion = createClient(apiToken);
  // const properties: Record<string, unknown> = {
  //   Title: {
  //     title: [{ text: { content: title } }]
  //   },
  //   URL: {
  //     url: url
  //   },
  //   Tags: {
  //     multi_select: tags.map(name => ({ name: name.trim() })).filter(t => t.name)
  //   },
  //   Notes: {
  //     rich_text: notes ? [{ text: { content: notes } }] : []
  //   },
  //   'Date Added': {
  //     date: { start: new Date().toISOString() }
  //   }
  // };
  // if (folderPageId) {
  //   properties['Folder'] = { relation: [{ id: folderPageId }] };
  // }
  // return notion.pages.create({
  //   parent: { database_id: databaseId },
  //   properties: properties as Parameters<typeof notion.pages.create>[0]['properties']
  // });

  
}

export interface QueryRecentBookmarksParams {
  apiToken: string;
  databaseId: string;
  pageSize?: number;
}

export async function queryRecentBookmarks({
  apiToken,
  databaseId,
  pageSize = 10,
}: QueryRecentBookmarksParams): Promise<unknown> {
  const notion = createClient(apiToken);
  const database = await notion.databases.retrieve({ database_id: databaseId }) as unknown as {
    data_sources: Array<{ id: string }>;
  };
  const datasource = database.data_sources[0];
  return notion.dataSources.query({
    data_source_id: datasource.id,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: pageSize,
  });
}

export interface QueryFoldersParams {
  apiToken: string;
  databaseId: string;
}

export async function queryFolders({
  apiToken,
  databaseId,
}: QueryFoldersParams): Promise<{ pages: unknown[]; titlePropName: string; parentPropName: string }> {
  const notion = createClient(apiToken) as ExtendedClient;
  const database = await notion.databases.retrieve({ database_id: databaseId }) as unknown as {
    properties: Record<string, { type: string }>;
    data_sources: Array<{ id: string }>;
  };

  const datasourceId = database.data_sources[0].id;
  const datasource = await notion.dataSources.retrieve({ 'data_source_id': datasourceId })as unknown as {
    properties: Record<string, { type: string }>;
    id: string
  };

  const titlePropName = Object.entries(datasource.properties)
    .find(([, v]) => v.type === 'title')?.[0] ?? 'Name';
  const parentPropName = Object.entries(datasource.properties)
    .find(([k, v]) => v.type === 'relation' && k.toLowerCase().includes('parent'))?.[0] ?? 'Parent ID';

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
  return { pages, titlePropName, parentPropName };
}

export interface CreateFolderParams {
  apiToken: string;
  databaseId: string;
  name: string;
  parentPageId?: string | null;
  titlePropName?: string;
  parentPropName?: string;
}

export async function createFolder({
  apiToken,
  databaseId,
  name,
  parentPageId,
  titlePropName = 'Name',
  parentPropName = 'Parent ID',
}: CreateFolderParams): Promise<unknown> {
  const notion = createClient(apiToken);
  const properties: Record<string, unknown> = {
    [titlePropName]: { title: [{ text: { content: name } }] }
  };
  if (parentPageId) {
    properties[parentPropName] = { relation: [{ id: parentPageId }] };
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
