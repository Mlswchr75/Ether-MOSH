import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NEWS_ARTICLES, latestNewsArticles, newsArticlePath, type NewsArticle } from "../src/content/news";

const ORIGIN = "https://ether-mosh.online";
const dist = path.resolve("dist");
const template = await readFile(path.join(dist, "index.html"), "utf8");
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const absolute = (s: string) => new URL(s, ORIGIN).toString();

type Page = { route:string; title:string; description:string; keywords:string[]; image:string; type:"website"|"article"; jsonLd:unknown; noscript:string };
const articleSchema = (a: NewsArticle) => [
  { "@context":"https://schema.org", "@type":"BlogPosting", headline:a.title, description:a.description, image:absolute(a.image), datePublished:a.publishedAt, dateModified:a.publishedAt, mainEntityOfPage:absolute(newsArticlePath(a)), author:{"@type":"Organization",name:"Ether-MOSH"}, publisher:{"@type":"Organization",name:"Aesthetic Rebellion",url:"https://aestheticrebellion.store"}, keywords:a.keywords.join(", ") },
  { "@context":"https://schema.org", "@type":"FAQPage", mainEntity:a.faqs.map(f => ({"@type":"Question",name:f.question,acceptedAnswer:{"@type":"Answer",text:f.answer}})) },
  { "@context":"https://schema.org", "@type":"HowTo", name:`How to use ${a.effectName} in Ether-MOSH`, description:a.tldr, step:a.steps.map((text, i) => ({"@type":"HowToStep",position:i+1,text})) },
];
const description = "Satirical but factual Ether-MOSH effect guides, glitch-art history, practical tutorials, downloadable field cards, and real production workflows for visual artists.";
const pages: Page[] = [{ route:"/news", title:"News + Updates: Glitch Art Effect Guides | Ether-MOSH", description, keywords:["glitch art tutorials","Ether-MOSH effects","VJ tutorials","digital art education"], image:"/news/pixel-sort-bureaucracy.jpg", type:"website", jsonLd:{"@context":"https://schema.org","@type":"Blog",name:"Ether-MOSH News + Updates",description,url:`${ORIGIN}/news`,blogPost:latestNewsArticles.map(a=>({"@type":"BlogPosting",headline:a.title,url:absolute(newsArticlePath(a)),image:absolute(a.image)}))}, noscript:`<h1>Ether-MOSH News + Updates</h1><p>${esc(description)}</p><ul>${latestNewsArticles.map(a=>`<li><a href="${newsArticlePath(a)}">${esc(a.title)}</a> — ${esc(a.description)}</li>`).join("")}</ul>` }, ...NEWS_ARTICLES.map(a => ({ route:newsArticlePath(a), title:`${a.title} | Ether-MOSH News`, description:a.description, keywords:a.keywords, image:a.image, type:"article" as const, jsonLd:articleSchema(a), noscript:`<article><h1>${esc(a.title)}</h1><p>${esc(a.dek)}</p><h2>Quick answer</h2><p>${esc(a.tldr)}</p><a href="/edit">Open Ether-MOSH</a></article>` }))];

function render(page: Page) {
  const canonical = absolute(page.route), image = absolute(page.image);
  const tags = `<title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <meta name="keywords" content="${esc(page.keywords.join(", "))}" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" type="application/rss+xml" title="Ether-MOSH News + Updates" href="${ORIGIN}/news/feed.xml" />
    <meta property="og:type" content="${page.type}" /><meta property="og:site_name" content="Ether-MOSH" /><meta property="og:title" content="${esc(page.title)}" /><meta property="og:description" content="${esc(page.description)}" /><meta property="og:url" content="${canonical}" /><meta property="og:image" content="${image}" />
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(page.title)}" /><meta name="twitter:description" content="${esc(page.description)}" /><meta name="twitter:image" content="${image}" />
    <script type="application/ld+json">${JSON.stringify(page.jsonLd).replaceAll("<", "\\u003c")}</script>`;
  return template.replace(/\s*<title>[\s\S]*?<\/title>/, "").replace(/\s*<meta name="description"[^>]*>/, "").replace(/\s*<meta property="og:[^"]+"[^>]*>/g, "").replace(/\s*<meta name="twitter:[^"]+"[^>]*>/g, "").replace("</head>", `${tags}\n  </head>`).replace('<div id="root"></div>', `<div id="root"><noscript>${page.noscript}</noscript></div>`);
}

await Promise.all(pages.map(async page => { const dir = path.join(dist, page.route.slice(1)); await mkdir(dir, {recursive:true}); await writeFile(path.join(dir,"index.html"), render(page)); }));
const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>Ether-MOSH News + Updates</title><link>${ORIGIN}/news</link><description>Satirical, sourced effect and mode education with practical production guides from Ether-MOSH.</description><language>en-us</language><atom:link href="${ORIGIN}/news/feed.xml" rel="self" type="application/rss+xml"/>
${latestNewsArticles.map(a => `<item><title>${esc(a.title)}</title><link>${absolute(newsArticlePath(a))}</link><guid>${absolute(newsArticlePath(a))}</guid><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate><description>${esc(a.description)}</description></item>`).join("\n")}
</channel></rss>`;
await mkdir(path.join(dist, "news"), { recursive: true });
await writeFile(path.join(dist, "news", "feed.xml"), feed);
console.log(`Generated ${pages.length} crawlable news entry points.`);
