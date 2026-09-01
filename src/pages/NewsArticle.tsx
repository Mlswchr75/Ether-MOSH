import { ArrowLeft, ArrowRight, ArrowUpRight, Download } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate, useParams } from "react-router-dom";
import { NewsFooter, NewsHeader } from "@/components/news/NewsChrome";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { latestNewsArticles, NEWS_ARTICLES_BY_SLUG, newsArticlePath } from "@/content/news";
import "./news.css";

export default function NewsArticle() {
  const { slug } = useParams();
  const article = slug ? NEWS_ARTICLES_BY_SLUG.get(slug) : undefined;
  if (!article) return <Navigate to="/news" replace/>;
  const canonical = `https://ether-mosh.online${newsArticlePath(article)}`;
  const effect = EFFECTS_BY_ID[article.effectId];
  const next = latestNewsArticles[(latestNewsArticles.indexOf(article) + 1) % latestNewsArticles.length];
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "BlogPosting", headline: article.title, description: article.description, image: `https://ether-mosh.online${article.image}`, datePublished: article.publishedAt, dateModified: article.publishedAt, mainEntityOfPage: canonical, author: { "@type": "Organization", name: "Ether-MOSH" }, publisher: { "@type": "Organization", name: "Aesthetic Rebellion", url: "https://aestheticrebellion.store" }, keywords: article.keywords.join(", ") },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: article.faqs.map(f => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) },
    { "@context": "https://schema.org", "@type": "HowTo", name: `How to use ${article.effectName} in Ether-MOSH`, description: article.tldr, step: article.steps.map((text, index) => ({ "@type": "HowToStep", position: index + 1, text })) },
  ];
  return <main className="news-page news-article">
    <Helmet><title>{article.title} | Ether-MOSH News</title><meta name="description" content={article.description}/><meta name="keywords" content={article.keywords.join(", ")}/><link rel="canonical" href={canonical}/><meta property="og:type" content="article"/><meta property="og:title" content={article.title}/><meta property="og:description" content={article.description}/><meta property="og:url" content={canonical}/><meta property="og:image" content={`https://ether-mosh.online${article.image}`}/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content={article.title}/><meta name="twitter:description" content={article.description}/><meta name="twitter:image" content={`https://ether-mosh.online${article.image}`}/>{jsonLd.map((data, i) => <script type="application/ld+json" key={i}>{JSON.stringify(data)}</script>)}</Helmet>
    <NewsHeader/>
    <div className="news-article-breadcrumb"><Link to="/news"><ArrowLeft/> News + Updates</Link><span>{article.category}</span><span>{article.readMinutes} minute read</span></div>
    <article>
      <header className="news-article-title"><p className="news-kicker">{article.category} / Dispatch 001</p><h1>{article.title}</h1><p>{article.dek}</p><div><time dateTime={article.publishedAt}>August 31, 2026</time><span>Effect: {effect?.name ?? article.effectName}</span><span>{effect?.params.length ?? 0} live controls</span></div></header>
      <figure className="news-article-hero"><img src={article.image} alt={article.imageAlt} width="1672" height="941"/><figcaption>{article.imageCaption}</figcaption></figure>
      <section className="news-answer"><span>Quick answer</span><p>{article.tldr}</p></section>
      <aside className="news-disclosure"><strong>Satire disclosure</strong><p>{article.satireDisclosure}</p></aside>
      <section className="news-copy"><p className="news-dropcap">{article.dispatch[0]}</p><p>{article.dispatch[1]}</p><h2>What {article.effectName} actually does</h2>{article.explanation.map(p => <p key={p}>{p}</p>)}</section>
      <blockquote><p>“{article.quote}”</p><cite>— {article.quoteAttribution}</cite></blockquote>
      <section className="news-howto"><p className="news-kicker">Field procedure</p><h2>Make it in Ether-MOSH</h2><ol>{article.steps.map((step, i) => <li key={step}><span>{String(i + 1).padStart(2, "0")}</span><p>{step}</p></li>)}</ol><Link to="/edit" className="news-button">Open the instrument <ArrowUpRight/></Link></section>
      <section className="news-parameters"><p className="news-kicker">Control desk</p><h2>Settings that matter</h2><div className="news-table"><div><b>Control</b><b>Purpose</b><b>Low</b><b>High</b><b>Useful start</b></div>{article.parameters.map(row => <div key={row.control}><strong>{row.control}</strong><span>{row.purpose}</span><span>{row.low}</span><span>{row.high}</span><em>{row.sweetSpot}</em></div>)}</div></section>
      <section className="news-usecases"><p className="news-kicker">Where this leaves the browser</p><h2>Real-world use cases</h2><div>{article.uses.map((use, i) => <article key={use.title}><span>0{i + 1}</span><h3>{use.title}</h3><p>{use.body}</p></article>)}</div></section>
      <aside className="news-sponsor"><span>Shameless product placement / paid partnership with ourselves</span><h2>{article.product.name}</h2><p>{article.product.copy}</p><a href={article.product.href} target="_blank" rel="sponsored noreferrer">View the thing we interrupted science for <ArrowUpRight/></a></aside>
      <section className="news-download"><Download/><div><p className="news-kicker">Free field card</p><h2>{article.effectName}: settings + production checklist</h2><p>A portable Markdown reference for your next print, projection, pattern, animation, or live-performance experiment.</p></div><a href={article.downloadHref} download>Download .md</a></section>
      <section className="news-faq"><p className="news-kicker">People also ask</p><h2>Questions, answered without SEO-flavored fog</h2>{article.faqs.map(f => <details key={f.question}><summary>{f.question}</summary><p>{f.answer}</p></details>)}</section>
      <section className="news-sources"><h2>Sources + further learning</h2><ol>{article.sources.map(source => <li key={source.href}><a href={source.href} target={source.href.startsWith("http") ? "_blank" : undefined} rel={source.href.startsWith("http") ? "noreferrer" : undefined}>{source.label} <ArrowUpRight/></a><p>{source.note}</p></li>)}</ol></section>
      <footer className="news-next"><p className="news-kicker">Next transmission</p><Link to={newsArticlePath(next)}><span>{next.category}</span><strong>{next.title}</strong><ArrowRight/></Link></footer>
    </article>
    <NewsFooter/>
  </main>;
}
