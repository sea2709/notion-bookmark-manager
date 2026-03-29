import type { Bookmark, Folder, FolderNode } from '../shared/types';

// Elements
const viewNotConfigured = document.getElementById('view-not-configured') as HTMLElement;
const viewSave          = document.getElementById('view-save') as HTMLElement;
const viewRecent        = document.getElementById('view-recent') as HTMLElement;
const btnToggleView     = document.getElementById('btn-toggle-view') as HTMLButtonElement;
const btnSave           = document.getElementById('btn-save') as HTMLButtonElement;
const btnRefresh        = document.getElementById('btn-refresh') as HTMLButtonElement;
const inputTitle        = document.getElementById('input-title') as HTMLInputElement;
const inputUrl          = document.getElementById('input-url') as HTMLInputElement;
const inputNotes        = document.getElementById('input-notes') as HTMLTextAreaElement;
const inputPrompt       = document.getElementById('input-prompt') as HTMLTextAreaElement;
const saveStatus        = document.getElementById('save-status') as HTMLElement;
const recentList        = document.getElementById('recent-list') as HTMLElement;
const folderTree        = document.getElementById('folder-tree') as HTMLElement;

type ViewName = 'save' | 'recent' | 'not-configured';

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
    folders.map(f => [f.id, { ...f, children: [] }])
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
    item.className = 'folder-item';
    item.dataset['id'] = String(node.id);
    item.dataset['pageId'] = node.pageId;
    item.style.paddingLeft = `${8 + depth * 14}px`;
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
  viewNotConfigured.classList.add('hidden');
  viewSave.classList.add('hidden');
  viewRecent.classList.add('hidden');
  btnToggleView.classList.remove('active');

  if (view === 'not-configured') {
    viewNotConfigured.classList.remove('hidden');
  } else if (view === 'save') {
    viewSave.classList.remove('hidden');
  } else if (view === 'recent') {
    viewRecent.classList.remove('hidden');
    btnToggleView.classList.add('active');
    loadRecentBookmarks();
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
  if (error === 'NOT_CONFIGURED') {
    showView('not-configured');
    return;
  }
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

// Recent bookmarks
interface FetchRecentResponse {
  success: boolean;
  error?: string;
  bookmarks?: Bookmark[];
}

async function loadRecentBookmarks(forceRefresh = false): Promise<void> {
  recentList.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>`;

  try {
    const response = await sendMessage<FetchRecentResponse>({ type: 'FETCH_RECENT', payload: { forceRefresh } });

    if (!response.success) {
      if (response.error === 'NOT_CONFIGURED') {
        showView('not-configured');
        return;
      }
      recentList.innerHTML = `<div class="empty-recent"><span>Failed to load bookmarks.</span></div>`;
      return;
    }

    renderBookmarks(response.bookmarks ?? []);
  } catch {
    recentList.innerHTML = `<div class="empty-recent"><span>Connection failed.</span></div>`;
  }
}

function renderBookmarks(bookmarks: Bookmark[]): void {
  if (!bookmarks.length) {
    recentList.innerHTML = `
      <div class="empty-recent">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>No bookmarks yet.</span>
      </div>`;
    return;
  }

  recentList.innerHTML = bookmarks.map(b => {
    const domain = getDomain(b.url);
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=16` : '';
    const dateStr = formatDate(b.dateAdded);
    return `
      <div class="bookmark-item">
        ${faviconUrl
          ? `<img class="bookmark-favicon" src="${faviconUrl}" alt="" onerror="this.style.display='none'">`
          : `<div class="bookmark-favicon-placeholder"></div>`
        }
        <div class="bookmark-content">
          <a class="bookmark-title" href="${escapeHtml(b.url)}" target="_blank" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</a>
          <div class="bookmark-url">${escapeHtml(domain || b.url)}</div>
          <div class="bookmark-meta">
            <span class="bookmark-date">${dateStr}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// Helpers
function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function formatDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

// Event listeners
btnToggleView.addEventListener('click', () => {
  showView(currentView === 'recent' ? 'save' : 'recent');
});

btnRefresh.addEventListener('click', () => loadRecentBookmarks(true));

// Start
init();
