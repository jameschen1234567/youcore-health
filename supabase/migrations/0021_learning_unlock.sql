-- 0021：模擬教室改為「逐單元手動開放」
--   要看到內容必須同時符合：使用期限內（learning_grants）＋ 該單元已由管理員為這位客戶開放（learning_unlocks）＋ 單元為公開

alter table public.learning_modules
  add column category text not null default 'kinesiology' check (category in ('kinesiology', 'posture'));

create table public.learning_unlocks (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  module_id   uuid not null references public.learning_modules(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, module_id)
);
alter table public.learning_unlocks enable row level security;
create policy learning_unlocks_select on public.learning_unlocks for select using (profile_id = auth.uid() or public.is_admin());
revoke all on public.learning_unlocks from anon, authenticated;
grant select on public.learning_unlocks to authenticated;
grant all on public.learning_unlocks to service_role;

-- 已經有期限的客戶，原本看得到的單元維持開放
insert into public.learning_unlocks (profile_id, module_id)
select distinct g.profile_id, m.id from public.learning_grants g cross join public.learning_modules m
 where g.revoked_at is null and g.expires_on >= (now() at time zone 'Asia/Taipei')::date and m.published;

create or replace function public.can_open_learning(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.has_learning_access() and exists (
      select 1 from public.learning_modules m join public.learning_unlocks u on u.module_id = m.id
       where m.path = p_path and m.published and u.profile_id = auth.uid()));
$$;
revoke execute on function public.can_open_learning(text) from public, anon;
grant execute on function public.can_open_learning(text) to authenticated;

drop policy learning_read on storage.objects;
create policy learning_read on storage.objects for select to authenticated
  using (bucket_id = 'learning' and public.can_open_learning(name));

-- 設定一位客戶開放哪些單元（整份覆蓋）
create or replace function public.set_learning_unlocks(p_profile uuid, p_modules uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.profiles where id = p_profile for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  delete from public.learning_unlocks where profile_id = p_profile and module_id <> all (coalesce(p_modules, '{}'));
  insert into public.learning_unlocks (profile_id, module_id)
  select p_profile, id from public.learning_modules where id = any (coalesce(p_modules, '{}'))
  on conflict do nothing;
  select count(*) into n from public.learning_unlocks where profile_id = p_profile;
  return n;
end;
$$;
revoke execute on function public.set_learning_unlocks(uuid, uuid[]) from public, anon;
grant execute on function public.set_learning_unlocks(uuid, uuid[]) to authenticated;

insert into public.learning_modules (title, summary, path, sort, published, category) values
  ('翹腳坐', '骨盆為什麼會歪、哪些肌肉被拉長，怎麼坐比較平均。', 'posture-crossleg.html', 101, true, 'posture'),
  ('滑鼠手與腕隧道', '拉動手腕角度，看正中神經和前臂怎麼受影響。', 'posture-mouse.html', 102, true, 'posture'),
  ('頸前移與低頭族', '看電腦、滑手機時，頭往前對後頸與肩膀的影響。', 'posture-neck.html', 103, true, 'posture'),
  ('側睡', '枕頭高度與夾枕頭，怎麼避免頸部與腰椎扭轉。', 'posture-sleep.html', 104, true, 'posture'),
  ('彎腰拿東西', '彎腰和髖膝一起用力，差在哪裡。', 'posture-lift.html', 105, true, 'posture'),
  ('走路：腳跟先著地', '看腳掌怎麼滾動、小腿和臀部怎麼出力。', 'posture-walk.html', 106, true, 'posture'),
  ('上下樓梯', '下樓的緩衝與前掌先接、上樓的臀腿推進。', 'posture-stairs.html', 107, true, 'posture'),
  ('提東西、拿東西', '用背和肩膀分擔，減少前臂與手肘代償。', 'posture-carry.html', 108, true, 'posture'),
  ('圓肩駝背與呼吸', '看胸廓與橫膈膜在不同姿勢能動多少。', 'posture-round.html', 109, true, 'posture'),
  ('久坐與窩沙發', '腰部懸空時腰椎的變化，以及怎麼用臀腿站起來。', 'posture-sofa.html', 110, true, 'posture');
