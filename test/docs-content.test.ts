import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const contentDir = new URL("../docs/content/", import.meta.url);

const pages = readdirSync(contentDir, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(".md"))
  .map((path) => ({ path, text: readFileSync(new URL(path, contentDir), "utf8") }));

/* The `description` lines of a page's frontmatter, `seo.description` included. */
function descriptions(text: string): string[] {
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1] ?? "";
  return [...frontmatter.matchAll(/^\s*description:\s*(.*)$/gmu)].map((match) => match[1] ?? "");
}

describe("docs content", () => {
  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  /** Docus 5.13 names the OG file after the description: a comma splits it, `..png` is skipped. */
  it.each(pages)("keeps commas and a closing period out of the description of $path", (page) => {
    for (const description of descriptions(page.text)) {
      expect(description).not.toMatch(/,|\.$/u);
    }
  });

  /** A `: ` in a plain YAML value starts a mapping, and the page drops out of the prerender. */
  it.each(pages)("keeps a colon and space out of the description of $path", (page) => {
    for (const description of descriptions(page.text)) {
      expect(description.startsWith('"') ? "" : description).not.toContain(": ");
    }
  });

  /** A list item opening on bold sends the `/llms-full.txt` serializer into endless recursion. */
  it.each(pages)("opens no list item in $path with bold", (page) => {
    expect(page.text).not.toMatch(/^\s*(?:[-*]|\d+\.) \*\*/mu);
  });
});
