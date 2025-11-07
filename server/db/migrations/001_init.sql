-- включим расширение для uuid, если доступно
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key,
  email text unique,
  password_hash text,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  type text not null,                       -- 'rent' | 'sale' | ...
  title text not null,
  status text not null default 'draft',     -- 'draft' | 'ready'
  current_html text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  html text not null,
  created_at timestamptz default now()
);

create table if not exists forms (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  json jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_documents_owner on documents(owner_id);
create index if not exists idx_versions_doc on document_versions(document_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_documents_updated_at on documents;
create trigger trg_documents_updated_at
before update on documents
for each row execute procedure set_updated_at();
