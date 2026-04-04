/**
 * build-blog.mjs
 * Fetches all Substack articles via API and generates static HTML blog pages.
 * Zero dependencies — requires Node 20+ (native fetch).
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG_DIR = join(ROOT, 'blog');

const SITE_URL = 'https://jeudeprompts.fr';
const SUBSTACK_API = 'https://jeudeprompts.substack.com/api/v1/posts';
const FALLBACK_IMAGE = `${SITE_URL}/Marc.png`;

// ── Fetch all posts via Substack API ───────────────────────────────

async function fetchAllPosts() {
    const all = [];
    let offset = 0;
    const limit = 50;

    while (true) {
        const url = `${SUBSTACK_API}?limit=${limit}&offset=${offset}&_t=${Date.now()}`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'JeuDePrompts-BlogSync/1.0',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
            }
        });
        if (!res.ok) throw new Error(`API fetch failed: ${res.status} ${res.statusText} for ${url}`);
        const posts = await res.json();
        if (posts.length === 0) break;
        all.push(...posts);
        if (posts.length < limit) break;
        offset += limit;
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.post_date) - new Date(a.post_date));

    return all.map(post => ({
        title: post.title || '',
        slug: post.slug || '',
        pubDate: post.post_date || '',
        description: post.description || '',
        content: post.body_html || '',
        enclosure: post.cover_image || '',
    }));
}

// ── Content Processing ─────────────────────────────────────────────

function processContent(html) {
    return html
        // Strip Substack subscription widgets
        .replace(/<div[^>]*class="[^"]*subscription-widget[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi, '')
        // Strip script tags
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        // Rewrite internal Substack links to local blog
        .replace(/https:\/\/jeudeprompts\.substack\.com\/p\/([a-z0-9-]+)/gi, (_, slug) => `${slug}.html`);
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toISO(dateStr) {
    return new Date(dateStr).toISOString();
}

function truncate(str, len) {
    const clean = str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return clean.length > len ? clean.slice(0, len) + '…' : clean;
}

// ── HTML Templates ─────────────────────────────────────────────────

function articlePage(item, prev, next) {
    const image = item.enclosure || FALLBACK_IMAGE;
    const desc = escapeHtml(truncate(item.description || item.content, 160));
    const titleEsc = escapeHtml(item.title);
    const contentHtml = processContent(item.content);

    const prevLink = prev
        ? `<a href="${prev.slug}.html" class="flex-1 group flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all no-underline">
                <span class="text-xl text-slate-300 group-hover:text-indigo-500 transition-colors">&larr;</span>
                <div class="min-w-0">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pr&eacute;c&eacute;dent</p>
                    <p class="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors truncate">${escapeHtml(prev.title)}</p>
                </div>
            </a>`
        : '<div class="flex-1"></div>';

    const nextLink = next
        ? `<a href="${next.slug}.html" class="flex-1 group flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all no-underline text-right">
                <div class="min-w-0 flex-1">
                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Suivant</p>
                    <p class="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors truncate">${escapeHtml(next.title)}</p>
                </div>
                <span class="text-xl text-slate-300 group-hover:text-indigo-500 transition-colors">&rarr;</span>
            </a>`
        : '<div class="flex-1"></div>';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titleEsc} &mdash; Jeu de Prompts</title>
    <meta name="description" content="${desc}">
    <link rel="icon" type="image/png" href="../Logo Jeu de Prompts.png">
    <link rel="canonical" href="${SITE_URL}/blog/${item.slug}.html">
    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${SITE_URL}/blog/${item.slug}.html">
    <meta property="og:title" content="${titleEsc}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${image}">
    <meta property="og:locale" content="fr_FR">
    <meta property="og:site_name" content="Jeu de Prompts">
    <meta property="article:published_time" content="${toISO(item.pubDate)}">
    <meta property="article:author" content="Marc ASSI">
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${titleEsc}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${image}">
    <!-- Styles -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../style.css">
    <style>::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#a5b4fc;border-radius:10px}::-webkit-scrollbar-thumb:hover{background:#6366f1}::-webkit-scrollbar-track{background:#f1f5f9;border-radius:10px}html{scrollbar-width:auto;scrollbar-color:#a5b4fc #f1f5f9}</style>
    <!-- Analytics -->
    <script defer src="https://cloud.umami.is/script.js" data-website-id="a8cd9e80-8934-45bf-8a9f-154577b95f8e"></script>
    <!-- Structured Data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": "${titleEsc}",
        "description": "${desc}",
        "image": "${image}",
        "datePublished": "${toISO(item.pubDate)}",
        "dateModified": "${toISO(item.pubDate)}",
        "author": {
            "@type": "Person",
            "name": "Marc ASSI",
            "url": "${SITE_URL}"
        },
        "publisher": {
            "@type": "Organization",
            "name": "Jeu de Prompts",
            "logo": {
                "@type": "ImageObject",
                "url": "${SITE_URL}/Logo%20Jeu%20de%20Prompts.png"
            }
        },
        "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": "${SITE_URL}/blog/${item.slug}.html"
        }
    }
    </script>
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "${SITE_URL}/" },
            { "@type": "ListItem", "position": 2, "name": "Blog", "item": "${SITE_URL}/blog/" },
            { "@type": "ListItem", "position": 3, "name": "${titleEsc}" }
        ]
    }
    </script>
</head>
<body class="bg-slate-50/50 min-h-screen text-slate-800">
    <header class="bg-white border-b px-6 py-4 flex items-center justify-between">
        <a href="../index.html" class="flex items-center gap-3 hover:opacity-80 transition-opacity no-underline">
            <img src="../Logo Jeu de Prompts.png" alt="Logo" class="h-10 w-auto">
            <span class="font-black text-slate-900 text-lg tracking-tighter">JEU DE <span class="text-indigo-600">PROMPTS</span></span>
        </a>
        <a href="index.html" class="text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors no-underline">&larr; Tous les articles</a>
    </header>

    <main class="max-w-3xl mx-auto px-6 py-12">
        <!-- Fil d'Ariane -->
        <nav aria-label="Breadcrumb" class="mb-8 text-xs font-medium text-slate-400">
            <ol class="flex items-center gap-1.5 flex-wrap">
                <li><a href="../index.html" class="hover:text-indigo-600 transition-colors no-underline">Accueil</a></li>
                <li class="select-none">/</li>
                <li><a href="index.html" class="hover:text-indigo-600 transition-colors no-underline">Blog</a></li>
                <li class="select-none">/</li>
                <li class="text-slate-600 font-bold truncate max-w-[250px]">${item.title}</li>
            </ol>
        </nav>

        <article>
            <div class="mb-8">
                <p class="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">${formatDate(item.pubDate)}</p>
                <h1 class="text-3xl font-black text-slate-900 tracking-tight leading-tight">${item.title}</h1>
                <p class="text-sm text-slate-500 mt-3">Par Marc ASSI</p>
            </div>

            <div class="lesson-content">
                ${contentHtml}
            </div>
        </article>

        <!-- Navigation Précédent / Suivant -->
        <div class="flex gap-4 mt-12">
            ${prevLink}
            ${nextLink}
        </div>

        <div class="mt-8 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 text-center">
            <p class="font-black text-slate-900 mb-1">Envie de recevoir les prochains articles ?</p>
            <p class="text-sm text-slate-500 mb-4">Rejoins la newsletter Jeu de Prompts</p>
            <a href="https://jeudeprompts.substack.com/" target="_blank" rel="noopener"
               class="inline-block bg-indigo-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-indigo-700 transition-all no-underline">
                S'abonner gratuitement
            </a>
        </div>
    </main>

    <footer class="py-8 text-center border-t border-slate-100 mt-12">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">&copy; 2026 Jeu de Prompts, Marc ASSI</p>
    </footer>
</body>
</html>`;
}

function indexPage(items) {
    const cards = items.map(item => {
        const image = item.enclosure || FALLBACK_IMAGE;
        const desc = truncate(item.description || item.content, 140);
        return `
                <a href="${item.slug}.html" class="group bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all no-underline">
                    <div class="aspect-[16/9] overflow-hidden bg-slate-100">
                        <img src="${image}" alt="${escapeHtml(item.title)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                    </div>
                    <div class="p-5">
                        <p class="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">${formatDate(item.pubDate)}</p>
                        <h2 class="text-lg font-black text-slate-900 tracking-tight leading-snug mb-2 group-hover:text-indigo-600 transition-colors">${item.title}</h2>
                        <p class="text-sm text-slate-500 leading-relaxed">${escapeHtml(desc)}</p>
                    </div>
                </a>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog &mdash; Jeu de Prompts</title>
    <meta name="description" content="Articles, tutoriels et retours d'exp&eacute;rience sur l'IA pour les formateurs ind&eacute;pendants. Par Marc ASSI.">
    <link rel="icon" type="image/png" href="../Logo Jeu de Prompts.png">
    <link rel="canonical" href="${SITE_URL}/blog/">
    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${SITE_URL}/blog/">
    <meta property="og:title" content="Blog &mdash; Jeu de Prompts">
    <meta property="og:description" content="Articles, tutoriels et retours d'exp&eacute;rience sur l'IA pour les formateurs ind&eacute;pendants.">
    <meta property="og:image" content="${SITE_URL}/Marc.png">
    <meta property="og:locale" content="fr_FR">
    <meta property="og:site_name" content="Jeu de Prompts">
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Blog &mdash; Jeu de Prompts">
    <meta name="twitter:description" content="Articles et tutoriels IA pour formateurs ind&eacute;pendants.">
    <meta name="twitter:image" content="${SITE_URL}/Marc.png">
    <!-- Styles -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../style.css">
    <style>::-webkit-scrollbar{width:8px}::-webkit-scrollbar-thumb{background:#a5b4fc;border-radius:10px}::-webkit-scrollbar-thumb:hover{background:#6366f1}::-webkit-scrollbar-track{background:#f1f5f9;border-radius:10px}html{scrollbar-width:auto;scrollbar-color:#a5b4fc #f1f5f9}</style>
    <!-- Analytics -->
    <script defer src="https://cloud.umami.is/script.js" data-website-id="a8cd9e80-8934-45bf-8a9f-154577b95f8e"></script>
    <!-- Structured Data -->
    <script type="application/ld+json">
    {
        "@context": "https://schema.org",
        "@type": "Blog",
        "name": "Blog Jeu de Prompts",
        "url": "${SITE_URL}/blog/",
        "description": "Articles, tutoriels et retours d'exp\u00e9rience sur l'IA pour les formateurs ind\u00e9pendants.",
        "author": {
            "@type": "Person",
            "name": "Marc ASSI",
            "url": "${SITE_URL}"
        },
        "blogPost": [${items.map(i => `
            {
                "@type": "BlogPosting",
                "headline": "${escapeHtml(i.title)}",
                "url": "${SITE_URL}/blog/${i.slug}.html",
                "datePublished": "${toISO(i.pubDate)}"
            }`).join(',')}
        ]
    }
    </script>
</head>
<body class="bg-slate-50/50 min-h-screen text-slate-800">
    <header class="bg-white border-b px-6 py-4 flex items-center justify-between">
        <a href="../index.html" class="flex items-center gap-3 hover:opacity-80 transition-opacity no-underline">
            <img src="../Logo Jeu de Prompts.png" alt="Logo" class="h-10 w-auto">
            <span class="font-black text-slate-900 text-lg tracking-tighter">JEU DE <span class="text-indigo-600">PROMPTS</span></span>
        </a>
        <a href="../index.html" class="text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors no-underline">Retour au site</a>
    </header>

    <main class="max-w-5xl mx-auto px-6 py-12">
        <div class="text-center mb-12">
            <h1 class="text-3xl font-black text-slate-900 tracking-tight">Blog</h1>
            <p class="text-sm text-slate-500 mt-2">Articles, tutoriels et retours d'exp&eacute;rience sur l'IA pour formateurs</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
${cards}
        </div>
    </main>

    <footer class="py-8 text-center border-t border-slate-100 mt-12">
        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">&copy; 2026 Jeu de Prompts, Marc ASSI</p>
    </footer>
</body>
</html>`;
}

// ── Sitemap ────────────────────────────────────────────────────────

function generateSitemap(items) {
    const blogEntries = items.map(item => `    <url>
        <loc>${SITE_URL}/blog/${item.slug}.html</loc>
        <lastmod>${toISO(item.pubDate).split('T')[0]}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.7</priority>
    </url>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${SITE_URL}/index.html</loc>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${SITE_URL}/legal.html</loc>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
    </url>
    <url>
        <loc>${SITE_URL}/blog/index.html</loc>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>
${blogEntries}
</urlset>`;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
    console.log('Fetching Substack articles via API…');
    const items = await fetchAllPosts();
    console.log(`Found ${items.length} articles.`);

    if (items.length === 0) {
        console.log('No articles found, skipping generation.');
        return;
    }

    // Ensure blog directory exists
    if (!existsSync(BLOG_DIR)) mkdirSync(BLOG_DIR, { recursive: true });

    // Generate article pages (with prev/next navigation)
    for (let i = 0; i < items.length; i++) {
        const prev = i > 0 ? items[i - 1] : null;
        const next = i < items.length - 1 ? items[i + 1] : null;
        const html = articlePage(items[i], prev, next);
        const path = join(BLOG_DIR, `${items[i].slug}.html`);
        writeFileSync(path, html, 'utf-8');
        console.log(`  → blog/${items[i].slug}.html`);
    }

    // Generate index
    const index = indexPage(items);
    writeFileSync(join(BLOG_DIR, 'index.html'), index, 'utf-8');
    console.log('  → blog/index.html');

    // Regenerate sitemap
    const sitemap = generateSitemap(items);
    writeFileSync(join(ROOT, 'sitemap.xml'), sitemap, 'utf-8');
    console.log('  → sitemap.xml');

    console.log('Done!');
}

main().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
