alter table public.profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'suspended', 'closed'));

alter table public.wallets
  alter column balance type numeric(14, 2) using balance::numeric(14, 2);

create table public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  transaction_type text not null check (transaction_type in ('deposit', 'withdrawal')),
  status text not null check (status in (
    'initiating', 'pending', 'succeeded', 'cancelled', 'failed',
    'timed_out', 'reconciliation', 'reserved', 'submitted'
  )),
  amount_kes bigint not null check (amount_kes > 0),
  phone_number text not null check (phone_number ~ '^254[17][0-9]{8}$'),
  idempotency_key text not null,
  merchant_request_id text,
  checkout_request_id text,
  originator_conversation_id text,
  conversation_id text,
  mpesa_receipt_number text,
  provider_result_code text,
  provider_result_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key),
  unique (merchant_request_id),
  unique (checkout_request_id),
  unique (originator_conversation_id),
  unique (conversation_id),
  unique (mpesa_receipt_number)
);

create index mpesa_transactions_user_created_idx
  on public.mpesa_transactions(user_id, created_at desc);
create index mpesa_transactions_status_updated_idx
  on public.mpesa_transactions(status, updated_at);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id),
  mpesa_transaction_id uuid not null references public.mpesa_transactions(id),
  entry_type text not null check (entry_type in (
    'deposit_credit', 'withdrawal_reserve', 'withdrawal_release'
  )),
  amount_kes bigint not null check (amount_kes <> 0),
  balance_after numeric(14, 2) not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (mpesa_transaction_id, entry_type)
);

create index wallet_ledger_user_created_idx
  on public.wallet_ledger(user_id, created_at desc);

alter table public.mpesa_transactions enable row level security;
alter table public.wallet_ledger enable row level security;

revoke all on public.mpesa_transactions, public.wallet_ledger from public, anon, authenticated;
grant select on public.mpesa_transactions, public.wallet_ledger to authenticated;

create policy "Users read their M-Pesa transactions"
  on public.mpesa_transactions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their wallet ledger"
  on public.wallet_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_mpesa_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger mpesa_transactions_set_updated_at
  before update on public.mpesa_transactions
  for each row execute function public.set_mpesa_updated_at();

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_mpesa_updated_at();

create or replace function public.prevent_wallet_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Wallet ledger entries are immutable.';
end;
$$;

create trigger wallet_ledger_immutable
  before update or delete on public.wallet_ledger
  for each row execute function public.prevent_wallet_ledger_mutation();

