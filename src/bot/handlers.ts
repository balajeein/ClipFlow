import type { Bot, Context } from "grammy";
import { config } from "../config/env.js";
import { downloadTelegramVideo, getTelegramVideo } from "../services/telegram-media.js";
import { fitVideoForShorts } from "../services/video-format.js";
import { uploadVideoFile } from "../services/youtube-upload.js";
import { logger } from "../utils/logger.js";

let videoUploadQueue = Promise.resolve();

function enqueueVideoUpload<T>(task: () => Promise<T>): Promise<T> {
  const result = videoUploadQueue.then(task, task);
  videoUploadQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown upload error";
}

function publicUploadFailureMessage(error: unknown): string {
  const message = safeErrorMessage(error).toLowerCase();
  if (message.includes("too big") || message.includes("exceeds")) {
    return "That video is too large for Telegram bot download. The current limit is 20 MB.";
  }
  return "I couldn't upload that video to YouTube.";
}

function isFromConfiguredGroup(ctx: Context): boolean {
  const chatId = String(ctx.chat?.id ?? "");
  return chatId === config.telegram.groupId;
}

export function registerIngestionHandlers(bot: Bot): void {
  bot.on("message", async (ctx) => {
    const telegramVideo = getTelegramVideo(ctx);
    if (!telegramVideo) return;

    if (!isFromConfiguredGroup(ctx)) {
      logger.warn(
        { chatId: ctx.chat?.id },
        "Ignored video from outside the configured Telegram group",
      );
      return;
    }

    try {
      await ctx.reply("Video received. It will be formatted for Shorts and uploaded in order.");
      const result = await enqueueVideoUpload(async () => {
        const temporaryVideo = await downloadTelegramVideo(ctx, telegramVideo);
        try {
          const shortsVideoPath = await fitVideoForShorts(temporaryVideo.filePath);
          return await uploadVideoFile(shortsVideoPath);
        } finally {
          await temporaryVideo.cleanup();
        }
      });

      await ctx.reply(
        `Scheduled on YouTube (${result.channelName}) for ${result.scheduledFor} ET:\n${result.videoUrl}`,
      );
    } catch (error) {
      logger.error(
        {
          message: safeErrorMessage(error),
          fileName: telegramVideo.fileName,
          fileSize: telegramVideo.fileSize,
        },
        "Telegram video upload failed",
      );
      await ctx.reply(publicUploadFailureMessage(error));
    }
  });
}
