import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { NEWS_ARTICLES, NEWS_LOOK_EXAMPLES_BY_SLUG } from "@/content/news";
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
  it("gives every article a way to be shared, pointed at its canonical url", async () => {
    // The most shareable thing on the site had no share control at all, and a
    // window.location link would post the preview deploy from a preview deploy.
    const article = NEWS_ARTICLES[0];
    renderArticle(article.slug);
    render(<Toaster />);

    screen.getByRole("button", { name: `Share ${article.title}` }).click();

    const link = await screen.findByLabelText<HTMLInputElement>("Link to this article");
    expect(link.value).toBe(`https://ether-mosh.online/news/${article.slug}`);
  });

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

  it("starts each article at the top after index navigation", () => {
    document.documentElement.scrollTop = 640;
    document.body.scrollTop = 640;

    renderArticle("make-the-rgb-shift-effect-split-before-it-gets-a-lawyer");

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("renders mode reports without requiring an effect registry entry", () => {
    renderArticle("forge-mode-already-started-the-fight");

    expect(screen.getByRole("heading", { name: "Forge Mode Already Started the Fight" })).toBeTruthy();
    expect(screen.getByText("Mode: Forge Mode")).toBeTruthy();
    expect(screen.getByText("3 core controls")).toBeTruthy();
  });

  it("publishes sixteen unique reports including nine September effects and two modes", () => {
    expect(NEWS_ARTICLES).toHaveLength(16);
    expect(new Set(NEWS_ARTICLES.map(article => article.slug)).size).toBe(16);
    expect(NEWS_ARTICLES.find(article => article.effectId === "kaleidoscope")?.steps).toHaveLength(5);
    expect(NEWS_ARTICLES.filter(article => ["kaleidoscope", "posterize", "duotone", "asciiCollapse", "solarize", "thermal", "rgbShift", "oilSlick", "filmGrain"].includes(article.effectId ?? "")))
      .toHaveLength(9);
    expect(NEWS_ARTICLES.filter(article => article.subjectKind === "mode").map(article => article.effectName))
      .toEqual(["Forge Mode", "Pattern / Motif Mode"]);
  });

  it("gives every existing report two concrete visual-result examples", () => {
    expect(Object.keys(NEWS_LOOK_EXAMPLES_BY_SLUG)).toHaveLength(NEWS_ARTICLES.length);
    for (const article of NEWS_ARTICLES) {
      const examples = NEWS_LOOK_EXAMPLES_BY_SLUG[article.slug];
      expect(examples, article.slug).toHaveLength(2);
      for (const example of examples) {
        expect(example.scene.length).toBeGreaterThan(4);
        expect(example.settings.length).toBeGreaterThan(8);
        expect(example.result.length).toBeGreaterThan(40);
      }
    }
  });

  it("renders the two examples inside each article without adding another route", () => {
    const { container } = renderArticle("break-the-keyframes-before-lunch");

    expect(screen.getByRole("heading", { name: "What it actually looks like" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Dancer crossing frame" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fast camera pan" })).toBeTruthy();
    expect(container.querySelectorAll(".news-look-examples article")).toHaveLength(2);
  });

  it("keeps the eight recent reports answer-first and release-complete", () => {
    const batch = NEWS_ARTICLES.filter(article => ["posterize", "duotone", "asciiCollapse", "solarize", "thermal", "rgbShift", "oilSlick", "filmGrain"].includes(article.effectId ?? ""));
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

  it("renders Solarize controls, technical distinction, download, and live product link", () => {
    renderArticle("make-the-solarize-effect-expose-itself");

    expect(screen.getByRole("heading", { name: "Make the Solarize Effect Expose Itself" })).toBeTruthy();
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByText("Pivot")).toBeTruthy();
    expect(screen.getAllByText(/per-channel threshold shader/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /View the thing we interrupted science for/i }).getAttribute("href"))
      .toBe("https://aestheticrebellion.store/products/boundless-bleeds-uv-arm-sleeves");
    expect(screen.getByRole("link", { name: "Download .md" }).getAttribute("href"))
      .toBe("/news/downloads/solarize-field-card.md");
  });

  it("renders Thermal controls, RGB-versus-infrared distinction, download, and live product link", () => {
    renderArticle("make-the-thermal-effect-admit-it-cannot-feel-heat");

    expect(screen.getByRole("heading", { name: "Make the Thermal Effect Admit It Cannot Feel Heat" })).toBeTruthy();
    expect(screen.getByText("Mix")).toBeTruthy();
    expect(screen.getByText("Range")).toBeTruthy();
    expect(screen.getAllByText(/detects no infrared radiation/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /View the thing we interrupted science for/i }).getAttribute("href"))
      .toBe("https://aestheticrebellion.store/products/color-splash-warmup-hoodie");
    expect(screen.getByRole("link", { name: "Download .md" }).getAttribute("href"))
      .toBe("/news/downloads/thermal-field-card.md");
  });

  it("renders RGB Shift controls, optical distinction, download, and live product link", () => {
    renderArticle("make-the-rgb-shift-effect-split-before-it-gets-a-lawyer");

    expect(screen.getByRole("heading", { name: "Make the RGB Shift Effect Split Before It Gets a Lawyer" })).toBeTruthy();
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByText("Angle")).toBeTruthy();
    expect(screen.getAllByText(/without simulating a physical lens/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /View the thing we interrupted science for/i }).getAttribute("href"))
      .toBe("https://aestheticrebellion.store/products/brushstroke-riot-sweatshirt");
    expect(screen.getByRole("link", { name: "Download .md" }).getAttribute("href"))
      .toBe("/news/downloads/rgb-shift-field-card.md");
  });

  it("renders Oil Slick controls, physical distinction, download, and live product link", () => {
    renderArticle("make-the-oil-slick-effect-pass-a-sheen-inspection");

    expect(screen.getByRole("heading", { name: "Make the Oil Slick Effect Pass a Sheen Inspection" })).toBeTruthy();
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByText("Frequency")).toBeTruthy();
    expect(screen.getAllByText(/not a physical thin-film simulation/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /View the thing we interrupted science for/i }).getAttribute("href"))
      .toBe("https://aestheticrebellion.store/products/chameleon-prism-hoodie");
    expect(screen.getByRole("link", { name: "Download .md" }).getAttribute("href"))
      .toBe("/news/downloads/oil-slick-field-card.md");
  });

  it("renders Film Grain controls, physical distinction, download, and live product link", () => {
    renderArticle("make-the-film-grain-effect-show-its-receipts");

    expect(screen.getByRole("heading", { name: "Make the Film Grain Effect Show Its Receipts" })).toBeTruthy();
    expect(screen.getByText("Amount")).toBeTruthy();
    expect(screen.getByText("Halation")).toBeTruthy();
    expect(screen.getAllByText(/not a film-stock measurement or restoration tool/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /View the thing we interrupted science for/i }).getAttribute("href"))
      .toBe("https://aestheticrebellion.store/products/stipple-wave-long-fleece-coat");
    expect(screen.getByRole("link", { name: "Download .md" }).getAttribute("href"))
      .toBe("/news/downloads/film-grain-field-card.md");
  });
});
