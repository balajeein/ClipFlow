import { createClient } from "@supabase/supabase-js";
import { config } from "../config/env.js";
import type { ExtractedUrl } from "../utils/validation.js";

export const supabase = createClient(config.supabase.url, config.supabase.secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const submissionsColumns =
  "id, telegram_user_id, telegram_username, source_url, source_type, status, youtube_url, created_at, completed_at";

/**
 * Reads the existing table shape without creating or changing anything.
 * This runs during startup so a schema mismatch fails before ingestion begins.
 */
export async function verifySubmissionsSchema(): Promise<void> {
  const { error } = await supabase
    .from("submissions")
    .select(submissionsColumns)
    .limit(1);

  if (error) {
    throw new Error(
      `Could not read the existing public.submissions schema: ${error.message}`,
    );
  }
}

export type Submission = {
  id: number;
  status: string;
};

export async function findExistingSubmission(sourceUrl: string): Promise<Submission | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("source_url", sourceUrl)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(`Could not check for duplicate URL: ${error.message}`);
  }

  return data?.[0] ?? null;
}

export async function insertSubmission(input: {
  telegramUserId: number;
  telegramUsername: string;
  extracted: ExtractedUrl;
}): Promise<number> {
  const { data, error } = await supabase
    .from("submissions")
    .insert({
      telegram_user_id: input.telegramUserId,
      telegram_username: input.telegramUsername,
      source_url: input.extracted.url,
      source_type: input.extracted.sourceType,
      status: "pending",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not save submission: ${error.message}`);
  }

  return data.id;
}
