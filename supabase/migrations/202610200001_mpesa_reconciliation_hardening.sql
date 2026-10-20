create or replace function public.guard_mpesa_withdrawal_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transaction_type <> 'withdrawal' then
    return new;
  end if;

  perform 1
  from public.profiles p
  where p.user_id = new.user_id and p.account_status = 'active'
  for update;
  if not found then
    raise exception 'Account is not eligible for withdrawals.';
  end if;

  if exists (
    select 1 from public.mpesa_transactions t
    where t.user_id = new.user_id
      and t.transaction_type = 'withdrawal'
      and t.status in ('reserved', 'submitted', 'reconciliation')
  ) then
    raise exception 'A previous withdrawal is unresolved. Check its status or contact support before requesting another.';
  end if;

  new.originator_conversation_id := coalesce(new.originator_conversation_id, new.id::text);
  return new;
end;
$$;

revoke all on function public.guard_mpesa_withdrawal_insert() from public, anon, authenticated;

create trigger mpesa_withdrawal_insert_guard
  before insert on public.mpesa_transactions
  for each row execute function public.guard_mpesa_withdrawal_insert();

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
declare
  v_transaction public.mpesa_transactions%rowtype;
begin
  if p_status not in ('submitted', 'reconciliation') then
    raise exception 'Invalid payout status.';
  end if;

  select * into v_transaction
  from public.mpesa_transactions t
  where t.id = p_transaction_id and t.transaction_type = 'withdrawal'
  for update;
  if not found then raise exception 'Withdrawal was not found.'; end if;

  if v_transaction.status in ('succeeded', 'failed') then
    return;
  end if;
  if v_transaction.status not in ('reserved', 'submitted', 'reconciliation') then
    raise exception 'Withdrawal is not awaiting provider submission.';
  end if;
  if v_transaction.originator_conversation_id is not null
    and p_originator_conversation_id is not null
    and v_transaction.originator_conversation_id <> p_originator_conversation_id then
    raise exception 'Payout originator identifier does not match.';
  end if;
  if v_transaction.conversation_id is not null
    and p_conversation_id is not null
    and v_transaction.conversation_id <> p_conversation_id then
    raise exception 'Payout conversation identifier does not match.';
  end if;

  update public.mpesa_transactions
  set status = case
        when v_transaction.status = 'reconciliation' then 'reconciliation'
        else p_status
      end,
      originator_conversation_id = coalesce(originator_conversation_id, nullif(p_originator_conversation_id, '')),
      conversation_id = coalesce(conversation_id, nullif(p_conversation_id, '')),
      provider_result_code = coalesce(nullif(p_result_code, ''), provider_result_code),
      provider_result_description = left(coalesce(p_result_description, provider_result_description, ''), 240)
  where id = p_transaction_id;
end;
$$;

revoke all on function public.record_mpesa_withdrawal_submission(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_mpesa_withdrawal_submission(uuid, text, text, text, text, text) to service_role;

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
begin
  if p_user_id is null
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_amount_kes is null
    or p_min_amount_kes is null
    or p_max_amount_kes is null
    or p_hourly_request_limit is null
    or p_hourly_request_limit < 1
    or p_min_amount_kes < 1
    or p_max_amount_kes < p_min_amount_kes
    or p_amount_kes < p_min_amount_kes
    or p_amount_kes > p_max_amount_kes
    or p_phone_number is null
    or p_phone_number !~ '^254[17][0-9]{8}$' then
    raise exception 'Invalid M-Pesa withdrawal details.';
  end if;

  perform 1 from public.profiles p
  where p.user_id = p_user_id and p.account_status = 'active'
  for update;
  if not found then raise exception 'Account is not eligible for withdrawals.'; end if;

  select * into v_existing
  from public.mpesa_transactions t
  where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.transaction_type <> 'withdrawal'
      or v_existing.amount_kes <> p_amount_kes
      or v_existing.phone_number <> p_phone_number then
      raise exception 'Idempotency key was already used with different request details.';
    end if;
    select w.balance into v_balance
    from public.wallets w
    where w.user_id = p_user_id;
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
  ) then
    raise exception 'A previous withdrawal is unresolved. Check its status or contact support before requesting another.';
  end if;

  select w.balance into v_balance
  from public.wallets w
  where w.user_id = p_user_id
  for update;
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
    select * into v_existing
    from public.mpesa_transactions t
    where t.user_id = p_user_id and t.idempotency_key = p_idempotency_key;
    if v_existing.transaction_type <> 'withdrawal'
      or v_existing.amount_kes <> p_amount_kes
      or v_existing.phone_number <> p_phone_number then
      raise exception 'Idempotency key was already used with different request details.';
    end if;
    return query select v_existing.id, v_existing.status, v_balance, false;
    return;
  end if;

  update public.wallets
  set balance = balance - p_amount_kes, updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;
  insert into public.wallet_ledger (
    user_id, mpesa_transaction_id, entry_type, amount_kes, balance_after
  ) values (p_user_id, v_transaction_id, 'withdrawal_reserve', -p_amount_kes, v_balance);
  insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
  values (p_user_id, 'withdraw', 'M-Pesa withdrawal reserved', -p_amount_kes, v_transaction_id);

  return query select v_transaction_id, 'reserved'::text, v_balance, true;
