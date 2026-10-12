import fs from 'node:fs';
import {POINTS_POLICY} from '../supabase/functions/_shared/points-policy.js';
const header=`-- KK policy v1. Existing balances/history are preserved; enrollment grants 100 KK once.
create table public.korae_points_policy(id integer primary key check(id=1), body jsonb not null);
insert into public.korae_points_policy values(1,'${JSON.stringify(POINTS_POLICY).replaceAll("'","''")}'::jsonb);
alter table public.korae_points_policy enable row level security;
revoke all on public.korae_points_policy from public,anon,authenticated;
grant select on public.korae_points_policy to service_role;
create table public.korae_point_events(uid text not null, action text not null, event_key text not null, delta integer not null default 0, created_at timestamptz not null default now(), primary key(uid,action,event_key));
alter table public.korae_point_events enable row level security;
revoke all on public.korae_point_events from public,anon,authenticated;
grant all on public.korae_point_events to service_role;
`;
const file='supabase/migrations/202610120001_points_policy.sql';
const existing=fs.readFileSync(file,'utf8');
fs.writeFileSync(file,header+existing.slice(existing.indexOf('create function public.korae_points_level')));
