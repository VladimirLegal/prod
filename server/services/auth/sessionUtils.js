function regenerateSession(req) {
  const previousSessionData = { ...req.session };
  delete previousSessionData.cookie;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.entries(previousSessionData).forEach(([key, value]) => {
        if (key !== 'userId') req.session[key] = value;
      });
      return resolve();
    });
  });
}

module.exports = { regenerateSession };