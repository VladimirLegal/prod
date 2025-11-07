alter table forms
  add column if not exists consent_id uuid null references user_consents(id);
