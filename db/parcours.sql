-- ============================================================
--  PARCOURS GUIDÉS — tables + sécurité (RLS) + contenu initial
--  À exécuter UNE SEULE FOIS dans Supabase → SQL Editor.
--  Ré-exécutable sans danger (if not exists / on conflict do nothing).
-- ============================================================

-- 1) Tables --------------------------------------------------
create table if not exists public.parcours (
    id         bigint generated always as identity primary key,
    title      text not null unique,
    subtitle   text,
    icon       text default '🧭',
    position   int  default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.parcours_fiches (
    id          bigint generated always as identity primary key,
    parcours_id bigint not null references public.parcours (id)  on delete cascade,
    resource_id bigint not null references public.resources (id) on delete cascade,
    position    int default 0,
    created_at  timestamptz not null default now(),
    unique (parcours_id, resource_id)
);

-- 2) Sécurité : lecture pour tous, écriture réservée à l'admin (Marc)
alter table public.parcours        enable row level security;
alter table public.parcours_fiches enable row level security;

create policy "parcours lisibles par tous"
    on public.parcours for select using (true);
create policy "parcours_fiches lisibles par tous"
    on public.parcours_fiches for select using (true);

create policy "parcours modifiables par l'admin"
    on public.parcours for all
    using (auth.uid() = 'f0ee9d68-0e34-4aef-87e1-eaf8aed5b882')
    with check (auth.uid() = 'f0ee9d68-0e34-4aef-87e1-eaf8aed5b882');
create policy "parcours_fiches modifiables par l'admin"
    on public.parcours_fiches for all
    using (auth.uid() = 'f0ee9d68-0e34-4aef-87e1-eaf8aed5b882')
    with check (auth.uid() = 'f0ee9d68-0e34-4aef-87e1-eaf8aed5b882');

-- 3) Les 6 parcours -----------------------------------------
insert into public.parcours (title, subtitle, icon, position) values
    ('Je démarre mon activité',         'De l''idée au premier client : la séquence pour bien lancer.',          '🚀', 10),
    ('De l''intérêt au contrat signé',  'Le tunnel de vente complet : attirer l''attention, convaincre, signer.', '💰', 20),
    ('Attirer sans prospecter',         'Construire sa visibilité pour que les clients viennent à toi.',         '🧲', 30),
    ('Concevoir des cours d''exception','Créer des supports pédagogiques pro avec l''IA.',                       '🎓', 40),
    ('Mes outils IA sur mesure',        'Tes propres outils de gestion et de relation élève.',                   '🧰', 50),
    ('Tenir sur la durée',              'Prendre soin de soi pour durer dans le métier de formateur.',           '🧘', 60)
on conflict (title) do nothing;

-- 4) Les fiches de chaque parcours (dans l'ordre) -----------
insert into public.parcours_fiches (parcours_id, resource_id, position)
select p.id, v.resource_id, v.position
from (values (5,10),(23,20),(30,30),(9,40),(10,50),(6,60)) as v(resource_id, position)
cross join (select id from public.parcours where title = 'Je démarre mon activité') p
on conflict (parcours_id, resource_id) do nothing;

insert into public.parcours_fiches (parcours_id, resource_id, position)
select p.id, v.resource_id, v.position
from (values (9,10),(10,20),(32,30),(33,40),(34,50),(25,60),(35,70)) as v(resource_id, position)
cross join (select id from public.parcours where title = 'De l''intérêt au contrat signé') p
on conflict (parcours_id, resource_id) do nothing;

insert into public.parcours_fiches (parcours_id, resource_id, position)
select p.id, v.resource_id, v.position
from (values (6,10),(24,20),(31,30),(8,40),(7,50)) as v(resource_id, position)
cross join (select id from public.parcours where title = 'Attirer sans prospecter') p
on conflict (parcours_id, resource_id) do nothing;

insert into public.parcours_fiches (parcours_id, resource_id, position)
select p.id, v.resource_id, v.position
from (values (18,10),(17,20),(15,30),(16,40),(19,50)) as v(resource_id, position)
cross join (select id from public.parcours where title = 'Concevoir des cours d''exception') p
on conflict (parcours_id, resource_id) do nothing;

insert into public.parcours_fiches (parcours_id, resource_id, position)
select p.id, v.resource_id, v.position
from (values (11,10),(12,20),(14,30),(13,40),(27,50)) as v(resource_id, position)
cross join (select id from public.parcours where title = 'Mes outils IA sur mesure') p
on conflict (parcours_id, resource_id) do nothing;

insert into public.parcours_fiches (parcours_id, resource_id, position)
select p.id, v.resource_id, v.position
from (values (20,10),(21,20),(22,30),(26,40)) as v(resource_id, position)
cross join (select id from public.parcours where title = 'Tenir sur la durée') p
on conflict (parcours_id, resource_id) do nothing;

-- Fiches volontairement non assignées (à toi de les placer plus tard si tu veux) :
--   28  Audit mémoire ChatGPT     |   29  Installer la PWA
