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

// Any internal team member (admin / staff / consultant)
function requireTeamMember(req, res, next) {
  requireAuth(req, res, () => {
    if (!['admin', 'staff', 'consultant'].includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });
    next();
  });
}

// College user — must be role=college with a linked collegeId
function requireCollege(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'college' || !req.user.collegeId)
      return res.status(403).json({ error: 'Forbidden — college account required' });
    next();
  });
}

// Agent user
function requireAgent(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'agent')
      return res.status(403).json({ error: 'Forbidden — agent account required' });
    next();
  });
}

// Student user
function requireStudent(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'student')
      return res.status(403).json({ error: 'Forbidden — student account required' });
    next();
  });
}

// Any authenticated user with one of the specified roles
function requireRole(...roles) {
  return (req, res, next) => {
    requireAuth(req, res, () => {
      if (!roles.includes(req.user.role))
        return res.status(403).json({ error: `Forbidden — requires ${roles.join(' or ')}` });
      next();
    });
  };
}

module.exports = { requireAuth, requireAdmin, requireStaff, requireTeamMember, requireCollege, requireAgent, requireStudent, requireRole };
