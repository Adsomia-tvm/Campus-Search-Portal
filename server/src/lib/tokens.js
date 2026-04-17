const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('./prisma');

const ACCESS_EXPIRY = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_EXPIRY_DAYS = 30;

/** Generate a short-lived access token (JWT) */
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, collegeId: user.collegeId || null },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY },
  );
}

/** Create a refresh token row in the sessions table */
async function createRefreshToken(userId, req) {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      userAgent: req?.headers?.['user-agent']?.slice(0, 255) || null,
      ipAddress: req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || null,
      expiresAt,
    },
  });

  return refreshToken;
}

/** Rotate: verify old refresh token, issue new pair */
async function rotateRefreshToken(oldToken, req) {
  const session = await prisma.session.findUnique({ where: { refreshToken: oldToken } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Delete old session
  await prisma.session.delete({ where: { id: session.id } });

  // Issue new pair
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id, req);

  return { accessToken, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

/** Revoke all sessions for a user (logout everywhere) */
async function revokeAllSessions(userId) {
  await prisma.session.deleteMany({ where: { userId } });
}

/** Clean up expired sessions (call periodically) */
async function cleanExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

module.exports = { signAccessToken, createRefreshToken, rotateRefreshToken, revokeAllSessions, cleanExpiredSessions };
