-- 0003: (1) lock requests once checkout starts; (2) crash-safe, duplicate-proof Stripe event handling.

create or replace function public.gift_requests_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  protected text[] := array['product_cost','service_fee','protection_reserve','total_due_today',
    'stripe_payment_reference','payment_status','order_id','order_number','retailer_order_number',
    'tracking_number','refundable_balance','amount_refunded','refund_date','assigned_admin_id',
    'selected_product','target_purchase_date','next_product_check_date','final_purchase_deadline',
    'original_availability','backup_availability','last_observed_original_price',
    'last_observed_backup_price','low_stock_status'];
  k text;
begin
  if current_user in ('service_role','postgres','supabase_admin') or public.is_admin() then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'Draft' then raise exception 'new requests must start as Draft'; end if;
    if new.customer_id is distinct from auth.uid() then raise exception 'not your request'; end if;
    foreach k in array protected loop
      if (to_jsonb(new) -> k) <> 'null'::jsonb then
        raise exception 'field % is set by the server', k;
      end if;
    end loop;
    if new.priority <> 'medium' then raise exception 'field priority is set by the server'; end if;
  else
    -- Once checkout starts (Awaiting Payment) the request is locked for the customer:
    -- price, quantity and fees can no longer change under an open payment.
    if old.status <> 'Draft' then
      raise exception 'request can no longer be edited';
    end if;
    if new.status <> 'Draft' then
      raise exception 'status is set by the server';
    end if;
    if new.customer_id is distinct from old.customer_id
       or new.confirmation_number is distinct from old.confirmation_number
       or new.priority is distinct from old.priority then
      raise exception 'protected field changed';
    end if;
    foreach k in array protected loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
        raise exception 'field % is set by the server', k;
      end if;
    end loop;
  end if;
  new.updated_at := now();
  return new;
end $$;

alter table public.stripe_events
  add column status text not null default 'processing' check (status in ('processing','done','failed')),
  add column attempts int not null default 1,
  add column processed_at timestamptz,
  add column last_error text;

-- Returns true if THIS caller should process the event. False = already done, or another
-- worker is on it. A failed event, or one stuck "processing" for 5+ minutes (crashed worker),
-- can be claimed again, so a payment is never lost and never handled twice at once.
create function public.claim_stripe_event(p_id text, p_type text) returns boolean
language plpgsql security definer set search_path = public as $$
declare got boolean;
begin
  insert into public.stripe_events(id, type) values (p_id, p_type)
  on conflict (id) do update
    set attempts = public.stripe_events.attempts + 1, received_at = now(), status = 'processing'
    where public.stripe_events.status = 'failed'
       or (public.stripe_events.status = 'processing' and public.stripe_events.received_at < now() - interval '5 minutes')
  returning true into got;
  return coalesce(got, false);
end $$;

create function public.finish_stripe_event(p_id text, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = public as $$
  update public.stripe_events
     set status = case when p_ok then 'done' else 'failed' end,
         processed_at = case when p_ok then now() else processed_at end,
         last_error = case when p_ok then null else left(p_error, 500) end
   where id = p_id
$$;

revoke execute on function public.claim_stripe_event(text, text), public.finish_stripe_event(text, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text), public.finish_stripe_event(text, boolean, text) to service_role;
