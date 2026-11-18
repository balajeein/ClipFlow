import type {
  MediaProvider,
  MediaProviderInput,
  MediaRetrievalResult,
} from "./types.js";

export class YouTubeAdapter implements MediaProvider {
  readonly sourceType = "youtube" as const;

  canHandle(sourceUrl: string): boolean {
    try {
      const url = new URL(sourceUrl);
      return (
        url.hostname.replace(/^www\./, "").toLowerCase() === "youtube.com" &&
        /^\/shorts\/[^/]+$/i.test(url.pathname.replace(/\/+$/, ""))
      );
    } catch {
      return false;
    }
  }

  async retrieve(_input: MediaProviderInput): Promise<MediaRetrievalResult> {
    return {
      kind: "unavailable",
      reason: "No authorized YouTube media source file has been supplied.",
      requiresAuthorizedSourceFile: true,
    };
  }
}
