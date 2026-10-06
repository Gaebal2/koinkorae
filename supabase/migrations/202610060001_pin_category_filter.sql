CREATE OR REPLACE FUNCTION public.korae_page(p_uid text,p_options jsonb DEFAULT '{}',p_cursor jsonb DEFAULT null,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb; n integer:=least(greatest(p_limit,1),100);
BEGIN
  IF coalesce(p_options->>'mode','posts') <> 'pins' THEN
    RETURN public.korae_page_before_map_filter(p_uid,p_options,p_cursor,p_limit);
  END IF;
  WITH matching AS (
    SELECT d.id,d.body FROM korae_documents d WHERE d.kind='pins'
      AND (p_options->>'pinCategory' IS NULL OR (CASE d.body->>'category' WHEN '판매' THEN 'P2P 판매' WHEN '구매 희망' THEN 'P2P 구매' WHEN 'P2P 구매 희망' THEN 'P2P 구매' WHEN '상점 등록' THEN '상점' WHEN '서비스' THEN '상점' WHEN '사업장' THEN '상점' ELSE d.body->>'category' END)=p_options->>'pinCategory')
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
    (CASE WHEN p_options->>'detail'='true' THEN body ELSE jsonb_build_object('lat',body->'lat','lng',body->'lng','coin',body->'coin','tradeCoins',body->'tradeCoins','title',body->'title','category',body->'category','ownerId',body->'ownerId') END)
    ||jsonb_build_object('id',id,'owner',coalesce(body->>'ownerId'=p_uid,false)) ORDER BY id),'[]'),
    'totalCount',(SELECT count(*) FROM matching),
    'nextCursor',CASE WHEN (SELECT count(*) FROM candidates)>n THEN (SELECT jsonb_build_array(id) FROM page ORDER BY id DESC LIMIT 1) ELSE null END)
    INTO result FROM page;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.korae_page(text,jsonb,jsonb,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.korae_page(text,jsonb,jsonb,integer) TO service_role;

