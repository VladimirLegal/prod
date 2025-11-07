-- Помечаем возможность отзыва согласий
ALTER TABLE consents
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Индекс для быстрых проверок «активности»
CREATE INDEX IF NOT EXISTS idx_consents_user_type_signed_revoked
  ON consents(user_id, doc_type, signed_at DESC, revoked_at);
