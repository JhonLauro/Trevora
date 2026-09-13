-- Profile photos become private.
--
-- 013 made `profile-photos` public-read on the reasoning that an avatar carries
-- nothing private. It is still a photo of a person, and a public URL can be read
-- by anyone it reaches, for as long as the file exists. This brings the bucket in
-- line with `service-receipts` and `vehicle-photos` (015): private, owner-only
-- read, signed URL at render time.
--
-- ORDER MATTERS. Deploy the frontend that signs avatar URLs (`useAvatarSrc`)
-- BEFORE running this. That frontend works with the bucket public or private;
-- the one before it only works while the bucket is public, so running this first
-- would replace every uploaded photo with initials until the deploy lands.
--
-- No data changes. Files stay where they are, and the URL already stored in each
-- account's metadata is kept as a pointer: the app reads the path out of it and
-- signs that. The backend never reads avatars, and no screen shows one account's
-- photo to another account, so owner-only read is all anything needs.
--
-- The Supabase dashboard and the service role are not affected by policies and
-- can still open these files.
--
-- Rollback (needs no frontend change):
--   create policy "Profile photos are publicly readable"
--     on storage.objects for select using (bucket_id = 'profile-photos');
--   update storage.buckets set public = true where id = 'profile-photos';

-- 1. Owners read their own folder. Signing a URL needs this, and so does
--    deleting the previous photo after a new one is uploaded. Created before the
--    public policy is dropped so there is never a moment with neither.
drop policy if exists "Users read their own profile photo" on storage.objects;
create policy "Users read their own profile photo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. No other account, and nobody signed out, can read them.
drop policy if exists "Profile photos are publicly readable" on storage.objects;

-- 3. The public URL stops serving files.
update storage.buckets set public = false where id = 'profile-photos';

-- Check afterwards:
--   select id, public from storage.buckets where id = 'profile-photos';
--   select policyname, cmd, roles from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname ilike '%profile photo%';
-- Expect public = false and four policies: read, upload, update, delete, all
-- for `authenticated`.
