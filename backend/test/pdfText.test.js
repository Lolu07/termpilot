import assert from "node:assert/strict";
import test from "node:test";

import { hasUsablePdfText, normalizeExtractedText, renderPdfPage } from "../src/pdfText.js";

test("renderPdfPage preserves table columns using text coordinates", async () => {
  const page = {
    async getTextContent() {
      return {
        items: [
          { str: "Homework 1 - Requirements", transform: [1, 0, 0, 10, 40, 700], width: 170, height: 10 },
          { str: "Homework", transform: [1, 0, 0, 10, 260, 700], width: 55, height: 10 },
          { str: "September 8, 2026", transform: [1, 0, 0, 10, 360, 700], width: 95, height: 10 },
          { str: "40", transform: [1, 0, 0, 10, 500, 700], width: 12, height: 10 },
          { str: "Schedule", transform: [1, 0, 0, 10, 40, 720], width: 45, height: 10 },
        ],
      };
    },
  };

  assert.equal(
    await renderPdfPage(page),
    "Schedule\nHomework 1 - Requirements | Homework | September 8, 2026 | 40",
  );
});

test("normalizeExtractedText repairs concatenated PDF table cells", () => {
  const raw = "Homework 1 – Requirements DocumentHomeworkSeptember 8, 202640";
  assert.equal(
    normalizeExtractedText(raw),
    "Homework 1 - Requirements Document | Homework | September 8, 2026 | 40",
  );
});

test("hasUsablePdfText rejects image-only extraction", () => {
  assert.equal(hasUsablePdfText(" \n  "), false);
  assert.equal(hasUsablePdfText("CS 3450 Homework 1 is due September 8, 2026."), true);
});
