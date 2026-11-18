export type SourceType = "instagram" | "youtube";

export type ExtractedUrl = {
  url: string;
  sourceType: SourceType;
};

const urlPattern = /https?:\/\/[^\s<>()]+/gi;
const trailingPunctuation = /[.,!?;:'"\])}]+$/;

function normalizeCandidate(candidate: string): string {
  return candidate.replace(trailingPunctuation, "");
}

export function classifyUrl(candidate: string): ExtractedUrl | null {
  const url = normalizeCandidate(candidate);

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");

    if (hostname === "instagram.com" && /^\/reel\/[^/]+$/i.test(path)) {
      return { url, sourceType: "instagram" };
    }

    if (
      hostname === "youtube.com" &&
      /^\/shorts\/[^/]+$/i.test(path)
    ) {
      return { url, sourceType: "youtube" };
    }
  } catch {
    return null;
  }

  return null;
}

export function extractSupportedUrls(text: string): ExtractedUrl[] {
  const found: ExtractedUrl[] = [];
  const seen = new Set<string>();

  for (const candidate of text.match(urlPattern) ?? []) {
    const extracted = classifyUrl(candidate);
    if (extracted && !seen.has(extracted.url)) {
      seen.add(extracted.url);
      found.push(extracted);
    }
  }

  return found;
}
