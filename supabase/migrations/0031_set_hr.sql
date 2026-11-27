-- 0031：每一組都可以記心率（組間／組末心率，教練填）
alter table public.training_sets
  add column hr smallint check (hr between 40 and 230);
