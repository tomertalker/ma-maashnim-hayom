-- ============================================================================
-- "מה מעשנים היום" — pilot backend (v2)
--
-- Paste this whole file into the Supabase SQL editor and press Run.
-- Safe to run again: it never drops data.
--
-- Design
--   * Every object is prefixed mmh_ so it can live next to the survey tables.
--   * The browser never touches a table. Row level security is on with no
--     policies, and all access goes through the mmh_* functions below.
--   * Patients sign in with a nickname and a password (no e-mail). A function
--     returns a random session token; every other function takes that token.
--   * The feed returns only reviews the writer chose to publish, with
--     whitelisted fields and a month instead of a date. Indication and dosage
--     appear only when the writer also chose to show them, and are frozen at
--     the moment of saving.
--   * Expected failures come back as {"error": "<code>"}; nothing is raised,
--     so a failed login or a refused request can still be counted.
--   * Limits: sign-ups and wrong passwords per network address, reviews and
--     photos per patient. Numbers are in mmh_settings and can be changed there.
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables ----

create table if not exists public.mmh_settings (
  key   text primary key,
  value jsonb not null
);

insert into public.mmh_settings (key, value) values
  ('session_days',          '180'),
  ('signup_hourly_cap',     '300'),   -- all sign-ups, any address
  ('signup_hourly_per_ip',  '40'),    -- a pharmacy's shared Wi-Fi is one address
  ('reviews_daily_cap',     '30'),
  ('photos_total_cap',      '60'),
  ('invite_code',           'null')
on conflict (key) do nothing;

