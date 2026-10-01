-- Keep Pin filtering/counting independent of cursor and map bounds.
DO $$ BEGIN
  IF to_regprocedure('public.korae_page_before_map_filter(text,jsonb,jsonb,integer)') IS NULL THEN
    ALTER FUNCTION public.korae_page(text,jsonb,jsonb,integer) RENAME TO korae_page_before_map_filter;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.korae_page(p_uid text,p_options jsonb DEFAULT '{}',p_cursor jsonb DEFAULT null,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb; n integer:=least(greatest(p_limit,1),100);
BEGIN
  IF coalesce(p_options->>'mode','posts') <> 'pins' THEN
    RETURN public.korae_page_before_map_filter(p_uid,p_options,p_cursor,p_limit);
  END IF;
  WITH matching AS (
    SELECT d.id,d.body FROM korae_documents d WHERE d.kind='pins'
      AND (p_options->>'owner' IS NULL OR d.owner=p_options->>'owner')
      AND (p_options->>'coin' IS NULL OR d.body->>'coin'=p_options->>'coin' OR coalesce(d.body->'tradeCoins','[]'::jsonb) ? (p_options->>'coin'))
  ), candidates AS (
    SELECT * FROM matching d WHERE (p_cursor IS NULL OR d.id>p_cursor->>0)
      AND (p_options->'bounds' IS NULL OR (
        (d.body->>'lat')::numeric BETWEEN (p_options->'bounds'->>0)::numeric AND (p_options->'bounds'->>2)::numeric
        AND (CASE WHEN (p_options->'bounds'->>1)::numeric <= (p_options->'bounds'->>3)::numeric
          THEN (d.body->>'lng')::numeric BETWEEN (p_options->'bounds'->>1)::numeric AND (p_options->'bounds'->>3)::numeric
          ELSE (d.body->>'lng')::numeric >= (p_options->'bounds'->>1)::numeric OR (d.body->>'lng')::numeric <= (p_options->'bounds'->>3)::numeric END)))
    ORDER BY d.id LIMIT n+1
  ), page AS (SELECT * FROM candidates ORDER BY id LIMIT n)
  SELECT jsonb_build_object('items',coalesce(jsonb_agg(
    (CASE WHEN p_options->>'detail'='true' THEN body ELSE jsonb_build_object('lat',body->'lat','lng',body->'lng','coin',body->'coin','tradeCoins',body->'tradeCoins','title',body->'title','ownerId',body->'ownerId') END)
    ||jsonb_build_object('id',id,'owner',coalesce(body->>'ownerId'=p_uid,false)) ORDER BY id),'[]'),
    'totalCount',(SELECT count(*) FROM matching),
    'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>n THEN (SELECT jsonb_build_array(id) FROM page ORDER BY id DESC LIMIT 1) ELSE null END)
    INTO result FROM page;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.korae_page(text,jsonb,jsonb,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.korae_page(text,jsonb,jsonb,integer) TO service_role;

-- Existing data only retained the last check-in. Preserve that known day and
-- mark when complete history starts, rather than inventing older attendance.
CREATE OR REPLACE FUNCTION public.korae_keep_checkin_history()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE history jsonb; since_day integer;
BEGIN
  IF NEW.kind <> 'balances' THEN RETURN NEW; END IF;
  history := CASE WHEN TG_OP='UPDATE' THEN coalesce(OLD.body->'checkinDays','[]'::jsonb) ELSE '[]'::jsonb END;
  since_day := CASE WHEN TG_OP='UPDATE' THEN coalesce((OLD.body->>'historySince')::integer,floor((extract(epoch FROM now())*1000+32400000)/86400000)::integer) ELSE floor((extract(epoch FROM now())*1000+32400000)/86400000)::integer END;
  IF TG_OP='UPDATE' AND coalesce((OLD.body->>'day')::integer,-1)>=0 AND NOT history @> jsonb_build_array((OLD.body->>'day')::integer) THEN history:=history||jsonb_build_array((OLD.body->>'day')::integer); END IF;
  IF coalesce((NEW.body->>'day')::integer,-1)>=0 AND NOT history @> jsonb_build_array((NEW.body->>'day')::integer) THEN history:=history||jsonb_build_array((NEW.body->>'day')::integer); END IF;
  NEW.body:=NEW.body||jsonb_build_object('checkinDays',history,'historySince',since_day);
  RETURN NEW;
END $$;
CREATE TRIGGER korae_checkin_history BEFORE INSERT OR UPDATE ON public.korae_documents
FOR EACH ROW WHEN (NEW.kind='balances') EXECUTE FUNCTION public.korae_keep_checkin_history();
UPDATE public.korae_documents SET body=body WHERE kind='balances';