end;
$$;

revoke all on function public.reserve_mpesa_withdrawal(uuid, text, bigint, text, bigint, bigint, integer) from public, anon, authenticated;
grant execute on function public.reserve_mpesa_withdrawal(uuid, text, bigint, text, bigint, bigint, integer) to service_role;

create or replace function public.sync_mpesa_withdrawal_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.transaction_type <> 'withdrawal'
    or old.status = new.status
    or new.status not in ('succeeded', 'failed') then
    return new;
  end if;

  if new.status = 'succeeded' then
    update public.wallet_transactions
    set description = 'Completed M-Pesa withdrawal'
    where reference_id = new.id and category = 'withdraw';
  else
    update public.wallet_transactions
    set description = 'Failed M-Pesa withdrawal reservation'
    where reference_id = new.id and category = 'withdraw';
    if exists (
      select 1 from public.wallet_ledger l
      where l.mpesa_transaction_id = new.id and l.entry_type = 'withdrawal_release'
    ) and not exists (
      select 1 from public.wallet_transactions w
      where w.reference_id = new.id and w.category = 'withdraw' and w.amount > 0
    ) then
      insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
      values (new.user_id, 'withdraw', 'M-Pesa withdrawal reservation released', new.amount_kes, new.id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_mpesa_withdrawal_history() from public, anon, authenticated;

create trigger mpesa_withdrawal_history_sync
  after update of status on public.mpesa_transactions
  for each row execute function public.sync_mpesa_withdrawal_history();

create table public.mpesa_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  mpesa_transaction_id uuid not null references public.mpesa_transactions(id),
  admin_user_id uuid not null references auth.users(id),
  previous_status text not null,
  final_status text not null check (final_status in ('succeeded', 'failed')),
  amount_kes bigint not null check (amount_kes > 0),
  receipt_number text,
  evidence_reference text not null check (char_length(trim(evidence_reference)) between 1 and 160),
  admin_note text not null check (char_length(trim(admin_note)) between 10 and 500),
  created_at timestamptz not null default now(),
  check ((final_status <> 'succeeded') or nullif(trim(receipt_number), '') is not null)
);

create index mpesa_reconciliation_events_transaction_idx
  on public.mpesa_reconciliation_events(mpesa_transaction_id, created_at desc);
alter table public.mpesa_reconciliation_events enable row level security;
revoke all on public.mpesa_reconciliation_events from public, anon, authenticated;
grant all on public.mpesa_reconciliation_events to service_role;

