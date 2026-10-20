create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone_number text not null check (char_length(trim(phone_number)) between 3 and 32),
  referral_code text not null unique,
  referred_by uuid references public.profiles(user_id),
  first_investment_discount_used boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_not_self_referred check (referred_by is null or referred_by <> user_id)
);

create table public.wallets (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  category text not null check (category in ('bid', 'deposit', 'withdraw', 'investment', 'swap', 'referral_commission')),
  description text not null,
  amount numeric(14, 2) not null check (amount <> 0),
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.investment_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 16),
  company text not null,
  shares numeric(14, 4) not null check (shares > 0),
  gross_value numeric(14, 2) not null check (gross_value > 0),
  amount_charged numeric(14, 2) not null check (amount_charged > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.investment_assets (
  symbol text primary key,
  company text not null,
  unit_price numeric(14, 2) not null check (unit_price > 0),
  active boolean not null default true
);

create table public.auctions (
  id text primary key,
  title text not null,
  image_url text not null,
  starting_bid numeric(14, 2) not null check (starting_bid >= 0),
  bid_target integer not null check (bid_target > 0),
  prize_value numeric(14, 2),
  active boolean not null default true,
  constraint auctions_prize_value_positive check (prize_value is null or prize_value > 0)
);

create table public.auction_rounds (
  id uuid primary key default gen_random_uuid(),
  auction_id text not null references public.auctions(id),
  round_number integer not null check (round_number > 0),
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (auction_id, round_number)
);

create unique index auction_rounds_one_active_per_auction
  on public.auction_rounds(auction_id) where status = 'active';

create table public.auction_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.auction_rounds(id),
  user_id uuid not null references public.profiles(user_id),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table public.auction_results (
  id uuid primary key default gen_random_uuid(),
  auction_id text not null references public.auctions(id),
  round_number integer not null,
  winner_name text not null,
  completed_at timestamptz not null default now(),
  unique (auction_id, round_number)
);

create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(user_id),
  invitee_id uuid not null references public.profiles(user_id),
  investment_id uuid not null unique references public.investment_positions(id),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (inviter_id, invitee_id),
  constraint referral_rewards_distinct_users check (inviter_id <> invitee_id)
);

create table public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  reward_type text not null check (reward_type in ('auction_win', 'first_investment', 'referral_commission')),
  title text not null,
  detail text not null,
  amount numeric(14, 2),
  created_at timestamptz not null default now()
);

create table public.platform_ledger (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('first_investment_discount', 'referral_commission')),
  user_id uuid not null references public.profiles(user_id),
  related_user_id uuid references public.profiles(user_id),
  reference_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (event_type, reference_id)
);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  request_type text not null check (request_type in ('deposit', 'withdraw')),
  amount numeric(14, 2) not null check (amount > 0),
  phone_number text not null check (char_length(trim(phone_number)) between 3 and 32),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text
);

create table public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  duration_months integer not null check (duration_months between 1 and 60),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text
);

create index wallet_transactions_user_created_idx
  on public.wallet_transactions(user_id, created_at desc);
create index investment_positions_user_symbol_expiry_idx
  on public.investment_positions(user_id, symbol, expires_at);
create index auction_entries_round_created_idx
  on public.auction_entries(round_id, created_at);
create index reward_events_user_created_idx
  on public.reward_events(user_id, created_at desc);
create index payment_requests_user_created_idx
  on public.payment_requests(user_id, created_at desc);
