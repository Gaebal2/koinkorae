begin;
-- Preserve balances, earned ranks and existing markers.
update public.korae_points_policy set body='{"version":2,"welcome":100,"attendance":20,"missionReward":100,"mission":{"posts":3,"games":5,"comments":5},"minimumGameSeconds":10,"costs":{"posts":10,"reposts":10,"pins":10,"comments":2,"likes":0,"messages":0,"following":0,"battle":0},"streaks":{"10":100,"30":500,"100":3000,"365":10000},"levels":[{"name":"새우","days":0,"bp":0,"posts":0,"reposts":0,"games":0,"likes":0,"bonus":0,"pins":0,"avatar":"흑백","cover":"기본색","friends":3,"dm":3,"images":0},{"name":"게","days":7,"bp":300,"posts":3,"reposts":1,"games":20,"likes":5,"bonus":5,"pins":1,"avatar":"컬러","cover":"기본색","friends":10,"dm":10,"images":1},{"name":"오징어","days":30,"bp":1000,"posts":10,"reposts":5,"games":100,"likes":20,"bonus":10,"pins":2,"avatar":"컬러","cover":"기본색","friends":20,"dm":20,"images":1},{"name":"문어","days":60,"bp":3000,"posts":30,"reposts":15,"games":200,"likes":50,"bonus":20,"pins":2,"avatar":"컬러","cover":"이미지","friends":50,"dm":50,"images":2},{"name":"돌고래","days":100,"bp":10000,"posts":80,"reposts":40,"games":400,"likes":200,"bonus":30,"pins":3,"avatar":"컬러","cover":"이미지","friends":100,"dm":100,"images":3},{"name":"상어","days":200,"bp":30000,"posts":200,"reposts":100,"games":1000,"likes":500,"bonus":50,"pins":3,"avatar":"컬러","cover":"이미지","friends":null,"dm":null,"images":3},{"name":"고래","days":365,"bp":100000,"posts":500,"reposts":250,"games":2000,"likes":2000,"bonus":100,"pins":5,"avatar":"컬러","cover":"이미지","friends":null,"dm":null,"images":5}]}'::jsonb where id=1;
create function public.korae_pin_capacity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare balance jsonb; config jsonb; capacity integer;
begin
 if exists(select 1 from korae_documents where kind=new.kind and parent=new.parent and id=new.id) then return new; end if;
 balance:=korae_points_init(new.owner);
 select body into config from korae_points_policy where id=1;
 capacity:=(config->'levels'->korae_points_level(balance)->>'pins')::integer;
 if (select count(*) from korae_documents where kind='pins' and owner=new.owner)>=capacity then
  raise exception '현재 등급의 마커 생성 한도에 도달했습니다.';
 end if;
 return new;
end $$;
revoke all on function public.korae_pin_capacity() from public,anon,authenticated;
create trigger korae_pin_capacity before insert on public.korae_documents for each row when(new.kind='pins') execute function public.korae_pin_capacity();
commit;
