import type { SourceType } from "../../utils/validation.js";

export type MediaProviderInput = {
  sourceUrl: string;
  temporaryDirectory: string;
};

export type RetrievedMedia = {
  kind: "available";
  filePath: string;
  mimeType: "video/mp4" | "video/quicktime" | "application/octet-stream";
};

export type MediaUnavailable = {
  kind: "unavailable";
  reason: string;
  requiresAuthorizedSourceFile: boolean;
};

export type MediaRetrievalResult = RetrievedMedia | MediaUnavailable;

export interface MediaProvider {
  readonly sourceType: SourceType;
  canHandle(sourceUrl: string): boolean;
  retrieve(input: MediaProviderInput): Promise<MediaRetrievalResult>;
}
