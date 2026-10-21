-- Shared demonstration timeline: four hours per full route, preserving pause/resume progress.
-- Client devices read this state; only admin status/motion controls change it.
alter table public.app_client_tracking
  add column if not exists animation_paused boolean,
  add column if not exists animation_progress double precision,
  add column if not exists animation_running_since timestamptz;

update public.app_client_tracking
set animation_progress = case when lower(trim(status)) = 'entregue' then 1 else 0 end,
    animation_running_since = case
      when lower(trim(status)) <> 'entregue' and animation_paused is distinct from true
        and (animation_paused = false or lower(status) ~ 'andamento|em rota|em transito|em trânsito|a caminho')
      then updated_at else null end
where animation_progress is null;
alter table public.app_client_tracking alter column animation_progress set default 0;
alter table public.app_client_tracking alter column animation_progress set not null;

-- Preserve the position when changing speed; never retroactively slow down
-- progress already travelled. Paused deliveries keep their stored position.
do $$
declare
  previous_definition text;
  previous_limit double precision;
  previous_duration double precision;
begin
  perform pg_advisory_xact_lock(1742348806);
  previous_definition := coalesce(pg_get_functiondef(to_regprocedure('public.advance_tracking_animation()')), '');
  if position('tracking_animation_duration_v4_4h' in previous_definition) = 0 then
    previous_duration := case when position('tracking_animation_duration_v3_8h' in previous_definition) > 0 then 28800.0 else 7200.0 end;
    previous_limit := case when position('tracking_animation_full_route_v2' in previous_definition) > 0 then 1 else 0.5 end;
    update public.app_client_tracking
    set animation_progress = case
      when animation_paused is distinct from true and animation_running_since is not null and animation_progress < previous_limit
      then least(previous_limit, animation_progress + greatest(0, extract(epoch from (now() - animation_running_since))) / previous_duration)
      else animation_progress end;
    update public.app_client_tracking
    set animation_running_since = case
      when animation_progress < 1 and animation_paused is distinct from true
        and (animation_running_since is not null or animation_progress > 0 or animation_paused = false
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
  -- tracking_animation_duration_v4_4h
  if TG_OP = 'UPDATE' then
    progress_value := OLD.animation_progress;
    already_started := OLD.animation_running_since is not null or progress_value > 0;
    if OLD.animation_running_since is not null and progress_value < 1 then
      progress_value := least(1, progress_value + greatest(0, extract(epoch from (now() - OLD.animation_running_since))) / 14400.0);
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
