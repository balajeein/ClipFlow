import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_GROUP_ID: z.string().min(1),
  ALLOWED_USER_IDS: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  ADMIN_IDS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid environment configuration. Check: ${missing}`);
}

function parseIdList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export const config = {
  telegram: {
    botToken: parsed.data.TELEGRAM_BOT_TOKEN,
    groupId: parsed.data.TELEGRAM_GROUP_ID,
    adminIds: parseIdList(parsed.data.ADMIN_IDS),
  },
  supabase: {
    url: parsed.data.SUPABASE_URL,
    secretKey: parsed.data.SUPABASE_SECRET_KEY,
  },
};

