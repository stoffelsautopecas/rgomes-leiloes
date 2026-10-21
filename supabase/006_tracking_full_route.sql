-- Resume the old halfway limit from its current position, without counting
-- time spent stopped at that limit. Run only once across cold starts.
do $$
begin
  perform pg_advisory_xact_lock(1742348806);
  if coalesce(position('tracking_animation_full_route_v2' in
      pg_get_functiondef(to_regprocedure('public.advance_tracking_animation()'))), 0) = 0 then
    update public.app_client_tracking
    set animation_progress = case
          when animation_running_since is not null and animation_progress < 0.5
          then least(0.5, animation_progress + greatest(0, extract(epoch from (now() - animation_running_since))) / 7200.0)
          else animation_progress end;
    update public.app_client_tracking
    set animation_running_since = case
      when animation_progress < 1 and animation_paused is distinct from true
        and (animation_running_since is not null or animation_progress > 0
          or animation_paused = false
          or lower(status) ~ 'andamento|em rota|em transito|em trânsito|a caminho')
      then now() else null end;
  end if;
end;
$$;

create or replace function public.advance_tracking_animation() returns trigger
language plpgsql set search_path = public as $$
declare
  progress_value double precision := 0;
  already_started boolean := false;
  moving_status boolean;
begin
  -- tracking_animation_full_route_v2
  if TG_OP = 'UPDATE' then
    progress_value := OLD.animation_progress;
    already_started := OLD.animation_running_since is not null or progress_value > 0;
    if OLD.animation_running_since is not null and progress_value < 1 then
      progress_value := least(1, progress_value + greatest(0, extract(epoch from (now() - OLD.animation_running_since))) / 7200.0);
    end if;
  end if;
  if lower(trim(NEW.status)) = 'entregue' then progress_value := 1; end if;
  NEW.animation_progress := progress_value;
  moving_status := lower(NEW.status) ~ 'andamento|em rota|em transito|em trânsito|a caminho';
  NEW.animation_running_since := case
    when progress_value < 1 and NEW.animation_paused is distinct from true
      and (already_started or moving_status or NEW.animation_paused = false)
    then now() else null end;
  return NEW;
end;
$$;
drop trigger if exists advance_tracking_animation on public.app_client_tracking;
create trigger advance_tracking_animation
before insert or update of status, animation_paused on public.app_client_tracking
for each row execute function public.advance_tracking_animation();
