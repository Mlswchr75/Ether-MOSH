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
  it("uses the clean FAQ heading and keeps the disclosure quietly at the bottom", () => {
    const { container } = renderArticle("sort-your-pixels-before-they-sort-you");

    expect(screen.getByRole("heading", { name: "Questions, answered." })).toBeTruthy();
    expect(screen.queryByText(/SEO-flavored fog/i)).toBeNull();

    const sources = screen.getByRole("heading", { name: "Sources + further learning" }).closest("section");
    const disclosure = container.querySelector(".news-disclosure");
    expect(sources).toBeTruthy();
    expect(disclosure).toBeTruthy();
    expect(sources!.compareDocumentPosition(disclosure!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders mode reports without requiring an effect registry entry", () => {
    renderArticle("forge-mode-already-started-the-fight");

    expect(screen.getByRole("heading", { name: "Forge Mode Already Started the Fight" })).toBeTruthy();
    expect(screen.getByText("Mode: Forge Mode")).toBeTruthy();
    expect(screen.getByText("3 core controls")).toBeTruthy();
  });

  it("publishes seven unique reports including two effects and two modes in the new set", () => {
    expect(NEWS_ARTICLES).toHaveLength(7);
    expect(new Set(NEWS_ARTICLES.map(article => article.slug)).size).toBe(7);
    expect(NEWS_ARTICLES.filter(article => article.subjectKind === "mode").map(article => article.effectName))
      .toEqual(["Forge Mode", "Pattern / Motif Mode"]);
  });
});
