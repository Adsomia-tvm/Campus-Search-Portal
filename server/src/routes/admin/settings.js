const router = require('express').Router();
const prisma = require('../../lib/prisma');
const { requireAdmin } = require('../../middleware/auth');
const { logAudit, getIp } = require('../../lib/audit');
const { clearCache } = require('../../lib/settings');

router.use(requireAdmin);

// ── GET /api/admin/settings — all settings, grouped by category ─────────────
router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const where = category ? { category } : {};

    const settings = await prisma.systemSetting.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    // Group by category
    const grouped = {};
    for (const s of settings) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push({
        id: s.id,
        key: s.key,
        value: s.value,
        label: s.label,
        description: s.description,
        updatedAt: s.updatedAt,
      });
    }

    res.json({ settings: grouped, total: settings.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/settings/:key — single setting by key ────────────────────
router.get('/:key(*)', async (req, res, next) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: req.params.key },
    });
    if (!setting) return res.status(404).json({ error: 'Setting not found' });
    res.json(setting);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/settings/:key — update a single setting ──────────────────
router.put('/:key(*)', async (req, res, next) => {
  try {
    const { value } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }

    const existing = await prisma.systemSetting.findUnique({
      where: { key: req.params.key },
    });
    if (!existing) return res.status(404).json({ error: 'Setting not found' });

    const setting = await prisma.systemSetting.update({
      where: { key: req.params.key },
      data: {
        value: String(value),
        updatedBy: req.user.id,
      },
    });

    clearCache();

    logAudit({
      userId: req.user.id,
      action: 'setting_update',
      entity: 'system_setting',
      entityId: setting.id,
      details: { key: setting.key, oldValue: existing.value, newValue: setting.value },
      ipAddress: getIp(req),
    });

    res.json(setting);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/admin/settings — batch update multiple settings ────────────────
router.put('/', async (req, res, next) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object required: { "key": "value", ... }' });
    }

    const keys = Object.keys(settings);
    if (!keys.length) return res.status(400).json({ error: 'No settings to update' });
    if (keys.length > 50) return res.status(400).json({ error: 'Maximum 50 settings per batch' });

    // Verify all keys exist
    const existing = await prisma.systemSetting.findMany({
      where: { key: { in: keys } },
    });
    const existingMap = Object.fromEntries(existing.map(s => [s.key, s]));
    const invalid = keys.filter(k => !existingMap[k]);
    if (invalid.length) {
      return res.status(400).json({ error: `Unknown settings: ${invalid.join(', ')}` });
    }

    // Batch update in transaction
    const updates = keys.map(key =>
      prisma.systemSetting.update({
        where: { key },
        data: { value: String(settings[key]), updatedBy: req.user.id },
      }),
    );
    const results = await prisma.$transaction(updates);

    clearCache();

    logAudit({
      userId: req.user.id,
      action: 'setting_batch_update',
      entity: 'system_setting',
      details: {
        count: keys.length,
        changes: keys.map(k => ({
          key: k,
          old: existingMap[k].value,
          new: String(settings[k]),
        })),
      },
      ipAddress: getIp(req),
    });

    res.json({ updated: results.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/settings — create a new setting ─────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { key, value, label, category, description } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key and value are required' });
    }

    // Check if key already exists
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (existing) {
      return res.status(409).json({ error: 'Setting with this key already exists' });
    }

    const setting = await prisma.systemSetting.create({
      data: {
        key,
        value: String(value),
        label: label || key,
        category: category || 'general',
        description: description || null,
        updatedBy: req.user.id,
      },
    });

    logAudit({
      userId: req.user.id,
      action: 'setting_create',
      entity: 'system_setting',
      entityId: setting.id,
      details: { key, value: setting.value, category: setting.category },
      ipAddress: getIp(req),
    });

    res.status(201).json(setting);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
