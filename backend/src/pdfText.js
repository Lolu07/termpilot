const LINE_TOLERANCE = 2;

function itemPosition(item) {
  return {
    x: Number(item.transform?.[4]) || 0,
    y: Number(item.transform?.[5]) || 0,
    width: Math.max(0, Number(item.width) || 0),
    height: Math.max(1, Math.abs(Number(item.height) || Number(item.transform?.[3]) || 10)),
  };
}

/**
 * pdf-parse's default renderer concatenates adjacent table cells. Grouping text
 * items by their Y coordinate and spacing them by X position preserves rows and
 * column boundaries, which gives both Groq and the deterministic parser much
 * cleaner input.
 */
export async function renderPdfPage(pageData) {
  const textContent = await pageData.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });

  const rows = [];
  for (const item of textContent.items || []) {
    const value = String(item.str || "").trim();
    if (!value) continue;

    const position = itemPosition(item);
    let row = rows.find(candidate => Math.abs(candidate.y - position.y) <= LINE_TOLERANCE);
    if (!row) {
      row = { y: position.y, items: [] };
      rows.push(row);
    }
    row.items.push({ value, ...position });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map(row => {
      const items = row.items.sort((a, b) => a.x - b.x);
      let line = "";
      let previousRight = null;
      let previousHeight = 10;

      for (const item of items) {
        if (line) {
          const gap = item.x - previousRight;
          const columnGap = Math.max(8, Math.min(previousHeight, item.height) * 0.8);
          line += gap >= columnGap ? " | " : " ";
        }
        line += item.value;
        previousRight = item.x + item.width;
        previousHeight = item.height;
      }
      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

export function normalizeExtractedText(value) {
  const months = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
  const itemTypes = "Homework|Assignment|Quiz|Exam|Midterm|Final|Project|Lab|Paper|Presentation";

  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00AD/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    // Repair the common pdf-parse table shape: TitleTypeMonth Day, YearPoints.
    .replace(new RegExp(`([a-z0-9)])(${itemTypes})(?=${months}\\b)`, "gi"), "$1 | $2 | ")
    .replace(/\b(20\d{2})(?=\d{1,4}\b)/g, "$1 | ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function hasUsablePdfText(text) {
  const normalized = normalizeExtractedText(text);
  const lettersAndNumbers = (normalized.match(/[A-Za-z0-9]/g) || []).length;
  return normalized.length >= 40 && lettersAndNumbers >= 20;
}
