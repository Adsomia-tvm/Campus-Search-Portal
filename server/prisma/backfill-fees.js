/**
 * One-time migration script: backfill minFee/maxFee on all colleges.
 *
 * Run after deploying the schema migration that adds minFee/maxFee columns:
 *   node prisma/backfill-fees.js
 *
 * Safe to re-run — idempotent.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Backfilling minFee/maxFee for all colleges...');

  const colleges = await prisma.college.findMany({ select: { id: true, name: true } });
  let updated = 0;

  for (const college of colleges) {
    const agg = await prisma.course.aggregate({
      where: { collegeId: college.id, isActive: true, totalFee: { gt: 0 } },
      _min: { totalFee: true },
      _max: { totalFee: true },
    });

    await prisma.college.update({
      where: { id: college.id },
      data: {
        minFee: agg._min.totalFee || null,
        maxFee: agg._max.totalFee || null,
      },
    });
    updated++;
  }

  console.log(`Done. Updated ${updated} colleges.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