create or replace function public.begin_mpesa_deposit(
  p_user_id uuid,
  p_idempotency_key text,
  p_amount_kes bigint,
  p_phone_number text,
  p_min_amount_kes bigint,
  p_max_amount_kes bigint,
  p_hourly_request_limit integer
)
returns table (transaction_id uuid, transaction_status text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.mpesa_transactions%rowtype;
  v_transaction_id uuid;
begin
  if p_user_id is null or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_amount_kes is null or p_min_amount_kes is null or p_max_amount_kes is null
    or p_hourly_request_limit is null or p_hourly_request_limit < 1
    or p_min_amount_kes < 1 or p_max_amount_kes < p_min_amount_kes
    or p_amount_kes < p_min_amount_kes or p_amount_kes > p_max_amount_kes
    or p_phone_number is null or p_phone_number !~ '^254[17][0-9]{8}$' then
    raise exception 'Invalid M-Pesa deposit details.';
  end if;

  perform 1 from public.profiles p
    where p.user_id = p_user_id and p.account_status = 'active'
    for update;
  if not found then raise exception 'Account is not eligible for payments.'; end if;

  select * into v_existing
    from public.mpesa_transactions t
    where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.transaction_type <> 'deposit'
      or v_existing.amount_kes <> p_amount_kes
      or v_existing.phone_number <> p_phone_number then
      raise exception 'Idempotency key was already used with different request details.';
    end if;
    return query select v_existing.id, v_existing.status, false;
    return;
  end if;

  if (
    select count(*) from public.mpesa_transactions t
    where t.user_id = p_user_id
      and t.transaction_type = 'deposit'
      and t.created_at > now() - interval '1 hour'
  ) >= p_hourly_request_limit then
    raise exception 'Deposit request rate limit reached. Try again later.';
  end if;

  if exists (
    select 1 from public.mpesa_transactions t
    where t.user_id = p_user_id
      and t.transaction_type = 'deposit'
      and t.status in ('initiating', 'pending', 'reconciliation')
      and t.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'A recent deposit is still being processed.';
  end if;

  insert into public.mpesa_transactions (
    user_id, transaction_type, status, amount_kes, phone_number, idempotency_key
  ) values (
    p_user_id, 'deposit', 'initiating', p_amount_kes, p_phone_number, p_idempotency_key
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select * into v_existing from public.mpesa_transactions t
      where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;
    if v_existing.transaction_type <> 'deposit'
      or v_existing.amount_kes <> p_amount_kes
      or v_existing.phone_number <> p_phone_number then
      raise exception 'Idempotency key was already used with different request details.';
    end if;
    return query select v_existing.id, v_existing.status, false;
    return;
  end if;

  return query select v_transaction_id, 'initiating'::text, true;
end;
$$;

create or replace function public.record_mpesa_deposit_initiation(
  p_transaction_id uuid,
  p_status text,
  p_merchant_request_id text,
  p_checkout_request_id text,
  p_result_code text,
  p_result_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'failed', 'reconciliation') then
    raise exception 'Invalid initiation status.';
  end if;
  update public.mpesa_transactions
  set status = p_status,
      merchant_request_id = nullif(p_merchant_request_id, ''),
      checkout_request_id = nullif(p_checkout_request_id, ''),
      provider_result_code = nullif(p_result_code, ''),
      provider_result_description = left(coalesce(p_result_description, ''), 240)
  where id = p_transaction_id and transaction_type = 'deposit' and status = 'initiating';
  if not found then raise exception 'Deposit transaction is not in the initiating state.'; end if;
end;
$$;

create or replace function public.apply_mpesa_deposit_callback(
  p_checkout_request_id text,
  p_verified_status text,
  p_verified boolean,
  p_amount_kes bigint,
  p_receipt_number text,
  p_phone_number text,
  p_result_code text,
  p_result_description text
)
returns table (transaction_id uuid, transaction_status text, wallet_balance numeric, credited boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.mpesa_transactions%rowtype;
  v_balance numeric(14, 2);
  v_credit bigint;
begin
  select * into v_transaction
  from public.mpesa_transactions t
  where t.checkout_request_id = p_checkout_request_id
    and t.transaction_type = 'deposit'
  for update;
  if not found then raise exception 'Deposit transaction was not found.'; end if;

  select w.balance into v_balance
    from public.wallets w where w.user_id = v_transaction.user_id for update;
  if v_balance is null then raise exception 'Wallet was not found.'; end if;

  if v_transaction.status = 'succeeded' then
    return query select v_transaction.id, v_transaction.status, v_balance, false;
    return;
  end if;

  if p_verified_status = 'succeeded' then
    if p_verified is distinct from true
      or p_amount_kes is distinct from v_transaction.amount_kes
      or p_receipt_number is null or trim(p_receipt_number) = ''
      or p_phone_number is distinct from v_transaction.phone_number then
      update public.mpesa_transactions
        set status = 'reconciliation',
            provider_result_code = nullif(p_result_code, ''),
            provider_result_description = 'Provider verification details did not match the request.'
        where id = v_transaction.id;
      return query select v_transaction.id, 'reconciliation'::text, v_balance, false;
      return;
    end if;

    update public.wallets set balance = balance + v_transaction.amount_kes, updated_at = now()
      where user_id = v_transaction.user_id returning balance into v_balance;
    v_credit := v_transaction.amount_kes;
    insert into public.wallet_ledger (
      user_id, mpesa_transaction_id, entry_type, amount_kes, balance_after
    ) values (
      v_transaction.user_id, v_transaction.id, 'deposit_credit', v_credit, v_balance
    );
    update public.mpesa_transactions
      set status = 'succeeded',
          mpesa_receipt_number = trim(p_receipt_number),
          provider_result_code = nullif(p_result_code, ''),
          provider_result_description = left(coalesce(p_result_description, ''), 240),
          completed_at = now()
      where id = v_transaction.id;
    insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
      values (v_transaction.user_id, 'deposit', 'Verified M-Pesa deposit', v_credit, v_transaction.id);
    return query select v_transaction.id, 'succeeded'::text, v_balance, true;
    return;
  end if;

  if p_verified_status not in ('pending', 'cancelled', 'failed', 'timed_out', 'reconciliation')
    or p_verified is distinct from true then
    update public.mpesa_transactions
      set status = 'reconciliation',
          provider_result_code = nullif(p_result_code, ''),
          provider_result_description = 'Provider result requires reconciliation.'
      where id = v_transaction.id;
    return query select v_transaction.id, 'reconciliation'::text, v_balance, false;
    return;
  end if;

  if v_transaction.status in ('cancelled', 'failed', 'timed_out', 'reconciliation') then
    return query select v_transaction.id, v_transaction.status, v_balance, false;
    return;
  end if;

  update public.mpesa_transactions
    set status = p_verified_status,
        provider_result_code = nullif(p_result_code, ''),
        provider_result_description = left(coalesce(p_result_description, ''), 240),
        completed_at = case when p_verified_status = 'pending' then null else now() end
    where id = v_transaction.id;
  return query select v_transaction.id, p_verified_status, v_balance, false;
end;
$$;

create or replace function public.reserve_mpesa_withdrawal(
  p_user_id uuid,
  p_idempotency_key text,
  p_amount_kes bigint,
  p_phone_number text,
  p_min_amount_kes bigint,
  p_max_amount_kes bigint,
  p_hourly_request_limit integer
)
returns table (transaction_id uuid, transaction_status text, wallet_balance numeric, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_existing public.mpesa_transactions%rowtype;
  v_balance numeric(14, 2);
  v_registered_phone text;
begin
  if p_user_id is null or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_amount_kes is null or p_min_amount_kes is null or p_max_amount_kes is null
    or p_hourly_request_limit is null or p_hourly_request_limit < 1
    or p_min_amount_kes < 1 or p_max_amount_kes < p_min_amount_kes
    or p_amount_kes < p_min_amount_kes or p_amount_kes > p_max_amount_kes
    or p_phone_number is null or p_phone_number !~ '^254[17][0-9]{8}$' then
    raise exception 'Invalid M-Pesa withdrawal details.';
  end if;

  select p.phone_number into v_registered_phone
    from public.profiles p
    where p.user_id = p_user_id and p.account_status = 'active'
    for update;
  if not found then raise exception 'Account is not eligible for withdrawals.'; end if;
  v_registered_phone := regexp_replace(trim(v_registered_phone), '[^0-9]', '', 'g');
  if left(v_registered_phone, 1) = '0' then
    v_registered_phone := '254' || substr(v_registered_phone, 2);
  elsif left(v_registered_phone, 1) = '+' then
    v_registered_phone := substr(v_registered_phone, 2);
  end if;
  if v_registered_phone <> p_phone_number then
    raise exception 'Withdrawal phone number must match the registered account phone.';
  end if;

  select * into v_existing from public.mpesa_transactions t
    where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.transaction_type <> 'withdrawal'
      or v_existing.amount_kes <> p_amount_kes
      or v_existing.phone_number <> p_phone_number then
      raise exception 'Idempotency key was already used with different request details.';
    end if;
    select w.balance into v_balance from public.wallets w where w.user_id = p_user_id;
    return query select v_existing.id, v_existing.status, v_balance, false;
    return;
  end if;

  if (
    select count(*) from public.mpesa_transactions t
    where t.user_id = p_user_id
      and t.transaction_type = 'withdrawal'
      and t.created_at > now() - interval '1 hour'
  ) >= p_hourly_request_limit then
    raise exception 'Withdrawal request rate limit reached. Try again later.';
  end if;

  if exists (
    select 1 from public.mpesa_transactions t
    where t.user_id = p_user_id
      and t.transaction_type = 'withdrawal'
      and t.status in ('reserved', 'submitted', 'reconciliation')
      and t.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'A recent withdrawal is still being processed.';
  end if;

  select w.balance into v_balance from public.wallets w
    where w.user_id = p_user_id for update;
  if v_balance is null or v_balance < p_amount_kes then
    raise exception 'Insufficient available balance.';
  end if;

  insert into public.mpesa_transactions (
    user_id, transaction_type, status, amount_kes, phone_number, idempotency_key
  ) values (
    p_user_id, 'withdrawal', 'reserved', p_amount_kes, p_phone_number, p_idempotency_key
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_transaction_id;
  if v_transaction_id is null then
    select * into v_existing from public.mpesa_transactions t
      where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;
    if v_existing.transaction_type <> 'withdrawal'
      or v_existing.amount_kes <> p_amount_kes
      or v_existing.phone_number <> p_phone_number then
      raise exception 'Idempotency key was already used with different request details.';
    end if;
    return query select v_existing.id, v_existing.status, v_balance, false;
    return;
  end if;

  update public.wallets set balance = balance - p_amount_kes, updated_at = now()
    where user_id = p_user_id returning balance into v_balance;
  insert into public.wallet_ledger (
    user_id, mpesa_transaction_id, entry_type, amount_kes, balance_after
  ) values (p_user_id, v_transaction_id, 'withdrawal_reserve', -p_amount_kes, v_balance);
  insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
    values (p_user_id, 'withdraw', 'M-Pesa withdrawal reserved', -p_amount_kes, v_transaction_id);

  return query select v_transaction_id, 'reserved'::text, v_balance, true;
end;
$$;

create or replace function public.record_mpesa_withdrawal_submission(
  p_transaction_id uuid,
  p_status text,
  p_originator_conversation_id text,
  p_conversation_id text,
  p_result_code text,
  p_result_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('submitted', 'reconciliation') then raise exception 'Invalid payout status.'; end if;
  update public.mpesa_transactions
  set status = p_status,
      originator_conversation_id = nullif(p_originator_conversation_id, ''),
      conversation_id = nullif(p_conversation_id, ''),
      provider_result_code = nullif(p_result_code, ''),
      provider_result_description = left(coalesce(p_result_description, ''), 240)
  where id = p_transaction_id and transaction_type = 'withdrawal' and status = 'reserved';
  if not found then raise exception 'Withdrawal is not reserved.'; end if;
end;
$$;

create or replace function public.finalize_mpesa_withdrawal(
  p_transaction_id uuid,
  p_status text,
  p_originator_conversation_id text,
  p_conversation_id text,
  p_amount_kes bigint,
  p_receipt_number text,
  p_provider_result_code text,
  p_provider_result_description text,
  p_provider_verified boolean
)
returns table (transaction_status text, wallet_balance numeric, released boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.mpesa_transactions%rowtype;
  v_balance numeric(14, 2);
begin
  if p_provider_verified is distinct from true
    or p_status not in ('succeeded', 'failed', 'reconciliation') then
    raise exception 'Unverified payout result.';
  end if;

  select * into v_transaction from public.mpesa_transactions t
    where t.id = p_transaction_id and t.transaction_type = 'withdrawal'
    for update;
  if not found then raise exception 'Withdrawal was not found.'; end if;

  select w.balance into v_balance from public.wallets w
    where w.user_id = v_transaction.user_id for update;

  if v_transaction.status = 'succeeded' or v_transaction.status = 'failed' then
    return query select v_transaction.status, v_balance, false;
    return;
  end if;

  if v_transaction.originator_conversation_id is not null
    and v_transaction.originator_conversation_id <> p_originator_conversation_id then
    raise exception 'Payout conversation does not match.';
  end if;
  if v_transaction.conversation_id is not null
    and v_transaction.conversation_id <> p_conversation_id then
    raise exception 'Payout conversation does not match.';
  end if;
  if p_amount_kes is distinct from v_transaction.amount_kes then
    update public.mpesa_transactions set status = 'reconciliation',
      provider_result_description = 'Payout amount requires reconciliation.'
      where id = v_transaction.id;
    return query select 'reconciliation'::text, v_balance, false;
    return;
  end if;

  if p_status = 'succeeded' then
    if p_receipt_number is null or trim(p_receipt_number) = '' then
      update public.mpesa_transactions set status = 'reconciliation',
        provider_result_description = 'Successful payout has no receipt; reconciliation required.'
        where id = v_transaction.id;
      return query select 'reconciliation'::text, v_balance, false;
      return;
    end if;
    update public.mpesa_transactions
      set status = 'succeeded', mpesa_receipt_number = trim(p_receipt_number),
        provider_result_code = nullif(p_provider_result_code, ''),
        provider_result_description = left(coalesce(p_provider_result_description, ''), 240),
        completed_at = now()
      where id = v_transaction.id;
    return query select 'succeeded'::text, v_balance, false;
    return;
  end if;

  if p_status = 'failed' then
    update public.wallets set balance = balance + v_transaction.amount_kes, updated_at = now()
      where user_id = v_transaction.user_id returning balance into v_balance;
    insert into public.wallet_ledger (
      user_id, mpesa_transaction_id, entry_type, amount_kes, balance_after
    ) values (
      v_transaction.user_id, v_transaction.id, 'withdrawal_release',
      v_transaction.amount_kes, v_balance
    );
    update public.mpesa_transactions
      set status = 'failed',
        provider_result_code = nullif(p_provider_result_code, ''),
        provider_result_description = left(coalesce(p_provider_result_description, ''), 240),
        completed_at = now()
      where id = v_transaction.id;
    return query select 'failed'::text, v_balance, true;
    return;
  end if;

  update public.mpesa_transactions set status = 'reconciliation',
    provider_result_code = nullif(p_provider_result_code, ''),
    provider_result_description = left(coalesce(p_provider_result_description, ''), 240)
    where id = v_transaction.id;
  return query select 'reconciliation'::text, v_balance, false;
end;
$$;

create or replace function public.get_mpesa_transaction_status(p_user_id uuid, p_transaction_id uuid)
returns table (
  transaction_id uuid,
  transaction_type text,
  transaction_status text,
  amount_kes bigint,
  phone_number text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  wallet_balance numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.transaction_type, t.status, t.amount_kes, t.phone_number,
    t.created_at, t.updated_at, t.completed_at, w.balance
  from public.mpesa_transactions t
  join public.wallets w on w.user_id = t.user_id
  where t.user_id = p_user_id and t.id = p_transaction_id;
$$;

revoke all on function public.set_mpesa_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_wallet_ledger_mutation() from public, anon, authenticated;
revoke all on function public.begin_mpesa_deposit(uuid, text, bigint, text, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.record_mpesa_deposit_initiation(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_mpesa_deposit_callback(text, text, boolean, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_mpesa_withdrawal(uuid, text, bigint, text, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.record_mpesa_withdrawal_submission(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.finalize_mpesa_withdrawal(uuid, text, text, text, bigint, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.get_mpesa_transaction_status(uuid, uuid) from public, anon, authenticated;

grant execute on function public.begin_mpesa_deposit(uuid, text, bigint, text, bigint, bigint, integer) to service_role;
grant execute on function public.record_mpesa_deposit_initiation(uuid, text, text, text, text, text) to service_role;
grant execute on function public.apply_mpesa_deposit_callback(text, text, boolean, bigint, text, text, text, text) to service_role;
grant execute on function public.reserve_mpesa_withdrawal(uuid, text, bigint, text, bigint, bigint, integer) to service_role;
grant execute on function public.record_mpesa_withdrawal_submission(uuid, text, text, text, text, text) to service_role;
grant execute on function public.finalize_mpesa_withdrawal(uuid, text, text, text, bigint, text, text, text, boolean) to service_role;
grant execute on function public.get_mpesa_transaction_status(uuid, uuid) to service_role;
