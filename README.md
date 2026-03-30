# Notion Bookmark Manager

A Chrome extension that saves browser tabs to your Notion workspace, with folder organization, notes, AI-generated summaries, and AI-powered search.

## Features

- **Save bookmarks** — Save the current tab to a Notion database with a title, URL, and optional notes
- **Folder tree** — Organize bookmarks into nested folders synced from Notion
- **AI summaries** — Optionally generate a page summary using Gemini AI based on a custom prompt
- **Browse bookmarks** — View all your bookmarks grouped by folder in a collapsible tree
- **Search** — Search your Notion bookmarks using natural language via Gemini AI and the Notion MCP

## Architecture

```
Chrome Extension (Manifest V3)
├── popup/          UI for saving, browsing, and searching bookmarks
├── background/     Service worker — routes messages between popup and server
├── shared/         Shared types, constants, and chrome.storage helpers
└── dist/           Built output (load this directory in Chrome)

Local Server (Express)
└── server/         Handles all Notion API and AI calls, runs on localhost:3456
    ├── index.ts    REST API bridge (/call, /test, /health)
    └── notion-api.ts   Notion SDK + Gemini AI + MCP client functions
```

The popup communicates with the service worker via `chrome.runtime.sendMessage`. The service worker calls the local Express server, which handles all external API interactions (Notion, Gemini, MCP).

## Requirements

- Node.js 18+
- A [Notion internal integration](https://www.notion.so/my-integrations) with access to your databases
- A Google Gemini API key
- Two Notion databases: one for bookmarks, one for folders (see schema below)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
NOTION_INTERNAL_INTEGRATION_SECRET=secret_...
NOTION_BOOKMARKS_DATABASE_ID=...
NOTION_FOLDERS_DATABASE_ID=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
```

### 3. Build the extension

```bash
npm run build
```

For development with auto-rebuild on changes:

```bash
npm run watch
```

### 4. Start the local server

```bash
npm run start-server
```

The server runs on `http://localhost:3456` and must be running for the extension to work.

### 5. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` directory

## Notion Database Schema

### Bookmarks database

| Property   | Type         |
|------------|--------------|
| Title      | Title        |
| URL        | URL          |
| Notes      | Rich text    |
| Date Added | Date         |
| Folder     | Relation → Folders database |

### Folders database

| Property  | Type         |
|-----------|--------------|
| ID        | ID        |
| Name      | Title        |
| Parent ID | Number → ID (for nesting) |

> The extension auto-detects property names for title and parent relation from your database schema.

## Development

```bash
npm run build        # one-shot build
npm run watch        # rebuild on file changes
npm run start-server # run the Express server
```

Built output goes to `dist/`. Source maps are included for debugging.
