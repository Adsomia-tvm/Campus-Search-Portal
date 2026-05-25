#!/usr/bin/env node
/**
 * Fix-up: migrate enquiries + commissions from OLD → NEW with FK remapping.
 *
 * Why this is separate from migrate-from-old-db.js:
 *   OLD and NEW DBs both have colleges + courses tables but the IDs DON'T
 *   match (NEW was reseeded). So enquiries that reference OLD's collegeId=47
 *   can't be inserted into NEW where collegeId=47 is a different college.
 *
 * Strategy:
 *   1. Build an OLD→NEW remap by matching college NAMES (and course names).
 *   2. For each enquiry, remap collegeId/courseId. Where no match exists,
 *      set to NULL (preserves the lead's contact info — only the college
 *      relation is lost).
 *   3. Insert row-by-row with try/catch so one bad row doesn't fail the
 *      whole batch.
 *   4. After enquiries succeed, retry commissions (which FK to enquiries).
 *
 * Usage:
 *   OLD_DATABASE_URL='…' NEW_DATABASE_URL='…' node scripts/migrate-enquiries-fixup.js
 *
 * Safe to re-run — ON CONFLICT DO NOTHING on id.
 */

const { Client } = require('pg');

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;

if (!OLD_URL || !NEW_URL) {
  console.error('Set OLD_DATABASE_URL and NEW_DATABASE_URL');
  process.exit(1);
}

async function getColumns(client, table) {
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.map(r => r.column_name);
}

// Build OLD id → NEW id map for a table that has a `name` column.
async function buildRemap(oldClient, newClient, table) {
  const [oldRows, newRows] = await Promise.all([
    oldClient.query(`SELECT id, name FROM "${table}" WHERE name IS NOT NULL`),
    newClient.query(`SELECT id, name FROM "${table}" WHERE name IS NOT NULL`),
  ]);
  const byName = new Map();
  newRows.rows.forEach(r => byName.set(r.name.trim().toLowerCase(), r.id));
  const remap = new Map();
  let matched = 0, missed = 0;
  oldRows.rows.forEach(r => {
    const newId = byName.get(r.name.trim().toLowerCase());
    if (newId != null) { remap.set(r.id, newId); matched++; }
    else missed++;
  });
  console.log(`  ${table} remap: ${matched} matched / ${missed} unmapped (${oldRows.rows.length} OLD, ${newRows.rows.length} NEW)`);
  return remap;
}

// Build OLD courseId → NEW courseId. Course rows have BOTH name and collegeId,
// so we need to remap via (collegeName, courseName) tuples — not just name —
// because the same course name appears under many colleges.
async function buildCourseRemap(oldClient, newClient, collegeRemap) {
  const [oldRows, newRows] = await Promise.all([
    oldClient.query(`
      SELECT c.id, c."collegeId", c.name, col.name AS "collegeName"
      FROM "courses" c
      LEFT JOIN "colleges" col ON col.id = c."collegeId"
    `),
    newClient.query(`
      SELECT c.id, c."collegeId", c.name, col.name AS "collegeName"
      FROM "courses" c
      LEFT JOIN "colleges" col ON col.id = c."collegeId"
    `),
  ]);
  const byKey = new Map();
  newRows.rows.forEach(r => {
    const key = `${(r.collegeName || '').trim().toLowerCase()}|${(r.name || '').trim().toLowerCase()}`;
    byKey.set(key, r.id);
  });
  const remap = new Map();
  let matched = 0, missed = 0;
  oldRows.rows.forEach(r => {
    const key = `${(r.collegeName || '').trim().toLowerCase()}|${(r.name || '').trim().toLowerCase()}`;
    const newId = byKey.get(key);
    if (newId != null) { remap.set(r.id, newId); matched++; }
    else missed++;
  });
  console.log(`  courses remap: ${matched} matched / ${missed} unmapped (${oldRows.rows.length} OLD, ${newRows.rows.length} NEW)`);
  return remap;
}

async function getValidIds(client, table) {
  const res = await client.query(`SELECT id FROM "${table}"`);
  return new Set(res.rows.map(r => r.id));
}

async function insertRowByRow(client, table, rows, commonCols, fkRemaps = {}, validFkSets = {}) {
  const quotedCols = commonCols.map(c => `"${c}"`).join(', ');
  let copied = 0, skipped = 0, errored = 0;
  const errorSamples = [];

  for (const row of rows) {
    // Apply FK remaps (collegeId, courseId, etc.)
    for (const [col, remap] of Object.entries(fkRemaps)) {
      if (row[col] != null) {
        const newVal = remap.get(row[col]);
        row[col] = newVal != null ? newVal : null;
      }
    }
    // Validate any remaining FKs against the NEW DB's valid IDs
    for (const [col, validSet] of Object.entries(validFkSets)) {
      if (row[col] != null && !validSet.has(row[col])) {
        row[col] = null;
      }
    }

    const placeholders = commonCols.map((_, i) => `$${i + 1}`).join(', ');
    const values = commonCols.map(c => row[c]);
    try {
      const res = await client.query(
        `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT ("id") DO NOTHING`,
        values
      );
      if (res.rowCount > 0) copied++;
      else skipped++;
    } catch (err) {
      errored++;
      if (errorSamples.length < 3) errorSamples.push({ id: row.id, err: err.message.slice(0, 100) });
    }
  }

  console.log(`  ${table}: ✓ ${copied} copied, ${skipped} skipped (conflicts), ${errored} errored`);
  if (errorSamples.length) {
    errorSamples.forEach(s => console.log(`    e.g. id=${s.id}: ${s.err}`));
  }
  return { copied, skipped, errored };
}

