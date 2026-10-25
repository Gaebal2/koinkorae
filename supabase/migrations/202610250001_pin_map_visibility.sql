-- Hide pins from map queries before pagination/counts, while keeping owner management.
DO $$ DECLARE definition text; BEGIN
 definition:=pg_get_functiondef('public.korae_page(text,jsonb,jsonb,integer)'::regprocedure);
 IF position('mapHidden' in definition)=0 THEN
  IF position('WHERE d.kind=''pins''' in definition)=0 THEN RAISE EXCEPTION 'Pin page predicate not found'; END IF;
  definition:=replace(definition,'WHERE d.kind=''pins''','WHERE d.kind=''pins'' AND (coalesce(d.body->>''mapHidden'',''false'')<>''true'' OR (p_options->>''owner''=p_uid AND p_options->>''detail''=''true'' AND p_options->''bounds'' IS NULL))');
  EXECUTE definition;
 END IF;
END $$;
DO $$ BEGIN
 IF to_regprocedure('public.korae_mutate_before_pin_visibility(text,text,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.korae_mutate(text,text,text,jsonb) RENAME TO korae_mutate_before_pin_visibility;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.korae_mutate(p_action text,p_uid text,p_id text DEFAULT '',p_value jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE old jsonb; result jsonb;
BEGIN
 IF p_action IN ('setPinMapHidden','savePin') AND p_id<>'' THEN
  SELECT body INTO old FROM korae_documents WHERE kind='pins' AND parent='' AND id=p_id AND owner=p_uid FOR UPDATE;
  IF old IS NULL THEN RAISE EXCEPTION 'Pin owner required'; END IF;
 END IF;
 IF p_action='setPinMapHidden' THEN
  IF old IS NULL OR jsonb_typeof(p_value->'hidden') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid pin visibility'; END IF;
  UPDATE korae_documents SET body=jsonb_set(body,'{mapHidden}',p_value->'hidden') WHERE kind='pins' AND parent='' AND id=p_id AND owner=p_uid RETURNING body INTO result;
  RETURN result||jsonb_build_object('id',p_id,'owner',true);
 END IF;
 -- Editing content/location must not overwrite a concurrent visibility toggle.
 IF p_action='savePin' THEN p_value:=p_value||jsonb_build_object('mapHidden',coalesce(old->'mapHidden','false'::jsonb)); END IF;
 RETURN public.korae_mutate_before_pin_visibility(p_action,p_uid,p_id,p_value);
END $$;
REVOKE ALL ON FUNCTION public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_pin_visibility(text,text,text,jsonb) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.korae_mutate(text,text,text,jsonb),public.korae_mutate_before_pin_visibility(text,text,text,jsonb) TO service_role;
