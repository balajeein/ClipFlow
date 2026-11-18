import "dotenv/config";
import { z } from "zod";
import { google } from "googleapis";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  const missing = parsedEnv.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid YouTube OAuth configuration. Check: ${missing}`);
}
const env = parsedEnv.data;

async function main(): Promise<void> {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    refresh_token: env.YOUTUBE_REFRESH_TOKEN,
  });

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });
  const response = await youtube.channels.list({
    part: ["snippet"],
    mine: true,
  });
  const channel = response.data.items?.[0];

  if (!channel?.id || !channel.snippet?.title) {
    throw new Error("No authenticated YouTube channel was returned");
  }

  console.log("YouTube authentication succeeded.");
  console.log(`Channel name: ${channel.snippet.title}`);
  console.log(`Channel ID: ${channel.id}`);
}

main().catch((error: unknown) => {
  const response =
    typeof error === "object" && error !== null && "response" in error
      ? (error as { response?: { status?: number; data?: { error?: { message?: string } } } }).response
      : undefined;
  const status = response?.status ? ` (HTTP ${response.status})` : "";
  const reason = response?.data?.error?.message;
  console.error(
    `YouTube authentication verification failed${status}${reason ? `: ${reason}` : "."}`,
  );
  process.exitCode = 1;
});