(async () => {
  const oldClient = new Client({ connectionString: OLD_URL, ssl: { rejectUnauthorized: false } });
  const newClient = new Client({ connectionString: NEW_URL, ssl: { rejectUnauthorized: false } });

  console.log('Connecting…');
  await oldClient.connect();
  await newClient.connect();

  // Build remaps from OLD ids → NEW ids (matched by name)
  console.log('\nBuilding remaps (by name match):');
  const collegeRemap = await buildRemap(oldClient, newClient, 'colleges');
  const courseRemap  = await buildCourseRemap(oldClient, newClient, collegeRemap);

  // Pre-load valid IDs for tables we DID migrate, so FK to those is preserved
  const validStudentIds = await getValidIds(newClient, 'students');
  const validUserIds    = await getValidIds(newClient, 'users');
  const validAgentIds   = await getValidIds(newClient, 'agents');

  // ── Migrate enquiries ──────────────────────────────────────────────────
  console.log('\nMigrating enquiries:');
  const oldEnqCols = new Set(await getColumns(oldClient, 'enquiries'));
  const newEnqCols = await getColumns(newClient, 'enquiries');
  const enqCols = newEnqCols.filter(c => oldEnqCols.has(c));
  const droppedEnq = newEnqCols.filter(c => !oldEnqCols.has(c)).concat([...oldEnqCols].filter(c => !newEnqCols.includes(c)));
  if (droppedEnq.length) console.log(`  skipping non-matching cols: ${droppedEnq.join(', ')}`);

  const enqQuoted = enqCols.map(c => `"${c}"`).join(', ');
  const { rows: enqRows } = await oldClient.query(`SELECT ${enqQuoted} FROM "enquiries"`);
  console.log(`  loaded ${enqRows.length} rows from OLD`);

  await insertRowByRow(newClient, 'enquiries', enqRows, enqCols, {
    collegeId: collegeRemap,
    courseId:  courseRemap,
  }, {
    studentId:   validStudentIds,
    counsellorId: validUserIds,
    counselorId:  validUserIds,
    assignedToId: validUserIds,
    agentId:      validAgentIds,
  });

  // ── Reset sequence so future enquiry IDs don't collide ─────────────────
  try {
    await newClient.query(`SELECT setval(pg_get_serial_sequence('public.enquiries', 'id'), COALESCE((SELECT MAX(id) FROM "enquiries"), 1), true)`);
    console.log('  sequence reset ✓');
  } catch (e) {
    console.log('  sequence reset skipped:', e.message.slice(0, 80));
  }

  // ── Migrate commissions ────────────────────────────────────────────────
  console.log('\nMigrating commissions:');
  const oldCommCols = new Set(await getColumns(oldClient, 'commissions'));
  const newCommCols = await getColumns(newClient, 'commissions');
  const commCols = newCommCols.filter(c => oldCommCols.has(c));

  const commQuoted = commCols.map(c => `"${c}"`).join(', ');
  const { rows: commRows } = await oldClient.query(`SELECT ${commQuoted} FROM "commissions"`);
  console.log(`  loaded ${commRows.length} rows from OLD`);

  const validEnquiryIds = await getValidIds(newClient, 'enquiries');
  await insertRowByRow(newClient, 'commissions', commRows, commCols, {}, {
    enquiryId: validEnquiryIds,
    agentId: validAgentIds,
  });

  try {
    await newClient.query(`SELECT setval(pg_get_serial_sequence('public.commissions', 'id'), COALESCE((SELECT MAX(id) FROM "commissions"), 1), true)`);
    console.log('  sequence reset ✓');
  } catch (e) {
    console.log('  sequence reset skipped:', e.message.slice(0, 80));
  }

  // ── Also reset sequences for tables migrated earlier ───────────────────
  console.log('\nResetting sequences for previously-migrated tables:');
  for (const t of ['users', 'students', 'agents', 'affiliates', 'sessions']) {
    try {
      await newClient.query(`SELECT setval(pg_get_serial_sequence('public.${t}', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), true)`);
      console.log(`  ${t}: ✓`);
    } catch (e) {
      console.log(`  ${t}: skipped (${e.message.slice(0, 60)})`);
    }
  }

  await oldClient.end();
  await newClient.end();
  console.log('\nDone.');
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
