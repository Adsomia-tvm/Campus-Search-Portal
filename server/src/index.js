require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const _path = require('path');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.disable('x-powered-by'); // Don't reveal Express
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://campussearch.in https://www.campussearch.in; " +
    "frame-ancestors 'none';",
  );
  next();
});

// ── CORS — allow localhost (dev) + production Vercel domain only ──────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4000',
  'http://localhost:3000',
  'https://campussearch.in',
  'https://www.campussearch.in',
  'https://app.campussearch.in',
  'https://campus-search-iota.vercel.app',
  'https://campus-search-website.vercel.app',
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server requests (no origin header, e.g. curl, Postman, SSR)
    // but REJECT the string "null" — that's an attacker using a sandboxed iframe
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));

// Performance middleware
const { responseTime } = require('./middleware/perf');
app.use(responseTime);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Rate limiting — global
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(limiter);

// Stricter rate limits on sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});
const enquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { error: 'Too many submissions from this IP. Try again later.' },
});

// ── Serve built React app (public/ folder) ────────────────────────────────────
const _distPath = process.env.DIST_PATH || _path.join(__dirname, '..', 'public');
app.use(express.static(_distPath));

// ── Public Routes ─────────────────────────────────────────────────────────────
app.use('/api/colleges',      require('./routes/public/colleges'));
app.use('/api/enquiries',     enquiryLimiter, require('./routes/public/enquiries'));
app.use('/api/whatsapp',     require('./routes/public/whatsapp'));
app.use('/api/razorpay',     require('./routes/public/razorpayWebhook'));
app.use('/api/career-leads',  enquiryLimiter, require('./routes/public/careerLeads'));
app.use('/api/categories',    require('./routes/public/categories'));
app.use('/api/student',       enquiryLimiter, require('./routes/public/studentAuth'));
app.use('/api/register',      authLimiter, require('./routes/public/register'));

// ── Student self-service routes (JWT protected) ──────────────────────────────
app.use('/api/student',       require('./routes/student/profile'));

// ── Agent self-service routes (JWT protected) ────────────────────────────────
app.use('/api/agent',         require('./routes/agent/dashboard'));

// ── College self-service portal (JWT protected) ─────────────────────────────
app.use('/api/college',       require('./routes/college/portal'));

// ── Admin Routes (JWT protected) ──────────────────────────────────────────────
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth',                require('./routes/admin/auth'));
app.use('/api/admin/dashboard',     require('./routes/admin/dashboard'));
app.use('/api/admin/students',      require('./routes/admin/students'));
app.use('/api/admin/enquiries',     require('./routes/admin/enquiries'));
app.use('/api/admin/colleges',      require('./routes/admin/colleges'));
app.use('/api/admin/commissions',   require('./routes/admin/commissions'));
app.use('/api/admin/payouts',       require('./routes/admin/payouts'));
app.use('/api/admin/notifications', require('./routes/admin/notifications'));
app.use('/api/admin/analytics',     require('./routes/admin/analytics'));
app.use('/api/admin/leads',         require('./routes/admin/leads'));
app.use('/api/admin/reports',       require('./routes/admin/reports'));
app.use('/api/admin/import',        require('./routes/admin/import'));
app.use('/api/admin/users',         require('./routes/admin/users'));
app.use('/api/admin/tiers',         require('./routes/admin/tiers'));
app.use('/api/admin/bulk',          require('./routes/admin/bulk'));
app.use('/api/admin/audit',         require('./routes/admin/audit'));
app.use('/api/admin/settings',      require('./routes/admin/settings'));
app.use('/api/admin/payments',      require('./routes/admin/payments'));
app.use('/api/admin/crm',           require('./routes/admin/crm'));

// ── Health check (safe for production — no env/db details leaked) ────────────
// ── Cron: follow-up reminders (called by Vercel Cron or external scheduler) ──
app.get('/api/cron/follow-ups', async (req, res) => {
  // Simple auth: check cron secret or admin token
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { processFollowUpReminders } = require('./lib/notify');
    const count = await processFollowUpReminders();
    res.json({ ok: true, reminders: count, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const prisma = require('./lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL;
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      ...(!isProd && { db: 'connected', env: process.env.NODE_ENV }),
    });
  } catch (err) {
    res.status(503).json({ status: 'error', time: new Date().toISOString() });
  }
});

