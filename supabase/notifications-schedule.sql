-- Run after migration + Edge secrets + push-dispatch deployment.
-- Store project_url and push_dispatch_secret in Supabase Vault beforehand.
-- push_dispatch_secret must match PUSH_DISPATCH_SECRET in Edge secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if exists(select 1 from cron.job where jobname='korae-push-cleanup') then perform cron.unschedule('korae-push-cleanup');end if;
 if exists(select 1 from cron.job where jobname='korae-push-dispatch') then perform cron.unschedule('korae-push-dispatch');end if;
end $$;
select cron.schedule('korae-push-dispatch','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='project_url')||'/functions/v1/push-dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='push_dispatch_secret')),
  body:='{}'::jsonb, timeout_milliseconds:=90000);
$job$);
-- Keep day-level deduplication keys for 7 days, then cascade-delete delivery history.
select cron.schedule('korae-push-cleanup','15 16 * * *',$job$
 delete from public.korae_notification_events where created_at<now()-interval '7 days';
$job$);
