import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { NEWS_ARTICLES } from "@/content/news";
import NewsArticle from "./NewsArticle";

afterEach(cleanup);

function renderArticle(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/news/${slug}`]}>
        <Routes><Route path="/news/:slug" element={<NewsArticle />} /></Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("NewsArticle", () => {
  it("uses the clean FAQ heading and discloses satire before the fictional dispatch", () => {
    const { container } = renderArticle("sort-your-pixels-before-they-sort-you");

    expect(screen.getByRole("heading", { name: "Questions, answered." })).toBeTruthy();
    expect(screen.queryByText(/SEO-flavored fog/i)).toBeNull();

    const answer = container.querySelector(".news-answer");
    const disclosure = container.querySelector(".news-disclosure");
    const copy = container.querySelector(".news-copy");
    expect(answer).toBeTruthy();
    expect(disclosure).toBeTruthy();
    expect(copy).toBeTruthy();
    expect(answer!.compareDocumentPosition(disclosure!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(disclosure!.compareDocumentPosition(copy!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders mode reports without requiring an effect registry entry", () => {
    renderArticle("forge-mode-already-started-the-fight");

    expect(screen.getByRole("heading", { name: "Forge Mode Already Started the Fight" })).toBeTruthy();
    expect(screen.getByText("Mode: Forge Mode")).toBeTruthy();
    expect(screen.getByText("3 core controls")).toBeTruthy();
  });

  it("publishes eleven unique reports including four September effects and two modes", () => {
    expect(NEWS_ARTICLES).toHaveLength(11);
    expect(new Set(NEWS_ARTICLES.map(article => article.slug)).size).toBe(11);
    expect(NEWS_ARTICLES.find(article => article.effectId === "kaleidoscope")?.steps).toHaveLength(5);
    expect(NEWS_ARTICLES.filter(article => ["posterize", "duotone", "asciiCollapse"].includes(article.effectId ?? "")))
      .toHaveLength(3);
    expect(NEWS_ARTICLES.filter(article => article.subjectKind === "mode").map(article => article.effectName))
      .toEqual(["Forge Mode", "Pattern / Motif Mode"]);
  });

  it("keeps the three new reports answer-first and release-complete", () => {
    const batch = NEWS_ARTICLES.filter(article => ["posterize", "duotone", "asciiCollapse"].includes(article.effectId ?? ""));
    for (const article of batch) {
      const answerWords = article.tldr.trim().split(/\s+/).length;
      expect(answerWords, `${article.slug} direct answer`).toBeGreaterThanOrEqual(40);
      expect(answerWords, `${article.slug} direct answer`).toBeLessThanOrEqual(70);
      expect(article.steps, `${article.slug} steps`).toHaveLength(5);
      expect(article.uses.length, `${article.slug} uses`).toBeGreaterThanOrEqual(4);
      expect(article.faqs, `${article.slug} FAQs`).toHaveLength(4);
      expect(article.keywords.length, `${article.slug} keywords`).toBeGreaterThanOrEqual(5);
      expect(article.keywords.length, `${article.slug} keywords`).toBeLessThanOrEqual(8);
    }
  });

  it("renders the three new effect controls and distinguishes ASCII-inspired pixels from text", () => {
    renderArticle("make-ascii-collapse-admit-it-is-not-actually-text");

    expect(screen.getByRole("heading", { name: "Make ASCII Collapse Admit It Is Not Actually Text" })).toBeTruthy();
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByText("Cell")).toBeTruthy();
    expect(screen.getAllByText(/emits no character codes/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Kaleidoscope controls, related effects, download, and live product link", () => {
    renderArticle("turn-the-kaleidoscope-effect-until-it-confesses");

    expect(screen.getByRole("heading", { name: "Turn the Kaleidoscope Effect Until the Room Confesses" })).toBeTruthy();
    expect(screen.getByText("Segments")).toBeTruthy();
    expect(screen.getByText("Spin")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Related effects" }).querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /View the thing we interrupted science for/i }).getAttribute("href"))
      .toBe("https://aestheticrebellion.store/products/radial-kaleidoscope-aloha-shirt");
    expect(screen.getByRole("link", { name: "Download .md" }).getAttribute("href"))
      .toBe("/news/downloads/kaleidoscope-field-card.md");
  });
});
