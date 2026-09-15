-- Prevent Hot/Client leads from moving back to Cold/Warm.
-- Applied remotely 2026-09-03.

CREATE OR REPLACE FUNCTION public.prevent_lead_hot_downgrade()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rank_old int; rank_new int;
BEGIN
  rank_old := CASE OLD.stage
    WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'hot' THEN 2
    WHEN 'client' THEN 3 WHEN 'regular_client' THEN 4 ELSE 0 END;
  rank_new := CASE NEW.stage
    WHEN 'cold' THEN 0 WHEN 'warm' THEN 1 WHEN 'hot' THEN 2
    WHEN 'client' THEN 3 WHEN 'regular_client' THEN 4 ELSE 0 END;
  IF rank_old >= 2 AND rank_new < 2 THEN
    RAISE EXCEPTION 'Hot or converted leads cannot move back to cold/warm';
  END IF;
  RETURN NEW;
END;
$$;
