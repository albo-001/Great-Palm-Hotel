create or replace function public.create_user_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral_code text;
  v_referrer_id uuid;
  v_full_name text;
  v_phone_number text;
begin
  v_full_name := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  if v_full_name is null or char_length(v_full_name) not between 2 and 120 then
    v_full_name := coalesce(
      nullif(left(split_part(coalesce(new.email, ''), '@', 1), 120), ''),
      'Account User'
    );
    if char_length(v_full_name) < 2 then
      v_full_name := 'Account User';
    end if;
  end if;

  v_phone_number := nullif(trim(new.raw_user_meta_data ->> 'phone_number'), '');
  if v_phone_number is null or char_length(v_phone_number) not between 3 and 32 then
    v_phone_number := 'Not provided';
  end if;

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
      values (new.id, v_full_name, v_phone_number, v_referral_code, v_referrer_id);
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

revoke all on function public.create_user_account() from public, anon, authenticated;
