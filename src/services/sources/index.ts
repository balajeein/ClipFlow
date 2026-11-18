import type { MediaProvider } from "./types.js";
import { InstagramAdapter } from "./instagram.js";
import { YouTubeAdapter } from "./youtube.js";

export const mediaProviders: readonly MediaProvider[] = [
  new InstagramAdapter(),
  new YouTubeAdapter(),
];

export function providerForUrl(sourceUrl: string): MediaProvider | null {
  return mediaProviders.find((provider) => provider.canHandle(sourceUrl)) ?? null;
}
