module.exports.requireRole = (...roles) => (req, res, next) => {
  const role = req.user?.role;
  if (!role) {
    return res.status(401).json({ ok: false, error: 'auth_required' });
  }
  if (!roles.includes(role)) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  return next();
};

module.exports.requireAuth = (req, res, next) => {
  const id = req.user?.id || req.userId;
  if (!id) {
    return res.status(401).json({ ok: false, error: 'auth_required' });
  }
  if (!req.user) {
    req.user = { id };
  }
  return next();
};