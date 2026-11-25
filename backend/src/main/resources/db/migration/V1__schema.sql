-- Normalized shape of one Transparency in Coverage in-network file.
--
-- Rows are loaded with COPY inside one transaction per file, so readers only ever see
-- complete files. Search results are grouped and de-duplicated at query time from
-- these base tables (see SearchRepository), which keeps a single source of truth.

-- One ingested rate file, with everything needed to trace a rate back to its source.
create table source_file (
    id                        bigint generated always as identity primary key,
    index_url                 text        not null,
    reporting_structure_index int         not null,
    plan_group_label          text,
    plan_count                int         not null default 0,
    file_url                  text        not null unique,
    file_name                 text        not null,
    file_description          text,
    reporting_entity_name     text,
    reporting_entity_type     text,
    schema_version            text,
    last_updated_on           date,
    byte_size                 bigint,
    stats                     jsonb       not null default '{}'::jsonb,
    ingested_at               timestamptz not null default now()
);

-- Plans the index lists for the chosen reporting structure.
create table plan (
    id               bigint generated always as identity primary key,
    source_file_id   bigint not null references source_file on delete cascade,
    plan_name        text   not null,
    plan_id_type     text,
    plan_id          text,
    plan_market_type text
);

-- One provider group inside a provider reference: a tax ID and the NPIs billing under it.
-- ref_id is the file's provider_group_id; groups written inline on a rate get a negative one.
create table provider_group (
    id             bigint primary key,
    source_file_id bigint not null references source_file on delete cascade,
    ref_id         bigint not null,
    group_index    int    not null,
    tin_type       text   not null,
    tin            text   not null,
    business_name  text
);

create index provider_group_ref_idx on provider_group (source_file_id, ref_id);
create index provider_group_tin_idx on provider_group (source_file_id, tin);

create table provider_group_npi (
    provider_group_id bigint not null references provider_group on delete cascade,
    npi               bigint not null,
    primary key (provider_group_id, npi)
);

create index provider_group_npi_npi_idx on provider_group_npi (npi);

-- Derived after load: one row per tax ID with the name shown in results.
-- The file can spell one tax ID's business name several ways; the most common wins.
create table provider (
    source_file_id bigint not null references source_file on delete cascade,
    tin            text   not null,
    tin_type       text   not null,
    name           text   not null,
    name_count     int    not null,
    primary key (source_file_id, tin)
);

-- One in_network[] entry.
create table billing_item (
    id                        bigint primary key,
    source_file_id            bigint not null references source_file on delete cascade,
    item_index                int    not null,
    billing_code_type         text   not null,
    billing_code_type_version text,
    billing_code              text   not null,
    name                      text,
    description               text,
    negotiation_arrangement   text
);

-- One negotiated price per provider reference it applies to.
--
-- search_code is the code a person would look this price up by. For revenue-code items
-- the real procedure code is written in additional_information on each price, so that
-- value becomes the search code and match_kind records where it came from.
create table price_record (
    id                     bigint  primary key,
    source_file_id         bigint  not null references source_file on delete cascade,
    billing_item_id        bigint  not null references billing_item on delete cascade,
    rate_index             int     not null,
    price_index            int     not null,
    provider_ref_id        bigint  not null,
    negotiated_type        text,
    negotiated_rate        numeric not null,
    expiration_date        date,
    billing_class          text,
    setting                text,
    service_codes          text[]  not null default '{}',
    modifiers              text[]  not null default '{}',
    additional_information text,
    search_code            text    not null,
    match_kind             text    not null check (match_kind in ('billing_code', 'additional_information')),
    -- json, not jsonb: the detail view shows the record as the file wrote it, with the same
    -- key order and the same number text (539.40 stays 539.40). Only whitespace differs.
    raw                    json    not null
);

create index price_record_search_idx on price_record (source_file_id, search_code);

-- Every foreign key has an index, so replacing a file (a delete that cascades to its
-- rows) does not scan the big tables once per parent row.
create index price_record_item_idx on price_record (billing_item_id);
create index billing_item_source_idx on billing_item (source_file_id);
create index plan_source_idx on plan (source_file_id);

-- Every code that can be searched in a file, built at the end of each load.
-- code_type, name and description exist only when the file has an item filed under the code itself.
--
-- This is a plain table, not a materialized view: REFRESH replaces a view's contents in a
-- way that snapshots taken earlier cannot see, so a search running while a file reloads
-- would briefly find no codes at all.
create table code_catalog (
    source_file_id bigint not null references source_file on delete cascade,
    code           text   not null,
    code_type      text,
    name           text,
    description    text,
    provider_count int    not null,
    primary key (source_file_id, code)
);

create index code_catalog_prefix_idx on code_catalog (source_file_id, code text_pattern_ops);
