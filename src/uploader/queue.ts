import { supabase } from "../services/supabase.js";

const submissionColumns =
  "id, telegram_user_id, telegram_username, source_url, source_type, status, youtube_url, created_at, completed_at";

export type QueueSubmission = {
  id: number;
  telegram_user_id: number;
  telegram_username: string | null;
  source_url: string;
  source_type: string;
  status: string;
  youtube_url: string | null;
  created_at: string;
  completed_at: string | null;
};

export async function peekOldestPendingSubmission(): Promise<QueueSubmission | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select(submissionColumns)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read the pending queue: ${error.message}`);
  }

  return data;
}

/**
 * Claims the oldest pending row with a compare-and-set update.
 * If another worker claims the selected row first, the conditional update
 * returns no row and this function retries the selection a bounded number of
 * times. No database schema change or transaction function is required.
 */
export async function claimNextPendingSubmission(): Promise<QueueSubmission | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pending = await peekOldestPendingSubmission();
    if (!pending) return null;

    const { data: claimed, error } = await supabase
      .from("submissions")
      .update({ status: "processing" })
      .eq("id", pending.id)
      .eq("status", "pending")
      .select(submissionColumns)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not claim queue item #${pending.id}: ${error.message}`);
    }

    if (claimed) return claimed;
  }

  return null;
}
