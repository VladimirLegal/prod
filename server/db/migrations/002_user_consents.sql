create table if not exists user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,                           -- гость = null
  role text not null default 'guest',          -- guest/tenant/landlord/realtor/lawyer/agency
  agreement_version text not null,             -- например, 'v1.0_2025-10-09'
  consent_text text not null,                  -- снапшот текста соглашения
  ip_address text,
  user_agent text,
  accepted_at timestamptz default now()
);
create index if not exists idx_user_consents_user on user_consents(user_id);
