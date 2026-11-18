import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { Context } from "grammy";
import { config } from "../config/env.js";

// Telegram's hosted Bot API limits bot downloads through getFile to 20 MB.
const DEFAULT_MAX_VIDEO_BYTES = 20 * 1024 * 1024;

export type TelegramVideo = {
  fileId: string;
  fileName: string;
  fileSize?: number;
};

export type TemporaryTelegramVideo = {
  filePath: string;
  cleanup: () => Promise<void>;
};

function maxVideoBytes(): number {
  const configured = Number(process.env.TELEGRAM_MAX_VIDEO_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_VIDEO_BYTES;
}

function safeFileName(fileName: string): string {
  const cleaned = basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.toLowerCase().endsWith(".mp4") ? cleaned : `${cleaned || "video"}.mp4`;
}

export function getTelegramVideo(ctx: Context): TelegramVideo | null {
  const message = ctx.message;
  if (!message) return null;

  if ("video" in message && message.video) {
    return {
      fileId: message.video.file_id,
      fileName: safeFileName(message.video.file_name ?? "clipflow-video.mp4"),
      fileSize: message.video.file_size,
    };
  }

  if ("document" in message && message.document) {
    const document = message.document;
    const fileName = document.file_name ?? "";
    const isMp4 =
      document.mime_type === "video/mp4" || fileName.toLowerCase().endsWith(".mp4");
    if (!isMp4) return null;

    return {
      fileId: document.file_id,
      fileName: safeFileName(fileName || "clipflow-video.mp4"),
      fileSize: document.file_size,
    };
  }

  return null;
}

export async function downloadTelegramVideo(
  ctx: Context,
  video: TelegramVideo,
): Promise<TemporaryTelegramVideo> {
  const maximumBytes = maxVideoBytes();
  if (video.fileSize && video.fileSize > maximumBytes) {
    throw new Error(`Telegram video exceeds the ${maximumBytes} byte limit`);
  }

  const file = await ctx.api.getFile(video.fileId);
  if (!file.file_path) {
    throw new Error("Telegram did not provide a downloadable file path");
  }

  const directory = await mkdtemp(join(tmpdir(), "clipflow-telegram-video-"));
  const filePath = join(directory, video.fileName);
  let downloadedBytes = 0;

  try {
    const response = await fetch(
      `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`,
    );
    if (!response.ok || !response.body) {
      throw new Error(`Telegram file download failed with HTTP ${response.status}`);
    }

    const sizeGuard = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloadedBytes += chunk.length;
        if (downloadedBytes > maximumBytes) {
          callback(new Error(`Telegram video exceeds the ${maximumBytes} byte limit`));
          return;
        }
        callback(null, chunk);
      },
    });

    await pipeline(
      Readable.fromWeb(
        response.body as unknown as NodeReadableStream<Uint8Array>,
      ),
      sizeGuard,
      createWriteStream(filePath, { flags: "wx" }),
    );

    return {
      filePath,
      cleanup: async () => {
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
