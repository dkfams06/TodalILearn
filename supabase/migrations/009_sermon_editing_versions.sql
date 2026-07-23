-- Sprint 7: 생성한 설교를 편집하고 버전과 평가를 남긴다.
-- 008_saved_sermons.sql의 sermons 테이블을 참조하는 비파괴 추가이며 기존 데이터에 영향이 없다.

begin;

-- 설교 수정 이력. 편집본은 Markdown 스냅샷으로 보존하고 과거 버전을 복원할 수 있다.
create table if not exists public.sermon_versions (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  source text not null check (source in ('ai_generation', 'web', 'obsidian', 'conflict_backup')),
  content text not null,
  content_hash text not null,
  edit_reasons jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  unique (sermon_id, version_number)
);

-- Sprint 1의 family_worship_sermons용 구형 테이블도 같은 이름을 사용했다.
-- 테이블이 이미 있으면 create table if not exists가 새 컬럼과 FK를 추가하지 않으므로,
-- Sprint 7 계약으로 안전하게 수렴하도록 누락 컬럼과 제약을 명시적으로 보정한다.
alter table public.sermon_versions
  add column if not exists user_id uuid,
  add column if not exists edit_reasons jsonb not null default '[]'::jsonb,
  add column if not exists note text;

update public.sermon_versions as version
set user_id = sermon.user_id
from public.sermons as sermon
where version.sermon_id = sermon.id
  and version.user_id is null;

do $$
begin
  if exists (
    select 1
    from public.sermon_versions
    where user_id is null
  ) then
    raise exception
      '구형 sermon_versions 행을 public.sermons와 연결하지 못했습니다. 수동 이관이 필요합니다.';
  end if;
end
$$;

alter table public.sermon_versions
  alter column user_id set not null,
  drop constraint if exists sermon_versions_sermon_id_fkey,
  drop constraint if exists sermon_versions_user_id_fkey;

alter table public.sermon_versions
  add constraint sermon_versions_sermon_id_fkey
    foreign key (sermon_id) references public.sermons(id) on delete cascade,
  add constraint sermon_versions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

create index if not exists sermon_versions_sermon_idx
  on public.sermon_versions (sermon_id, version_number desc);

alter table public.sermon_versions enable row level security;
revoke all on public.sermon_versions from anon, authenticated;
grant all on public.sermon_versions to service_role;

-- 사용자 평가표(12항목 점수 + 판정). append-only 이력으로 쌓는다.
create table if not exists public.sermon_evaluations (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer,
  scores jsonb not null,
  verdict text not null check (verdict in ('ready', 'minor_edit', 'major_edit', 'reject')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists sermon_evaluations_sermon_idx
  on public.sermon_evaluations (sermon_id, created_at desc);

alter table public.sermon_evaluations enable row level security;
revoke all on public.sermon_evaluations from anon, authenticated;
grant all on public.sermon_evaluations to service_role;

-- 기준 설교(baseline) 표시. 프롬프트 변경 전후 같은 주제를 비교할 때 기준점이 된다.
alter table public.sermons
  add column if not exists is_baseline boolean not null default false;

commit;
