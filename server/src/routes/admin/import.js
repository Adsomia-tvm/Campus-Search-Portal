const router = require('express').Router();
const prisma = require('../../lib/prisma');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAdmin } = require('../../middleware/auth');

router.use(requireAdmin);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/admin/import/fees — upload Excel
router.post('/fees', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    let imported = 0, skipped = 0;

    for (const row of rows) {
      const [collegeName, courseName, category, degreeLevel, duration, quota,
             y1, y2, y3, y4, y5, total, hostel, notes] = row;

      if (!collegeName || !courseName || typeof collegeName !== 'string') { skipped++; continue; }
      if (collegeName.toLowerCase().includes('college name'))              { skipped++; continue; }

      // Find or create college
      let college = await prisma.college.findFirst({ where: { name: { equals: collegeName.trim(), mode: 'insensitive' } } });
      if (!college) {
        college = await prisma.college.create({ data: { name: collegeName.trim() } });
      }

      // Create course
      await prisma.course.create({
        data: {
          collegeId:   college.id,
          name:        courseName?.toString().trim() || '',
          category:    category?.toString().trim() || null,
          degreeLevel: degreeLevel?.toString().trim() || null,
          durationYrs: duration ? parseFloat(duration) : null,
          quota:       quota?.toString().trim() || null,
          y1Fee:       num(y1), y2Fee: num(y2), y3Fee: num(y3), y4Fee: num(y4), y5Fee: num(y5),
          totalFee:    num(total),
          hostelPerYr: num(hostel),
          notes:       notes?.toString().trim() || null,
        },
      });
      imported++;
    }

    res.json({ message: 'Import complete', imported, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function num(val) {
  if (!val) return null;
  const n = Number(val);
  return isNaN(n) || n === 0 ? null : n;
}

module.exports = router;
