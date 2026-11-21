insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'influencer-analysis',
  'influencer-analysis',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users upload own analysis materials" on storage.objects;
create policy "Authenticated users upload own analysis materials"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'influencer-analysis'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Authenticated users read own analysis materials" on storage.objects;
create policy "Authenticated users read own analysis materials"
on storage.objects for select
to authenticated
using (
  bucket_id = 'influencer-analysis'
  and split_part(name, '/', 1) = auth.uid()::text
);
