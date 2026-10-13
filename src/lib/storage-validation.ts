export type EditionFileKind = "cover" | "pdf";

export const FILE_RULES: Record<EditionFileKind, { maxBytes: number; mime: RegExp }> = {
  cover: {
    maxBytes: 5 * 1024 * 1024,
    mime: /^image\/(jpeg|png|webp|avif)$/,
  },
  pdf: {
    maxBytes: 50 * 1024 * 1024,
    mime: /^application\/pdf$/,
  },
};

export type UploadValidationFailure =
  | "invalid_path"
  | "invalid_size"
  | "too_large"
  | "invalid_mime"
  | "invalid_signature"
  | "extension_mismatch";

export function isAllowedUploadPath(kind: EditionFileKind, path: string): boolean {
  if (path.includes("..") || path.includes("\\") || path.split("/").length !== 2) return false;
  if (kind === "pdf") {
    return /^pdfs\/(?:revista-\d+|articulo-gratis-\d+)-(?:es|en)\.pdf$/i.test(path);
  }
  return /^covers\/edicion-\d+-(?:es|en)-\d+\.(?:jpe?g|png|webp|avif)$/i.test(path);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  if (bytes.length < start + length) return "";
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function detectUploadMimeType(bytes: Uint8Array): string | null {
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === "ftyp") {
    for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
      const brand = ascii(bytes, offset, 4);
      if (brand === "avif" || brand === "avis") return "image/avif";
    }
  }
  return null;
}

export function validateStoredUpload(input: {
  kind: EditionFileKind;
  path: string;
  size: number;
  contentType: string;
  prefix: Uint8Array;
}): UploadValidationFailure | null {
  const { kind, path, size, contentType, prefix } = input;
  if (!isAllowedUploadPath(kind, path)) return "invalid_path";
  if (!Number.isSafeInteger(size) || size <= 0) return "invalid_size";
  if (size > FILE_RULES[kind].maxBytes) return "too_large";

  const normalizedContentType = contentType.trim().toLowerCase();
  if (!FILE_RULES[kind].mime.test(normalizedContentType)) return "invalid_mime";

  const detectedMime = detectUploadMimeType(prefix);
  if (!detectedMime || detectedMime !== normalizedContentType) return "invalid_signature";

  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const extensionsByMime: Record<string, string[]> = {
    "application/pdf": ["pdf"],
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/avif": ["avif"],
  };
  if (!extensionsByMime[detectedMime]?.includes(extension)) return "extension_mismatch";
  return null;
}
