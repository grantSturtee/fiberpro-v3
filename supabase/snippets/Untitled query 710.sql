alter table project_updates
add column if not exists status text;

alter table project_updates
alter column body drop not null;

alter table project_updates
drop constraint if exists project_updates_body_check;

alter table project_updates
add constraint project_updates_body_check
check (
  body is null
  or (char_length(body) >= 1 and char_length(body) <= 2000)
);