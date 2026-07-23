-- Sprint 8: 완성 설교를 옵시디언 폴더에 저장하고 그 위치를 Supabase에 기록한다.
-- sermons 컬럼 추가와 local_jobs check 확장뿐인 비파괴 변경이다.

begin;

-- 저장된 파일의 출력 폴더 기준 상대경로와 동기화 상태. 같은 설교는 같은 파일을 덮어쓴다.
alter table public.sermons
  add column if not exists obsidian_relative_path text,
  add column if not exists obsidian_synced_at timestamptz,
  add column if not exists obsidian_content_hash text;

-- Companion이 옵시디언 저장 작업을 받을 수 있게 job_type 허용 값을 확장한다.
alter table public.local_jobs
  drop constraint if exists local_jobs_job_type_check;

alter table public.local_jobs
  add constraint local_jobs_job_type_check
  check (job_type in ('research', 'sermon', 'sermon_export'));

commit;
