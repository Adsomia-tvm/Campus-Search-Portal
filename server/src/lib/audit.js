const prisma = require('./prisma');

/**
 * Log an auth or system event to the audit_logs table.
 * Fire-and-forget — never blocks the request.
 */
function logAudit({ userId, action, entity, entityId, details, ipAddress }) {
  prisma.auditLog.create({
    data: {
      userId: userId || null,
      action,
      entity: entity || null,
      entityId: entityId || null,
      details: details ? JSON.stringify(details) : null,
      ipAddress: ipAddress || null,
    },
  }).catch(() => {}); // swallow errors — audit should never break the flow
}

/** Extract IP from Express request (handles proxies) */
function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
}

module.exports = { logAudit, getIp };
