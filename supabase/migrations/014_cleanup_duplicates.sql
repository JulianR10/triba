-- Remove duplicate rows caused by the double-binding script bug
-- (setup() + astro:page-load both firing on first load -> double submit
--  on feedback and creator_applications forms).
-- Keeps the oldest row per duplicate key (created_at asc, id asc). Idempotent.

-- Feedback: duplicate = same user + same message
delete from public.feedback f
where f.id in (
  select id from (
    select id,
           row_number() over (
             partition by user_id, mensaje
             order by created_at asc, id asc
           ) as rn
    from public.feedback
  ) t
  where rn > 1
);

-- Creator applications: duplicate = same email + same propuesta
delete from public.creator_applications c
where c.id in (
  select id from (
    select id,
           row_number() over (
             partition by email, propuesta
             order by created_at asc, id asc
           ) as rn
    from public.creator_applications
  ) t
  where rn > 1
);