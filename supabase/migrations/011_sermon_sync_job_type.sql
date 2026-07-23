-- Sprint 9: 옵시디언 파일과 웹 편집 간 양방향 동기화 확인 작업을 받을 수 있게
-- local_jobs.job_type 허용 값을 확장한다. 기존 작업과 데이터에 영향이 없는 비파괴 변경이다.

alter table public.local_jobs
  drop constraint if exists local_jobs_job_type_check;

alter table public.local_jobs
  add constraint local_jobs_job_type_check
  check (job_type in ('research', 'sermon', 'sermon_export', 'sermon_sync'));
