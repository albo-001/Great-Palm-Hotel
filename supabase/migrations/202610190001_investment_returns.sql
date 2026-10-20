alter table public.investment_positions
  add column daily_return_percent numeric(5, 3) not null
    default round((5 + random() * 3)::numeric, 3),
  add column returns_paid numeric(14, 2) not null default 0,
  add constraint investment_positions_daily_return_percent_range
    check (daily_return_percent between 5 and 8),
  add constraint investment_positions_returns_paid_nonnegative
    check (returns_paid >= 0);

create or replace function public.claim_investment_returns()
returns table (amount_claimed numeric, balance numeric)
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
  v_total_claimed numeric(14, 2) := 0;
begin
  if v_user_id is null then
    raise exception 'Sign in is required.';
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
      v_total_claimed := v_total_claimed + v_claimable;
    end if;
  end loop;

  if v_total_claimed > 0 then
    update public.wallets as wallet
      set balance = wallet.balance + v_total_claimed, updated_at = now()
      where wallet.user_id = v_user_id
      returning wallet.balance into v_balance;
  end if;

  return query select v_total_claimed, v_balance;
end;
$$;

revoke all on function public.claim_investment_returns() from public, anon;
grant execute on function public.claim_investment_returns() to authenticated;
