-- 0025：模擬教室新增「發力模式」分類與 10 個單元（檔案在私有 bucket）；深蹲設為免費試玩
alter table public.learning_modules drop constraint learning_modules_category_check;
alter table public.learning_modules add constraint learning_modules_category_check check (category in ('kinesiology', 'posture', 'injury', 'force'));

insert into public.learning_modules (title, summary, path, sort, published, category, free) values
  ('高爾夫揮桿', '桿頭速度從地面和髖部來，看下桿時身體怎麼一節一節傳力。', 'force-golf.v1.html', 301, true, 'force', false),
  ('網球正拍', '從腳蹬地、髖與軀幹轉動，到手臂揮拍的發力鏈。', 'force-tennis.v1.html', 302, true, 'force', false),
  ('籃球跳投', '蹲下蓄力、腳蹬地，力量怎麼從腳往上送到出手。', 'force-jumpshot.v1.html', 303, true, 'force', false),
  ('足球腳背踢球', '支撐腳站位與骨盆帶動，踢球像甩鞭子一樣傳力。', 'force-kick.v1.html', 304, true, 'force', false),
  ('跑步', '臀部往後推蹬、腳落在身體下方，跑得省力又少受傷。', 'force-run.v1.html', 305, true, 'force', false),
  ('深蹲', '髖和膝一起出力：臀部往後坐、膝蓋跟腳尖同方向。', 'force-bsquat.v1.html', 306, true, 'force', true),
  ('硬舉', '把地上的重量「推」起來：腿推地、背保持中立。', 'force-deadlift.v1.html', 307, true, 'force', false),
  ('臥推', '肩胛骨先收緊下壓當穩固底座，再推起槓鈴。', 'force-bench.v1.html', 308, true, 'force', false),
  ('俯身划船', '從肩胛骨開始拉，背部出力、手臂只是掛鉤。', 'force-row.v1.html', 309, true, 'force', false),
  ('引體向上', '第一步是把肩胛骨往下拉，再用背把身體拉上去。', 'force-pullup.v1.html', 310, true, 'force', false);
