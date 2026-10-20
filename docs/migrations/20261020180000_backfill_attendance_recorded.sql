-- One-time backfill: derive calendar_events.attendance_recorded from attendance_records.
-- Manual production execution only. Idempotent; touches only the attendance_recorded flag.
-- Individual: recorded when the occurrence's student has a record.
-- Class: recorded when every student who was a member on the occurrence date has a record.
BEGIN;

WITH expected AS (
  SELECT e.id AS event_id, e.student_id
  FROM public.calendar_events e
  WHERE e.class_id IS NULL AND e.student_id IS NOT NULL
  UNION
  SELECT e.id, m.student_id
  FROM public.calendar_events e
  JOIN public.class_members m
    ON m.class_id = e.class_id AND m.teacher_id = e.teacher_id
   AND (m.joined_at IS NULL OR m.joined_at::date <= e.date)
   AND (m.left_at IS NULL OR m.left_at::date > e.date)
  WHERE e.class_id IS NOT NULL
),
computed AS (
  SELECT e.id,
         EXISTS (SELECT 1 FROM expected x WHERE x.event_id = e.id)
         AND NOT EXISTS (
           SELECT 1 FROM expected x
           WHERE x.event_id = e.id
             AND NOT EXISTS (
               SELECT 1 FROM public.attendance_records r
               WHERE r.event_id = x.event_id AND r.student_id = x.student_id
             )
         ) AS complete
  FROM public.calendar_events e
  WHERE e.student_id IS NOT NULL OR e.class_id IS NOT NULL
)
UPDATE public.calendar_events e
SET attendance_recorded = c.complete
FROM computed c
WHERE c.id = e.id
  AND e.attendance_recorded IS DISTINCT FROM c.complete;

COMMIT;
