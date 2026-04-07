require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const path = require('path');
const prisma = new PrismaClient();

const EXCEL_PATH = process.env.FEES_EXCEL_PATH || path.join(__dirname, '../../CampusSearch_Fees_2026-27.xlsx');

function cleanStr(val) { if (!val) return null; const s = val.toString().trim(); return (s===''||s==='—'||s==='-') ? null : s; }
function toInt(val) { if (!val) return null; const n = parseInt(val); return (isNaN(n)||n===0) ? null : n; }
function toFloat(val) { if (!val) return null; const n = parseFloat(val); return isNaN(n) ? null : n; }
function extractCity(name) {
  const m = name.match(/\(([^)]+)\)\s*$/) || name.match(/,\s*([^,]+)\s*$/);
  if (!m) return null;
  const p = m[1].trim();
  const known = ['bangalore','bengaluru','mysore','mysuru','tumkur','mangalore','mangaluru','hubli','dharwad','udupi','manipal','calicut','kozhikode','coimbatore','chennai','hyderabad','nelamangala','yelahanka'];
  return known.some(c => p.toLowerCase().includes(c)) ? p : null;
}

async function main() {
  console.log('🌱 Campus Search Fast Batch Seeder');
  console.log('📄 Reading:', EXCEL_PATH);

  const existing = await prisma.user.findUnique({ where: { email: 'md@adsomia.com' } });
  if (!existing) {
    await prisma.user.create({ data: { name: 'Hassan Rawther', email: 'md@adsomia.com', passwordHash: await bcrypt.hash('CampusSearch@2026', 12), role: 'admin', phone: '' } });
    console.log('✅ Admin user created');
  } else {
    console.log('✅ Admin user already exists');
  }

  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets['💰 Fees Data'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`📊 Excel rows: ${rows.length}`);

  const collegeMap = new Map();
  const validRows = [];
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    const [collegeName, courseName, category, degreeLevel, duration, quota, y1, y2, y3, y4, y5, total, hostel, notes] = row;
    if (!collegeName || typeof collegeName !== 'string') continue;
    const name = collegeName.trim();
    if (!name || name.toLowerCase().includes('college name') || name.startsWith('✅') || name.startsWith('📋')) continue;
    if (!collegeMap.has(name.toLowerCase())) collegeMap.set(name.toLowerCase(), { name, city: extractCity(name) });
    validRows.push({ name, courseName, category, degreeLevel, duration, quota, y1, y2, y3, y4, y5, total, hostel, notes });
  }

  console.log(`🏫 Unique colleges: ${collegeMap.size}, 📚 Course rows: ${validRows.length}`);

  await prisma.college.createMany({ data: Array.from(collegeMap.values()).map(c => ({ name: c.name, city: c.city, isActive: true })), skipDuplicates: true });

  const allColleges = await prisma.college.findMany({ select: { id: true, name: true } });
  const idMap = new Map(allColleges.map(c => [c.name.toLowerCase(), c.id]));
  console.log(`✅ ${allColleges.length} colleges in DB`);

  const courseData = validRows.map(r => ({ collegeId: idMap.get(r.name.toLowerCase()), name: r.courseName?.toString().trim() || 'Course', category: cleanStr(r.category), degreeLevel: cleanStr(r.degreeLevel), durationYrs: toFloat(r.duration), quota: cleanStr(r.quota), y1Fee: toInt(r.y1), y2Fee: toInt(r.y2), y3Fee: toInt(r.y3), y4Fee: toInt(r.y4), y5Fee: toInt(r.y5), totalFee: toInt(r.total), hostelPerYr: toInt(r.hostel), notes: cleanStr(r.notes), isActive: true })).filter(r => r.collegeId);

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < courseData.length; i += CHUNK) {
    await prisma.course.createMany({ data: courseData.slice(i, i + CHUNK), skipDuplicates: true });
    inserted += Math.min(CHUNK, courseData.length - i);
    console.log(`  → ${inserted}/${courseData.length} courses inserted`);
  }

  console.log('\n🎉 Done! Colleges:', allColleges.length, '| Courses:', inserted);
  console.log('🔐 Login: md@adsomia.com / CampusSearch@2026');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
