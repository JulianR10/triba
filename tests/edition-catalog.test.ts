import { describe, expect, it } from "vitest";
import { resolveEditionView } from "../src/lib/editions";

const issue = {
  id: 5,
  edition_number: 5,
  featured: true,
  kind: "magazine" as const,
  published_at: "2026-01-01",
  created_at: "2026-01-01",
};

describe("resolveEditionView (public catalog sin pdf_url)", () => {
  it("no expone pdf_url y marca hasPdf", () => {
    const view = resolveEditionView(
      issue,
      [{ id: 51, language: "es", title: "T5", description: "d", cover_url: "c", badge: null }],
      "es",
      true,
    );
    expect(view.pdf_url).toBeNull();
    expect(view.hasPdf).toBe(true);
    expect(view.versionId).toBe(51);
  });

  it("sin PDF marca hasPdf false y mantiene fallback es", () => {
    const view = resolveEditionView(
      issue,
      [{ id: 52, language: "es", title: "T5", description: "d", cover_url: "c", badge: null }],
      "en",
      false,
    );
    expect(view.hasPdf).toBe(false);
    expect(view.isFallback).toBe(true);
    expect(view.pdf_url).toBeNull();
  });
});
