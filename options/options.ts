import { validateCredentials } from '../shared/notion-api';
import { getConfig, setConfig, clearCache } from '../shared/storage';

const inputToken          = document.getElementById('input-token') as HTMLInputElement;
const inputDatabase       = document.getElementById('input-database') as HTMLInputElement;
const inputFolderDatabase = document.getElementById('input-folder-database') as HTMLInputElement;
const btnToggleToken      = document.getElementById('btn-toggle-token') as HTMLButtonElement;
const iconEye             = document.getElementById('icon-eye') as HTMLElement;
const iconEyeOff          = document.getElementById('icon-eye-off') as HTMLElement;
const btnTest             = document.getElementById('btn-test') as HTMLButtonElement;
const btnSave             = document.getElementById('btn-save') as HTMLButtonElement;
const testStatus          = document.getElementById('test-status') as HTMLElement;
const saveStatus          = document.getElementById('save-status') as HTMLElement;

// Load saved config
async function init(): Promise<void> {
  const config = await getConfig();
  if (config.apiToken) inputToken.value = config.apiToken;
  if (config.databaseId) inputDatabase.value = config.databaseId;
  if (config.folderDatabaseId) inputFolderDatabase.value = config.folderDatabaseId;
}

// Toggle token visibility
btnToggleToken.addEventListener('click', () => {
  const isPassword = inputToken.type === 'password';
  inputToken.type = isPassword ? 'text' : 'password';
  iconEye.classList.toggle('hidden', isPassword);
  iconEyeOff.classList.toggle('hidden', !isPassword);
});

// Normalize database ID (remove hyphens, extract from URL)
function normalizeDatabaseId(input: string): string {
  const urlMatch = input.match(/([a-f0-9]{32})(?:\?|$)/i);
  if (urlMatch) return urlMatch[1];
  return input.replace(/-/g, '').trim();
}

// Test connection
btnTest.addEventListener('click', async () => {
  const apiToken = inputToken.value.trim();
  const rawDatabaseId = inputDatabase.value.trim();

  if (!apiToken || !rawDatabaseId) {
    showStatus(testStatus, 'error', 'Please enter both token and database ID.');
    return;
  }

  const databaseId = normalizeDatabaseId(rawDatabaseId);
  const rawFolderDatabaseId = inputFolderDatabase.value.trim();
  const folderDatabaseId = rawFolderDatabaseId ? normalizeDatabaseId(rawFolderDatabaseId) : '';

  setButtonState(btnTest, true, 'Testing...');
  showStatus(testStatus, 'loading', 'Connecting to Notion...');
  hideStatus(saveStatus);

  try {
    const tests: Promise<{ databaseTitle: string }>[] = [validateCredentials({ apiToken, databaseId })];
    if (folderDatabaseId) tests.push(validateCredentials({ apiToken, databaseId: folderDatabaseId }));

    const [bookmarkResult, folderResult] = await Promise.all(tests);

    let msg = `Bookmark DB: "${bookmarkResult.databaseTitle}"`;
    if (folderResult) msg += ` · Folder DB: "${folderResult.databaseTitle}"`;
    showStatus(testStatus, 'success', msg);
  } catch (err) {
    showStatus(testStatus, 'error', getErrorMessage(err));
  } finally {
    setButtonState(btnTest, false, null, `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      Test Connection`);
  }
});

// Save settings
btnSave.addEventListener('click', async () => {
  const apiToken = inputToken.value.trim();
  const rawDatabaseId = inputDatabase.value.trim();

  if (!apiToken) {
    showStatus(saveStatus, 'error', 'Please enter your Notion integration token.');
    inputToken.focus();
    return;
  }

  if (!rawDatabaseId) {
    showStatus(saveStatus, 'error', 'Please enter your database ID.');
    inputDatabase.focus();
    return;
  }

  const databaseId = normalizeDatabaseId(rawDatabaseId);

  if (databaseId.length !== 32) {
    showStatus(saveStatus, 'error', 'Database ID must be 32 characters. Check your database URL.');
    return;
  }

  const rawFolderDatabaseId = inputFolderDatabase.value.trim();
  const folderDatabaseId = rawFolderDatabaseId ? normalizeDatabaseId(rawFolderDatabaseId) : '';

  setButtonState(btnSave, true, 'Saving...');
  hideStatus(testStatus);

  try {
    await setConfig({ apiToken, databaseId, folderDatabaseId });
    await clearCache();
    inputDatabase.value = databaseId;
    if (folderDatabaseId) inputFolderDatabase.value = folderDatabaseId;
    showStatus(saveStatus, 'success', 'Settings saved!');
  } catch {
    showStatus(saveStatus, 'error', 'Failed to save settings. Please try again.');
  } finally {
    setButtonState(btnSave, false, null, `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Save Settings`);
  }
});

// Helpers
function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string };
    if (e.code === 'unauthorized') return 'Invalid API token. Double-check your integration token.';
    if (e.code === 'object_not_found') return 'Database not found. Make sure you shared it with your integration.';
    if (e.message?.includes('fetch')) return 'Could not reach Notion API. Check your internet connection.';
    return e.message ?? 'An error occurred.';
  }
  return 'An error occurred.';
}

function showStatus(el: HTMLElement, type: 'success' | 'error' | 'loading', message: string): void {
  const icons: Record<string, string> = {
    success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    error:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    loading: `<div class="spinner"></div>`
  };
  el.className = type;
  el.innerHTML = `${icons[type] ?? ''} ${message}`;
  el.classList.remove('hidden');
}

function hideStatus(el: HTMLElement): void {
  el.classList.add('hidden');
}

function setButtonState(btn: HTMLButtonElement, disabled: boolean, loadingText: string | null, restoreHtml?: string): void {
  btn.disabled = disabled;
  if (disabled && loadingText) {
    btn.innerHTML = `<div class="spinner"></div> ${loadingText}`;
  } else if (!disabled && restoreHtml) {
    btn.innerHTML = restoreHtml;
  }
}

init();
