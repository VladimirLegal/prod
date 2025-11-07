-- 2025_10_24_add_pdn_revoked.sql

-- 1) колонка-флаг, когда юзер отозвал согласие ПДн
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pdn_revoked_at timestamptz NULL;

-- 2) индексы — по желанию (чуть ускорит выборки/фильтры)
CREATE INDEX IF NOT EXISTS idx_users_pdn_revoked_at ON public.users (pdn_revoked_at);
