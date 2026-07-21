-- Sprint 6: local_jobs가 설교 생성 작업을 받을 수 있게 job_type 허용 값을 확장한다.
-- 기존 research 작업과 데이터에는 영향이 없는 비파괴 변경이다.

alter table public.local_jobs
  drop constraint if exists local_jobs_job_type_check;

alter table public.local_jobs
  add constraint local_jobs_job_type_check
  check (job_type in ('research', 'sermon'));
