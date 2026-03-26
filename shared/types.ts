export interface NotionConfig {
  apiToken: string;
  databaseId: string;
  folderDatabaseId?: string;
}

export interface Bookmark {
  notionPageId: string;
  title: string;
  url: string;
  tags: string[];
  notes: string;
  dateAdded: string;
}

export interface Folder {
  pageId: string;
  name: string;
  parentId: string | null;
  id: number | null;
}

export interface FolderMeta {
  titlePropName: string;
  parentPropName: string;
}

export interface FolderNode extends Folder {
  children: FolderNode[];
}
