import { describe, expect, it } from "vitest";
import {
  parseStoredFileRef,
  buildPdfRef,
  bucketForKind,
  bucketForPath,
  PDF_BUCKET,
  COVERS_BUCKET,
} from "../src/lib/storage-refs";

describe("parseStoredFileRef", () => {
  it("resuelve storage:// a bucket+path", () => {
    expect(parseStoredFileRef(`storage://${PDF_BUCKET}/pdfs/revista-5-es.pdf`)).toEqual({
      bucket: PDF_BUCKET,
      path: "pdfs/revista-5-es.pdf",
    });
  });

  it("resuelve URL pública legacy al bucket de portadas", () => {
    expect(
      parseStoredFileRef("https://xyz.supabase.co/storage/v1/object/public/editions/pdfs/revista-5-es.pdf"),
    ).toEqual({ bucket: COVERS_BUCKET, path: "pdfs/revista-5-es.pdf" });
  });

  it("devuelve null para refs externas o inválidas", () => {
    expect(parseStoredFileRef("/articulo-gratis.pdf")).toBeNull();
    expect(parseStoredFileRef(null)).toBeNull();
    expect(parseStoredFileRef("storage://sin-path")).toBeNull();
  });

  it("buildPdfRef genera refs al bucket privado", () => {
    expect(buildPdfRef("pdfs/revista-5-es.pdf")).toBe(`storage://${PDF_BUCKET}/pdfs/revista-5-es.pdf`);
  });

  it("bucket por kind y por path", () => {
    expect(bucketForKind("pdf")).toBe(PDF_BUCKET);
    expect(bucketForKind("cover")).toBe(COVERS_BUCKET);
    expect(bucketForPath("pdfs/x.pdf")).toBe(PDF_BUCKET);
    expect(bucketForPath("covers/x.jpg")).toBe(COVERS_BUCKET);
  });
});
