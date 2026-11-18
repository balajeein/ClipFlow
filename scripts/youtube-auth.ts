import "dotenv/config";
import { createServer, type Server } from "node:http";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { google } from "googleapis";

const execFileAsync = promisify(execFile);
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const ENV_FILE = new URL("../.env", import.meta.url);

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  const missing = parsedEnv.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid Google OAuth configuration. Check: ${missing}`);
}
const env = parsedEnv.data;

type AuthorizationResult = {
  code: string;
  state: string;
};

function callbackPath(redirectUri: URL): string {
  return redirectUri.pathname || "/";
}

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args = process.platform === "darwin"
    ? ["-a", "Google Chrome", url]
    : process.platform === "win32"
      ? ["/c", "start", "", url]
      : [url];

  await execFileAsync(command, args);
}

async function startCallbackServer(
  configuredRedirectUri: URL,
  expectedState: string,
): Promise<{
  server: Server;
  redirectUri: string;
  result: Promise<AuthorizationResult>;
}> {
  const path = callbackPath(configuredRedirectUri);
  let resolveResult!: (result: AuthorizationResult) => void;
  let rejectResult!: (error: Error) => void;

  const result = new Promise<AuthorizationResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "localhost"}`,
    );

    if (requestUrl.pathname !== path) {
      response.writeHead(404).end("Not found");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state") ?? "";

    if (error) {
      response.writeHead(400).end("Google authorization was not completed.");
      rejectResult(new Error("Google authorization was not completed"));
      return;
    }

    if (!code || state !== expectedState) {
      response.writeHead(400).end("Invalid OAuth callback.");
      rejectResult(new Error("Invalid OAuth callback"));
      return;
    }

    response
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end("<h1>ClipFlow authorization complete</h1><p>You can close this window.</p>");
    resolveResult({ code, state });
  });

  const configuredPort = configuredRedirectUri.port
    ? Number(configuredRedirectUri.port)
    : 0;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(configuredPort, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not determine the local OAuth callback port");
  }

  const redirectUri = new URL(configuredRedirectUri.toString());
  redirectUri.port = String(address.port);

  return {
    server,
    redirectUri: redirectUri.toString(),
    result,
  };
}

async function saveRefreshToken(refreshToken: string): Promise<void> {
  let envText: string;
  try {
    envText = await readFile(ENV_FILE, "utf8");
  } catch {
    throw new Error("Could not read the existing .env file");
  }

  const tokenLine = `YOUTUBE_REFRESH_TOKEN=${refreshToken}`;
  const tokenPattern = /^YOUTUBE_REFRESH_TOKEN=.*$/m;
  const updatedEnv = tokenPattern.test(envText)
    ? envText.replace(tokenPattern, tokenLine)
    : `${envText.trimEnd()}\n${tokenLine}\n`;

  await writeFile(ENV_FILE, updatedEnv, { mode: 0o600 });
  await chmod(ENV_FILE, 0o600);
}

async function main(): Promise<void> {
  const configuredRedirectUri = new URL(env.GOOGLE_REDIRECT_URI);
  if (configuredRedirectUri.protocol !== "http:" || configuredRedirectUri.hostname !== "localhost") {
    throw new Error("GOOGLE_REDIRECT_URI must use an http://localhost redirect");
  }

  const state = randomBytes(32).toString("hex");
  const callback = await startCallbackServer(configuredRedirectUri, state);
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    callback.redirectUri,
  );

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [YOUTUBE_UPLOAD_SCOPE, YOUTUBE_READONLY_SCOPE],
    state,
  });

  try {
    await openBrowser(authorizationUrl);
    console.log("Google authorization page opened. Complete consent in the browser.");

    const { code } = await callback.result;
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token; authorization was not saved");
    }

    await saveRefreshToken(tokens.refresh_token);
    console.log("YouTube refresh token saved to .env.");
  } finally {
    callback.server.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown OAuth error";
  console.error(`YouTube authorization failed: ${message}`);
  process.exitCode = 1;
});
