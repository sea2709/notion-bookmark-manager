import type { Bookmark, Folder, FolderNode } from '../shared/types';

// Elements
const viewSave      = document.getElementById('view-save') as HTMLElement;
const viewBrowse    = document.getElementById('view-browse') as HTMLElement;
const viewSearch    = document.getElementById('view-search') as HTMLElement;
const btnToggleView = document.getElementById('btn-toggle-view') as HTMLButtonElement;
const btnSearchView = document.getElementById('btn-search-view') as HTMLButtonElement;
const btnSave       = document.getElementById('btn-save') as HTMLButtonElement;
const btnRefresh    = document.getElementById('btn-refresh') as HTMLButtonElement;
const inputTitle    = document.getElementById('input-title') as HTMLInputElement;
const inputUrl      = document.getElementById('input-url') as HTMLInputElement;
const inputNotes    = document.getElementById('input-notes') as HTMLTextAreaElement;
const inputPrompt   = document.getElementById('input-prompt') as HTMLTextAreaElement;
const inputSearch   = document.getElementById('input-search') as HTMLInputElement;
const saveStatus    = document.getElementById('save-status') as HTMLElement;
const browseList    = document.getElementById('browse-list') as HTMLElement;
const searchResults = document.getElementById('search-results') as HTMLElement;
const folderTree    = document.getElementById('folder-tree') as HTMLElement;

type ViewName = 'save' | 'browse' | 'search';

let currentView: ViewName = 'save';
let currentTab: chrome.tabs.Tab | null = null;
let selectedFolderId: string | null = null;

// Init
async function init(): Promise<void> {
  currentTab = await getActiveTab();

  if (currentTab) {
    inputTitle.value = currentTab.title ?? '';
    inputUrl.value = currentTab.url ?? '';
  }

  showView('save');
  loadFolderTree();
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve(tabs[0] ?? null);
    });
  });
}

function sendMessage<T>(message: object): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(response);
    });
  });
}

// Folder tree
async function loadFolderTree(): Promise<void> {
  folderTree.innerHTML = `<div class="folder-loading"><div class="spinner"></div><span>Loading folders...</span></div>`;
  try {
    const response = await sendMessage<{ success: boolean; folders?: Folder[] }>({ type: 'FETCH_FOLDERS' });
    console.log('response', response);
    if (!response.success) {
      folderTree.innerHTML = `<div class="folder-loading"><span>Failed to load folders.</span></div>`;
      return;
    }
    renderFolderTree(response.folders ?? []);
  } catch {
    folderTree.innerHTML = `<div class="folder-loading"><span>Connection failed.</span></div>`;
  }
}

