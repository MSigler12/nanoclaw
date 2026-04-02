#!/usr/bin/env npx tsx
/**
 * Google Drive OAuth Setup for NanoClaw
 *
 * One-time interactive script that authenticates with Google Drive
 * and stores the refresh token for the host-side Drive API client.
 *
 * Prerequisites:
 *   1. Create a GCP project at https://console.cloud.google.com
 *   2. Enable the Google Drive API
 *   3. Create OAuth 2.0 credentials (Desktop application type)
 *   4. Download the credentials JSON
 *
 * Usage:
 *   npx tsx scripts/setup-google-drive.ts <path-to-credentials.json>
 *
 * The script will:
 *   1. Read the client ID and secret from the downloaded credentials
 *   2. Open a browser for OAuth consent
 *   3. Listen for the authorization code on a local redirect
 *   4. Exchange for a refresh token
 *   5. Save to ~/.config/nanoclaw/google-drive.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { URL } from 'url';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
];
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_PORT = 8491;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const OUTPUT_PATH = path.join(
  os.homedir(),
  '.config',
  'nanoclaw',
  'google-drive.json',
);

async function main(): Promise<void> {
  const credentialsPath = process.argv[2];

  if (!credentialsPath) {
    console.error(
      'Usage: npx tsx scripts/setup-google-drive.ts <path-to-credentials.json>\n\n' +
        'Download OAuth credentials from GCP Console:\n' +
        '  1. Go to https://console.cloud.google.com/apis/credentials\n' +
        '  2. Create OAuth 2.0 Client ID (Desktop application)\n' +
        '  3. Download the JSON file\n' +
        '  4. Run this script with the path to that file',
    );
    process.exit(1);
  }

  // Read GCP credentials
  let gcpCreds: {
    installed?: { client_id: string; client_secret: string };
    web?: { client_id: string; client_secret: string };
  };
  try {
    gcpCreds = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  } catch {
    console.error(`Failed to read credentials file: ${credentialsPath}`);
    process.exit(1);
  }

  const creds = gcpCreds.installed || gcpCreds.web;
  if (!creds || !creds.client_id || !creds.client_secret) {
    console.error(
      'Invalid credentials file. Expected "installed" or "web" credentials with client_id and client_secret.',
    );
    process.exit(1);
  }

  const { client_id, client_secret } = creds;

  console.log('\nGoogle Drive Setup for NanoClaw');
  console.log('================================\n');
  console.log(`Client ID: ${client_id.slice(0, 20)}...`);
  console.log(`Scopes: ${SCOPES.join(', ')}\n`);

  // Build auth URL
  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  // Start local server to receive callback
  const authCode = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${REDIRECT_PORT}`);
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(
            `<h1>Authorization Failed</h1><p>Error: ${error}</p><p>You can close this window.</p>`,
          );
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<h1>Authorization Successful</h1><p>You can close this window and return to the terminal.</p>',
          );
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing authorization code');
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(
        `Listening on port ${REDIRECT_PORT} for OAuth callback...\n`,
      );
      console.log('Open this URL in your browser to authorize:\n');
      console.log(authUrl.toString());
      console.log('\nWaiting for authorization...');
    });

    server.on('error', (err) => {
      reject(
        new Error(
          `Failed to start callback server on port ${REDIRECT_PORT}: ${err.message}`,
        ),
      );
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });

  console.log('\nAuthorization code received. Exchanging for tokens...');

  // Exchange auth code for tokens
  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: authCode,
      client_id,
      client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();
    console.error(`Token exchange failed: ${tokenResponse.status}\n${body}`);
    process.exit(1);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!tokenData.refresh_token) {
    console.error(
      'No refresh token received. Make sure you included access_type=offline and prompt=consent.',
    );
    process.exit(1);
  }

  // Save credentials
  const outputData = {
    client_id,
    client_secret,
    refresh_token: tokenData.refresh_token,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2), 'utf-8');
  // Restrict file permissions — contains secrets
  fs.chmodSync(OUTPUT_PATH, 0o600);

  console.log(`\nCredentials saved to: ${OUTPUT_PATH}`);
  console.log('Google Drive is now configured for NanoClaw.');
  console.log(
    'No restart required — the host process will pick up credentials on the next Drive request.',
  );
}

main().catch((err) => {
  console.error(`Setup failed: ${err.message || err}`);
  process.exit(1);
});
