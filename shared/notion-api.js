import { Client, APIResponseError } from '@notionhq/client';

function createClient(apiToken) {
  return new Client({ auth: apiToken });
}

export { APIResponseError };

export async function createBookmark({ apiToken, databaseId, title, url, tags = [], notes = '', folderPageId }) {
  const notion = createClient(apiToken);
  const properties = {
    Title: {
      title: [{ text: { content: title } }]
    },
    URL: {
      url: url
    },
    Tags: {
      multi_select: tags.map(name => ({ name: name.trim() })).filter(t => t.name)
    },
    Notes: {
      rich_text: notes ? [{ text: { content: notes } }] : []
    },
    'Date Added': {
      date: { start: new Date().toISOString() }
    }
  };
  if (folderPageId) {
    properties['Folder'] = { relation: [{ id: folderPageId }] };
  }
  return notion.pages.create({
    parent: { database_id: databaseId },
    properties
  });
}

export async function queryRecentBookmarks({ apiToken, databaseId, pageSize = 10 }) {
  const notion = createClient(apiToken);
  return notion.databases.query({
    database_id: databaseId,
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    page_size: pageSize
  });
}

export async function queryFolders({ apiToken, databaseId }) {
  const notion = createClient(apiToken);
  const results = [];
  const database = await notion.databases.retrieve({ database_id: databaseId });
  const datasource = database.data_sources[0];
  let cursor;
  do {
    const response = await notion.dataSources.query({
      data_source_id: datasource.id,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  console.log('results', results);
  return results;
}

export async function validateCredentials({ apiToken, databaseId }) {
  const notion = createClient(apiToken);
  const db = await notion.databases.retrieve({ database_id: databaseId });
  return {
    valid: true,
    databaseTitle: db.title?.[0]?.plain_text ?? 'Untitled'
  };
}
