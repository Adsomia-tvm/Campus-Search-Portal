const jwt = require('jsonwebtoken');

// Verify JWT — attach user to req
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorised — no token' });

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorised — invalid token' });
  }
}

// Admin only
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin')
      return res.status(403).json({ error: 'Forbidden — admin only' });
    next();
  });
}

// Admin or Staff
function requireStaff(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'staff'].includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden — admin or staff only' });
    next();
  });
}

// Any team member (admin / staff / consultant)
function requireTeamMember(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'staff', 'consultant'].includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

module.exports = { requireAuth, requireAdmin, requireStaff, requireTeamMember };