create table if not exists public.mmh_patients (
  id            uuid primary key default gen_random_uuid(),
  nick          text not null,
  nick_key      text not null unique,
  pass_hash     text not null,
  card          jsonb,
  card_at       timestamptz,
  share_default boolean,            -- null until the patient answers the question
  share_context_default boolean not null default false,
  consent_at    timestamptz,
  created_at    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

create table if not exists public.mmh_sessions (
  token_hash bytea primary key,
  patient_id uuid not null references public.mmh_patients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists mmh_sessions_patient on public.mmh_sessions(patient_id);

-- wrong passwords. nick_key is the nickname, or 'pw:<patient id>' for the
-- password check inside a signed-in session.
create table if not exists public.mmh_login_attempts (
  nick_key text not null,
  at       timestamptz not null default now()
);
alter table public.mmh_login_attempts add column if not exists ip_hash bytea;
create index if not exists mmh_login_attempts_idx on public.mmh_login_attempts(nick_key, at);

-- counted events per network address (sign-ups, wrong invite codes)
create table if not exists public.mmh_rate (
  kind    text not null,
  ip_hash bytea not null,
  at      timestamptz not null default now()
);
create index if not exists mmh_rate_idx on public.mmh_rate(kind, ip_hash, at);

create table if not exists public.mmh_products (
  id         text primary key,          -- Jane product id
  data       jsonb not null,
  active     boolean not null default true,
  fetched_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.mmh_reviews (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.mmh_patients(id) on delete cascade,
  product_id    text references public.mmh_products(id),
  product_name  text,                   -- free text when the strain is not in the catalogue
  verdict       text check (verdict in ('like','unsure','dislike')),
  stars         smallint check (stars between 1 and 5),
  helped        text[] not null default '{}',
  bothered      text[] not null default '{}',
  note          text,
  source        text not null default 'own' check (source in ('reco','own','history')),
  buys          int not null default 1 check (buys between 1 and 99),
  publish       boolean not null default false,
  share_context boolean not null default false,
  hidden        boolean not null default false,   -- moderation
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  feed_at       timestamptz,
  check (product_id is not null or product_name is not null),
  check (not share_context or publish)
);
alter table public.mmh_reviews add column if not exists ctx jsonb;              -- indication + dosage, frozen when saved
alter table public.mmh_reviews add column if not exists moderated_at timestamptz; -- set by mmh_admin_unhide
create unique index if not exists mmh_reviews_one_per_product
  on public.mmh_reviews(patient_id, product_id) where product_id is not null;
create unique index if not exists mmh_reviews_one_per_free_name
  on public.mmh_reviews(patient_id, lower(product_name)) where product_id is null;
create index if not exists mmh_reviews_feed
  on public.mmh_reviews(feed_at desc) where publish and not hidden;
create index if not exists mmh_reviews_patient on public.mmh_reviews(patient_id);

create table if not exists public.mmh_photos (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.mmh_reviews(id) on delete cascade,
  patient_id uuid not null references public.mmh_patients(id) on delete cascade,
  full_jpeg  bytea not null,
  thumb_jpeg bytea not null,
  w          int,
  h          int,
  created_at timestamptz not null default now()
);
create index if not exists mmh_photos_review on public.mmh_photos(review_id);
create index if not exists mmh_photos_patient on public.mmh_photos(patient_id);

create table if not exists public.mmh_flags (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.mmh_reviews(id) on delete cascade,
  patient_id uuid not null references public.mmh_patients(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  unique (review_id, patient_id)
);

alter table public.mmh_settings       enable row level security;
alter table public.mmh_patients       enable row level security;
alter table public.mmh_sessions       enable row level security;
alter table public.mmh_login_attempts enable row level security;
alter table public.mmh_rate           enable row level security;
alter table public.mmh_products       enable row level security;
alter table public.mmh_reviews        enable row level security;
alter table public.mmh_photos         enable row level security;
alter table public.mmh_flags          enable row level security;

revoke all on public.mmh_settings, public.mmh_patients, public.mmh_sessions,
              public.mmh_login_attempts, public.mmh_rate, public.mmh_products,
              public.mmh_reviews, public.mmh_photos, public.mmh_flags
  from anon, authenticated;

-- v1 had a view here; it is a function now
drop view if exists public.mmh_admin_overview;

-- ------------------------------------------------------ internal helpers ----

create or replace function public.mmh__err(p_code text) returns jsonb
language sql immutable set search_path = public, extensions as $$ select jsonb_build_object('error', p_code) $$;

-- a nickname as typed -> a clean display form (case kept)
create or replace function public.mmh__nick_clean(p_nick text) returns text
language sql immutable set search_path = public, extensions as $$
  select btrim(regexp_replace(
           regexp_replace(normalize(coalesce(p_nick, ''), NFKC),
                          '[­​-‏‪-‮⁠-⁩﻿]', '', 'g'),
           '[\s ]+', ' ', 'g'))
$$;

-- the form used for uniqueness and sign-in
create or replace function public.mmh__nick_key(p_nick text) returns text
language sql immutable set search_path = public, extensions as $$
  select lower(public.mmh__nick_clean(p_nick))
$$;

-- Hebrew or English letters, digits, space, _ . -   (2 to 20, at least one letter or digit)
create or replace function public.mmh__nick_ok(p_key text) returns boolean
language sql immutable set search_path = public, extensions as $$
  select p_key ~ '^[0-9a-zא-ת _.-]{2,20}$' and p_key ~ '[0-9a-zא-ת]'
$$;

create or replace function public.mmh__pass_ok(p_pass text, p_key text) returns boolean
language sql immutable set search_path = public, extensions as $$
  select p_pass is not null and char_length(p_pass) >= 6 and octet_length(p_pass) <= 72
     and lower(p_pass) <> p_key
     and lower(p_pass) not in ('123456','1234567','12345678','123456789','1234567890','654321','111111','000000',
                               '123123','112233','121212','qwerty','qwerty123','password','abcdef','abc123',
                               'aaaaaa','asdfgh','zxcvbn','iloveyou','696969','147258','159753','987654')
$$;

create or replace function public.mmh__bool(p jsonb) returns boolean
language sql immutable set search_path = public, extensions as $$
  select case when jsonb_typeof(p) = 'boolean' then (p #>> '{}')::boolean end
$$;

-- a number from JSON, clamped, never raising
create or replace function public.mmh__int(p jsonb, p_min int, p_max int) returns int
language sql immutable set search_path = public, extensions as $$
  select case when jsonb_typeof(p) = 'number'
              then greatest(p_min::numeric, least(p_max::numeric, round((p #>> '{}')::numeric)))::int end
$$;

create or replace function public.mmh__setting(p_key text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select value from public.mmh_settings where key = p_key
$$;

create or replace function public.mmh__setting_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(public.mmh__int(public.mmh__setting(p_key), 0, 1000000), p_default)
$$;

-- hash of the caller's network address, as passed on by the API gateway
create or replace function public.mmh__ip_hash() returns bytea
language sql stable security definer set search_path = public, extensions as $$
  select digest(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', h->>'x-forwarded-for', '?'), 'sha256')
    from (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as h) x
$$;

-- true and counted if the caller is under the limit for this kind of event
create or replace function public.mmh__rate(p_kind text, p_limit int, p_window interval, p_count boolean default true)
returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_ip bytea := public.mmh__ip_hash();
begin
  perform pg_advisory_xact_lock(hashtext('mmh_rate:' || p_kind || ':' || encode(v_ip, 'hex')));
  if (select count(*) from public.mmh_rate where kind = p_kind and ip_hash = v_ip and at > now() - p_window) >= p_limit then
    return false;
  end if;
  if p_count then insert into public.mmh_rate(kind, ip_hash) values (p_kind, v_ip); end if;
  return true;
end $$;

-- token -> patient id, or null when the token is missing, unknown or expired
create or replace function public.mmh__auth(p_token text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 200 then return null; end if;
  select s.patient_id into v_id
    from public.mmh_sessions s
   where s.token_hash = digest(p_token, 'sha256') and s.expires_at > now();
  if v_id is null then return null; end if;
  update public.mmh_patients set last_seen = now()
   where id = v_id and last_seen < now() - interval '1 hour';
  return v_id;
end $$;

create or replace function public.mmh__new_session(p_patient uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(32), 'hex');
        v_days  int  := public.mmh__setting_int('session_days', 180);
begin
  delete from public.mmh_sessions where expires_at < now();
  insert into public.mmh_sessions(token_hash, patient_id, expires_at)
  values (digest(v_token, 'sha256'), p_patient, now() + make_interval(days => v_days));
  return v_token;
end $$;

-- password check inside a session (change password, delete account), with its own lockout
create or replace function public.mmh__check_pass(p_id uuid, p_pass text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_key text := 'pw:' || p_id::text;
begin
  perform pg_advisory_xact_lock(hashtext('mmh_pw:' || v_key));
  if (select count(*) from public.mmh_login_attempts where nick_key = v_key and at > now() - interval '15 minutes') >= 8 then
    return 'locked';
  end if;
  select pass_hash into v_hash from public.mmh_patients where id = p_id;
  if p_pass is null or octet_length(p_pass) > 200 or v_hash <> crypt(p_pass, v_hash) then
    insert into public.mmh_login_attempts(nick_key, ip_hash) values (v_key, public.mmh__ip_hash());
    return 'bad_login';
  end if;
  delete from public.mmh_login_attempts where nick_key = v_key;
  return null;
end $$;

-- keep only known keys of a text array
create or replace function public.mmh__pick(p_in jsonb, p_allowed text[]) returns text[]
language sql immutable set search_path = public, extensions as $$
  select coalesce(array_agg(distinct x), '{}')
    from jsonb_array_elements_text(case when jsonb_typeof(p_in) = 'array' then p_in else '[]'::jsonb end) as t(x)
   where x = any(p_allowed)
$$;

create or replace function public.mmh__one(p_in jsonb, p_allowed text[]) returns text
language sql immutable set search_path = public, extensions as $$
  select case when jsonb_typeof(p_in) = 'string' and (p_in #>> '{}') = any(p_allowed)
              then p_in #>> '{}' end
$$;

-- free text from the browser: no control characters, trimmed, cut to length
create or replace function public.mmh__text(p jsonb, p_len int) returns text
language sql immutable set search_path = public, extensions as $$
  select case when jsonb_typeof(p) = 'string'
              then nullif(left(btrim(regexp_replace(p #>> '{}', '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]', '', 'g')), p_len), '') end
$$;

-- a product's name even after it left the catalogue
create or replace function public.mmh__product_name(r public.mmh_reviews) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(r.product_name, (select p.data->>'he' from public.mmh_products p where p.id = r.product_id))
$$;

create or replace function public.mmh__review_json(r public.mmh_reviews) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', r.id, 'product_id', r.product_id, 'product_name', public.mmh__product_name(r),
    'verdict', r.verdict, 'stars', r.stars, 'helped', to_jsonb(r.helped),
    'bothered', to_jsonb(r.bothered), 'note', r.note, 'source', r.source,
    'buys', r.buys, 'publish', r.publish, 'share_context', r.share_context,
    'hidden', r.hidden, 'created_at', r.created_at, 'updated_at', r.updated_at,
    'photos', coalesce((select jsonb_agg(ph.id order by ph.created_at)
                          from public.mmh_photos ph where ph.review_id = r.id), '[]'::jsonb))
$$;

-- --------------------------------------------------------------- account ----

create or replace function public.mmh_nick_available(p_nick text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_key text := public.mmh__nick_key(left(coalesce(p_nick, ''), 100));
begin
  if not public.mmh__nick_ok(v_key) then return public.mmh__err('nick_invalid'); end if;
  return jsonb_build_object('ok', true, 'available',
    not exists (select 1 from public.mmh_patients where nick_key = v_key));
end $$;

create or replace function public.mmh_signup(p_nick text, p_pass text, p_invite text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_nick  text := public.mmh__nick_clean(left(coalesce(p_nick, ''), 100));
        v_key   text := lower(v_nick);
        v_code  text := public.mmh__setting('invite_code') #>> '{}';
        v_id    uuid;
begin
  if not public.mmh__nick_ok(v_key) then return public.mmh__err('nick_invalid'); end if;
  if not public.mmh__pass_ok(p_pass, v_key) then return public.mmh__err('pass_invalid'); end if;
  if v_code is not null and v_code <> ''
     and lower(btrim(coalesce(left(p_invite, 100), ''))) <> lower(v_code) then
    if not public.mmh__rate('invite_fail', 20, interval '1 hour') then return public.mmh__err('busy'); end if;
    return public.mmh__err('invite_required');
  end if;
  if (select count(*) from public.mmh_patients where created_at > now() - interval '1 hour')
     >= public.mmh__setting_int('signup_hourly_cap', 300) then
    return public.mmh__err('busy');
  end if;
  if not public.mmh__rate('signup', public.mmh__setting_int('signup_hourly_per_ip', 40), interval '1 hour', false) then
    return public.mmh__err('busy');
  end if;
  begin
    insert into public.mmh_patients(nick, nick_key, pass_hash)
    values (v_nick, v_key, crypt(p_pass, gen_salt('bf', 10)))
    returning id into v_id;
  exception when unique_violation then
    return public.mmh__err('nick_taken');
  end;
  insert into public.mmh_rate(kind, ip_hash) values ('signup', public.mmh__ip_hash());
  delete from public.mmh_rate where at < now() - interval '1 day';
  return jsonb_build_object('ok', true, 'token', public.mmh__new_session(v_id), 'nick', v_nick);
end $$;

-- Wrong passwords lock the nickname for this network address after 8 tries
-- in 15 minutes, and for everyone after 30 tries in an hour.
create or replace function public.mmh_login(p_nick text, p_pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_key text := public.mmh__nick_key(left(coalesce(p_nick, ''), 100));
        v_ip  bytea := public.mmh__ip_hash();
        v_p   public.mmh_patients;
begin
  if not public.mmh__nick_ok(v_key) or p_pass is null or octet_length(p_pass) > 200 then
    return public.mmh__err('bad_login');
  end if;
  perform pg_advisory_xact_lock(hashtext('mmh_login:' || v_key));
  delete from public.mmh_login_attempts where at < now() - interval '1 day';
  if (select count(*) from public.mmh_login_attempts
       where nick_key = v_key and ip_hash = v_ip and at > now() - interval '15 minutes') >= 8
     or (select count(*) from public.mmh_login_attempts
       where nick_key = v_key and at > now() - interval '1 hour') >= 30 then
    return public.mmh__err('locked');
  end if;
  select * into v_p from public.mmh_patients where nick_key = v_key;
  if v_p.id is null then
    perform crypt(p_pass, gen_salt('bf', 10));     -- same time as a real check
  end if;
  if v_p.id is null or v_p.pass_hash <> crypt(p_pass, v_p.pass_hash) then
    insert into public.mmh_login_attempts(nick_key, ip_hash) values (v_key, v_ip);
    return public.mmh__err('bad_login');
  end if;
  delete from public.mmh_login_attempts where nick_key = v_key and ip_hash = v_ip;
  return jsonb_build_object('ok', true, 'token', public.mmh__new_session(v_p.id), 'nick', v_p.nick);
end $$;

create or replace function public.mmh_logout(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.mmh_sessions where token_hash = digest(left(coalesce(p_token, ''), 200), 'sha256');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.mmh_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_p  public.mmh_patients;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  select * into v_p from public.mmh_patients where id = v_id;
  return jsonb_build_object('ok', true, 'nick', v_p.nick, 'card', v_p.card,
    'share_default', v_p.share_default, 'share_context_default', v_p.share_context_default,
    'consent', v_p.consent_at is not null);
end $$;

-- the card: only known keys with known values are kept
create or replace function public.mmh_save_card(p_token text, p_card jsonb,
  p_share boolean default null, p_share_context boolean default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_card jsonb;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object' or length(p_card::text) > 4000 then
    return public.mmh__err('card_invalid');
  end if;
  v_card := jsonb_strip_nulls(jsonb_build_object(
    'age',     public.mmh__one(p_card->'age',   array['18-24','25-34','35-44','45-54','55-64','65+']),
    'sex',     public.mmh__one(p_card->'sex',   array['m','f']),
    'years',   public.mmh__one(p_card->'years', array['<1','1-3','3-5','5+']),
    'grams',   public.mmh__one(p_card->'grams', array['10-20','30','40','50-60','70+']),
    'license', to_jsonb(public.mmh__pick(p_card->'license',
                 array['T22/C4','T18/C3','T15/C3','T10/C2','T10/C10','T5/C10','T3/C15','T1/C20','other'])),
    'uses',    to_jsonb(public.mmh__pick(p_card->'uses',
                 array['pain','sleep','anxiety','ptsd','mood','calm','appetite','nausea','focus'])),
    'times',   to_jsonb(public.mmh__pick(p_card->'times', array['morning','noon','evening','night'])),
    'flavors', to_jsonb(public.mmh__pick(p_card->'flavors',
                 array['citrus','pine','earthy','floral','spicy','sweet'])),
    'avoid',   to_jsonb(public.mmh__pick(p_card->'avoid',
                 array['daysleep','anxiety','racing','fog','munchies','dry'])),
    'budget',  public.mmh__int(p_card->'budget', 50, 1000),
    'budget_hard', public.mmh__bool(p_card->'budget_hard')
  ));
  if v_card->>'age' is null or jsonb_array_length(v_card->'uses') = 0 then
    return public.mmh__err('card_incomplete');
  end if;
  update public.mmh_patients
     set card = v_card, card_at = now(),
         consent_at = coalesce(consent_at, now()),
         share_default = coalesce(p_share, share_default),
         share_context_default = case when coalesce(p_share, share_default) is true
                                      then coalesce(p_share_context, share_context_default)
                                      else false end
   where id = v_id;
  return public.mmh_me(p_token);
end $$;

create or replace function public.mmh_change_password(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_err text;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  if not public.mmh__pass_ok(p_new, (select nick_key from public.mmh_patients where id = v_id)) then
    return public.mmh__err('pass_invalid');
  end if;
  v_err := public.mmh__check_pass(v_id, p_old);
  if v_err is not null then return public.mmh__err(v_err); end if;
  update public.mmh_patients set pass_hash = crypt(p_new, gen_salt('bf', 10)) where id = v_id;
  delete from public.mmh_sessions
   where patient_id = v_id and token_hash <> digest(p_token, 'sha256');
  return jsonb_build_object('ok', true);
end $$;

-- removes the patient and everything they wrote (reviews, photos, sessions)
create or replace function public.mmh_delete_account(p_token text, p_pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_err text;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  v_err := public.mmh__check_pass(v_id, p_pass);
  if v_err is not null then return public.mmh__err(v_err); end if;
  delete from public.mmh_login_attempts where nick_key = 'pw:' || v_id::text;
  delete from public.mmh_patients where id = v_id;
  return jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------- catalogue ----

create or replace function public.mmh_catalog(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  return jsonb_build_object('ok', true,
    'fetched_at', (select max(fetched_at) from public.mmh_products where active),
    'products', coalesce((select jsonb_agg(data order by data->>'he')
                            from public.mmh_products where active), '[]'::jsonb));
end $$;

-- what other patients published, counted per product
create or replace function public.mmh_stats(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_uses text[];
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  select array(select jsonb_array_elements_text(coalesce(card->'uses', '[]'::jsonb)))
    into v_uses from public.mmh_patients where id = v_id;
  return jsonb_build_object('ok', true, 'stats', coalesce((
    select jsonb_object_agg(product_id, s) from (
      select r.product_id, jsonb_build_object(
               'like',    count(*) filter (where r.verdict = 'like'),
               'unsure',  count(*) filter (where r.verdict = 'unsure'),
               'dislike', count(*) filter (where r.verdict = 'dislike'),
               -- writers who chose to show their indication and share one with the caller
               'like_me', count(*) filter (where r.verdict = 'like' and r.share_context
                                             and coalesce(r.ctx->'uses', '[]'::jsonb) ?| v_uses)
             ) as s
        from public.mmh_reviews r
       where r.publish and not r.hidden and r.verdict is not null
         and r.product_id is not null and r.patient_id <> v_id
       group by r.product_id
    ) x), '{}'::jsonb));
end $$;

-- --------------------------------------------------------------- reviews ----

create or replace function public.mmh_my_reviews(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  return jsonb_build_object('ok', true, 'reviews', coalesce((
    select jsonb_agg(public.mmh__review_json(r) order by r.updated_at desc)
      from public.mmh_reviews r where r.patient_id = v_id), '[]'::jsonb));
end $$;

-- Insert or update. One review per patient per strain (catalogue product, or
-- the same free-text name). p_review.bought = true on an existing review
-- counts one more purchase.
create or replace function public.mmh_save_review(p_token text, p_review jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id   uuid := public.mmh__auth(p_token);
        v_p    public.mmh_patients;
        v_r    public.mmh_reviews;
        v_rid  uuid;
        v_pid  text;
        v_name text;
        v_verdict text;
        v_stars smallint;
        v_helped text[];
        v_bothered text[];
        v_note text;
        v_source text;
        v_publish boolean;
        v_ctx_on boolean;
        v_bought boolean;
        v_new boolean := false;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  if p_review is null or jsonb_typeof(p_review) <> 'object' or length(p_review::text) > 6000 then
    return public.mmh__err('review_invalid');
  end if;
  select * into v_p from public.mmh_patients where id = v_id;
  -- publishing needs a finished card (that is where consent is given)
  if coalesce(public.mmh__bool(p_review->'publish'), false) and v_p.consent_at is null then
    return public.mmh__err('card_incomplete');
  end if;
  v_pid  := public.mmh__text(p_review->'product_id', 200);
  v_name := public.mmh__text(p_review->'product_name', 60);

  if p_review->>'id' is not null then
    begin v_rid := (p_review->>'id')::uuid; exception when others then return public.mmh__err('review_invalid'); end;
    select * into v_r from public.mmh_reviews where id = v_rid and patient_id = v_id for update;
    if v_r.id is null then return public.mmh__err('not_found'); end if;
  elsif v_pid is not null then
    if not exists (select 1 from public.mmh_products where id = v_pid) then
      return public.mmh__err('product_unknown');
    end if;
    select * into v_r from public.mmh_reviews where patient_id = v_id and product_id = v_pid for update;
  elsif v_name is not null then
    select * into v_r from public.mmh_reviews
     where patient_id = v_id and product_id is null and lower(product_name) = lower(v_name) for update;
  else
    return public.mmh__err('product_missing');
  end if;

  v_verdict  := public.mmh__one(p_review->'verdict', array['like','unsure','dislike']);
  v_stars    := public.mmh__int(p_review->'stars', 1, 5);
  v_helped   := public.mmh__pick(p_review->'helped',
                  array['pain','sleep','anxiety','relaxation','mood','focus','appetite']);
  v_bothered := public.mmh__pick(p_review->'bothered',
                  array['dry_mouth','anxiety','dizziness','sedation','racing_heart','fog','bad_taste']);
  v_note     := public.mmh__text(p_review->'note', 400);
  v_source   := coalesce(public.mmh__one(p_review->'source', array['reco','own','history']), 'own');
  v_publish  := coalesce(public.mmh__bool(p_review->'publish'), false);
  v_ctx_on   := coalesce(public.mmh__bool(p_review->'share_context'), false);
  v_bought   := coalesce(public.mmh__bool(p_review->'bought'), false);

  if v_r.id is null then
    if (select count(*) from public.mmh_reviews where patient_id = v_id and created_at > now() - interval '1 day')
       >= public.mmh__setting_int('reviews_daily_cap', 30) then
      return public.mmh__err('too_many');
    end if;
    begin
      insert into public.mmh_reviews(patient_id, product_id, product_name, verdict, stars, helped,
                                     bothered, note, source, publish, share_context)
      values (v_id, v_pid, case when v_pid is null then v_name end, v_verdict, v_stars, v_helped,
              v_bothered, v_note, v_source, false, false)
      returning * into v_r;
      v_new := true;
    exception when unique_violation then
      -- the same strain saved twice at once: fall through and update the first one
      select * into v_r from public.mmh_reviews
       where patient_id = v_id
         and ((v_pid is not null and product_id = v_pid)
              or (v_pid is null and product_id is null and lower(product_name) = lower(v_name)))
       for update;
    end;
    -- a new review carries every field it was sent with
    p_review := p_review || jsonb_build_object('verdict', v_verdict, 'stars', v_stars, 'helped', v_helped,
                  'bothered', v_bothered, 'note', v_note, 'publish', v_publish);
  end if;

  update public.mmh_reviews set
    verdict  = case when p_review ? 'verdict'  then v_verdict  else verdict  end,
    stars    = case when p_review ? 'stars'    then v_stars    else stars    end,
    helped   = case when p_review ? 'helped'   then v_helped   else helped   end,
    bothered = case when p_review ? 'bothered' then v_bothered else bothered end,
    note     = case when p_review ? 'note'     then v_note     else note     end,
    publish  = case when p_review ? 'publish'  then v_publish  else publish  end,
    -- context can be shown only while published (the table refuses anything else)
    share_context = case when not (case when p_review ? 'publish' then v_publish else publish end) then false
                         when p_review ? 'share_context' or p_review ? 'publish' then v_ctx_on
                         else share_context end,
    buys     = least(99, buys + case when v_bought and not v_new then 1 else 0 end),
    -- a first real purchase of a strain that was only "tried before"
    source   = case when source = 'history' and v_bought then v_source else source end,
    updated_at = now()
  where id = v_r.id
  returning * into v_r;

  -- the context shown with the review is the card as it is at this save
  update public.mmh_reviews set
    ctx = case when share_context then jsonb_strip_nulls(jsonb_build_object(
                 'uses', v_p.card->'uses', 'grams', v_p.card->'grams')) end,
    feed_at = case when publish then coalesce(feed_at, now()) else feed_at end
  where id = v_r.id
  returning * into v_r;
  return jsonb_build_object('ok', true, 'created', v_new, 'review', public.mmh__review_json(v_r));
end $$;

create or replace function public.mmh_delete_review(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  delete from public.mmh_reviews where id = p_id and patient_id = v_id;
  if not found then return public.mmh__err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- photos ----
-- The app redraws every photo on the phone before upload, which removes EXIF
-- and GPS. The server refuses anything that is not a whole JPEG, and any JPEG
-- that still carries an EXIF or XMP block.

create or replace function public.mmh_add_photo(p_token text, p_review_id uuid,
  p_full text, p_thumb text, p_w int default null, p_h int default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_full bytea; v_thumb bytea; v_pid uuid; v_rid uuid;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  select id into v_rid from public.mmh_reviews where id = p_review_id and patient_id = v_id for update;
  if v_rid is null then return public.mmh__err('not_found'); end if;
  if (select count(*) from public.mmh_photos where review_id = v_rid) >= 3 then
    return public.mmh__err('photo_limit');
  end if;
  if (select count(*) from public.mmh_photos where patient_id = v_id) >= public.mmh__setting_int('photos_total_cap', 60) then
    return public.mmh__err('too_many');
  end if;
  if p_full is null or p_thumb is null then return public.mmh__err('photo_invalid'); end if;
  if length(p_full) > 820000 or length(p_thumb) > 82000 then return public.mmh__err('photo_too_big'); end if;
  begin
    v_full := decode(p_full, 'base64'); v_thumb := decode(p_thumb, 'base64');
  exception when others then return public.mmh__err('photo_invalid');
  end;
  if octet_length(v_full) > 600000 or octet_length(v_thumb) > 60000 then
    return public.mmh__err('photo_too_big');
  end if;
  if octet_length(v_full) < 100 or octet_length(v_thumb) < 100
     or substring(v_full from 1 for 3) <> '\xffd8ff'::bytea or substring(v_thumb from 1 for 3) <> '\xffd8ff'::bytea
     or substring(v_full from octet_length(v_full) - 1) <> '\xffd9'::bytea
     or substring(v_thumb from octet_length(v_thumb) - 1) <> '\xffd9'::bytea
     or position('\x457869660000'::bytea in v_full) > 0 or position('\x457869660000'::bytea in v_thumb) > 0
     or position(convert_to('http://ns.adobe.com/xap/', 'UTF8') in v_full) > 0
     or position(convert_to('http://ns.adobe.com/xap/', 'UTF8') in v_thumb) > 0 then
    return public.mmh__err('photo_invalid');
  end if;
  insert into public.mmh_photos(review_id, patient_id, full_jpeg, thumb_jpeg, w, h)
  values (v_rid, v_id, v_full, v_thumb,
          case when p_w between 1 and 10000 then p_w end, case when p_h between 1 and 10000 then p_h end)
  returning id into v_pid;
  return jsonb_build_object('ok', true, 'id', v_pid);
end $$;

create or replace function public.mmh_delete_photo(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  delete from public.mmh_photos where id = p_id and patient_id = v_id;
  if not found then return public.mmh__err('not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- the writer always sees their own photo; others only while the review is in the feed
create or replace function public.mmh_photo(p_token text, p_id uuid, p_size text default 'thumb') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_b bytea;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  select case when p_size = 'full' then ph.full_jpeg else ph.thumb_jpeg end into v_b
    from public.mmh_photos ph join public.mmh_reviews r on r.id = ph.review_id
   where ph.id = p_id and (ph.patient_id = v_id or (r.publish and not r.hidden));
  if v_b is null then return public.mmh__err('not_found'); end if;
  return jsonb_build_object('ok', true, 'jpeg', replace(encode(v_b, 'base64'), E'\n', ''));
end $$;

-- ------------------------------------------------------------------ feed ----
-- Whitelisted fields only. No patient id, no nickname, no exact time.
-- p_kind: null | 'like' | 'dislike'. p_like_me: only writers who chose to show
-- their indication and share one with the caller.

create or replace function public.mmh_feed(p_token text, p_offset int default 0, p_limit int default 20,
  p_product_id text default null, p_kind text default null, p_like_me boolean default false) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_uses text[];
        v_lim int := greatest(1, least(50, coalesce(p_limit, 20)));
        v_off int := greatest(0, least(100000, coalesce(p_offset, 0)));
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  select array(select jsonb_array_elements_text(coalesce(card->'uses', '[]'::jsonb)))
    into v_uses from public.mmh_patients where id = v_id;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(item order by ord) from (
      select row_number() over (order by r.feed_at desc, r.id) as ord,
             jsonb_build_object(
               'id', r.id,
               'product_id', r.product_id,
               'product_name', public.mmh__product_name(r),
               'verdict', r.verdict, 'stars', r.stars,
               'helped', to_jsonb(r.helped), 'bothered', to_jsonb(r.bothered),
               'note', r.note, 'source', r.source, 'buys', r.buys,
               'month', to_char(r.feed_at at time zone 'Asia/Jerusalem', 'YYYY-MM'),
               'photos', coalesce((select jsonb_agg(ph.id order by ph.created_at)
                                     from public.mmh_photos ph where ph.review_id = r.id), '[]'::jsonb),
               'ctx', case when r.share_context then r.ctx end,
               'mine', r.patient_id = v_id) as item
        from public.mmh_reviews r
       where r.publish and not r.hidden
         and (p_product_id is null or r.product_id = p_product_id)
         and (p_kind is null or r.verdict = p_kind)
         and (not coalesce(p_like_me, false)
              or (r.share_context and coalesce(r.ctx->'uses', '[]'::jsonb) ?| v_uses))
       order by r.feed_at desc, r.id
       offset v_off limit v_lim
    ) q), '[]'::jsonb));
end $$;

-- Three flags hide a review until Tomer looks at it. Only flags from patients
-- with a finished card and an account older than 12 hours count, and a review
-- Tomer has already put back (mmh_admin_unhide) is not hidden again.
create or replace function public.mmh_flag(p_token text, p_review_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid := public.mmh__auth(p_token);
        v_n int;
begin
  if v_id is null then return public.mmh__err('auth'); end if;
  if not exists (select 1 from public.mmh_reviews where id = p_review_id and publish and not hidden) then
    return public.mmh__err('not_found');
  end if;
  insert into public.mmh_flags(review_id, patient_id, reason)
  values (p_review_id, v_id, nullif(left(btrim(coalesce(p_reason, '')), 200), ''))
  on conflict (review_id, patient_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 1 and (select count(*) from public.mmh_flags f join public.mmh_patients p on p.id = f.patient_id
                   where f.review_id = p_review_id and p.consent_at is not null
                     and p.created_at < now() - interval '12 hours') >= 3 then
    update public.mmh_reviews set hidden = true where id = p_review_id and moderated_at is null;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ----------------------------------------------------------------- admin ----
-- Run these from the SQL editor only; the browser cannot call them.

-- select public.mmh_admin_set_key('a long secret');   -- key for the catalogue loader
create or replace function public.mmh_admin_set_key(p_key text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_key is null or char_length(p_key) < 16 then return 'key must be at least 16 characters'; end if;
  insert into public.mmh_settings(key, value)
  values ('admin_key_hash', to_jsonb(crypt(p_key, gen_salt('bf', 10))))
  on conflict (key) do update set value = excluded.value;
  return 'ok';
end $$;

-- select public.mmh_admin_reset_password('כינוי', 'new-password');
create or replace function public.mmh_admin_reset_password(p_nick text, p_new text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_key text := public.mmh__nick_key(p_nick);
begin
  if not public.mmh__pass_ok(p_new, v_key) then return 'password too short or too common'; end if;
  update public.mmh_patients set pass_hash = crypt(p_new, gen_salt('bf', 10))
   where nick_key = v_key returning id into v_id;
  if v_id is null then return 'no such nickname'; end if;
  delete from public.mmh_sessions where patient_id = v_id;
  delete from public.mmh_login_attempts where nick_key in (v_key, 'pw:' || v_id::text);
  return 'ok';
end $$;

-- select public.mmh_admin_set_invite('a-random-code');   -- or null to let anyone register
create or replace function public.mmh_admin_set_invite(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.mmh_settings(key, value) values ('invite_code', coalesce(to_jsonb(nullif(btrim(p_code), '')), 'null'::jsonb))
  on conflict (key) do update set value = excluded.value;
  return 'ok';
end $$;

-- select public.mmh_admin_unhide('<review id>');   -- puts a flagged review back, for good
create or replace function public.mmh_admin_unhide(p_review_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.mmh_reviews set hidden = false, moderated_at = now() where id = p_review_id;
  if not found then return 'no such review'; end if;
  delete from public.mmh_flags where review_id = p_review_id;
  return 'ok';
end $$;

-- select * from public.mmh_admin_overview();   -- numbers for following the pilot
create or replace function public.mmh_admin_overview()
returns table(patients bigint, with_card bigint, reviews bigint, in_feed bigint, hidden bigint,
              photos bigint, photo_mb numeric, flags bigint, products bigint, catalogue_from timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select (select count(*) from public.mmh_patients),
         (select count(*) from public.mmh_patients where card is not null),
         (select count(*) from public.mmh_reviews),
         (select count(*) from public.mmh_reviews where publish and not hidden),
         (select count(*) from public.mmh_reviews where hidden),
         (select count(*) from public.mmh_photos),
         (select round(coalesce(sum(octet_length(full_jpeg) + octet_length(thumb_jpeg)), 0) / 1048576.0, 1) from public.mmh_photos),
         (select count(*) from public.mmh_flags),
         (select count(*) from public.mmh_products where active),
         (select max(fetched_at) from public.mmh_products where active)
$$;

-- Called by the loader script with the key set above. Products that are not
-- in the new list stay in the table (reviews point at them) but turn inactive.
create or replace function public.mmh_admin_load_catalog(p_key text, p_products jsonb,
  p_fetched_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text := public.mmh__setting('admin_key_hash') #>> '{}';
        v_n int;
begin
  if v_hash is null or p_key is null or char_length(p_key) > 200 or v_hash <> crypt(p_key, v_hash) then
    return public.mmh__err('admin_key');
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) = 0 then
    return public.mmh__err('products_invalid');
  end if;
  if exists (select 1 from jsonb_array_elements(p_products) e
              where jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') = '' or coalesce(e->>'he', '') = '') then
    return public.mmh__err('products_invalid');
  end if;
  insert into public.mmh_products(id, data, active, fetched_at, updated_at)
  select e->>'id', e, true, p_fetched_at, now() from jsonb_array_elements(p_products) e
  on conflict (id) do update
    set data = excluded.data, active = true, fetched_at = excluded.fetched_at, updated_at = now();
  get diagnostics v_n = row_count;
  update public.mmh_products set active = false, updated_at = now()
   where active and id not in (select e->>'id' from jsonb_array_elements(p_products) e);
  return jsonb_build_object('ok', true, 'loaded', v_n,
    'active', (select count(*) from public.mmh_products where active),
    'inactive', (select count(*) from public.mmh_products where not active));
end $$;

-- ---------------------------------------------------------------- grants ----

do $$
declare f record;
begin
  -- nothing prefixed mmh_ is callable unless granted just below
  for f in select p.oid::regprocedure as sig from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'mmh\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'mmh_nick_available','mmh_signup','mmh_login','mmh_logout','mmh_me','mmh_save_card',
             'mmh_change_password','mmh_delete_account','mmh_catalog','mmh_stats','mmh_my_reviews',
             'mmh_save_review','mmh_delete_review','mmh_add_photo','mmh_delete_photo','mmh_photo',
             'mmh_feed','mmh_flag','mmh_admin_load_catalog') loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
