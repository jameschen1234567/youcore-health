-- 0023：模擬教室新增「運動傷害」分類與 10 個單元（檔案在私有 bucket；仍需逐一開放）
alter table public.learning_modules drop constraint learning_modules_category_check;
alter table public.learning_modules add constraint learning_modules_category_check check (category in ('kinesiology', 'posture', 'injury'));

insert into public.learning_modules (title, summary, path, sort, published, category) values
  ('前十字韌帶撕裂', '落地與變向時，膝蓋怎麼把韌帶拉斷。', 'injury-acl.v1.html', 201, true, 'injury'),
  ('半月板撕裂', '腳固定、身體扭轉時，半月板怎麼被夾住。', 'injury-meniscus.v1.html', 202, true, 'injury'),
  ('腳踝外側扭傷', '拉動內翻與腳尖朝下，看哪條韌帶先受傷。', 'injury-ankle.v1.html', 203, true, 'injury'),
  ('阿基里斯腱斷裂', '蹬地瞬間，跟腱為什麼會斷。', 'injury-achilles.v1.html', 204, true, 'injury'),
  ('膕旁肌拉傷', '衝刺時大腿後側在哪個位置最容易拉傷。', 'injury-hamstring.v1.html', 205, true, 'injury'),
  ('腰椎間盤突出', '從膨出到脫出，神經根怎麼受壓。', 'injury-disc.v1.html', 206, true, 'injury'),
  ('肩關節前脫臼', '外展加外轉，肱骨頭怎麼滑出去。', 'injury-disloc.v1.html', 207, true, 'injury'),
  ('旋轉肌撕裂', '從磨損到完全撕裂，抬手會怎麼變。', 'injury-cuff.v1.html', 208, true, 'injury'),
  ('五十肩', '三個階段，關節囊怎麼變緊又恢復。', 'injury-frozen.v1.html', 209, true, 'injury'),
  ('網球肘', '抓握與手腕負荷，肌腱怎麼慢慢出問題。', 'injury-tennis.v1.html', 210, true, 'injury');
