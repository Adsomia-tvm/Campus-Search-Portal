#!/usr/bin/env node
/**
 * One-shot data migration: OLD Neon project → NEW Neon project.
 *
 * Background (2026-05-25): the original Neon project (us-east-1, endpoint
 * ep-frosty-bonus-aniqhtqz) was auto-archived May 23 and a new project was
 * spun up in ap-southeast-1 (ep-young-tree) with only static reference data
 * (colleges + courses) seeded. All transactional data (enquiries, students,
 * affiliates, agents, commissions, users, sessions) is missing in the new
 * DB. This script copies those tables row-by-row, in dependency order, with
 * ON CONFLICT handling so it's idempotent.
 *
 * Tables COPIED (in this order, to satisfy FK constraints):
 *   1. users         (ON CONFLICT (email) DO NOTHING — preserves the
 *                     admin row we just created if email collides)
 *   2. students      (refs users via counsellor)
 *   3. agents        (refs users)
 *   4. affiliates
 *   5. enquiries     (refs students, courses, colleges, users)
 *   6. sessions      (refs users)
 *   7. commissions   (refs enquiries, agents)
 *
 * Tables SKIPPED:
 *   - colleges, courses — already populated in NEW with newer data
 *
 * Usage:
 *   OLD_DATABASE_URL='postgresql://...@ep-frosty-bonus-...neon.tech/...' \
 *   NEW_DATABASE_URL='postgresql://...@ep-young-tree-...neon.tech/...' \
 *   node scripts/migrate-from-old-db.js
 *
 * Safe to run multiple times — uses ON CONFLICT DO NOTHING on primary keys.
 */

const { Client } = require('pg');

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;

if (!OLD_URL || !NEW_URL) {
  console.error('Set OLD_DATABASE_URL and NEW_DATABASE_URL env vars.');
  console.error('Example:');
  console.error('  OLD_DATABASE_URL=postgresql://...soft-grass.../neondb?sslmode=require \\');
  console.error('  NEW_DATABASE_URL=postgresql://...ep-young-tree.../neondb?sslmode=require \\');
  console.error('  node scripts/migrate-from-old-db.js');
  process.exit(1);
}

// Tables to migrate, in FK dependency order.
// `conflict` is the column(s) to use for ON CONFLICT DO NOTHING — typically
// the primary key, or `email` for users so we don't trample the new admin.
const TABLES = [
  { name: 'users',       conflict: '("email")' },
  { name: 'students',    conflict: '("id")' },
  { name: 'agents',      conflict: '("id")' },
  { name: 'affiliates',  conflict: '("id")' },
  { name: 'enquiries',   conflict: '("id")' },
  { name: 'sessions',    conflict: '("id")' },
  { name: 'commissions', conflict: '("id")' },
];

async function getColumns(client, table) {
  const res = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return res.rows.map(r => r.column_name);
}

async function tableExists(client, table) {
  const res = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
  `, [table]);
  return res.rows.length > 0;
}

async function getPrimaryKeyName(client, table) {
  // Returns the integer PK column name if it exists (for serial sequence reset).
  const res = await client.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = format('public.%I', $1)::regclass AND i.indisprimary
    LIMIT 1
  `, [table]);
  return res.rows[0]?.attname || null;
}

async function resetSequenceFor(client, table) {
  const pk = await getPrimaryKeyName(client, table);
  if (!pk) return;
  // setval to max(id) so future inserts don't collide with the migrated IDs.
  try {
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence(format('public.%I', $1), $2),
        COALESCE((SELECT MAX(${JSON.stringify(pk).replace(/"/g, '"')}) FROM "${table}"), 1),
        true
      )
    `, [table, pk]);
  } catch (e) {
    // Not all PKs are serial — silently skip.
  }
}

async function copyTable(oldClient, newClient, { name, conflict }) {
  if (!(await tableExists(oldClient, name))) {
    console.log(`  ${name}: ⊘ doesn't exist in OLD — skip`);
    return { copied: 0, skipped: 0 };
  }
  if (!(await tableExists(newClient, name))) {
    console.log(`  ${name}: ⊘ doesn't exist in NEW — skip (schema mismatch)`);
    return { copied: 0, skipped: 0 };
  }

  // Use intersection of columns so we don't INSERT into columns that don't
  // exist in NEW (schema drift safety).
  const oldCols = new Set(await getColumns(oldClient, name));
  const newCols = await getColumns(newClient, name);
  const commonCols = newCols.filter(c => oldCols.has(c));
  if (commonCols.length === 0) {
    console.log(`  ${name}: ⊘ no common columns — skip`);
    return { copied: 0, skipped: 0 };
  }
  const droppedCols = newCols.filter(c => !oldCols.has(c))
    .concat([...oldCols].filter(c => !newCols.includes(c)));
  if (droppedCols.length) {
    console.log(`  ${name}: ⚠ skipping non-matching cols: ${droppedCols.join(', ')}`);
  }

  // Quote each column with double-quotes (Postgres case-sensitivity).
  const quotedCols = commonCols.map(c => `"${c}"`).join(', ');

  // Read all rows from OLD.
  const { rows } = await oldClient.query(`SELECT ${quotedCols} FROM "${name}"`);
  if (rows.length === 0) {
    console.log(`  ${name}: 0 rows in OLD — nothing to copy`);
    return { copied: 0, skipped: 0 };
  }

  // Insert into NEW, batch of 500 at a time, ON CONFLICT DO NOTHING.
  const BATCH = 500;
  let copied = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = [];
    const values = [];
    batch.forEach((row, rowIdx) => {
      const rowPh = commonCols.map((_, colIdx) => `$${rowIdx * commonCols.length + colIdx + 1}`);
      placeholders.push(`(${rowPh.join(', ')})`);
      commonCols.forEach(c => values.push(row[c]));
    });

    const sql = `
      INSERT INTO "${name}" (${quotedCols})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT ${conflict} DO NOTHING
    `;

    const res = await newClient.query(sql, values);
    copied += res.rowCount;
    skipped += batch.length - res.rowCount;
  }

  console.log(`  ${name}: ✓ copied ${copied} rows (${skipped} skipped due to conflicts)`);

  // Reset sequence so new auto-generated IDs don't collide
  await resetSequenceFor(newClient, name);

  return { copied, skipped };
}

(async () => {
  const oldClient = new Client({ connectionString: OLD_URL, ssl: { rejectUnauthorized: false } });
  const newClient = new Client({ connectionString: NEW_URL, ssl: { rejectUnauthorized: false } });

  console.log('Connecting to OLD…');
  await oldClient.connect();
  console.log('Connecting to NEW…');
  await newClient.connect();
  console.log('');

  console.log('Migrating in FK dependency order:');
  const summary = [];
  for (const t of TABLES) {
    try {
      const result = await copyTable(oldClient, newClient, t);
      summary.push({ table: t.name, ...result, status: 'ok' });
    } catch (err) {
      console.error(`  ${t.name}: ✗ ${err.message}`);
      summary.push({ table: t.name, copied: 0, skipped: 0, status: 'error', error: err.message });
    }
  }

  console.log('');
  console.log('Done. Summary:');
  console.table(summary);

  await oldClient.end();
  await newClient.end();
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