// ── Dynamic sitemap.xml — includes every active college URL ──────────────────
app.get('/sitemap.xml', async (req, res) => {
  const prisma = require('./lib/prisma');
  const BASE = process.env.PORTAL_URL || 'https://campussearch.in';
  const now = new Date().toISOString().split('T')[0];
  try {
    const colleges = await prisma.college.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, citySlug: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    const staticUrls = [
      { loc: `${BASE}/`,       priority: '1.0', changefreq: 'daily'   },
      { loc: `${BASE}/search`, priority: '0.9', changefreq: 'daily'   },
    ];

    // College detail pages — use slug URLs where available, fall back to /college/:id
    const collegeUrls = colleges.map(c => ({
      loc: c.slug && c.citySlug
        ? `${BASE}/colleges/${c.citySlug}/${c.slug}`
        : `${BASE}/college/${c.id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: c.updatedAt?.toISOString().split('T')[0] || now,
    }));

    // City landing pages
    const citySlugs = [...new Set(colleges.filter(c => c.citySlug).map(c => c.citySlug))];
    const cityUrls = citySlugs.map(cs => ({
      loc: `${BASE}/colleges/${cs}`,
      priority: '0.7',
      changefreq: 'weekly',
      lastmod: now,
    }));

    const allUrls = [...staticUrls, ...cityUrls, ...collegeUrls];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : `<lastmod>${now}</lastmod>`}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (e) {
    console.error('Sitemap error:', e.message);
    res.status(500).send('Sitemap generation failed');
  }
});

// ── API 404 catch-all — return JSON for unknown API routes ──────────────────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── SEO: Server-side meta injection for college & city pages ────────────────
const _fs = require('fs');
let _indexHtml = null;
function getIndexHtml() {
  if (!_indexHtml) {
    try { _indexHtml = _fs.readFileSync(_path.join(_distPath, 'index.html'), 'utf8'); }
    catch { _indexHtml = ''; }
  }
  return _indexHtml;
}

// Helper to inject meta tags into index.html for bots
function injectMeta(html, { title, description, canonical, ogImage }) {
  if (!html || !html.includes('<html')) return null; // Return null if HTML is empty/invalid
  const BASE = 'https://campussearch.in';
  const img = ogImage || `${BASE}/og-image.png`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}" />`);
  html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`);
  html = html.replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${img}"`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}" />`);
  return html;
}

// Helper: send page with injected meta, fallback to sendFile if injection fails
function sendWithMeta(res, meta) {
  const html = injectMeta(getIndexHtml(), meta);
  if (html) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
  // Fallback: serve regular index.html (React client-side handles meta)
  return res.sendFile(_path.join(_distPath, 'index.html'));
}

// College detail page by slug: /colleges/:citySlug/:slug
app.get('/colleges/:citySlug/:slug', async (req, res) => {
  const prisma = require('./lib/prisma');
  const BASE = 'https://campussearch.in';
  try {
    const college = await prisma.college.findFirst({
      where: { slug: req.params.slug, citySlug: req.params.citySlug, isActive: true },
      select: { id: true, name: true, city: true, state: true, minFee: true, maxFee: true, slug: true, citySlug: true, metaTitle: true, metaDescription: true,
        courses: { where: { isActive: true }, select: { category: true }, take: 5 } },
    });
    if (!college) return res.sendFile(_path.join(_distPath, 'index.html'));
    const cats = [...new Set(college.courses.map(c => c.category).filter(Boolean))].slice(0, 3).join(', ');
    const feeStr = college.minFee ? `Fees from ₹${college.minFee.toLocaleString('en-IN')}` : '';
    const title = college.metaTitle || `${college.name} — ${feeStr || 'Courses'} & Fees 2026-27 | ${college.city || 'South India'}`;
    const desc = college.metaDescription || `${college.name}${college.city ? ` in ${college.city}` : ''} — ${cats || 'courses'} available. ${feeStr}. Compare fees, get free counselling. Updated 2026-27.`;
    const canonical = `${BASE}/colleges/${college.citySlug}/${college.slug}`;
    sendWithMeta(res, { title: title.slice(0, 70), description: desc.slice(0, 160), canonical });
  } catch (e) {
    res.sendFile(_path.join(_distPath, 'index.html'));
  }
});

// City landing page: /colleges/:citySlug
app.get('/colleges/:citySlug', async (req, res) => {
  const BASE = 'https://campussearch.in';
  const cityName = req.params.citySlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const title = `Colleges in ${cityName} — Fees, Courses & Admission 2026-27 | Campus Search`;
  const desc = `Browse all colleges in ${cityName}. Compare fees, courses, and get free counselling. Nursing, Engineering, Medical & more.`;
  const canonical = `${BASE}/colleges/${req.params.citySlug}`;
  sendWithMeta(res, { title: title.slice(0, 70), description: desc.slice(0, 160), canonical });
});

// Old college URL redirect: /college/:id -> /colleges/:citySlug/:slug (301)
app.get('/college/:id', async (req, res) => {
  const prisma = require('./lib/prisma');
  try {
    const id = Number(req.params.id);
    if (id) {
      const college = await prisma.college.findUnique({ where: { id }, select: { slug: true, citySlug: true } });
      if (college?.slug && college?.citySlug) {
        return res.redirect(301, `/colleges/${college.citySlug}/${college.slug}`);
      }
    }
  } catch { /* slug lookup failed — fall through to SPA */ }
  // Fallback — serve SPA for colleges without slugs yet
  res.sendFile(_path.join(_distPath, 'index.html'));
});

// ── 410 Gone — old Laravel URLs that Google still crawls ─────────────────────
// GSC shows 1,007 "Crawled — currently not indexed" URLs from the old site.
// Returning 410 tells Google these are permanently removed → stop crawling them.
const GONE_PATTERNS = [
  '/course/details',        // /course/details/626/bba  (826 URLs)
  '/public/index.php',      // /public/index.php/...     (496 URLs)
  '/public/course',         // /public/course/type/12    (223 URLs)
  '/master/course',         // /master/course/details/10 (36 URLs)
  '/public/master',         // /public/master/...        (28 URLs)
  '/public/university',     // /public/university/...    (16 URLs)
  '/college/details',       // /college/details/150      (14 URLs)
  '/public/college',        // /public/college/details/  (14 URLs)
  '/trending/course',       // /trending/course?page=7   (6 URLs)
  '/university/details',    // /university/details/3     (3 URLs)
  '/course/type',           // /course/type/3            (3 URLs)
  '/public/all',            // /public/all/universities  (2 URLs)
  '/public/login',
  '/public/about',
  '/public/contact',
  '/public/blog',
  '/public/fetch-course-names',
  '/public/get-wishlist-property',
  '/get-wishlist-property',
  '/upload/brocher',
  '/blog/details',
];

app.use((req, res, next) => {
  const p = req.path;
  // Also catch college slugs with "null" in them (bad old data)
  if (p.includes('null--')) {
    return res.status(410).send('<!DOCTYPE html><html><head><title>410 Gone</title></head><body><h1>410 Gone</h1><p>This page has been permanently removed.</p><p><a href="https://campussearch.in">Go to Campus Search</a></p></body></html>');
  }
  for (const pattern of GONE_PATTERNS) {
    if (p.startsWith(pattern)) {
      return res.status(410).send('<!DOCTYPE html><html><head><title>410 Gone</title></head><body><h1>410 Gone</h1><p>This page has been permanently removed.</p><p><a href="https://campussearch.in">Go to Campus Search</a></p></body></html>');
    }
  }
  next();
});

// ── SPA fallback — send index.html for all non-API routes ───────────────────
app.get('*', (req, res) => {
  res.sendFile(_path.join(_distPath, 'index.html'));
});

// ── Centralized error handler (MUST be last middleware) ──────────────────────
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// ── Start server (local only — Vercel handles this in serverless mode) ────────
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`🚀 Campus Search API running on port ${PORT}`));

  // Follow-up reminder cron — runs every hour
  const { processFollowUpReminders } = require('./lib/notify');
  setInterval(async () => {
    try {
      const count = await processFollowUpReminders();
      if (count > 0) console.log(`⏰ Sent ${count} follow-up reminders`);
    } catch (e) { console.warn('Follow-up reminder failed:', e.message); }
  }, 60 * 60 * 1000); // every 1 hour

  // Cache warm-up on local startup
  const { staticCache } = require('./cache');
  const _p = require('./lib/prisma');
  setTimeout(async () => {
    try {
      const [cities, cats] = await Promise.all([
        _p.college.groupBy({ by:['city'], where:{isActive:true,city:{not:null}}, _count:{id:true}, orderBy:{_count:{id:'desc'}} }),
        _p.course.groupBy({ by:['category'], where:{isActive:true,category:{not:null}}, _count:{id:true}, orderBy:{_count:{id:'desc'}} }),
      ]);
      staticCache.set('cities', cities.map(c=>({city:c.city,count:c._count.id})));
      staticCache.set('categories', cats.map(c=>({category:c.category,count:c._count.id})));
      console.log(`🗂️  Cache warmed: ${cities.length} cities, ${cats.length} categories`);
    } catch(e) { console.warn('Cache warmup failed:', e.message); }
  }, 2000);
}

// ── Export for Vercel serverless ──────────────────────────────────────────────
module.exports = app;
