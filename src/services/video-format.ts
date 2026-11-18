import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import ffmpegStaticModule from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const SHORTS_WIDTH = 1080;
const SHORTS_HEIGHT = 1920;

const ffmpegExport = ffmpegStaticModule as unknown;
const ffmpegPath =
  typeof ffmpegExport === "string"
    ? ffmpegExport
    : typeof (ffmpegExport as { default?: unknown }).default === "string"
      ? (ffmpegExport as { default: string }).default
      : null;

/**
 * Fits the entire source video inside a 9:16 canvas without cropping.
 * The source is scaled proportionally and padded with black bars as needed.
 */
export async function fitVideoForShorts(inputPath: string): Promise<string> {
  if (!ffmpegPath) {
    throw new Error("FFmpeg is not available in this deployment");
  }

  const outputPath = join(dirname(inputPath), "clipflow-shorts.mp4");
  const videoFilter = [
    `scale=w='min(${SHORTS_WIDTH},iw)':h='min(${SHORTS_HEIGHT},ih)':force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${SHORTS_WIDTH}:${SHORTS_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
  ].join(",");

  try {
    await execFileAsync(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-vf",
      videoFilter,
      "-c:v",
      "libx264",
      "-preset",
      process.env.FFMPEG_PRESET?.trim() || "slow",
      "-crf",
      process.env.FFMPEG_CRF?.trim() || "17",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-metadata:s:v:0",
      "rotate=0",
      outputPath,
    ], { maxBuffer: 2 * 1024 * 1024 });
  } catch {
    throw new Error("Could not convert the video to a 9:16 YouTube Shorts format");
  }

  return outputPath;
}
