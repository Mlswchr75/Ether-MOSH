import { ArrowRight, Download } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { NewsFooter, NewsHeader } from "@/components/news/NewsChrome";
import { latestNewsArticles, newsArticlePath } from "@/content/news";
import "./news.css";

const description = "Satirical but factual Ether-MOSH effect guides, glitch-art history, practical tutorials, downloadable field cards, and real production workflows for visual artists.";
const featured = latestNewsArticles[0];
const canonical = "https://ether-mosh.online/news";
const formatArticleDate = (publishedAt: string) => new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles",
}).format(new Date(publishedAt));

export default function NewsIndex() {
  const jsonLd = { "@context": "https://schema.org", "@type": "Blog", name: "Ether-MOSH News + Updates", description, url: canonical, publisher: { "@type": "Organization", name: "Aesthetic Rebellion" }, blogPost: latestNewsArticles.map(article => ({ "@type": "BlogPosting", headline: article.title, description: article.description, datePublished: article.publishedAt, url: `${canonical}/${article.slug}`, image: `https://ether-mosh.online${article.image}` })) };
  return <main className="news-page">
    <Helmet>
      <title>News + Updates: Glitch Art Effect Guides | Ether-MOSH</title><meta name="description" content={description}/><meta name="keywords" content="glitch art tutorials, Ether-MOSH effects, VJ tutorials, projection mapping, digital art education"/><link rel="canonical" href={canonical}/><link rel="alternate" type="application/rss+xml" title="Ether-MOSH News + Updates" href={`${canonical}/feed.xml`}/>
      <meta property="og:type" content="website"/><meta property="og:title" content="Bad Signal. Good Information. | Ether-MOSH"/><meta property="og:description" content={description}/><meta property="og:url" content={canonical}/><meta property="og:image" content={`https://ether-mosh.online${featured.image}`}/>
      <meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="Bad Signal. Good Information. | Ether-MOSH"/><meta name="twitter:description" content={description}/><meta name="twitter:image" content={`https://ether-mosh.online${featured.image}`}/><script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
    <NewsHeader/>
    <section className="news-index-hero">
      <div><p className="news-kicker">News + updates / signal recovered</p><h1>Bad Signal.<br/><em>Good Information.</em></h1><p>Effect education, production recipes, fake scandals, real sources, and downloadable field notes.</p><Link to="/edit" className="news-button">Start moshing <ArrowRight/></Link></div>
      <Link to={newsArticlePath(featured)} className="news-hero-art"><img src={featured.image} alt={featured.imageAlt} width="1672" height="941"/><span>Latest dispatch · Read the field report</span></Link>
    </section>
    <section className="news-feature">
      <Link to={newsArticlePath(featured)}><img src={featured.image} alt="" width="1672" height="941" loading="lazy"/></Link>
      <div><p className="news-kicker">{featured.category} · Featured</p><h2><Link to={newsArticlePath(featured)}>{featured.title}</Link></h2><p>{featured.dek}</p><Link to={newsArticlePath(featured)} className="news-inline-link">Read field report <ArrowRight/></Link></div>
      <aside>{latestNewsArticles.filter(a => a !== featured).slice(0, 3).map(article => <Link key={article.slug} to={newsArticlePath(article)}><img src={article.image} alt=""/><span><small>{article.category}</small><strong>{article.title}</strong><em>{article.readMinutes} min read</em></span></Link>)}</aside>
    </section>
    <section className="news-latest"><header><h2>Latest field reports</h2><span>{latestNewsArticles.length} field reports</span></header><ol>{latestNewsArticles.map((article, index) => <li key={article.slug}><Link to={newsArticlePath(article)}><b>{String(index + 1).padStart(2, "0")}</b><time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time><span>{article.category}</span><strong>{article.title}</strong><em>{article.readMinutes} min <ArrowRight/></em></Link></li>)}</ol></section>
    <section className="news-resources"><div><p className="news-kicker">Practical resources</p><h2>Take the useful shit with you.</h2><p>No email. No gate. No desperate funnel-shaped nonsense.</p></div>{latestNewsArticles.map(article => <a key={article.slug} href={article.downloadHref} download><Download/><span><strong>{article.effectName} field card</strong><small>Markdown · recipes + production notes</small></span></a>)}<a href="/news/downloads/effect-starter-recipes.csv" download><Download/><span><strong>Starter recipes</strong><small>CSV · all published subjects</small></span></a></section>
    <NewsFooter/>
  </main>;
}
