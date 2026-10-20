alter table public.investment_positions
  add column if not exists daily_return_percent numeric(5, 3)
    not null default round((9 + random() * 3)::numeric, 3),
  add column if not exists returns_paid numeric(14, 2)
    not null default 0;

alter table public.investment_positions
  drop constraint if exists investment_positions_daily_return_percent_range,
  drop constraint if exists investment_positions_returns_paid_nonnegative;

update public.investment_positions
  set daily_return_percent = round((9 + random() * 3)::numeric, 3)
  where daily_return_percent is null
    or daily_return_percent < 9
    or daily_return_percent > 12;

update public.investment_positions
  set returns_paid = 0
  where returns_paid is null or returns_paid < 0;

alter table public.investment_positions
  alter column daily_return_percent set default round((9 + random() * 3)::numeric, 3),
  alter column daily_return_percent set not null,
  alter column returns_paid set default 0,
  alter column returns_paid set not null,
  add constraint investment_positions_daily_return_percent_range
    check (daily_return_percent between 9 and 12),
  add constraint investment_positions_returns_paid_nonnegative
    check (returns_paid >= 0);

create or replace function public.swap_investment_returns()
returns table (amount_swapped numeric, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric(14, 2);
  v_position record;
  v_earned numeric(14, 2);
  v_claimable numeric(14, 2);
  v_total_swapped numeric(14, 2) := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to swap investment returns.';
  end if;

  select w.balance into v_balance
    from public.wallets w
    where w.user_id = v_user_id
    for update;
  if v_balance is null then
    raise exception 'Wallet is unavailable.';
  end if;

  for v_position in
    select p.id, p.symbol, p.amount_charged, p.daily_return_percent,
      p.returns_paid, p.created_at, p.expires_at
    from public.investment_positions p
    where p.user_id = v_user_id
    order by p.id
    for update
  loop
    if v_position.daily_return_percent < 9 or v_position.daily_return_percent > 12 then
      raise exception 'Apply the 9-12 percent investment returns migration before swapping returns.';
    end if;

    v_earned := round(
      v_position.amount_charged * v_position.daily_return_percent / 100
      * least(
        30::numeric,
        greatest(
          0::numeric,
          extract(epoch from (least(now(), v_position.expires_at) - v_position.created_at)) / 86400
        )
      ),
      2
    );
    v_claimable := greatest(0, v_earned - v_position.returns_paid);
    if v_claimable > 0 then
      update public.investment_positions
        set returns_paid = v_earned
        where id = v_position.id;
      insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
        values (
          v_user_id,
          'swap',
          v_position.symbol || ' simulated investment returns',
          v_claimable,
          v_position.id
        );
      v_total_swapped := v_total_swapped + v_claimable;
    end if;
  end loop;

  if v_total_swapped > 0 then
    update public.wallets as wallet
      set balance = wallet.balance + v_total_swapped, updated_at = now()
      where wallet.user_id = v_user_id
      returning wallet.balance into v_balance;
  end if;

  return query select v_total_swapped, v_balance;
end;
$$;

revoke all on function public.swap_investment_returns() from public, anon;
grant execute on function public.swap_investment_returns() to authenticated;
