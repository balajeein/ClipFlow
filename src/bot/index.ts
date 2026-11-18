import { Bot } from "grammy";
import { config } from "../config/env.js";
import {
  verifySubmissionsSchema,
} from "../services/supabase.js";
import { logger } from "../utils/logger.js";
import { registerIngestionHandlers } from "./handlers.js";

const bot = new Bot(config.telegram.botToken);

registerIngestionHandlers(bot);

bot.catch((error) => {
  logger.error({ error: error.error }, "Telegram update failed");
});

async function main(): Promise<void> {
  await verifySubmissionsSchema();
  logger.info("Verified the existing public.submissions schema");

  await bot.api.deleteWebhook({ drop_pending_updates: false });
  logger.info("ClipFlow bot is starting in long-polling mode");
  await bot.start({
    onStart: (botInfo) => logger.info({ username: botInfo.username }, "Bot started"),
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down ClipFlow bot");
  await bot.stop();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error) => {
  logger.fatal({ error }, "ClipFlow bot failed to start");
  process.exitCode = 1;
});