create index loan_applications_user_created_idx
  on public.loan_applications(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.investment_positions enable row level security;
alter table public.investment_assets enable row level security;
alter table public.auctions enable row level security;
alter table public.auction_rounds enable row level security;
alter table public.auction_entries enable row level security;
alter table public.auction_results enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.reward_events enable row level security;
alter table public.platform_ledger enable row level security;
alter table public.payment_requests enable row level security;
alter table public.loan_applications enable row level security;

revoke all on public.profiles, public.wallets, public.wallet_transactions,
  public.investment_positions, public.auctions, public.auction_rounds,
  public.investment_assets,
  public.auction_entries, public.auction_results, public.referral_rewards,
  public.reward_events, public.platform_ledger, public.payment_requests,
  public.loan_applications from public, anon, authenticated;

grant select on public.profiles, public.wallets, public.wallet_transactions,
  public.investment_positions, public.auctions, public.auction_rounds,
  public.auction_entries, public.auction_results, public.referral_rewards,
  public.reward_events, public.payment_requests, public.loan_applications to authenticated;
grant update (full_name, phone_number) on public.profiles to authenticated;

create policy "Users read their profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users update their display details"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users read their wallet"
  on public.wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their transactions"
  on public.wallet_transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their investments"
  on public.investment_positions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Auctions are public"
  on public.auctions for select to anon, authenticated using (active);
create policy "Authenticated users read auction rounds"
  on public.auction_rounds for select to authenticated using (true);
create policy "Users read their auction entries"
  on public.auction_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Auction results are public"
  on public.auction_results for select to anon, authenticated using (true);
create policy "Users read their referral rewards"
  on public.referral_rewards for select to authenticated using ((select auth.uid()) = inviter_id);
create policy "Users read their rewards"
  on public.reward_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their payment requests"
  on public.payment_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users read their loan requests"
  on public.loan_applications for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.create_user_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral_code text;
  v_referrer_id uuid;
begin
  if nullif(trim(new.raw_user_meta_data ->> 'referral_code'), '') is not null then
    select p.user_id into v_referrer_id
    from public.profiles p
    where p.referral_code = upper(trim(new.raw_user_meta_data ->> 'referral_code'));

    if v_referrer_id is null then
      raise exception 'The referral code is invalid.';
    end if;
  end if;

  loop
    v_referral_code := 'DN' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    begin
      insert into public.profiles (user_id, full_name, phone_number, referral_code, referred_by)
      values (
        new.id,
        trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')),
        trim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')),
        v_referral_code,
        v_referrer_id
      );
      exit;
    exception when unique_violation then
      if exists (select 1 from public.profiles p where p.user_id = new.id) then
        raise;
      end if;
    end;
  end loop;

  insert into public.wallets (user_id, balance) values (new.id, 0);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_user_account();
revoke all on function public.create_user_account() from public, anon, authenticated;

create or replace function public.auction_next_entry_amount(
  p_auction_id text,
  p_round integer,
  p_count integer,
  p_total numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auction public.auctions%rowtype;
  v_remaining numeric(14, 2);
  v_after integer;
  v_min numeric(14, 2);
  v_max numeric(14, 2);
  v_hash numeric;
begin
  select * into v_auction from public.auctions a where a.id = p_auction_id;
  if not found then raise exception 'Auction is unavailable.'; end if;
  if v_auction.prize_value is null then
    return v_auction.starting_bid + p_count + 1;
  end if;
  v_remaining := v_auction.prize_value - p_total;
  v_after := v_auction.bid_target - p_count - 1;
  v_min := greatest(50, v_remaining - (199 * v_after));
  v_max := least(199, v_remaining - (50 * v_after));
  if p_count >= v_auction.bid_target or v_min > v_max then
    raise exception 'Auction entry pricing is misconfigured.';
  end if;
  v_hash := abs(hashtextextended(p_auction_id || '-' || p_round || '-' || p_count, 0)::numeric);
  return v_min + mod(v_hash, v_max - v_min + 1);
end;
$$;
revoke all on function public.auction_next_entry_amount(text, integer, integer, numeric) from public, anon, authenticated;

create or replace function public.get_auction_statuses()
returns table (
  auction_id text,
  round_number integer,
  entry_count bigint,
  total_amount numeric,
  last_amount numeric,
  last_winner text,
  last_won_at timestamptz,
  next_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id,
    coalesce(r.round_number, 1),
    coalesce(entries.entry_count, 0),
    coalesce(entries.total_amount, 0),
    coalesce(entries.last_amount, 0),
    result.winner_name,
    result.completed_at,
    public.auction_next_entry_amount(a.id, coalesce(r.round_number, 1),
      coalesce(entries.entry_count, 0)::integer, coalesce(entries.total_amount, 0))
  from public.auctions a
  left join lateral (
    select ar.id, ar.round_number
    from public.auction_rounds ar
    where ar.auction_id = a.id and ar.status = 'active'
    order by ar.round_number desc limit 1
  ) r on true
  left join lateral (
    select count(*) as entry_count, coalesce(sum(ae.amount), 0) as total_amount,
      (array_agg(ae.amount order by ae.created_at desc))[1] as last_amount
    from public.auction_entries ae where ae.round_id = r.id
  ) entries on true
  left join lateral (
    select ar.winner_name, ar.completed_at
    from public.auction_results ar
    where ar.auction_id = a.id
    order by ar.round_number desc limit 1
  ) result on true
  where a.active;
$$;
grant execute on function public.get_auction_statuses() to anon, authenticated;

create or replace function public.buy_demo_investment(
  p_symbol text,
  p_company text,
  p_shares numeric,
  p_unit_price numeric
)
returns table (investment_id uuid, amount_charged numeric, discount_amount numeric, balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_asset public.investment_assets%rowtype;
  v_balance numeric(14, 2);
  v_gross numeric(14, 2);
  v_discount numeric(14, 2);
  v_charge numeric(14, 2);
  v_position_id uuid;
  v_commission numeric(14, 2);
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  if p_symbol is null or char_length(trim(p_symbol)) not between 1 and 16
    or p_company is null or char_length(trim(p_company)) not between 1 and 160
    or p_shares is null or p_shares <= 0 or p_shares > 1000000
    or p_unit_price is null or p_unit_price <= 0 then
    raise exception 'Invalid investment details.';
  end if;
  select * into v_asset from public.investment_assets a
    where a.symbol = upper(trim(p_symbol)) and a.active;
  if not found or p_company <> v_asset.company or p_unit_price <> v_asset.unit_price then
    raise exception 'The asset quote is invalid or out of date.';
  end if;
  select * into v_profile from public.profiles p where p.user_id = v_user_id for update;
  select w.balance into v_balance from public.wallets w where w.user_id = v_user_id for update;
  if v_balance is null then raise exception 'Wallet is unavailable.'; end if;
  if exists (
    select 1 from public.investment_positions ip
    where ip.user_id = v_user_id and ip.symbol = upper(trim(p_symbol)) and ip.expires_at > now()
  ) then
    raise exception 'This asset is in its 30-day investment term.';
  end if;

  v_gross := round(p_shares * p_unit_price, 2);
  v_discount := case when v_profile.first_investment_discount_used then 0 else round(v_gross * 0.20, 2) end;
  v_charge := v_gross - v_discount;
  if v_charge <= 0 or v_balance < v_charge then raise exception 'Insufficient account balance.'; end if;

  update public.wallets set balance = balance - v_charge, updated_at = now()
    where user_id = v_user_id returning balance into v_balance;
  insert into public.investment_positions (
    user_id, symbol, company, shares, gross_value, amount_charged, expires_at
  ) values (
    v_user_id, upper(trim(p_symbol)), trim(p_company), p_shares, v_gross, v_charge, now() + interval '30 days'
  ) returning id into v_position_id;
  insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
    values (v_user_id, 'investment', upper(trim(p_symbol)) || ' demo investment', -v_charge, v_position_id);

  if not v_profile.first_investment_discount_used then
    update public.profiles set first_investment_discount_used = true where user_id = v_user_id;
  end if;
  if v_discount > 0 then
    insert into public.platform_ledger (event_type, user_id, reference_id, amount)
      values ('first_investment_discount', v_user_id, v_position_id, v_discount);
    insert into public.reward_events (user_id, reward_type, title, detail, amount)
      values (v_user_id, 'first_investment', '20% first-investment offer',
        'Saved KSh ' || to_char(v_discount, 'FM999999999990.00') || ' on ' || upper(trim(p_symbol)), v_discount);
  end if;

  if v_profile.referred_by is not null and not v_profile.first_investment_discount_used then
    v_commission := round(v_gross * 0.20, 2);
    if v_commission > 0 then
      update public.wallets set balance = balance + v_commission, updated_at = now()
        where user_id = v_profile.referred_by;
      insert into public.referral_rewards (inviter_id, invitee_id, investment_id, amount)
        values (v_profile.referred_by, v_user_id, v_position_id, v_commission);
      insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
        values (v_profile.referred_by, 'referral_commission', 'Referral first-investment commission', v_commission, v_position_id);
      insert into public.platform_ledger (event_type, user_id, related_user_id, reference_id, amount)
        values ('referral_commission', v_profile.referred_by, v_user_id, v_position_id, v_commission);
      insert into public.reward_events (user_id, reward_type, title, detail, amount)
        values (v_profile.referred_by, 'referral_commission', 'Referral commission',
          '20% of invitee’s first investment', v_commission);
    end if;
  end if;

  return query select v_position_id, v_charge, v_discount, v_balance;
end;
$$;
revoke all on function public.buy_demo_investment(text, text, numeric, numeric) from public, anon;
grant execute on function public.buy_demo_investment(text, text, numeric, numeric) to authenticated;

create or replace function public.place_auction_bid(p_auction_id text)
returns table (
  entry_amount numeric,
  winner_name text,
  new_round integer,
  balance numeric,
  entry_count integer,
  total_amount numeric,
  last_amount numeric,
  next_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_auction public.auctions%rowtype;
  v_round public.auction_rounds%rowtype;
  v_count integer;
  v_total numeric(14, 2);
  v_amount numeric(14, 2);
  v_balance numeric(14, 2);
  v_winner uuid;
  v_winner_name text;
  v_round_number integer;
  v_last_amount numeric(14, 2);
  v_next_amount numeric(14, 2);
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  select * into v_auction from public.auctions a where a.id = p_auction_id and a.active;
  if not found then raise exception 'Auction is unavailable.'; end if;
  select * into v_round from public.auction_rounds r
    where r.auction_id = p_auction_id and r.status = 'active' for update;
  if not found then raise exception 'Auction round is unavailable.'; end if;

  select count(*)::integer, coalesce(sum(e.amount), 0)
    into v_count, v_total from public.auction_entries e where e.round_id = v_round.id;
  if v_count >= v_auction.bid_target then raise exception 'Auction round is complete.'; end if;

  v_amount := public.auction_next_entry_amount(p_auction_id, v_round.round_number, v_count, v_total);

  select w.balance into v_balance from public.wallets w where w.user_id = v_user_id for update;
  if v_balance is null or v_balance < v_amount then raise exception 'Insufficient account balance.'; end if;
  update public.wallets set balance = balance - v_amount, updated_at = now()
    where user_id = v_user_id returning balance into v_balance;
  insert into public.auction_entries (round_id, user_id, amount) values (v_round.id, v_user_id, v_amount);
  insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
    values (v_user_id, 'bid', v_auction.title, -v_amount, v_round.id);

  select count(*)::integer into v_count from public.auction_entries e where e.round_id = v_round.id;
  if v_count >= v_auction.bid_target then
    select e.user_id into v_winner from public.auction_entries e
      where e.round_id = v_round.id order by random() limit 1;
    select string_agg(upper(left(part, 1)), '. ') || '.'
      into v_winner_name
      from public.profiles p,
        regexp_split_to_table(trim(p.full_name), '\s+') as words(part)
      where p.user_id = v_winner;
    update public.auction_rounds set status = 'completed', completed_at = now() where id = v_round.id;
    insert into public.auction_results (auction_id, round_number, winner_name)
      values (p_auction_id, v_round.round_number, coalesce(v_winner_name, 'Winner'));
    insert into public.reward_events (user_id, reward_type, title, detail)
      values (v_winner, 'auction_win', 'Won ' || v_auction.title, 'Auction round ' || v_round.round_number);
    insert into public.auction_rounds (auction_id, round_number) values (p_auction_id, v_round.round_number + 1);
    v_round_number := v_round.round_number + 1;
    v_count := 0;
    v_total := 0;
    v_last_amount := null;
  else
    v_round_number := v_round.round_number;
    v_total := v_total + v_amount;
    v_last_amount := v_amount;
  end if;

  v_next_amount := public.auction_next_entry_amount(p_auction_id, v_round_number, v_count, v_total);
  return query select v_amount, case when v_winner is not null then v_winner_name else null end,
    v_round_number, v_balance, v_count, v_total, v_last_amount, v_next_amount;
end;
$$;
revoke all on function public.place_auction_bid(text) from public, anon;
grant execute on function public.place_auction_bid(text) to authenticated;

create or replace function public.submit_payment_request(
  p_request_type text,
  p_amount numeric,
  p_phone_number text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if p_request_type not in ('deposit', 'withdraw') or p_amount is null
    or p_amount <= 0 or p_amount > 10000000 or char_length(trim(p_phone_number)) not between 3 and 32 then
    raise exception 'Invalid payment request.';
  end if;
  insert into public.payment_requests (user_id, request_type, amount, phone_number)
    values (auth.uid(), p_request_type, round(p_amount, 2), trim(p_phone_number))
    returning id into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function public.submit_payment_request(text, numeric, text) from public, anon;
grant execute on function public.submit_payment_request(text, numeric, text) to authenticated;

create or replace function public.submit_loan_application(p_amount numeric, p_duration_months integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000
    or p_duration_months not between 1 and 60 then
    raise exception 'Invalid loan application.';
  end if;
  insert into public.loan_applications (user_id, amount, duration_months)
    values (auth.uid(), round(p_amount, 2), p_duration_months)
    returning id into v_application_id;
  return v_application_id;
end;
$$;
revoke all on function public.submit_loan_application(numeric, integer) from public, anon;
grant execute on function public.submit_loan_application(numeric, integer) to authenticated;

insert into public.investment_assets (symbol, company, unit_price) values
  ('AAPL', 'Apple', 214.75),
  ('TSLA', 'Tesla', 251.84),
  ('NVDA', 'NVIDIA', 132.49),
  ('MSFT', 'Microsoft', 443.12),
  ('GOOGL', 'Alphabet (Google)', 174.65),
  ('AMZN', 'Amazon', 184.29),
  ('META', 'Meta Platforms', 512.83),
  ('AVGO', 'Broadcom', 170.54),
  ('AMD', 'AMD', 164.91),
  ('INTC', 'Intel', 48.29),
  ('QCOM', 'Qualcomm', 160.1),
  ('MU', 'Micron Technology', 116.43),
  ('PLTR', 'Palantir Technologies', 26.46),
  ('ORCL', 'Oracle', 170.72),
  ('CRM', 'Salesforce', 275.63),
  ('ADBE', 'Adobe', 521.48),
  ('IBM', 'IBM', 166.35),
  ('CSCO', 'Cisco Systems', 62.91),
  ('NFLX', 'Netflix', 681.9),
  ('ARM', 'Arm Holdings', 146.08),
  ('SMCI', 'Super Micro Computer', 1287.22),
  ('DELL', 'Dell Technologies', 132.7),
  ('NOW', 'ServiceNow', 980.1),
  ('SHOP', 'Shopify', 64.42),
  ('SNOW', 'Snowflake', 170.58),
  ('JPM', 'JPMorgan Chase', 214.85),
  ('BAC', 'Bank of America', 44.75),
  ('GS', 'Goldman Sachs', 528.91),
  ('V', 'Visa', 281.72),
  ('MA', 'Mastercard', 487.2),
  ('BRK.B', 'Berkshire Hathaway', 448.19),
  ('WMT', 'Walmart', 69.44),
  ('COST', 'Costco', 853.63),
  ('KO', 'Coca-Cola', 61.88),
  ('PEP', 'PepsiCo', 170.49),
  ('MCD', 'McDonald''s', 297.71),
  ('NKE', 'Nike', 98.12),
  ('TM', 'Toyota Motor', 182.4),
  ('GM', 'General Motors', 47.81),
  ('F', 'Ford Motor', 10.18),
  ('UBER', 'Uber Technologies', 73.62),
  ('ABNB', 'Airbnb', 156.63),
  ('LLY', 'Eli Lilly', 799.43),
  ('JNJ', 'Johnson & Johnson', 156.9),
  ('PFE', 'Pfizer', 29.45),
  ('XOM', 'Exxon Mobil', 118.7),
  ('CVX', 'Chevron', 160.32),
  ('DIS', 'Walt Disney', 111.12),
  ('BA', 'Boeing', 178.49),
  ('PG', 'Procter & Gamble', 170.1),
  ('SPY', 'SPDR S&P 500 ETF Trust', 598.65),
  ('VOO', 'Vanguard S&P 500 ETF', 442.35),
  ('QQQ', 'Invesco QQQ Trust', 478.14),
  ('VTI', 'Vanguard Total Stock Market ETF', 251.54),
  ('VT', 'Vanguard Total World Stock ETF', 97.62),
  ('IWDA', 'iShares Core MSCI World ETF', 95.1),
  ('VUG', 'Vanguard Growth ETF', 300.43),
  ('VTV', 'Vanguard Value ETF', 170.62),
  ('VYM', 'Vanguard High Dividend Yield ETF', 118.43),
  ('SCHD', 'Schwab US Dividend Equity ETF', 75.81),
  ('IWM', 'iShares Russell 2000 ETF', 205.98),
  ('DIA', 'SPDR Dow Jones Industrial Average ETF', 382.17),
  ('SMH', 'VanEck Semiconductor ETF', 234.91),
  ('SOXX', 'iShares Semiconductor ETF', 454.51),
  ('RSP', 'Invesco S&P 500 Equal Weight ETF', 165.22),
  ('ARKK', 'ARK Innovation ETF', 45.78),
  ('IWF', 'iShares Russell 1000 Growth ETF', 120.41),
  ('IVV', 'iShares Core S&P 500 ETF', 548.36),
  ('VGT', 'Vanguard Information Technology ETF', 456.12),
  ('XLF', 'Financial Select Sector SPDR Fund', 42.08),
  ('XLE', 'Energy Select Sector SPDR Fund', 89.66),
  ('XLV', 'Health Care Select Sector SPDR Fund', 139.82),
  ('GLD', 'SPDR Gold Shares', 218.35),
  ('SLV', 'iShares Silver Trust', 27.84),
  ('TLT', 'iShares 20+ Year Treasury Bond ETF', 93.65),
  ('SCOM', 'Safaricom PLC', 25.75),
  ('COOP', 'Co''operative Bank of Kenya', 15.45),
  ('KCB', 'KCB Group', 31.21),
  ('EQTY', 'Equity Group Holdings', 10.3),
  ('ABSA', 'Absa Bank Kenya', 12.68),
  ('NCBA', 'NCBA Group', 20.17),
  ('IMH', 'I&M Group', 6.28),
  ('SBIC', 'Stanbic Holdings', 23.66),
  ('SCBK', 'Standard Chartered Bank Kenya', 18.77),
  ('DTK', 'Diamond Trust Bank Kenya', 8.42),
  ('HFCK', 'HF Group', 3.26),
  ('EABL', 'East African Breweries', 16.94),
  ('KPLC', 'Kenya Power', 4.98),
  ('KEGN', 'KenGen', 4.61),
  ('KQ', 'Kenya Airways', 2.33),
  ('NMG', 'Nation Media Group', 1.74),
  ('BAMB', 'Bamburi Cement', 9.88),
  ('CGEN', 'Car & General', 6.92),
  ('JUB', 'Jubilee Holdings', 7.15),
  ('BRIT', 'Britam Holdings', 3.18),
  ('KNRE', 'Kenya Reinsurance Corporation', 3.42),
  ('SLAM', 'Sanlam Kenya', 4.31),
  ('SASN', 'Sasini', 2.64),
  ('KUKZ', 'Kakuzi', 8.12),
  ('WTK', 'Williamson Tea Kenya', 3.11);

insert into public.auctions (id, title, image_url, starting_bid, bid_target, prize_value) values
  ('watch', 'Luxurious Mens Watch Collection', 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=1200&q=85', 25, 50, null),
  ('headphones', 'Premium Headphones Set', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=85', 15, 40, null),
  ('sunglasses', 'Designer Sunglasses', 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=1200&q=85', 10, 30, null),
  ('wallet', 'Luxury Leather Wallet', 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=1200&q=85', 8, 25, null),
  ('macbook', 'Win a MacBook', 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1200&q=85', 0, 1440, 180000),
  ('iphone-18', 'Win an iPhone 18', 'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=1200&q=85', 0, 1280, 160000),
  ('samsung-s26', 'Win a Samsung S26', 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=1200&q=85', 0, 1160, 145000),
  ('hp-elitebook', 'Win an HP EliteBook', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=85', 0, 1000, 125000),
  ('tecno-camon', 'Win a Tecno Camon', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=85', 0, 280, 35000),
  ('infinix', 'Win an Infinix phone', 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1200&q=85', 0, 320, 40000),
  ('ps5', 'Win a PlayStation 5', 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=1200&q=85', 0, 680, 85000),
  ('75-inch-tv', 'Win a 75-inch TV', 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1200&q=85', 0, 1440, 180000),
  ('kitchen-set', 'Win a Kitchen Set', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=1200&q=85', 0, 360, 45000),
  ('fridge', 'Win a Fridge', 'https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=1200&q=85', 0, 720, 90000),
  ('ring-light', 'Win a Ring Light', 'https://images.unsplash.com/photo-1520390138845-fd2d229dd553?w=1200&q=85', 0, 64, 8000),
  ('handbag', 'Win a Handbag', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200&q=85', 0, 120, 15000);

insert into public.auction_rounds (auction_id, round_number)
  select id, 1 from public.auctions;
