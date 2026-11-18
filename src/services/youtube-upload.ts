import "dotenv/config";
import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { z } from "zod";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  const missing = parsedEnv.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid YouTube upload configuration. Check: ${missing}`);
}

const env = parsedEnv.data;
const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: env.YOUTUBE_REFRESH_TOKEN });

const youtube = google.youtube({ version: "v3", auth: oauth2Client });
let targetChannelPromise: Promise<{ id: string; title: string }> | null = null;

function defaultTags(): string[] {
  return (process.env.YOUTUBE_DEFAULT_TAGS ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function targetChannel(): Promise<{ id: string; title: string }> {
  const response = await youtube.channels.list({ part: ["snippet"], mine: true });
  const channel = response.data.items?.[0];
  if (!channel?.id || !channel.snippet?.title) {
    throw new Error("No authenticated YouTube channel was returned");
  }
  return { id: channel.id, title: channel.snippet.title };
}

export type YouTubeUploadResult = {
  videoId: string;
  videoUrl: string;
  channelId: string;
  channelName: string;
};

export async function uploadVideoFile(filePath: string): Promise<YouTubeUploadResult> {
  targetChannelPromise ??= targetChannel();
  const channel = await targetChannelPromise;
  const tags = defaultTags();
  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: process.env.YOUTUBE_DEFAULT_TITLE?.trim() || "ClipFlow upload",
        description:
          process.env.YOUTUBE_DEFAULT_DESCRIPTION?.trim() || "Uploaded by ClipFlow.",
        categoryId: "22",
        ...(tags.length > 0 ? { tags } : {}),
      },
      status: {
        privacyStatus: "public",
      },
    },
    media: {
      body: createReadStream(filePath),
    },
  });

  const videoId = response.data.id;
  if (!videoId) throw new Error("YouTube did not return a video ID");

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    channelId: channel.id,
    channelName: channel.title,
  };
}
