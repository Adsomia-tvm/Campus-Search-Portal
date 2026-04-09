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
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://app.campussearch.in https://campussearch.in; " +
    "frame-ancestors 'none';"
  );
  next();
});

// ── CORS — allow localhost (dev) + production Vercel domain only ──────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4000',
  'http://localhost:3000',
  'https://app.campussearch.in',
  'https://campus-search-iota.vercel.app',
  'https://campus-search-website.vercel.app',
  'https://campussearch.in',
  'https://www.campussearch.in',
  ...(process.env.CLIENT_URL ? [process.env.CLIENT_URL] : []),
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server (no origin/null origin) and allowlisted origins only
    if (!origin || origin === 'null' || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use(limiter);

// ── Serve built React app (public/ folder) ────────────────────────────────────
const _distPath = process.env.DIST_PATH || _path.join(__dirname, '..', 'public');
app.use(express.static(_distPath));

// ── Public Routes ─────────────────────────────────────────────────────────────
app.use('/api/colleges',      require('./routes/public/colleges'));
app.use('/api/enquiries',     require('./routes/public/enquiries'));
app.use('/api/career-leads',  require('./routes/public/careerLeads'));
app.use('/api/categories',    require('./routes/public/categories'));
app.use('/api/student',       require('./routes/public/studentAuth'));

// ── Admin Routes (JWT protected) ──────────────────────────────────────────────
app.use('/api/auth',                require('./routes/admin/auth'));
app.use('/api/admin/dashboard',     require('./routes/admin/dashboard'));
app.use('/api/admin/students',      require('./routes/admin/students'));
app.use('/api/admin/enquiries',     require('./routes/admin/enquiries'));
app.use('/api/admin/colleges',      require('./routes/admin/colleges'));
app.use('/api/admin/commissions',   require('./routes/admin/commissions'));
app.use('/api/admin/reports',       require('./routes/admin/reports'));
app.use('/api/admin/import',        require('./routes/admin/import'));
app.use('/api/admin/users',         require('./routes/admin/users'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date(), env: process.env.NODE_ENV }));

// ── Dynamic sitemap.xml — includes every active college URL ──────────────────
app.get('/sitemap.xml', async (req, res) => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const BASE = 'https://campus-search-iota.vercel.app';
  const now = new Date().toISOString().split('T')[0];
  try {
    const colleges = await prisma.college.findMany({
      where: { isActive: true },
      select: { id: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
    const staticUrls = [
      { loc: `${BASE}/`,       priority: '1.0', changefreq: 'daily'   },
      { loc: `${BASE}/search`, priority: '0.9', changefreq: 'daily'   },
    ];
    const collegeUrls = colleges.map(c => ({
      loc: `${BASE}/college/${c.id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: c.updatedAt?.toISOString().split('T')[0] || now,
    }));
    const allUrls = [...staticUrls, ...collegeUrls];
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
  } finally {
    await prisma.$disconnect();
  }
});

// ── SPA fallback — send index.html for all non-API routes ───────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(_path.join(_distPath, 'index.html'));
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ── Start server (local only — Vercel handles this in serverless mode) ────────
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`🚀 Campus Search API running on port ${PORT}`));

  // Cache warm-up on local startup
  const { staticCache } = require('./cache');
  const { PrismaClient: PC2 } = require('@prisma/client');
  const _p = new PC2();
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
    finally { _p.$disconnect(); }
  }, 2000);
}

// ── Export for Vercel serverless ──────────────────────────────────────────────
module.exports = app;
