// ---------------------------------------------------------------------------
// Google Drive API Client — host-side only
//
// Handles OAuth2 token management and Drive API v3 calls.
// Containers never see credentials — they reach Drive via IPC bridge.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_TIMEOUT_MS = 15_000;

const DEFAULT_CREDENTIALS_PATH = path.join(
  os.homedir(),
  '.config',
  'nanoclaw',
  'google-drive.json',
);

// Google Workspace MIME types → export formats
const EXPORT_MIME_MAP: Record<string, { text: string; markdown: string }> = {
  'application/vnd.google-apps.document': {
    text: 'text/plain',
    markdown: 'text/markdown',
  },
  'application/vnd.google-apps.spreadsheet': {
    text: 'text/csv',
    markdown: 'text/csv',
  },
  'application/vnd.google-apps.presentation': {
    text: 'text/plain',
    markdown: 'text/plain',
  },
};

const FILE_TYPE_MIME: Record<string, string> = {
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  pdf: 'application/pdf',
  presentation: 'application/vnd.google-apps.presentation',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriveCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

interface CachedToken {
  access_token: string;
  expiry: number; // epoch ms
}

export interface DriveSearchResult {
  fileId: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  path: string;
  snippet: string;
}

export interface DriveSearchResponse {
  results: DriveSearchResult[];
  totalResults: number;
}

export interface DriveReadResponse {
  fileId: string;
  name: string;
  mimeType: string;
  content: string;
  totalLength: number;
  truncated: boolean;
}

export interface DriveErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cachedToken: CachedToken | null = null;
let credentials: DriveCredentials | null = null;

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

function getCredentialsPath(): string {
  return process.env.GOOGLE_DRIVE_CREDENTIALS || DEFAULT_CREDENTIALS_PATH;
}

function loadCredentials(): DriveCredentials | null {
  if (credentials) return credentials;

  const credPath = getCredentialsPath();
  if (!fs.existsSync(credPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(credPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
      logger.error('Google Drive credentials file missing required fields');
      return null;
    }
    credentials = parsed as DriveCredentials;
    return credentials;
  } catch (err) {
    logger.error({ err }, 'Failed to read Google Drive credentials');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiry > Date.now() + 60_000) {
    return cachedToken.access_token;
  }

  const creds = loadCredentials();
  if (!creds) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.client_id,
          client_secret: creds.client_secret,
          refresh_token: creds.refresh_token,
          grant_type: 'refresh_token',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body: body.slice(0, 200) },
        'Google OAuth token refresh failed',
      );
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    cachedToken = {
      access_token: data.access_token,
      expiry: Date.now() + data.expires_in * 1000,
    };

    return cachedToken.access_token;
  } catch (err) {
    logger.error({ err }, 'Google OAuth token refresh error');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Drive API helpers
// ---------------------------------------------------------------------------

async function driveGet(
  urlPath: string,
  params?: Record<string, string>,
  raw?: false,
): Promise<Record<string, unknown> | null>;
async function driveGet(
  urlPath: string,
  params: Record<string, string> | undefined,
  raw: true,
): Promise<string | null>;
async function driveGet(
  urlPath: string,
  params?: Record<string, string>,
  raw?: boolean,
): Promise<Record<string, unknown> | string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const url = new URL(`${DRIVE_API_BASE}${urlPath}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, url: urlPath, body: body.slice(0, 200) },
        'Google Drive API error',
      );
      return null;
    }

    if (raw) {
      return await response.text();
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      logger.error({ url: urlPath }, 'Google Drive API timeout');
    } else {
      logger.error({ err, url: urlPath }, 'Google Drive API request failed');
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resolve parent folder path
// ---------------------------------------------------------------------------

async function resolveParentPath(parentIds: string[]): Promise<string> {
  if (!parentIds || parentIds.length === 0) return '/';

  // Resolve first parent only (files typically have one parent)
  const parentId = parentIds[0];
  const data = await driveGet(`/files/${parentId}`, {
    fields: 'name,parents',
  });
  if (!data) return '/';

  const parentName = (data.name as string) || '';
  const grandparents = data.parents as string[] | undefined;

  if (grandparents && grandparents.length > 0) {
    const prefix = await resolveParentPath(grandparents);
    return `${prefix}${parentName}/`;
  }

  return `/${parentName}/`;
}

// ---------------------------------------------------------------------------
// Public API: Search
// ---------------------------------------------------------------------------

export async function searchDrive(
  query: string,
  fileType?: string,
  folderId?: string,
  maxResults?: number,
): Promise<DriveSearchResponse | DriveErrorResponse> {
  const creds = loadCredentials();
  if (!creds) {
    return { error: 'Google Drive not configured. Run: npx tsx scripts/setup-google-drive.ts' };
  }

  const limit = Math.min(maxResults || 10, 25);

  // Build query string
  const qParts: string[] = [
    `fullText contains '${query.replace(/'/g, "\\'")}'`,
    'trashed = false',
  ];

  if (fileType && FILE_TYPE_MIME[fileType]) {
    qParts.push(`mimeType = '${FILE_TYPE_MIME[fileType]}'`);
  }

  if (folderId) {
    qParts.push(`'${folderId}' in parents`);
  }

  const data = await driveGet('/files', {
    q: qParts.join(' and '),
    fields:
      'files(id,name,mimeType,modifiedTime,parents,description),nextPageToken',
    pageSize: String(limit),
    orderBy: 'modifiedTime desc',
  });

  if (!data) {
    return { error: 'Google Drive API request failed' };
  }

  const files = (data.files as Array<Record<string, unknown>>) || [];

  const results: DriveSearchResult[] = [];
  for (const file of files) {
    const parents = (file.parents as string[]) || [];
    const filePath = await resolveParentPath(parents);

    results.push({
      fileId: file.id as string,
      name: file.name as string,
      mimeType: file.mimeType as string,
      modifiedTime: file.modifiedTime as string,
      path: filePath,
      snippet: ((file.description as string) || '').slice(0, 200),
    });
  }

  return { results, totalResults: results.length };
}

