module.exports = function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  return next();
};