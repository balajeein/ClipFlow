import type {
  MediaProvider,
  MediaProviderInput,
  MediaRetrievalResult,
} from "./types.js";

export class InstagramAdapter implements MediaProvider {
  readonly sourceType = "instagram" as const;

  canHandle(sourceUrl: string): boolean {
    try {
      const url = new URL(sourceUrl);
      return (
        url.hostname.replace(/^www\./, "").toLowerCase() === "instagram.com" &&
        /^\/reel\/[^/]+$/i.test(url.pathname.replace(/\/+$/, ""))
      );
    } catch {
      return false;
    }
  }

  async retrieve(_input: MediaProviderInput): Promise<MediaRetrievalResult> {
    return {
      kind: "unavailable",
      reason: "No authorized Instagram media source file has been supplied.",
      requiresAuthorizedSourceFile: true,
    };
  }
}
