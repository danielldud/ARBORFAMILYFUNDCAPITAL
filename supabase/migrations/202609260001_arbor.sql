-- Arbor Capital: one private family-office workspace per Supabase project.
create table public.memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null, role text not null default 'pending' check(role in ('pending','viewer','editor','admin','blocked')),
 created_at timestamptz not null default now()
);
create table public.assets (
 id uuid primary key default gen_random_uuid(), symbol text not null, name text not null,
 category text not null, broker text not null default '', qty numeric not null check(qty>0 and qty<1e25),
 cost numeric not null check(cost>=0 and cost<1e25), provider text not null check(provider in ('coingecko','twelve','custom','manual')),
 provider_id text not null, exchange text not null default '', currency text not null default 'IDR' check(currency ~ '^[A-Z]{3}$'),
 note text not null default '', version integer not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create table public.quotes (
 asset_id uuid primary key references public.assets(id) on delete cascade, mapping_key text not null,
 price_idr numeric check(price_idr>0 and price_idr<1e30), native_price numeric, currency text,
 fx_rate numeric, fx_as_of timestamptz, as_of timestamptz, fetched_at timestamptz,
 source text not null, status text not null, error text, market_open boolean
);
create table public.audit_log (
 id bigint generated always as identity primary key, actor uuid, action text not null,
 target text, detail jsonb not null default '{}', at timestamptz not null default now()
);
create table public.market_control (id integer primary key check(id=1), next_refresh timestamptz not null default '-infinity');
insert into public.market_control(id) values(1);
create table public.request_limits (key text primary key, window_start timestamptz not null default now(), hits integer not null default 1);

create function public.arbor_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.memberships where user_id=(select auth.uid())
$$;
revoke all on function public.arbor_role() from public;
grant execute on function public.arbor_role() to authenticated;
create function public.arbor_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.memberships(user_id,email,role) values(new.id,coalesce(new.email,''),'pending');return new;end $$;
create trigger arbor_user_created after insert on auth.users for each row execute function public.arbor_new_user();
revoke all on function public.arbor_new_user() from public;

alter table public.memberships enable row level security;
alter table public.assets enable row level security;
alter table public.quotes enable row level security;
alter table public.audit_log enable row level security;
alter table public.market_control enable row level security;
alter table public.request_limits enable row level security;
create policy own_membership on public.memberships for select to authenticated using(user_id=(select auth.uid()) or (select public.arbor_role())='admin');
create policy read_assets on public.assets for select to authenticated using((select public.arbor_role()) in ('viewer','editor','admin'));
create policy read_quotes on public.quotes for select to authenticated using((select public.arbor_role()) in ('viewer','editor','admin'));
create policy read_audit on public.audit_log for select to authenticated using((select public.arbor_role())='admin');
revoke all on public.memberships,public.assets,public.quotes,public.audit_log,public.market_control,public.request_limits from anon,authenticated;
grant select on public.memberships,public.assets,public.quotes,public.audit_log to authenticated;
grant all on public.memberships,public.assets,public.quotes,public.audit_log,public.market_control,public.request_limits to service_role;
grant usage,select on all sequences in schema public to service_role;

create function public.set_member_role(target_user uuid, new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(814728);
 if coalesce(public.arbor_role(),'')<>'admin' then raise exception 'Hanya admin yang dapat mengelola akun.';end if;
 if target_user=auth.uid() then raise exception 'Role akun sendiri tidak dapat diubah.';end if;
 if new_role not in ('viewer','editor','admin','blocked') then raise exception 'Role tidak valid.';end if;
 if not exists(select 1 from auth.users where id=target_user and email_confirmed_at is not null) then raise exception 'Email akun harus diverifikasi terlebih dahulu.';end if;
 update public.memberships set role=new_role where user_id=target_user;
 if not found then raise exception 'Akun tidak ditemukan.';end if;
 insert into public.audit_log(actor,action,target,detail) values(auth.uid(),'member.role',target_user::text,jsonb_build_object('role',new_role));
end $$;
revoke all on function public.set_member_role(uuid,text) from public;
grant execute on function public.set_member_role(uuid,text) to authenticated;

create function public.save_asset(item jsonb, expected_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid; mkey text; old public.assets; p text; q numeric; c numeric; price numeric; stamp timestamptz;
begin
 if coalesce(public.arbor_role(),'') not in ('editor','admin') then raise exception 'Akun tidak memiliki hak edit.';end if;
 p:=item->>'provider';q:=(item->>'qty')::numeric;c:=(item->>'cost')::numeric;
 if p not in ('coingecko','twelve','custom','manual') or p is null then raise exception 'Provider tidak valid.';end if;
 if q is null or c is null or q<=0 or c<0 or q>=1e25 or c>=1e25 or q::text='NaN' or c::text='NaN' then raise exception 'Jumlah/modal tidak valid.';end if;
 if length(trim(coalesce(item->>'symbol','')))=0 or length(trim(coalesce(item->>'name','')))=0 or length(coalesce(item->>'name',''))>200 or length(coalesce(item->>'note',''))>3000 then raise exception 'Nama/kode/catatan tidak valid.';end if;
 if length(coalesce(item->>'provider_id',''))>150 or (p<>'manual' and coalesce(item->>'provider_id','') !~ '^[A-Za-z0-9._:/-]{1,150}$') then raise exception 'ID data pasar tidak valid.';end if;
 if coalesce(item->>'currency','IDR') !~ '^[A-Z]{3}$' then raise exception 'Mata uang tidak valid.';end if;
 if coalesce(item->>'exchange','') !~ '^[A-Za-z0-9 ._-]{0,50}$' then raise exception 'Bursa tidak valid.';end if;
 aid:=coalesce(nullif(item->>'id','')::uuid,gen_random_uuid());
 select * into old from public.assets where id=aid for update;
 if found then
  if expected_version is null or old.version<>expected_version then raise exception 'Data telah berubah. Muat ulang sebelum menyimpan.';end if;
  update public.assets set symbol=upper(item->>'symbol'),name=item->>'name',category=coalesce(item->>'category','Lainnya'),broker=coalesce(item->>'broker',''),qty=q,cost=c,provider=p,provider_id=coalesce(item->>'provider_id',''),exchange=coalesce(item->>'exchange',''),currency=coalesce(item->>'currency','IDR'),note=coalesce(item->>'note',''),version=version+1,updated_at=now(),updated_by=auth.uid() where id=aid;
 else
  if expected_version is not null then raise exception 'Aset sudah tidak tersedia.';end if;
  perform pg_advisory_xact_lock(814729);
  if (select count(*) from public.assets)>=100 then raise exception 'Batas 100 aset tercapai.';end if;
  insert into public.assets(id,symbol,name,category,broker,qty,cost,provider,provider_id,exchange,currency,note,updated_by)
  values(aid,upper(item->>'symbol'),item->>'name',coalesce(item->>'category','Lainnya'),coalesce(item->>'broker',''),q,c,p,coalesce(item->>'provider_id',''),coalesce(item->>'exchange',''),coalesce(item->>'currency','IDR'),coalesce(item->>'note',''),auth.uid());
 end if;
 mkey:=p||'|'||coalesce(item->>'provider_id','')||'|'||coalesce(item->>'exchange','')||'|'||coalesce(item->>'currency','IDR');
 delete from public.quotes where asset_id=aid and mapping_key<>mkey;
 if p='manual' then
  price:=(item->>'manual_price')::numeric;stamp:=(item->>'manual_as_of')::timestamptz;
  if price is null or price<=0 or price>=1e30 or stamp is null or stamp>now()+interval '5 minutes' then raise exception 'Harga manual dan tanggal harga wajib valid.';end if;
  insert into public.quotes(asset_id,mapping_key,price_idr,native_price,currency,fx_rate,as_of,fetched_at,source,status)
  values(aid,mkey,price,price,'IDR',1,stamp,now(),'Input manual','manual')
  on conflict(asset_id) do update set mapping_key=excluded.mapping_key,price_idr=excluded.price_idr,native_price=excluded.native_price,currency='IDR',fx_rate=1,fx_as_of=null,as_of=excluded.as_of,fetched_at=now(),source='Input manual',status='manual',error=null,market_open=null;
 end if;
 insert into public.audit_log(actor,action,target,detail) values(auth.uid(),'asset.save',aid::text,jsonb_build_object('symbol',item->>'symbol','provider',p));
 return aid;
end $$;
revoke all on function public.save_asset(jsonb,integer) from public;
grant execute on function public.save_asset(jsonb,integer) to authenticated;

-- Service-only global lock keeps user refreshes from multiplying provider calls.
create function public.claim_market_refresh(seconds integer default 60) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.market_control set next_refresh=now()+make_interval(secs=>greatest(60,least(seconds,3600))) where id=1 and next_refresh<=now();return found;
end $$;
revoke all on function public.claim_market_refresh(integer) from public;
grant execute on function public.claim_market_refresh(integer) to service_role;
create function public.allow_market_search(limit_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.request_limits(key) values(limit_key) on conflict(key) do update set hits=case when public.request_limits.window_start < now()-interval '1 minute' then 1 else public.request_limits.hits+1 end,window_start=case when public.request_limits.window_start<now()-interval '1 minute' then now() else public.request_limits.window_start end returning hits into n;
 return n<=10;
end $$;
revoke all on function public.allow_market_search(text) from public;
grant execute on function public.allow_market_search(text) to service_role;
