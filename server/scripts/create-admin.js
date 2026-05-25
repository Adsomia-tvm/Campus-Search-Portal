#!/usr/bin/env node
/**
 * Create (or reset) an admin user.
 *
 * Use this when the users table is empty (post-restore / fresh DB) or when
 * an existing admin password needs to be reset.
 *
 * Usage:
 *   node scripts/create-admin.js <email> <password> [name]
 *
 * Examples:
 *   node scripts/create-admin.js md@adsomia.com MyStrongPass!23 "Hassan Rawther"
 *
 * Behaviour:
 *   - If user with given email exists → updates password + role (admin) + activates
 *   - If user doesn't exist → creates a new admin row
 *   - Hashes password with bcryptjs (cost 12, same as portal auth route)
 *   - Sets role='admin' and isActive=true
 *
 * Reads DATABASE_URL from process.env — works locally with .env.local AND on
 * Vercel via `vercel env pull` then `node scripts/create-admin.js …`.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const [, , emailArg, passwordArg, nameArg] = process.argv;

  if (!emailArg || !passwordArg) {
    console.error('Usage: node scripts/create-admin.js <email> <password> [name]');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();
  const password = passwordArg;
  const name = (nameArg || email.split('@')[0]).trim();

  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'admin',
      isActive: true,
      loginAttempts: 0,
      lockedUntil: null,
      name,
    },
    create: {
      email,
      name,
      passwordHash,
      role: 'admin',
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
  });

  console.log('✓ Admin user ready:');
  console.log(JSON.stringify(user, null, 2));
  console.log('\nYou can now log in at https://campussearch.in/admin/login with this email + the password you just set.');
}

main()
  .catch((err) => {
    console.error('✗ Failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
