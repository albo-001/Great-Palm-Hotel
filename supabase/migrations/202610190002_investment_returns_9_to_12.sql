alter table public.investment_positions
  alter column daily_return_percent
    set default round((9 + random() * 3)::numeric, 3);

alter table public.investment_positions
  drop constraint investment_positions_daily_return_percent_range,
  add constraint investment_positions_daily_return_percent_range
    check (daily_return_percent between 9 and 12);

update public.investment_positions
  set daily_return_percent = round((9 + random() * 3)::numeric, 3);