create or replace function public.admin_reconcile_mpesa_transaction(
  p_transaction_id uuid,
  p_admin_user_id uuid,
  p_verified_status text,
  p_amount_kes bigint,
  p_receipt_number text,
  p_evidence_reference text,
  p_admin_note text
)
returns table (transaction_status text, wallet_balance numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.mpesa_transactions%rowtype;
  v_balance numeric(14, 2);
  v_receipt text := nullif(trim(p_receipt_number), '');
begin
  if p_admin_user_id is null
    or p_verified_status is null
    or p_verified_status not in ('succeeded', 'failed')
    or p_amount_kes is null
    or nullif(trim(p_evidence_reference), '') is null
    or char_length(trim(p_evidence_reference)) > 160
    or nullif(trim(p_admin_note), '') is null
    or char_length(trim(p_admin_note)) not between 10 and 500 then
    raise exception 'Invalid reconciliation details.';
  end if;
  if p_verified_status = 'succeeded' and v_receipt is null then
    raise exception 'A confirmed provider receipt is required to reconcile a successful payment.';
  end if;

  select * into v_transaction
  from public.mpesa_transactions t
  where t.id = p_transaction_id
  for update;
  if not found then raise exception 'M-Pesa transaction was not found.'; end if;
  if v_transaction.status not in ('initiating', 'pending', 'timed_out', 'reconciliation', 'reserved', 'submitted') then
    raise exception 'Only unresolved M-Pesa transactions can be reconciled.';
  end if;
  if p_amount_kes is distinct from v_transaction.amount_kes then
    raise exception 'Reconciliation amount does not match the stored transaction.';
  end if;

  select w.balance into v_balance
  from public.wallets w
  where w.user_id = v_transaction.user_id
  for update;
  if v_balance is null then raise exception 'Wallet was not found.'; end if;

  if v_transaction.transaction_type = 'deposit' then
    if p_verified_status = 'succeeded' then
      update public.wallets
        set balance = balance + v_transaction.amount_kes, updated_at = now()
        where user_id = v_transaction.user_id
        returning balance into v_balance;
      insert into public.wallet_ledger (
        user_id, mpesa_transaction_id, entry_type, amount_kes, balance_after
      ) values (
        v_transaction.user_id, v_transaction.id, 'deposit_credit', v_transaction.amount_kes, v_balance
      );
      insert into public.wallet_transactions (user_id, category, description, amount, reference_id)
      values (v_transaction.user_id, 'deposit', 'Reconciled M-Pesa deposit', v_transaction.amount_kes, v_transaction.id);
    end if;
    update public.mpesa_transactions
    set status = p_verified_status,
        mpesa_receipt_number = case when p_verified_status = 'succeeded' then v_receipt else mpesa_receipt_number end,
        provider_result_code = 'ADMIN_RECONCILIATION',
        provider_result_description = left(trim(p_admin_note), 240),
        completed_at = now()
    where id = v_transaction.id;
  else
    if p_verified_status = 'succeeded' then
      update public.mpesa_transactions
      set status = 'succeeded',
          originator_conversation_id = coalesce(originator_conversation_id, id::text),
          mpesa_receipt_number = v_receipt,
          provider_result_code = 'ADMIN_RECONCILIATION',
          provider_result_description = left(trim(p_admin_note), 240),
          completed_at = now()
      where id = v_transaction.id;
    else
      update public.wallets
        set balance = balance + v_transaction.amount_kes, updated_at = now()
        where user_id = v_transaction.user_id
        returning balance into v_balance;
      insert into public.wallet_ledger (
        user_id, mpesa_transaction_id, entry_type, amount_kes, balance_after
      ) values (
        v_transaction.user_id, v_transaction.id, 'withdrawal_release', v_transaction.amount_kes, v_balance
      );
      update public.mpesa_transactions
      set status = 'failed',
          provider_result_code = 'ADMIN_RECONCILIATION',
          provider_result_description = left(trim(p_admin_note), 240),
          completed_at = now()
      where id = v_transaction.id;
    end if;
  end if;

  insert into public.mpesa_reconciliation_events (
    mpesa_transaction_id, admin_user_id, previous_status, final_status, amount_kes,
    receipt_number, evidence_reference, admin_note
  ) values (
    v_transaction.id, p_admin_user_id, v_transaction.status, p_verified_status,
    v_transaction.amount_kes, v_receipt, trim(p_evidence_reference), trim(p_admin_note)
  );
  return query select p_verified_status, v_balance;
end;
$$;

revoke all on function public.admin_reconcile_mpesa_transaction(uuid, uuid, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_reconcile_mpesa_transaction(uuid, uuid, text, bigint, text, text, text) to service_role;

drop function public.get_mpesa_transaction_status(uuid, uuid);

create function public.get_mpesa_transaction_status(p_user_id uuid, p_transaction_id uuid)
returns table (
  transaction_id uuid,
  transaction_type text,
  transaction_status text,
  amount_kes bigint,
  phone_number text,
  mpesa_receipt_number text,
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
    t.mpesa_receipt_number, t.created_at, t.updated_at, t.completed_at, w.balance
  from public.mpesa_transactions t
  join public.wallets w on w.user_id = t.user_id
  where t.user_id = p_user_id and t.id = p_transaction_id;
$$;

revoke all on function public.get_mpesa_transaction_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_mpesa_transaction_status(uuid, uuid) to service_role;