// ---------------------------------------------------------------------------
// Public API: Read
// ---------------------------------------------------------------------------

export async function readDriveFile(
  fileId: string,
  format?: string,
  maxLength?: number,
  offset?: number,
): Promise<DriveReadResponse | DriveErrorResponse> {
  const creds = loadCredentials();
  if (!creds) {
    return { error: 'Google Drive not configured. Run: npx tsx scripts/setup-google-drive.ts' };
  }

  // Get file metadata first
  const meta = await driveGet(`/files/${fileId}`, {
    fields: 'id,name,mimeType,size',
  });

  if (!meta) {
    return { error: `File not accessible: ${fileId}` };
  }

  const name = meta.name as string;
  const mimeType = meta.mimeType as string;
  const exportFormats = EXPORT_MIME_MAP[mimeType];
  const effectiveFormat = format === 'markdown' ? 'markdown' : 'text';
  const limit = maxLength || 50_000;
  const start = offset || 0;

  let content: string | null = null;

  if (exportFormats) {
    // Google Workspace file — use export endpoint
    const exportMime = exportFormats[effectiveFormat];
    content = await driveGet(
      `/files/${fileId}/export`,
      { mimeType: exportMime },
      true,
    );
  } else if (mimeType === 'application/pdf') {
    // PDF — download and extract text via pdftotext
    content = await extractPdfText(fileId);
  } else if (mimeType.startsWith('text/')) {
    // Plain text files — download directly
    content = await driveGet(`/files/${fileId}`, { alt: 'media' }, true);
  } else {
    return {
      error: `Cannot read binary file "${name}" (${mimeType}). Only Google Docs, Sheets, Slides, PDFs, and text files are supported.`,
    };
  }

  if (content === null) {
    return { error: `Failed to read file "${name}"` };
  }

  const totalLength = content.length;
  const sliced = content.slice(start, start + limit);

  return {
    fileId,
    name,
    mimeType,
    content: sliced,
    totalLength,
    truncated: sliced.length < totalLength,
  };
}

// ---------------------------------------------------------------------------
// PDF text extraction (soft dependency on pdftotext)
// ---------------------------------------------------------------------------

async function extractPdfText(fileId: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  // Download PDF to temp file
  const tmpPath = `/tmp/drive-pdf-${fileId}-${Date.now()}.pdf`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(
        `${DRIVE_API_BASE}/files/${fileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tmpPath, buffer);

    // Try pdftotext
    try {
      const { stdout } = await execFileAsync('pdftotext', [tmpPath, '-']);
      return stdout;
    } catch {
      logger.warn(
        'pdftotext not available — PDF text extraction requires pdftotext to be installed',
      );
      return '[PDF file — text extraction requires pdftotext. File metadata returned only.]';
    }
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failures
    }
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _resetForTesting(): void {
  cachedToken = null;
  credentials = null;
}
