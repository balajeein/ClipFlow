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

const RANDOM_TITLES = [
  "You Have to See This! 🤯 #Gaming #GTA6 #GTA6Clips #BrainTeasers #Puzzles #MindGames #ViralShorts",
  "This Is Actually Insane 💀 #Gaming #GTA6 #GTA6Clips #BrainTeasers #Puzzles #MindGames #ViralShorts",
  "Unexpected Moments 👀 #Gaming #GTA6 #GTA6Clips #BrainTeasers #Puzzles #MindGames #ViralShorts",
] as const;

const EASTERN_TIME_ZONE = "America/New_York";

type EasternDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function easternDateParts(date: Date): EasternDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function easternLocalTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = easternDateParts(new Date(guess));
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess += desiredAsUtc - actualAsUtc;
  }

  return new Date(guess);
}

export function nextEasternSevenPm(now = new Date()): Date {
  const current = easternDateParts(now);
  const todayAtSeven = easternLocalTimeToDate(
    current.year,
    current.month,
    current.day,
    19,
  );

  if (todayAtSeven.getTime() > now.getTime()) return todayAtSeven;

  const tomorrow = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  return easternLocalTimeToDate(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
    19,
  );
}

function randomTitle(): string {
  return RANDOM_TITLES[Math.floor(Math.random() * RANDOM_TITLES.length)];
}

function formatEasternTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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
  scheduledFor: string;
};

export async function uploadVideoFile(filePath: string): Promise<YouTubeUploadResult> {
  targetChannelPromise ??= targetChannel();
  const channel = await targetChannelPromise;
  const tags = defaultTags();
  const publishAt = nextEasternSevenPm();
  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: randomTitle(),
        description:
          process.env.YOUTUBE_DEFAULT_DESCRIPTION?.trim() || "Uploaded by ClipFlow.",
        categoryId: "22",
        ...(tags.length > 0 ? { tags } : {}),
      },
      status: {
        privacyStatus: "private",
        publishAt: publishAt.toISOString(),
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
    scheduledFor: formatEasternTime(publishAt),
  };
}
