-- 0026：卸力（放鬆與出力時機）
--   發力模式的跑步、網球正拍、深蹲換新版（多一條「反方向肌肉」煞車滑桿）
--   日常姿勢新增 3 個卸力單元；聳肩打字設為免費試玩
update public.learning_modules set path = 'force-run.v2.html' where path = 'force-run.v1.html';
update public.learning_modules set path = 'force-tennis.v2.html' where path = 'force-tennis.v1.html';
update public.learning_modules set path = 'force-bsquat.v2.html' where path = 'force-bsquat.v1.html';

insert into public.learning_modules (title, summary, path, sort, published, category, free) values
  ('聳肩打字', '肩膀不知不覺聳起來，肩頸一直在加班。拉拉看放下肩膀後，哪些肌肉換手。', 'posture-shrug.v1.html', 111, true, 'posture', true),
  ('腳趾抓地站', '腳趾一抓，小腿和腳踝就跟著繃。看看重心放回腳掌中間的差別。', 'posture-toegrip.v1.html', 112, true, 'posture', false),
  ('咬牙低頭', '專心時咬緊牙齒，頸部前後和肩膀會一起出力。學會讓下顎放鬆。', 'posture-jaw.v1.html', 113, true, 'posture', false);
