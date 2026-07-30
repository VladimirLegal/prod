const express = require('express');
const contentService = require('../services/contentService');

const router = express.Router();
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

router.get('/articles', async (_req, res) => {
  try {
    const articles = await contentService.getArticles();
    return res.json({ ok: true, articles });
  } catch (error) {
    console.error('[content] Unable to load articles:', error.message);
    return res.status(503).json({ ok: false, error: 'content_service_unavailable' });
  }
});

router.get('/articles/:slug', async (req, res) => {
  const slug = String(req.params.slug || '');
  if (!VALID_SLUG.test(slug)) {
    return res.status(400).json({ ok: false, error: 'invalid_slug' });
  }

  try {
    const article = await contentService.getArticleBySlug(slug);
    if (!article) {
      return res.status(404).json({ ok: false, error: 'article_not_found' });
    }
    return res.json({ ok: true, article });
  } catch (error) {
    console.error('[content] Unable to load article:', error.message);
    return res.status(503).json({ ok: false, error: 'content_service_unavailable' });
  }
});

module.exports = router;
