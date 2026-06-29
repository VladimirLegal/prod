CREATE TABLE IF NOT EXISTS user_auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email_at_provider TEXT,
  phone_at_provider TEXT,
  profile_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS user_auth_identities_user_id_idx
  ON user_auth_identities(user_id);

CREATE INDEX IF NOT EXISTS user_auth_identities_provider_idx
  ON user_auth_identities(provider);