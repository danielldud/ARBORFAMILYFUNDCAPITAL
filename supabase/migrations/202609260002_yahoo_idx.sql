-- Menambahkan Yahoo Finance sebagai sumber otomatis saham Indonesia.
-- Migrasi ini aman dijalankan setelah 202609260001_arbor.sql.
begin;

alter table public.assets drop constraint if exists assets_provider_check;
alter table public.assets add constraint assets_provider_check
 check(provider in ('coingecko','twelve','yahoo','custom','manual'));

create or replace function public.save_asset(item jsonb, expected_version integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare aid uuid; mkey text; old public.assets; p text; q numeric; c numeric; price numeric; stamp timestamptz;
begin
 if coalesce(public.arbor_role(),'') not in ('editor','admin') then raise exception 'Akun tidak memiliki hak edit.';end if;
 p:=item->>'provider';q:=(item->>'qty')::numeric;c:=(item->>'cost')::numeric;
 if p not in ('coingecko','twelve','yahoo','custom','manual') or p is null then raise exception 'Provider tidak valid.';end if;
 if q is null or c is null or q<=0 or c<0 or q>=1e25 or c>=1e25 or q::text='NaN' or c::text='NaN' then raise exception 'Jumlah/modal tidak valid.';end if;
 if length(trim(coalesce(item->>'symbol','')))=0 or length(trim(coalesce(item->>'name','')))=0 or length(coalesce(item->>'name',''))>200 or length(coalesce(item->>'note',''))>3000 then raise exception 'Nama/kode/catatan tidak valid.';end if;
 if length(coalesce(item->>'provider_id',''))>150 or (p<>'manual' and coalesce(item->>'provider_id','') !~ '^[A-Za-z0-9._:/-]{1,150}$') then raise exception 'ID data pasar tidak valid.';end if;
 if p='yahoo' and (upper(coalesce(item->>'provider_id','')) !~ '^[A-Z0-9]{1,12}[.]JK$' or coalesce(item->>'currency','IDR')<>'IDR') then raise exception 'Saham Yahoo IDX harus memakai simbol seperti BBCA.JK dan mata uang IDR.';end if;
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

-- Pindahkan saham IDX lama dari Twelve Data ke simbol Yahoo *.JK.
update public.assets
set provider='yahoo',
    provider_id=upper(regexp_replace(provider_id,'[.]JK$','','i'))||'.JK',
    exchange='XIDX',currency='IDR',version=version+1,updated_at=now()
where provider='twelve' and upper(exchange) in ('IDX','XIDX');

delete from public.quotes q
using public.assets a
where q.asset_id=a.id and q.mapping_key<>(a.provider||'|'||a.provider_id||'|'||a.exchange||'|'||a.currency);

commit;
