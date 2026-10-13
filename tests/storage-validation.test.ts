import { describe, expect, it } from "vitest";
import { detectUploadMimeType, isAllowedUploadPath, validateStoredUpload } from "../src/lib/storage-validation";

const encoder = new TextEncoder();

describe("verificación de uploads de ediciones", () => {
  it("reconoce firmas reales de PDF y formatos de portada permitidos", () => {
    expect(detectUploadMimeType(encoder.encode("%PDF-1.7"))).toBe("application/pdf");
    expect(detectUploadMimeType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectUploadMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");

    const webp = new Uint8Array(12);
    webp.set(encoder.encode("RIFF"), 0);
    webp.set(encoder.encode("WEBP"), 8);
    expect(detectUploadMimeType(webp)).toBe("image/webp");

    const avif = new Uint8Array(16);
    avif.set(encoder.encode("ftyp"), 4);
    avif.set(encoder.encode("avif"), 8);
    expect(detectUploadMimeType(avif)).toBe("image/avif");
  });

  it("acepta uploads con ruta, tamaño, MIME, firma y extensión coherentes", () => {
    expect(validateStoredUpload({
      kind: "pdf",
      path: "pdfs/revista-5-es.pdf",
      size: 1024,
      contentType: "application/pdf",
      prefix: encoder.encode("%PDF-1.7"),
    })).toBeNull();
    expect(validateStoredUpload({
      kind: "cover",
      path: "covers/edicion-5-es-1790000000000.webp",
      size: 1024,
      contentType: "image/webp",
      prefix: (() => {
        const bytes = new Uint8Array(12);
        bytes.set(encoder.encode("RIFF"), 0);
        bytes.set(encoder.encode("WEBP"), 8);
        return bytes;
      })(),
    })).toBeNull();
  });

  it("rechaza metadata declarada que no coincide con el contenido o extensión", () => {
    const pdfPrefix = encoder.encode("%PDF-1.7");
    expect(validateStoredUpload({
      kind: "cover",
      path: "covers/edicion-5-es-1790000000000.jpg",
      size: 1024,
      contentType: "image/jpeg",
      prefix: pdfPrefix,
    })).toBe("invalid_signature");
    expect(validateStoredUpload({
      kind: "cover",
      path: "covers/edicion-5-es-1790000000000.jpg",
      size: 1024,
      contentType: "image/png",
      prefix: Uint8Array.from([0xff, 0xd8, 0xff]),
    })).toBe("invalid_signature");
    expect(validateStoredUpload({
      kind: "cover",
      path: "covers/edicion-5-es-1790000000000.png",
      size: 1024,
      contentType: "image/png",
      prefix: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })).toBeNull();
    expect(validateStoredUpload({
      kind: "cover",
      path: "covers/edicion-5-es-1790000000000.png",
      size: 1024,
      contentType: "image/jpeg",
      prefix: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
    })).toBe("extension_mismatch");
  });

  it("rechaza rutas ajenas, archivos vacíos y tamaños sobre el máximo", () => {
    expect(isAllowedUploadPath("pdf", "covers/edicion-5-es-1.jpg")).toBe(false);
    expect(isAllowedUploadPath("pdf", "pdfs/../private.pdf")).toBe(false);
    expect(validateStoredUpload({
      kind: "pdf",
      path: "pdfs/revista-5-es.pdf",
      size: 0,
      contentType: "application/pdf",
      prefix: encoder.encode("%PDF-1.7"),
    })).toBe("invalid_size");
    expect(validateStoredUpload({
      kind: "pdf",
      path: "pdfs/revista-5-es.pdf",
      size: 50 * 1024 * 1024 + 1,
      contentType: "application/pdf",
      prefix: encoder.encode("%PDF-1.7"),
    })).toBe("too_large");
  });
});
