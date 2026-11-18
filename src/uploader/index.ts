import { verifySubmissionsSchema } from "../services/supabase.js";
import { logger } from "../utils/logger.js";
import { peekOldestPendingSubmission } from "./queue.js";

async function main(): Promise<void> {
  await verifySubmissionsSchema();
  const next = await peekOldestPendingSubmission();

  if (!next) {
    console.log("ClipFlow queue is empty. No uploader work is pending.");
    return;
  }

  console.log(
    `Stage 1 ready: oldest pending item is #${next.id} (${next.source_type}). ` +
      "Media retrieval and upload are intentionally not implemented yet.",
  );
}

main().catch((error: unknown) => {
  logger.error({ error }, "Uploader stage 1 failed");
  process.exitCode = 1;
});
