const router = require('express').Router();
const prisma = require('../../lib/prisma');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/admin/import/fees — upload Excel with transaction + dedup
router.post('/fees', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let imported = 0, skipped = 0, updated = 0;
    const errors = [];

    // ── Process in a transaction to ensure atomicity ─────────────────────────
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const [collegeName, courseName, category, degreeLevel, duration, quota,
               y1, y2, y3, y4, y5, total, hostel, notes] = row;

        // Skip header row and empty rows
        if (!collegeName || !courseName || typeof collegeName !== 'string') { skipped++; continue; }
        if (collegeName.toLowerCase().includes('college name'))              { skipped++; continue; }

        try {
          // Find or create college (case-insensitive match)
          let college = await tx.college.findFirst({
            where: { name: { equals: collegeName.trim(), mode: 'insensitive' } },
          });
          if (!college) {
            college = await tx.college.create({ data: { name: collegeName.trim() } });
          }

          const courseData = {
            name:        courseName?.toString().trim() || '',
            category:    category?.toString().trim() || null,
            degreeLevel: degreeLevel?.toString().trim() || null,
            durationYrs: duration ? parseFloat(duration) : null,
            quota:       quota?.toString().trim() || null,
            y1Fee:       num(y1), y2Fee: num(y2), y3Fee: num(y3),
            y4Fee:       num(y4), y5Fee: num(y5),
            totalFee:    num(total),
            hostelPerYr: num(hostel),
            notes:       notes?.toString().trim() || null,
          };

          // ── Dedup: check if this exact course exists for this college ─────
          const dedupWhere = {
            collegeId: college.id,
            name: { equals: courseData.name, mode: 'insensitive' },
          };
          // Only include category in dedup if it's not null (avoid matching all null categories)
          if (courseData.category) dedupWhere.category = courseData.category;

          const existing = await tx.course.findFirst({ where: dedupWhere });

          if (existing) {
            // Update existing course with new fee data
            await tx.course.update({ where: { id: existing.id }, data: courseData });
            updated++;
          } else {
            await tx.course.create({ data: { ...courseData, collegeId: college.id } });
            imported++;
          }
        } catch (rowErr) {
          errors.push({ row: i + 1, error: rowErr.message });
          skipped++;
        }
      }
    }, {
      timeout: 60000, // 60s for large imports
    });

    // ── Recalculate minFee/maxFee for all affected colleges ─────────────────
    try {
      const collegeIds = await prisma.course.groupBy({
        by: ['collegeId'],
        where: { isActive: true, totalFee: { gt: 0 } },
      });
      for (const { collegeId } of collegeIds) {
        const agg = await prisma.course.aggregate({
          where: { collegeId, isActive: true, totalFee: { gt: 0 } },
          _min: { totalFee: true },
          _max: { totalFee: true },
        });
        await prisma.college.update({
          where: { id: collegeId },
          data: { minFee: agg._min.totalFee || null, maxFee: agg._max.totalFee || null },
        });
      }
    } catch (e) {
      console.error('[import/fees] Fee recalc failed:', e.message);
    }

    res.json({
      message: 'Import complete',
      imported,
      updated,
      skipped,
      ...(errors.length ? { errors: errors.slice(0, 20) } : {}),
    });
  } catch (err) {
    next(err);
  }
});

function num(val) {
  if (!val) return null;
  const n = Number(val);
  return isNaN(n) || n === 0 ? null : n;
}

module.exports = router;