function buildTree(folders: Folder[]): FolderNode[] {
  const map: Record<string, FolderNode> = Object.fromEntries(
    folders.map(f => [f.pageId, { ...f, children: [], bookmarks: [] }])
  );
  const roots: FolderNode[] = [];
  for (const node of Object.values(map)) {
    if (node.parentId && map[node.parentId]) {
      map[node.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function renderFolderTree(folders: Folder[]): void {
  if (!folders.length) {
    folderTree.innerHTML = `<div class="folder-loading"><span>No folders found.</span></div>`;
    return;
  }
  const roots = buildTree(folders);
  folderTree.innerHTML = '';
  folderTree.appendChild(renderNodes(roots, 0));
  folderTree.addEventListener('click', (e: MouseEvent) => {
    const item = (e.target as Element).closest<HTMLElement>('.folder-item');
    if (!item) return;
    folderTree.querySelectorAll('.folder-item.selected').forEach(el => el.classList.remove('selected'));
    if (selectedFolderId === item.dataset['pageId']) {
      selectedFolderId = null;
    } else {
      item.classList.add('selected');
      selectedFolderId = item.dataset['pageId'] ?? null;
    }
  });
}

function renderNodes(nodes: FolderNode[], depth: number): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'folder-list';
  for (const node of nodes) {
    const li = document.createElement('li');
    const item = document.createElement('div');
    item.className = `folder-item depth-${depth}`;
    item.dataset['id'] = String(node.id);
    item.dataset['pageId'] = node.pageId;
    const icon = node.children.length
      ? `<svg class="folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>`
      : `<svg class="folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    item.innerHTML = `${icon}<span>${escapeHtml(node.name)}</span>`;
    li.appendChild(item);
    if (node.children.length) {
      li.appendChild(renderNodes(node.children, depth + 1));
    }
    ul.appendChild(li);
  }
  return ul;
}

// Views
function showView(view: ViewName): void {
  currentView = view;
  viewSave.classList.add('hidden');
  viewBrowse.classList.add('hidden');
  viewSearch.classList.add('hidden');
  btnToggleView.classList.remove('active');
  btnSearchView.classList.remove('active');

  if (view === 'save') {
    viewSave.classList.remove('hidden');
  } else if (view === 'browse') {
    viewBrowse.classList.remove('hidden');
    btnToggleView.classList.add('active');
    loadBrowseView();
  } else if (view === 'search') {
    viewSearch.classList.remove('hidden');
    btnSearchView.classList.add('active');
    inputSearch.focus();
    if (!inputSearch.value) {
      searchResults.innerHTML = `<div class="empty-recent"><span>Type a keyword and press Enter to search.</span></div>`;
    }
  }
}

// Save bookmark
interface SaveResponse {
  success: boolean;
  error?: string;
  code?: string;
}

btnSave.addEventListener('click', async () => {
  const title = inputTitle.value.trim();
  if (!title) {
    showSaveStatus('error', 'Please enter a title.');
    inputTitle.focus();
    return;
  }

  const url = currentTab?.url ?? inputUrl.value.trim();
  const notes = inputNotes.value.trim();
  const prompt = inputPrompt.value.trim();

  setSaving(true);
  hideSaveStatus();

  try {
    const response = await sendMessage<SaveResponse>({
      type: 'SAVE_BOOKMARK',
      payload: { title, url, notes, prompt, folderPageId: selectedFolderId }
    });

    if (response.success) {
      showSaveStatus('success', 'Saved to Notion!');
      setTimeout(() => {
        hideSaveStatus();
        inputNotes.value = '';
      }, 2000);
    } else {
      handleSaveError(response.error, response.code);
    }
  } catch {
    showSaveStatus('error', 'Connection failed. Check your internet.');
  } finally {
    setSaving(false);
  }
});

function handleSaveError(error?: string, code?: string): void {
  if (code === 'unauthorized') {
    showSaveStatus('error', 'Invalid API token. Check your settings.');
    return;
  }
  if (code === 'object_not_found') {
    showSaveStatus('error', 'Database not found. Check your settings.');
    return;
  }
  showSaveStatus('error', error ?? 'Failed to save. Please try again.');
}

function setSaving(saving: boolean): void {
  btnSave.disabled = saving;
  if (saving) {
    btnSave.innerHTML = `<div class="spinner"></div> Saving...`;
  } else {
    btnSave.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17,21 17,13 7,13 7,21"/>
        <polyline points="7,3 7,8 15,8"/>
      </svg>
      Save to Notion`;
  }
}

function showSaveStatus(type: 'success' | 'error', message: string): void {
  saveStatus.className = `save-status ${type}`;
  saveStatus.innerHTML = type === 'success'
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${message}`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${message}`;
  saveStatus.classList.remove('hidden');
}

function hideSaveStatus(): void {
  saveStatus.classList.add('hidden');
}

// Browse bookmarks
interface FetchRecentResponse {
  success: boolean;
  error?: string;
  bookmarks?: Bookmark[];
}

interface FetchFoldersResponse {
  success: boolean;
  folders?: Folder[];
}

async function loadBrowseView(forceRefresh = false): Promise<void> {
  browseList.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>`;

  try {
    const [bookmarkRes, folderRes] = await Promise.all([
      sendMessage<FetchRecentResponse>({ type: 'FETCH_RECENT', payload: { forceRefresh } }),
      sendMessage<FetchFoldersResponse>({ type: 'FETCH_FOLDERS' }),
    ]);

    if (!bookmarkRes.success) {
      browseList.innerHTML = `<div class="empty-recent"><span>Failed to load bookmarks.</span></div>`;
      return;
    }

    renderBrowseTree(bookmarkRes.bookmarks ?? [], folderRes.success ? (folderRes.folders ?? []) : []);
  } catch {
    browseList.innerHTML = `<div class="empty-recent"><span>Connection failed.</span></div>`;
  }
}

function renderBrowseTree(bookmarks: Bookmark[], folders: Folder[]): void {
  browseList.innerHTML = '';

  if (!bookmarks.length) {
    browseList.innerHTML = `
      <div class="empty-recent">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>No bookmarks yet.</span>
      </div>`;
    return;
  }

  // Build folder map with bookmarks attached
  const nodeMap: Record<string, FolderNode> = Object.fromEntries(
    folders.map(f => [f.pageId, { ...f, children: [], bookmarks: [] }])
  );
  const unfiled: Bookmark[] = [];
  for (const b of bookmarks) {
    if (b.folderId && nodeMap[b.folderId]) {
      nodeMap[b.folderId].bookmarks.push(b);
    } else {
      unfiled.push(b);
    }
  }

  // Build folder hierarchy
  const roots: FolderNode[] = [];
  for (const node of Object.values(nodeMap)) {
    if (node.parentId && nodeMap[node.parentId]) {
      nodeMap[node.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }

  function hasBrowseContent(node: FolderNode): boolean {
    return node.bookmarks.length > 0 || node.children.some(hasBrowseContent);
  }

  const chevronSvg = `<svg class="folder-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>`;

  function makeFolderHeader(label: string, iconSvg: string, depth: number): { header: HTMLDivElement; children: HTMLDivElement } {
    const header = document.createElement('div');
    header.className = `folder-item depth-${depth}`;
    header.innerHTML = `${iconSvg}<span>${label}</span>${chevronSvg}`;

    header.classList.add('collapsed');

    const children = document.createElement('div');
    children.className = 'folder-children hidden';

    header.addEventListener('click', () => {
      const collapsed = header.classList.toggle('collapsed');
      children.classList.toggle('hidden', collapsed);
    });

    return { header, children };
  }

  function renderNodes(nodes: FolderNode[], depth: number): HTMLUListElement {
    const ul = document.createElement('ul');
    ul.className = 'folder-list';
    for (const node of nodes) {
      if (!hasBrowseContent(node)) continue;
      const li = document.createElement('li');

      const folderIcon = `<svg class="folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>`;
      const { header, children } = makeFolderHeader(escapeHtml(node.name), folderIcon, depth);
      li.appendChild(header);

      if (node.bookmarks.length) children.appendChild(renderBookmarkItems(node.bookmarks, depth + 1));
      if (node.children.length) children.appendChild(renderNodes(node.children, depth + 1));
      li.appendChild(children);

      ul.appendChild(li);
    }
    return ul;
  }

  const root = document.createElement('ul');
  root.className = 'folder-list';

  // Unfiled bookmarks first
  if (unfiled.length) {
    const li = document.createElement('li');
    const unfiledIcon = `<svg class="folder-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const { header, children } = makeFolderHeader('Unfiled', unfiledIcon, 0);
    children.appendChild(renderBookmarkItems(unfiled, 1));
    li.appendChild(header);
    li.appendChild(children);
    root.appendChild(li);
  }

  // Folders
  for (const node of roots) {
    if (!hasBrowseContent(node)) continue;
    root.appendChild(renderNodes([node], 0));
  }

  browseList.appendChild(root);
}

function renderBookmarkItems(bookmarks: Bookmark[], depth: number): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'folder-list';
  for (const b of bookmarks) {
    const li = document.createElement('li');
    const domain = getDomain(b.url);
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';

    const item = document.createElement('div');
    item.className = `bookmark-item-tree depth-${depth}`;

    if (faviconUrl) {
      const img = document.createElement('img');
      img.className = 'bookmark-favicon';
      img.src = faviconUrl;
      img.alt = '';
      img.addEventListener('error', () => img.classList.add('error'));
      item.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'bookmark-favicon-placeholder';
      item.appendChild(placeholder);
    }

    const link = document.createElement('a');
    link.className = 'bookmark-title';
    link.href = b.url;
    link.target = '_blank';
    link.title = b.title;
    link.textContent = b.title;
    item.appendChild(link);

    li.appendChild(item);
    ul.appendChild(li);
  }
  return ul;
}

// Helpers
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}


function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Search
interface SearchResponse {
  success: boolean;
  text?: string;
  error?: string;
}

async function executeSearch(): Promise<void> {
  const keyword = inputSearch.value.trim();
  if (!keyword) return;

  searchResults.innerHTML = `<div class="loading-state"><div class="spinner"></div><span>Searching...</span></div>`;

  try {
    const res = await sendMessage<SearchResponse>({ type: 'SEARCH_BOOKMARKS', payload: { keyword } });
    if (!res.success) {
      searchResults.innerHTML = `<div class="empty-recent"><span>Search failed.</span></div>`;
      return;
    }
    searchResults.innerHTML = `<div class="search-result-text">${escapeHtml(res.text ?? '')}</div>`;
  } catch {
    searchResults.innerHTML = `<div class="empty-recent"><span>Connection failed.</span></div>`;
  }
}

// Event listeners
btnToggleView.addEventListener('click', () => {
  showView(currentView === 'browse' ? 'save' : 'browse');
});

btnSearchView.addEventListener('click', () => {
  showView(currentView === 'search' ? 'save' : 'search');
});

btnRefresh.addEventListener('click', () => loadBrowseView(true));

inputSearch.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') executeSearch();
});

// Start
init();
