-- Local development seed (run with `supabase db reset`).
-- Creates a confirmed demo user (demo@trackademia.local / trackademia-demo)
-- with a few notes. Never run this against production.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated', 'demo@trackademia.local',
  crypt('trackademia-demo', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Demo Student"}',
  now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
  '{"sub":"11111111-1111-4111-8111-111111111111","email":"demo@trackademia.local"}', 'email', now(), now(), now()
) on conflict do nothing;

update public.profiles set timezone = 'Asia/Manila' where id = '11111111-1111-4111-8111-111111111111';

insert into public.notes (user_id, title, content) values
  ('11111111-1111-4111-8111-111111111111', 'Thesis plan',
   'Submit thesis draft next Monday at 3pm.' || chr(10) || 'Meeting with Sarah on November 10 at 9am to review chapter 2.'),
  ('11111111-1111-4111-8111-111111111111', 'Errands',
   'Dentist appointment tomorrow at 10am.' || chr(10) || 'Pay electricity bill on the 15th.'),
  ('11111111-1111-4111-8111-111111111111', 'Reading list',
   'Finish "Deep Work" and summarise the chapter on attention residue.');
