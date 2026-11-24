-- 0015：身體性別只留男生、女生（2026-11-25 確認正式資料沒有 other）
alter table public.profiles drop constraint profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in ('male', 'female'));
