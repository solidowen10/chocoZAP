// middleware/rbac.js
// Resolves the caller's membership+role for the org referenced by the
// request (:orgId param, or body.orgId as a fallback) and enforces a
// minimum role. Every org-scoped route should sit behind requireRole(...).
const db = require('../db/db');
const { roleAtLeast } = require('../lib/util');

function requireRole(minRole) {
  return (req, res, next) => {
    const orgId = req.params.orgId || req.body.orgId || req.query.orgId;
    if (!orgId) return res.status(400).json({ error: 'org_id_required' });

    const membership = db
      .prepare('SELECT * FROM memberships WHERE org_id = ? AND user_id = ?')
      .get(orgId, req.user.id);

    if (!membership) return res.status(403).json({ error: 'not_a_member' });
    if (!roleAtLeast(membership.role, minRole)) {
      return res.status(403).json({ error: 'insufficient_role', required: minRole, actual: membership.role });
    }

    req.orgId = orgId;
    req.membership = membership;
    next();
  };
}

module.exports = { requireRole };
