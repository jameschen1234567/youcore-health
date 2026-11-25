-- 0022：會員意見回饋（對話串）。不使用任何 LINE 推播，回覆顯示在 App 內，LINE 由管理員在聊天室手動回
create table public.feedback (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  topic          text not null check (topic in ('booking','course','article','foot','learning','training','live','app','other')),
  status         text not null default 'open' check (status in ('open','replied','closed')),
  client_unread  boolean not null default false,
  admin_unread   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index feedback_profile_idx on public.feedback (profile_id, updated_at desc);
create index feedback_open_idx on public.feedback (updated_at desc) where status <> 'closed';

create table public.feedback_messages (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references public.feedback(id) on delete cascade,
  from_admin   boolean not null,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index feedback_messages_idx on public.feedback_messages (feedback_id, created_at);

alter table public.feedback enable row level security;
alter table public.feedback_messages enable row level security;
create policy feedback_select on public.feedback for select using (profile_id = auth.uid() or public.is_admin());
create policy feedback_messages_select on public.feedback_messages for select using (
  public.is_admin() or exists (select 1 from public.feedback f where f.id = feedback_id and f.profile_id = auth.uid()));
revoke all on public.feedback, public.feedback_messages from anon, authenticated;
grant select on public.feedback, public.feedback_messages to authenticated;   -- 寫入只能經由下面的函式
grant all on public.feedback, public.feedback_messages to service_role;

-- 客戶每 24 小時最多 10 則（新回饋＋追問合計）
create or replace function public._feedback_quota(p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('feedback' || p_profile::text));
  if (select count(*) from public.feedback_messages m join public.feedback f on f.id = m.feedback_id
       where f.profile_id = p_profile and not m.from_admin and m.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'TOO_MANY';
  end if;
end;
$$;
revoke execute on function public._feedback_quota(uuid) from public, anon, authenticated;

create or replace function public.submit_feedback(p_topic text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare who uuid := auth.uid(); fid uuid;
begin
  if who is null or not exists (select 1 from public.profiles where id = who) then raise exception 'NOT_LOGGED_IN'; end if;
  if char_length(coalesce(trim(p_body), '')) not between 1 and 1000 then raise exception 'BAD_INPUT'; end if;
  perform public._feedback_quota(who);
  insert into public.feedback (profile_id, topic) values (who, p_topic) returning id into fid;
  insert into public.feedback_messages (feedback_id, from_admin, body) values (fid, false, trim(p_body));
  return fid;
end;
$$;

-- 追問（本人）或回覆（管理員）
create or replace function public.add_feedback_message(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare f public.feedback; as_admin boolean;
begin
  select * into f from public.feedback where id = p_id for update;
  if f.id is null or not (f.profile_id = auth.uid() or public.is_admin()) then raise exception 'NOT_FOUND'; end if;
  if char_length(coalesce(trim(p_body), '')) not between 1 and 1000 then raise exception 'BAD_INPUT'; end if;
  as_admin := public.is_admin();
  if not as_admin then
    if f.status = 'closed' then raise exception 'CLOSED'; end if;
    perform public._feedback_quota(auth.uid());
  end if;
  insert into public.feedback_messages (feedback_id, from_admin, body) values (p_id, as_admin, trim(p_body));
  update public.feedback set status = case when as_admin then 'replied' else 'open' end,
    client_unread = as_admin or (client_unread and as_admin), admin_unread = not as_admin, updated_at = now() where id = p_id;
end;
$$;

create or replace function public.mark_feedback_read(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then update public.feedback set admin_unread = false where id = p_id;
  else update public.feedback set client_unread = false where id = p_id and profile_id = auth.uid(); end if;
end;
$$;

create or replace function public.set_feedback_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update public.feedback set status = p_status, admin_unread = false, updated_at = now() where id = p_id;
end;
$$;
revoke execute on function public.submit_feedback(text, text), public.add_feedback_message(uuid, text), public.mark_feedback_read(uuid), public.set_feedback_status(uuid, text) from public, anon;
grant execute on function public.submit_feedback(text, text), public.add_feedback_message(uuid, text), public.mark_feedback_read(uuid), public.set_feedback_status(uuid, text) to authenticated;
