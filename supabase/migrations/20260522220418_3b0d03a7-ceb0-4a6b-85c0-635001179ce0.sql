
create table public.pattern_forge_uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  analysis jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error text,
  outputs_count int not null default 0
);
alter table public.pattern_forge_uploads enable row level security;
create policy "anon read forge uploads" on public.pattern_forge_uploads for select using (true);
create policy "anon insert forge uploads" on public.pattern_forge_uploads for insert with check (true);
create policy "anon update forge uploads" on public.pattern_forge_uploads for update using (true);
create policy "anon delete forge uploads" on public.pattern_forge_uploads for delete using (true);

insert into storage.buckets (id, name, public) values ('forge-uploads', 'forge-uploads', true)
on conflict (id) do nothing;

create policy "forge bucket public read" on storage.objects for select using (bucket_id = 'forge-uploads');
create policy "forge bucket anon insert" on storage.objects for insert with check (bucket_id = 'forge-uploads');
create policy "forge bucket anon update" on storage.objects for update using (bucket_id = 'forge-uploads');
create policy "forge bucket anon delete" on storage.objects for delete using (bucket_id = 'forge-uploads');
