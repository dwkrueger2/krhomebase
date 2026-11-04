-- KR Homebase Schema 8.0 - canonical DDL
-- Source: live D1 database "krhomebase_dev", read with wrangler (sqlite_schema) on 2026-10-24.
-- Statements are the stored DDL exactly as D1 reports them: tables (in foreign-key dependency order),
-- then indexes, views, and triggers. Nothing has been reformatted or renamed.
-- 124 tables, 289 indexes, 3 views, 1 triggers.

-- ----------------------------------------------------------------------
-- table: address (Contacts, Addresses, and Communication Methods)
CREATE TABLE address (
    id                  TEXT PRIMARY KEY,
    building_name       TEXT,
    street_level        TEXT,
    street_number       TEXT,
    street_name         TEXT,
    street1             TEXT,
    street2             TEXT,
    city                TEXT,
    state               TEXT,
    postal_code         TEXT,
    country             TEXT NOT NULL DEFAULT 'US',
    county              TEXT,
    po_box_type         TEXT,
    po_box_number       TEXT,
    po_box_instructions TEXT,
    address_quality     TEXT NOT NULL DEFAULT 'imported'
                              CHECK (address_quality IN ('verified','imported','partial','unknown')),
    source_system       TEXT,
    source_raw_text     TEXT,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
);

-- ----------------------------------------------------------------------
-- table: billing_activity_code (Time and Expenses)
CREATE TABLE billing_activity_code (
    id                    TEXT PRIMARY KEY,
    code                  TEXT NOT NULL UNIQUE,
    label                 TEXT NOT NULL,
    description           TEXT,
    jurisdiction_state    TEXT,
    default_billing_mode  TEXT CHECK (default_billing_mode IS NULL OR default_billing_mode IN ('hourly_billable','flat_fee_tracked','flat_fee_billable','non_billable','no_charge','pro_bono','internal')),
    default_rate          REAL CHECK (default_rate IS NULL OR default_rate >= 0),
    is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    source_system         TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT
);

-- ----------------------------------------------------------------------
-- table: client_lead_profile_legacy_orphan (Intake and Lead Management)
CREATE TABLE client_lead_profile_legacy_orphan (
    id                   TEXT PRIMARY KEY,
    client_id            TEXT,
    public_inquiry_id    TEXT,
    source_id            TEXT,
    pipeline_stage_id    TEXT,
    lead_status          TEXT NOT NULL DEFAULT 'prospect',
    lead_source_text     TEXT,
    referral_source      TEXT,
    referring_url        TEXT,
    campaign             TEXT,
    first_contacted_at   TEXT,
    last_contacted_at    TEXT,
    qualified_at         TEXT,
    converted_at         TEXT,
    lost_at              TEXT,
    lost_reason          TEXT,
    assigned_to_user_id  TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT,
    archived_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------
-- table: contact_resolution (Identity and Parties)
CREATE TABLE "contact_resolution" (
    id                 TEXT PRIMARY KEY,
    source_kind        TEXT NOT NULL CHECK (source_kind IN ('individual','entity')),
    source_contact_id  TEXT NOT NULL,
    source_client_id   TEXT,
    target_kind        TEXT CHECK (target_kind IS NULL OR target_kind IN ('individual','entity')),
    target_contact_id  TEXT,
    target_client_id   TEXT,
    operation          TEXT NOT NULL CHECK (operation IN ('merge','copy_and_inactivate','inactivate')),
    reason             TEXT,
    actor_user_id      TEXT,
    actor_email        TEXT,
    request_id         TEXT,
    idempotency_key    TEXT UNIQUE,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source_kind, source_contact_id)
);

-- ----------------------------------------------------------------------
-- table: content_author (Public Content Publishing)
CREATE TABLE content_author (
    id                  TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    public_title        TEXT,
    bio_html            TEXT,
    headshot_r2_key     TEXT,
    headshot_public_url TEXT,
    active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT
);

-- ----------------------------------------------------------------------
-- table: content_sequence (Public Content Publishing)
CREATE TABLE content_sequence (
  content_type TEXT PRIMARY KEY CHECK (content_type IN ('article', 'answer')),
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------
-- table: custom_field_set (System Metadata and Configuration)
CREATE TABLE custom_field_set (
  id TEXT PRIMARY KEY,
  set_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('client','matter','individual','entity','asset','document','invoice','lead')),
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ----------------------------------------------------------------------
-- table: entity (Business Entities)
CREATE TABLE entity (
    id                           TEXT PRIMARY KEY,
    legal_name                   TEXT NOT NULL,
    entity_subtype_legacy               TEXT NOT NULL
                                     CHECK (entity_subtype_legacy IN (
                                         'llc','corporation','partnership','trust',
                                         'estate','nonprofit','government','sole_prop')),
    partnership_type             TEXT
                                     CHECK (partnership_type IS NULL OR partnership_type IN ('lp','llp','gp','lllp')),
    management_structure         TEXT
                                     CHECK (management_structure IS NULL OR management_structure IN (
                                         'member_managed','manager_managed',
                                         'board_managed','unknown')),
    ein                          TEXT,
    ein_last4                    TEXT,
    state_of_formation           TEXT,
    formation_date               TEXT,
    entity_status                TEXT NOT NULL DEFAULT 'active'
                                     CHECK (entity_status IN (
                                         'active','inactive','dissolved',
                                         'forfeited','reinstated','pending')),
    sos_file_number              TEXT,
    state_taxpayer_number        TEXT,
    xt_number                    TEXT,
    registered_agent_name        TEXT,
    boi_status                   TEXT NOT NULL DEFAULT 'unknown'
                                     CHECK (boi_status IN (
                                         'filed','not_required','pending','unknown','exempt')),
    boi_confirmation_number      TEXT,
    notes                        TEXT,
    created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                   TEXT
, entity_subtype TEXT NOT NULL DEFAULT 'unknown'
    CHECK (entity_subtype IN (
        'llc','corporation','partnership','trust','estate','nonprofit',
        'government','sole_prop','unknown')), ecid TEXT);

-- ----------------------------------------------------------------------
-- table: external_integration_account (External Integrations and Import)
CREATE TABLE external_integration_account (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  account_name TEXT NOT NULL,
  region TEXT,
  status TEXT NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','active','paused','error','disabled')),
  external_account_id TEXT,
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0,1)),
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes TEXT
);

-- ----------------------------------------------------------------------
-- table: firm_bank_account (Billing, Ledger, Payments, and Trust)
CREATE TABLE firm_bank_account (
    id                         TEXT PRIMARY KEY,
    account_name               TEXT NOT NULL,
    account_type               TEXT NOT NULL DEFAULT 'operating'
                                   CHECK (account_type IN ('operating','trust','savings','merchant','other')),
    bank_name                  TEXT,
    routing_last4              TEXT,
    routing_number         TEXT,
    account_last4              TEXT,
    account_number         TEXT,
    external_account_name      TEXT,
    is_active                  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    notes                      TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT
);

-- ----------------------------------------------------------------------
-- table: individual (Identity and Parties)
CREATE TABLE individual (
    id             TEXT PRIMARY KEY,
    title_prefix   TEXT,
    first_name     TEXT NOT NULL,
    middle_name    TEXT,
    last_name      TEXT NOT NULL,
    suffix         TEXT,
    preferred_name TEXT,
    dob            TEXT,
    ssn            TEXT,
    ssn_last4      TEXT,
    is_minor       INTEGER NOT NULL DEFAULT 0 CHECK (is_minor IN (0,1)),
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT
, is_attorney INTEGER NOT NULL DEFAULT 0 CHECK (is_attorney IN (0,1)), icid TEXT);

-- ----------------------------------------------------------------------
-- table: kr_crud_worker_smoke_test (System Metadata and Configuration)
CREATE TABLE kr_crud_worker_smoke_test (   id TEXT PRIMARY KEY,   test_key TEXT NOT NULL UNIQUE,   test_label TEXT NOT NULL,   test_note TEXT,   test_count INTEGER NOT NULL DEFAULT 0,   is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),   created_at TEXT NOT NULL,   updated_at TEXT NOT NULL );

-- ----------------------------------------------------------------------
-- table: kr_maintenance_gate (System Metadata and Configuration)
CREATE TABLE kr_maintenance_gate (
    id TEXT PRIMARY KEY CHECK (id = 'krhomebase'),
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    reason TEXT,
    set_by TEXT,
    set_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------
-- table: kr_session (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE kr_session (
                            id TEXT PRIMARY KEY,
                            session_token_hash TEXT NOT NULL UNIQUE,

                            user_id TEXT NOT NULL,

                            created_at TEXT NOT NULL,
                            expires_at TEXT NOT NULL,
                            last_seen_at TEXT,

                            revoked_at TEXT,
                            revoked_reason TEXT,

                            ip_hash TEXT,
                            user_agent_hash TEXT,

                            mfa_verified INTEGER NOT NULL DEFAULT 0,

                            created_by TEXT,
                            updated_at TEXT
);

-- ----------------------------------------------------------------------
-- table: lead_pipeline_stage (Intake and Lead Management)
CREATE TABLE lead_pipeline_stage (
  id TEXT PRIMARY KEY,
  stage_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_terminal INTEGER NOT NULL DEFAULT 0 CHECK (is_terminal IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ----------------------------------------------------------------------
-- table: lead_source (Intake and Lead Management)
CREATE TABLE lead_source (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'unknown',
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ----------------------------------------------------------------------
-- table: lookup (System Metadata and Configuration)
CREATE TABLE lookup (
    id            TEXT PRIMARY KEY,
    category      TEXT NOT NULL,
    value         TEXT NOT NULL,
    label         TEXT NOT NULL,
    description   TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT,
    UNIQUE (category, value)
);

-- ----------------------------------------------------------------------
-- table: repository (Documents, Media, and Templates)
CREATE TABLE repository (
    id                   TEXT PRIMARY KEY,
    repository_name      TEXT NOT NULL UNIQUE,
    repository_type      TEXT NOT NULL CHECK (repository_type IN ('r2_bucket','external_url_list','physical_file','other')),
    description          TEXT,
    r2_bucket            TEXT,
    base_prefix          TEXT,
    is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT
);

-- ----------------------------------------------------------------------
-- table: role_set (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE role_set (
    id               TEXT PRIMARY KEY,
    role_key         TEXT NOT NULL UNIQUE,
    label            TEXT NOT NULL,
    description      TEXT,
    role_family      TEXT NOT NULL DEFAULT 'operations'
                         CHECK (role_family IN ('system','administration','operations','external')),
    is_system        INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0,1)),
    is_assignable    INTEGER NOT NULL DEFAULT 1 CHECK (is_assignable IN (0,1)),
    sort_order       INTEGER NOT NULL DEFAULT 0,
    is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT
);

-- ----------------------------------------------------------------------
-- table: custom_field_definition (System Metadata and Configuration)
CREATE TABLE custom_field_definition (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','long_text','number','currency','date','datetime','boolean','select','multi_select','url','email','phone','json')),
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0,1)),
  options_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (set_id) REFERENCES custom_field_set(id) ON DELETE CASCADE,
  UNIQUE (set_id, field_key)
);

-- ----------------------------------------------------------------------
-- table: entity_address (Contacts, Addresses, and Communication Methods)
CREATE TABLE entity_address (
    id                       TEXT PRIMARY KEY,
    entity_id                TEXT NOT NULL,
    address_id               TEXT NOT NULL,
    address_type_lookup_id   TEXT,
    use_context              TEXT NOT NULL DEFAULT 'general'
                                 CHECK (use_context IN (
                                     'general','business','mailing','billing',
                                     'registered_office','other')),
    is_primary               INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    valid_from               TEXT,
    valid_to                 TEXT,
    source                   TEXT,
    notes                    TEXT,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT,
    FOREIGN KEY (entity_id)              REFERENCES entity(id),
    FOREIGN KEY (address_id)             REFERENCES address(id),
    FOREIGN KEY (address_type_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: entity_contact (Contacts, Addresses, and Communication Methods)
CREATE TABLE entity_contact (
    id                TEXT PRIMARY KEY,
    entity_id         TEXT NOT NULL,
    individual_id     TEXT NOT NULL,
    role_lookup_id    TEXT NOT NULL,
    is_primary        INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    start_date        TEXT,
    end_date          TEXT,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT,
    FOREIGN KEY (entity_id)      REFERENCES entity(id),
    FOREIGN KEY (individual_id)  REFERENCES individual(id),
    FOREIGN KEY (role_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: entity_contact_method (Contacts, Addresses, and Communication Methods)
CREATE TABLE entity_contact_method (
    id                         TEXT PRIMARY KEY,
    entity_id                  TEXT NOT NULL,
    contact_type               TEXT NOT NULL CHECK (contact_type IN ('email','phone','fax','web','other')),
    subtype_lookup_id          TEXT,
    value                      TEXT NOT NULL,
    label                      TEXT,
    use_context                TEXT NOT NULL DEFAULT 'general'
                                   CHECK (use_context IN (
                                       'general','client_contact','billing','employee_hr',
                                       'user_profile','emergency_contact','marketing','other')),
    is_primary                 INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    can_text                   INTEGER NOT NULL DEFAULT 0 CHECK (can_text IN (0,1)),
    is_verified                INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0,1)),
    do_not_contact             INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0,1)),
    marketing_consent_status   TEXT NOT NULL DEFAULT 'unknown'
                                   CHECK (marketing_consent_status IN ('unknown','yes','no','not_asked','revoked')),
    marketing_consent_at       TEXT,
    source_system              TEXT,
    source_label               TEXT,
    valid_from                 TEXT,
    valid_to                   TEXT,
    notes                      TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT,
    FOREIGN KEY (entity_id)          REFERENCES entity(id),
    FOREIGN KEY (subtype_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: entity_dba (Business Entities)
CREATE TABLE entity_dba (
    id                 TEXT PRIMARY KEY,
    entity_id          TEXT NOT NULL,
    dba_name           TEXT NOT NULL,
    state              TEXT,
    county             TEXT,
    start_date         TEXT,
    end_date           TEXT,
    is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    FOREIGN KEY (entity_id) REFERENCES entity(id)
);

-- ----------------------------------------------------------------------
-- table: external_sync_state (External Integrations and Import)
CREATE TABLE external_sync_state (
  id TEXT PRIMARY KEY,
  integration_account_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  cursor_value TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (integration_account_id) REFERENCES external_integration_account(id) ON DELETE CASCADE,
  UNIQUE (integration_account_id, resource_type)
);

-- ----------------------------------------------------------------------
-- table: external_webhook_event (External Integrations and Import)
CREATE TABLE external_webhook_event (
  id TEXT PRIMARY KEY,
  integration_account_id TEXT,
  provider TEXT NOT NULL,
  external_event_id TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  processing_status TEXT NOT NULL DEFAULT 'received' CHECK (processing_status IN ('received','processed','ignored','failed')),
  payload_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (integration_account_id) REFERENCES external_integration_account(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: individual_address (Contacts, Addresses, and Communication Methods)
CREATE TABLE individual_address (
    id                       TEXT PRIMARY KEY,
    individual_id            TEXT NOT NULL,
    address_id               TEXT NOT NULL,
    address_type_lookup_id   TEXT,
    use_context              TEXT NOT NULL DEFAULT 'general'
                                 CHECK (use_context IN (
                                     'general','client_contact','billing','employee_hr',
                                     'user_profile','emergency_contact','other')),
    is_primary               INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    valid_from               TEXT,
    valid_to                 TEXT,
    source                   TEXT,
    notes                    TEXT,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT,
    FOREIGN KEY (individual_id)          REFERENCES individual(id),
    FOREIGN KEY (address_id)             REFERENCES address(id),
    FOREIGN KEY (address_type_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: individual_contact_method (Contacts, Addresses, and Communication Methods)
CREATE TABLE individual_contact_method (
    id                         TEXT PRIMARY KEY,
    individual_id              TEXT NOT NULL,
    contact_type               TEXT NOT NULL CHECK (contact_type IN ('email','phone','fax','web','other')),
    subtype_lookup_id          TEXT,
    value                      TEXT NOT NULL,
    label                      TEXT,
    use_context                TEXT NOT NULL DEFAULT 'general'
                                   CHECK (use_context IN (
                                       'general','client_contact','billing','employee_hr',
                                       'user_profile','emergency_contact','marketing','other')),
    is_primary                 INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    can_text                   INTEGER NOT NULL DEFAULT 0 CHECK (can_text IN (0,1)),
    is_verified                INTEGER NOT NULL DEFAULT 0 CHECK (is_verified IN (0,1)),
    do_not_contact             INTEGER NOT NULL DEFAULT 0 CHECK (do_not_contact IN (0,1)),
    marketing_consent_status   TEXT NOT NULL DEFAULT 'unknown'
                                   CHECK (marketing_consent_status IN ('unknown','yes','no','not_asked','revoked')),
    marketing_consent_at       TEXT,
    source_system              TEXT,
    source_label               TEXT,
    valid_from                 TEXT,
    valid_to                   TEXT,
    notes                      TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT,
    FOREIGN KEY (individual_id)     REFERENCES individual(id),
    FOREIGN KEY (subtype_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: individual_relationship (Identity and Parties)
CREATE TABLE individual_relationship (
    id                                  TEXT PRIMARY KEY,
    individual_a_id                     TEXT NOT NULL,
    individual_b_id                     TEXT NOT NULL,
    a_to_b_relationship_lookup_id       TEXT NOT NULL,
    b_to_a_relationship_lookup_id       TEXT NOT NULL,
    relationship_status                 TEXT NOT NULL DEFAULT 'current'
                                            CHECK (relationship_status IN ('current','former','unknown')),
    valid_from                          TEXT,
    valid_to                            TEXT,
    is_primary                          INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    notes                               TEXT,
    created_at                          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                          TEXT,
    CHECK (individual_a_id <> individual_b_id),
    FOREIGN KEY (individual_a_id)               REFERENCES individual(id),
    FOREIGN KEY (individual_b_id)               REFERENCES individual(id),
    FOREIGN KEY (a_to_b_relationship_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (b_to_a_relationship_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: role_set_permission (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE role_set_permission (
    id                    TEXT PRIMARY KEY,
    role_set_id           TEXT NOT NULL,
    permission_key        TEXT NOT NULL,
    permission_label      TEXT NOT NULL,
    permission_group      TEXT NOT NULL,
    can_create            INTEGER NOT NULL DEFAULT 0 CHECK (can_create IN (0,1)),
    can_read              INTEGER NOT NULL DEFAULT 0 CHECK (can_read IN (0,1)),
    can_update            INTEGER NOT NULL DEFAULT 0 CHECK (can_update IN (0,1)),
    can_delete            INTEGER NOT NULL DEFAULT 0 CHECK (can_delete IN (0,1)),
    can_approve           INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0,1)),
    can_send              INTEGER NOT NULL DEFAULT 0 CHECK (can_send IN (0,1)),
    is_restricted_delete  INTEGER NOT NULL DEFAULT 0 CHECK (is_restricted_delete IN (0,1)),
    notes                 TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    FOREIGN KEY (role_set_id) REFERENCES role_set(id) ON DELETE CASCADE,
    UNIQUE (role_set_id, permission_key)
);

-- ----------------------------------------------------------------------
-- table: role_set_permission_scope (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE role_set_permission_scope (
  id TEXT PRIMARY KEY,
  role_set_id TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('own','team','all')),
  can_create INTEGER NOT NULL DEFAULT 0 CHECK (can_create IN (0,1)),
  can_read INTEGER NOT NULL DEFAULT 0 CHECK (can_read IN (0,1)),
  can_update INTEGER NOT NULL DEFAULT 0 CHECK (can_update IN (0,1)),
  can_delete INTEGER NOT NULL DEFAULT 0 CHECK (can_delete IN (0,1)),
  can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0,1)),
  can_send INTEGER NOT NULL DEFAULT 0 CHECK (can_send IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (role_set_id) REFERENCES role_set(id) ON DELETE CASCADE,
  UNIQUE (role_set_id, permission_key, scope)
);

-- ----------------------------------------------------------------------
-- table: action_review_stamp (Estate Planning, Assets, and Funding)
CREATE TABLE action_review_stamp (
    id                 TEXT PRIMARY KEY,
    funding_action_id  TEXT NOT NULL,
    user_id            TEXT NOT NULL,
    stamp_type         TEXT NOT NULL
                           CHECK (stamp_type IN (
                               'AttorneyReviewed','ClientApproved','StaffCompleted','QualityChecked')),
    stamped_at         TEXT NOT NULL DEFAULT (datetime('now')),
    notes              TEXT,
    FOREIGN KEY (funding_action_id) REFERENCES funding_action(id),
    FOREIGN KEY (user_id)           REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: asset (Estate Planning, Assets, and Funding)
CREATE TABLE asset (
    id               TEXT PRIMARY KEY,
    matter_id        TEXT NOT NULL,
    asset_number     TEXT NOT NULL,
    asset_type       TEXT NOT NULL,
    asset_category   TEXT NOT NULL
                         CHECK (asset_category IN (
                             'financial_account','retirement','real_estate',
                             'insurance','vehicle','entity_interest',
                             'tangible','digital_other')),
    display_name     TEXT NOT NULL,
    description      TEXT,
    planning_status  TEXT NOT NULL DEFAULT 'not_reviewed'
                         CHECK (planning_status IN (
                             'not_reviewed','action_needed','in_progress',
                             'completed','no_action_needed')),
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT,
    FOREIGN KEY (matter_id) REFERENCES matter(id),
    UNIQUE (matter_id, asset_number)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_bank (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_bank (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    institution_name         TEXT NOT NULL,
    account_type             TEXT NOT NULL CHECK (account_type IN ('checking','savings','money_market','cd','brokerage','other')),
    account_number_masked    TEXT,
    titling_confirmed        INTEGER NOT NULL DEFAULT 0 CHECK (titling_confirmed IN (0,1)),
    pod_tod_designation      TEXT,
    FOREIGN KEY (asset_id) REFERENCES asset(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_digital (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_digital (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    platform_name            TEXT NOT NULL,
    asset_identifier         TEXT,
    access_instructions_location TEXT,
    two_factor_notes         TEXT,
    custodian_contact        TEXT,
    FOREIGN KEY (asset_id) REFERENCES asset(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_insurance (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_insurance (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    carrier_name             TEXT NOT NULL,
    policy_number_masked     TEXT,
    insured_name             TEXT NOT NULL,
    owner_name_exact         TEXT NOT NULL,
    policy_type              TEXT,
    death_benefit            REAL,
    cash_value               REAL,
    beneficiary_designations_known INTEGER NOT NULL DEFAULT 0 CHECK (beneficiary_designations_known IN (0,1)),
    FOREIGN KEY (asset_id) REFERENCES asset(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_retirement (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_retirement (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    custodian_name           TEXT NOT NULL,
    plan_type                TEXT NOT NULL CHECK (plan_type IN ('ira','roth_ira','401k','403b','sep','pension','other')),
    account_number_masked    TEXT,
    beneficiary_designations_known INTEGER NOT NULL DEFAULT 0 CHECK (beneficiary_designations_known IN (0,1)),
    required_min_distribution_notes TEXT,
    FOREIGN KEY (asset_id) REFERENCES asset(id)
);

-- ----------------------------------------------------------------------
-- table: asset_valuation (Estate Planning, Assets, and Funding)
CREATE TABLE asset_valuation (
    id               TEXT PRIMARY KEY,
    asset_id         TEXT NOT NULL UNIQUE,
    estimated_value  REAL,
    value_date       TEXT,
    value_source     TEXT
                         CHECK (value_source IS NULL OR value_source IN (
                             'statement','cad','appraisal','client_estimate',
                             'kbb_nada','tax_return','unknown')),
    debt_amount      REAL DEFAULT 0,
    equity_value     REAL,
    notes            TEXT,
    FOREIGN KEY (asset_id) REFERENCES asset(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_entity (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_entity (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    entity_interest_name     TEXT NOT NULL,
    entity_id                TEXT,
    interest_type            TEXT CHECK (interest_type IS NULL OR interest_type IN ('membership','stock','partnership','beneficial_interest','other')),
    ownership_percentage     REAL CHECK (ownership_percentage IS NULL OR ownership_percentage BETWEEN 0 AND 100),
    operating_agreement_known INTEGER NOT NULL DEFAULT 0 CHECK (operating_agreement_known IN (0,1)),
    buy_sell_restrictions    TEXT,
    assignment_document_id   TEXT,
    FOREIGN KEY (asset_id)               REFERENCES asset(id),
    FOREIGN KEY (entity_id)              REFERENCES entity(id),
    FOREIGN KEY (assignment_document_id) REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_real_estate (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_real_estate (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    property_address         TEXT NOT NULL,
    county                   TEXT,
    state                    TEXT NOT NULL,
    legal_description        TEXT,
    parcel_id                TEXT,
    deed_type                TEXT,
    homestead                INTEGER NOT NULL DEFAULT 0 CHECK (homestead IN (0,1)),
    mortgage_lender          TEXT,
    deed_document_id         TEXT,
    FOREIGN KEY (asset_id)         REFERENCES asset(id),
    FOREIGN KEY (deed_document_id) REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_tangible (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_tangible (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    item_description         TEXT NOT NULL,
    location                 TEXT,
    serial_number_masked     TEXT,
    insured                  INTEGER NOT NULL DEFAULT 0 CHECK (insured IN (0,1)),
    appraisal_document_id    TEXT,
    FOREIGN KEY (asset_id)              REFERENCES asset(id),
    FOREIGN KEY (appraisal_document_id) REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: asset_detail_vehicle (Estate Planning, Assets, and Funding)
CREATE TABLE asset_detail_vehicle (
    id                       TEXT PRIMARY KEY,
    asset_id                 TEXT NOT NULL UNIQUE,
    vin_masked               TEXT,
    year                     INTEGER,
    make                     TEXT,
    model                    TEXT,
    title_state              TEXT,
    lienholder               TEXT,
    title_document_id        TEXT,
    FOREIGN KEY (asset_id)          REFERENCES asset(id),
    FOREIGN KEY (title_document_id) REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: asset_ownership (Estate Planning, Assets, and Funding)
CREATE TABLE asset_ownership (
    id                        TEXT PRIMARY KEY,
    asset_id                  TEXT NOT NULL UNIQUE,
    ownership_type            TEXT NOT NULL
                                  CHECK (ownership_type IN (
                                      'individual','joint_tenants','tenants_in_common',
                                      'community_property','trust','llc','lp',
                                      'pod_tod','unknown')),
    current_owner_name_exact  TEXT NOT NULL,
    owner_client_id           TEXT,
    owner_individual_id       TEXT,
    owner_entity_id           TEXT,
    co_owner_name             TEXT,
    co_owner_client_id        TEXT,
    co_owner_individual_id    TEXT,
    co_owner_entity_id        TEXT,
    notes                     TEXT,
    FOREIGN KEY (asset_id)                REFERENCES asset(id),
    FOREIGN KEY (owner_client_id)         REFERENCES client(id),
    FOREIGN KEY (owner_individual_id)     REFERENCES individual(id),
    FOREIGN KEY (owner_entity_id)         REFERENCES entity(id),
    FOREIGN KEY (co_owner_client_id)      REFERENCES client(id),
    FOREIGN KEY (co_owner_individual_id)  REFERENCES individual(id),
    FOREIGN KEY (co_owner_entity_id)      REFERENCES entity(id)
);

-- ----------------------------------------------------------------------
-- table: audit_log (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE audit_log (
    id                 TEXT PRIMARY KEY,
    actor_user_id      TEXT,
    action             TEXT NOT NULL,
    target_table       TEXT NOT NULL,
    target_id          TEXT NOT NULL,
    matter_id          TEXT,
    client_id          TEXT,
    ip_address         TEXT,
    user_agent         TEXT,
    previous_json      TEXT,
    new_json           TEXT,
    request_id         TEXT,
    actor_email        TEXT,
    actor_role         TEXT,
    source             TEXT,
    resource           TEXT,
    idempotency_key    TEXT,
    success            INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0,1)),
    error_message      TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (actor_user_id) REFERENCES user(id),
    FOREIGN KEY (matter_id)     REFERENCES matter(id),
    FOREIGN KEY (client_id)     REFERENCES client(id)
);

-- ----------------------------------------------------------------------
-- table: bank_deposit (Billing, Ledger, Payments, and Trust)
CREATE TABLE bank_deposit (
    id                   TEXT PRIMARY KEY,
    deposit_number       TEXT NOT NULL UNIQUE,
    deposit_date         TEXT NOT NULL,
    memo                 TEXT,
    bank_account_id      TEXT,
    deposit_method       TEXT NOT NULL DEFAULT 'mixed' CHECK (deposit_method IN ('cash','check','online_payment','mixed','other')),
    status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reconciled','void')),
    item_count           INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    total_amount         REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    deposited_by_user_id TEXT,
    teller_name          TEXT,
    source_document_id   TEXT,
    printed_at           TEXT,
    created_by_user_id   TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (bank_account_id)      REFERENCES firm_bank_account(id),
    FOREIGN KEY (deposited_by_user_id) REFERENCES user(id),
    FOREIGN KEY (source_document_id)   REFERENCES document_record(id),
    FOREIGN KEY (created_by_user_id)   REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: bank_deposit_item (Billing, Ledger, Payments, and Trust)
CREATE TABLE bank_deposit_item (
    id                     TEXT PRIMARY KEY,
    bank_deposit_id        TEXT NOT NULL,
    payment_id             TEXT,
    ledger_entry_id        TEXT,
    item_type              TEXT NOT NULL DEFAULT 'online_payment'
                                CHECK (item_type IN ('online_payment','cash','check','ach','wire','other')),
    source_receipt_number  TEXT,
    matter_id              TEXT,
    matter_number_text     TEXT,
    drawer_name            TEXT,
    routing_last4          TEXT,
    routing_number     TEXT,
    account_last4          TEXT,
    account_number     TEXT,
    amount                 REAL NOT NULL CHECK (amount >= 0),
    notes                  TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT,
    FOREIGN KEY (bank_deposit_id) REFERENCES bank_deposit(id),
    FOREIGN KEY (payment_id)      REFERENCES payment(id),
    FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entry(id),
    FOREIGN KEY (matter_id)       REFERENCES matter(id)
);

-- ----------------------------------------------------------------------
-- table: beneficiary_designation (Estate Planning, Assets, and Funding)
CREATE TABLE beneficiary_designation (
    id                      TEXT PRIMARY KEY,
    asset_id                TEXT NOT NULL,
    designation_type        TEXT NOT NULL CHECK (designation_type IN ('primary','contingent')),
    beneficiary_name        TEXT NOT NULL,
    percentage              REAL CHECK (percentage BETWEEN 0 AND 100),
    relationship            TEXT,
    beneficiary_client_id   TEXT,
    beneficiary_individual_id TEXT,
    beneficiary_entity_id   TEXT,
    designation_confirmed   INTEGER NOT NULL DEFAULT 0 CHECK (designation_confirmed IN (0,1)),
    notes                   TEXT,
    FOREIGN KEY (asset_id)                   REFERENCES asset(id),
    FOREIGN KEY (beneficiary_client_id)      REFERENCES client(id),
    FOREIGN KEY (beneficiary_individual_id)  REFERENCES individual(id),
    FOREIGN KEY (beneficiary_entity_id)      REFERENCES entity(id)
);

-- ----------------------------------------------------------------------
-- table: client (Clients and Matters)
CREATE TABLE client (
    id                         TEXT PRIMARY KEY,
    client_number              TEXT NOT NULL UNIQUE,
    client_type                TEXT NOT NULL CHECK (client_type IN ('individual','entity','group')),
    individual_id              TEXT,
    entity_id                  TEXT,
    display_name               TEXT NOT NULL,
    short_name                 TEXT,
    card_image_media_id        TEXT,
    prospect_status            TEXT NOT NULL DEFAULT 'prospect'
                                   CHECK (prospect_status IN (
                                       'prospect','proposed','memo_sent',
                                       'engagement_sent','intake_complete','engaged')),
    intake_date                TEXT,
    status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    marketing_consent_status   TEXT NOT NULL DEFAULT 'unknown'
                                   CHECK (marketing_consent_status IN ('unknown','yes','no','not_asked','revoked')),
    marketing_consent_at       TEXT,
    tax_identifier_last4       TEXT,
    tax_identifier  TEXT,
    source_system              TEXT,
    source_client_number       TEXT,
    source_card_name           TEXT,
    source_short_name          TEXT,
    import_batch_id            TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT,
    CHECK (
        (client_type = 'individual' AND individual_id IS NOT NULL AND entity_id IS NULL)
        OR
        (client_type = 'entity' AND entity_id IS NOT NULL AND individual_id IS NULL)
        OR
        (client_type = 'group' AND individual_id IS NULL AND entity_id IS NULL)
    ),
    FOREIGN KEY (individual_id)       REFERENCES individual(id),
    FOREIGN KEY (entity_id)           REFERENCES entity(id),
    FOREIGN KEY (card_image_media_id) REFERENCES media_asset(id),
    FOREIGN KEY (import_batch_id)     REFERENCES import_batch(id)
);

-- ----------------------------------------------------------------------
-- table: client_member (Clients and Matters)
CREATE TABLE client_member (
    id                    TEXT PRIMARY KEY,
    client_id             TEXT NOT NULL,
    individual_id         TEXT,
    entity_id             TEXT,
    member_role           TEXT NOT NULL DEFAULT 'member'
                              CHECK (member_role IN ('primary','spouse','co_client','authorized_contact','billing_contact','member','other')),
    is_primary            INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    receives_bills        INTEGER NOT NULL DEFAULT 0 CHECK (receives_bills IN (0,1)),
    signs_engagement      INTEGER NOT NULL DEFAULT 0 CHECK (signs_engagement IN (0,1)),
    start_date            TEXT,
    end_date              TEXT,
    source_system         TEXT,
    source_name_snapshot  TEXT,
    notes                 TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    CHECK (
        (individual_id IS NOT NULL AND entity_id IS NULL)
        OR
        (individual_id IS NULL AND entity_id IS NOT NULL)
    ),
    FOREIGN KEY (client_id)     REFERENCES client(id),
    FOREIGN KEY (individual_id) REFERENCES individual(id),
    FOREIGN KEY (entity_id)     REFERENCES entity(id)
);

-- ----------------------------------------------------------------------
-- table: client_lead_profile (Intake and Lead Management)
CREATE TABLE "client_lead_profile" (
    id                   TEXT PRIMARY KEY,
    individual_id        TEXT NOT NULL UNIQUE,
    public_inquiry_id    TEXT,
    source_id            TEXT,
    pipeline_stage_id    TEXT,
    lead_status          TEXT NOT NULL DEFAULT 'prospect',
    lead_source_text     TEXT,
    referral_source      TEXT,
    referring_url        TEXT,
    campaign             TEXT,
    first_contacted_at   TEXT,
    last_contacted_at    TEXT,
    qualified_at         TEXT,
    converted_at         TEXT,
    lost_at              TEXT,
    lost_reason          TEXT,
    assigned_to_user_id  TEXT,
    created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (individual_id)       REFERENCES individual(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id)           REFERENCES lead_source(id) ON DELETE SET NULL,
    FOREIGN KEY (pipeline_stage_id)   REFERENCES lead_pipeline_stage(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: communication_attachment (Notes, Communications, Tasks, and Reminders)
CREATE TABLE communication_attachment (
  id TEXT PRIMARY KEY,
  communication_id TEXT NOT NULL,
  document_record_id TEXT,
  media_asset_id TEXT,
  filename TEXT,
  content_type TEXT,
  external_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (communication_id) REFERENCES communication_log(id) ON DELETE CASCADE,
  FOREIGN KEY (document_record_id) REFERENCES document_record(id) ON DELETE SET NULL,
  FOREIGN KEY (media_asset_id) REFERENCES media_asset(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: communication_log (Notes, Communications, Tasks, and Reminders)
CREATE TABLE communication_log (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL DEFAULT 'general' CHECK (owner_type IN ('client','matter','individual','entity','general')),
  owner_id TEXT,
  matter_id TEXT,
  client_id TEXT,
  individual_id TEXT,
  entity_id TEXT,
  communication_type TEXT NOT NULL CHECK (communication_type IN ('email','phone','sms','meeting','letter','portal','note','other')),
  direction TEXT NOT NULL DEFAULT 'internal' CHECK (direction IN ('incoming','outgoing','internal','unknown')),
  subject TEXT,
  body_summary TEXT,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'logged' CHECK (status IN ('draft','sent','received','logged','failed','archived')),
  external_message_id TEXT,
  source_system TEXT,
  source_record_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (matter_id) REFERENCES matter(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL,
  FOREIGN KEY (individual_id) REFERENCES individual(id) ON DELETE SET NULL,
  FOREIGN KEY (entity_id) REFERENCES entity(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: communication_participant (Notes, Communications, Tasks, and Reminders)
CREATE TABLE communication_participant (
  id TEXT PRIMARY KEY,
  communication_id TEXT NOT NULL,
  participant_role TEXT NOT NULL CHECK (participant_role IN ('from','to','cc','bcc','caller','recipient','attendee','other')),
  individual_id TEXT,
  entity_id TEXT,
  user_id TEXT,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (communication_id) REFERENCES communication_log(id) ON DELETE CASCADE,
  FOREIGN KEY (individual_id) REFERENCES individual(id) ON DELETE SET NULL,
  FOREIGN KEY (entity_id) REFERENCES entity(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: compliance_filing (Business Entities)
CREATE TABLE compliance_filing (
    id                    TEXT PRIMARY KEY,
    entity_id             TEXT NOT NULL,
    filing_type           TEXT NOT NULL CHECK (filing_type IN ('annual_report','boi','franchise_tax','tax_return','license_renewal','other')),
    filing_period         TEXT,
    due_date              TEXT,
    filed_date            TEXT,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filed','late','not_required','waived')),
    confirmation_number   TEXT,
    document_record_id    TEXT,
    assigned_to_user_id   TEXT,
    notes                 TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    FOREIGN KEY (entity_id)           REFERENCES entity(id),
    FOREIGN KEY (document_record_id)  REFERENCES document_record(id),
    FOREIGN KEY (assigned_to_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: conflict_check (Conflict Checking)
CREATE TABLE conflict_check (
    id                            TEXT PRIMARY KEY,
    matter_id                     TEXT NOT NULL,
    checked_against_client_id     TEXT,
    checked_against_individual_id TEXT,
    checked_against_entity_id     TEXT,
    checked_by_user_id            TEXT NOT NULL,
    checked_date                  TEXT NOT NULL,
    result                        TEXT NOT NULL CHECK (result IN ('clear','conflict','waived','needs_review')),
    notes                         TEXT,
    created_at                    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (matter_id)                     REFERENCES matter(id),
    FOREIGN KEY (checked_against_client_id)     REFERENCES client(id),
    FOREIGN KEY (checked_against_individual_id) REFERENCES individual(id),
    FOREIGN KEY (checked_against_entity_id)     REFERENCES entity(id),
    FOREIGN KEY (checked_by_user_id)            REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: conflict_check_result (Conflict Checking)
CREATE TABLE conflict_check_result (
  id TEXT PRIMARY KEY,
  conflict_check_id TEXT NOT NULL,
  matched_owner_type TEXT NOT NULL CHECK (matched_owner_type IN ('client','matter','individual','entity','document','external','unknown')),
  matched_owner_id TEXT,
  matched_name TEXT NOT NULL,
  match_strength TEXT NOT NULL DEFAULT 'possible' CHECK (match_strength IN ('exact','strong','possible','weak')),
  conflict_type TEXT NOT NULL DEFAULT 'unknown',
  disposition TEXT NOT NULL DEFAULT 'needs_review' CHECK (disposition IN ('needs_review','cleared','waived','blocked','duplicate','not_a_conflict')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (conflict_check_id) REFERENCES conflict_check(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------
-- table: conflict_check_party (Conflict Checking)
CREATE TABLE conflict_check_party (
  id TEXT PRIMARY KEY,
  conflict_check_id TEXT NOT NULL,
  matter_id TEXT,
  client_id TEXT,
  party_name TEXT NOT NULL,
  party_role TEXT NOT NULL DEFAULT 'unknown',
  individual_id TEXT,
  entity_id TEXT,
  relationship_to_matter TEXT,
  search_terms TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (conflict_check_id) REFERENCES conflict_check(id) ON DELETE CASCADE,
  FOREIGN KEY (matter_id) REFERENCES matter(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL,
  FOREIGN KEY (individual_id) REFERENCES individual(id) ON DELETE SET NULL,
  FOREIGN KEY (entity_id) REFERENCES entity(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: content_asset (Public Content Publishing)
CREATE TABLE content_asset (
    id                     TEXT PRIMARY KEY,
    content_id             TEXT NOT NULL,
    original_relative_path TEXT NOT NULL,
    r2_key                 TEXT NOT NULL UNIQUE,
    public_url             TEXT NOT NULL,
    mime_type              TEXT NOT NULL,
    file_size              INTEGER NOT NULL CHECK (file_size >= 0),
    width                  INTEGER,
    height                 INTEGER,
    usage                  TEXT NOT NULL CHECK (usage IN ('body', 'thumbnail', 'both')),
    alt_text               TEXT NOT NULL DEFAULT '',
    sha256                 TEXT,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (content_id) REFERENCES public_content(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------
-- table: content_revision (Public Content Publishing)
CREATE TABLE content_revision (
    id                  TEXT PRIMARY KEY,
    content_id          TEXT NOT NULL,
    revision_number     INTEGER NOT NULL,
    content_json        TEXT NOT NULL,
    sanitized_html      TEXT NOT NULL,
    asset_manifest_json TEXT,
    changed_by_user_id  TEXT,
    change_note         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (content_id, revision_number),
    FOREIGN KEY (content_id) REFERENCES public_content(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: custom_field_value (System Metadata and Configuration)
CREATE TABLE custom_field_value (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('client','matter','individual','entity','asset','document','invoice','lead')),
  owner_id TEXT NOT NULL,
  value_text TEXT,
  value_number REAL,
  value_date TEXT,
  value_json TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (definition_id) REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE (definition_id, owner_type, owner_id)
);

-- ----------------------------------------------------------------------
-- table: document_record (Documents, Media, and Templates)
CREATE TABLE document_record (
    id                           TEXT PRIMARY KEY,
    document_number              TEXT UNIQUE,
    owner_type                   TEXT NOT NULL CHECK (owner_type IN ('client','individual','matter','user','employee','entity','asset','system')),
    owner_id                     TEXT NOT NULL,
    client_id                    TEXT,
    matter_id                    TEXT,
    individual_id                TEXT,
    entity_id                    TEXT,
    employee_id                  TEXT,
    title                        TEXT NOT NULL,
    document_category_lookup_id  TEXT,
    document_type                TEXT,
    document_date                TEXT,
    storage_type                 TEXT NOT NULL DEFAULT 'r2_object'
                                    CHECK (storage_type IN ('r2_object','external_url','paper','unknown')),
    primary_media_asset_id       TEXT,
    external_url                 TEXT,
    external_provider            TEXT
                                    CHECK (external_provider IS NULL OR external_provider IN (
                                        'google_drive','dropbox','onedrive','sharepoint',
                                        'court_portal','county_recorder','other')),
    external_resource_type       TEXT
                                    CHECK (external_resource_type IS NULL OR external_resource_type IN (
                                        'file','folder','webpage','portal_record','unknown')),
    storage_status               TEXT NOT NULL DEFAULT 'active' CHECK (storage_status IN ('draft','active','superseded','archived','deleted')),
    is_confidential              INTEGER NOT NULL DEFAULT 1 CHECK (is_confidential IN (0,1)),
    source                       TEXT CHECK (source IS NULL OR source IN ('client','firm','court','institution','employee','system','other')),
    received_date                TEXT,
    notes                        TEXT,
    created_by_user_id           TEXT NOT NULL,
    created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                   TEXT,
    FOREIGN KEY (client_id)                   REFERENCES client(id),
    FOREIGN KEY (matter_id)                   REFERENCES matter(id),
    FOREIGN KEY (individual_id)               REFERENCES individual(id),
    FOREIGN KEY (entity_id)                   REFERENCES entity(id),
    FOREIGN KEY (employee_id)                 REFERENCES employee(id),
    FOREIGN KEY (document_category_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (primary_media_asset_id)      REFERENCES media_asset(id),
    FOREIGN KEY (created_by_user_id)          REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: entity_registration (Business Entities)
CREATE TABLE entity_registration (
    id                         TEXT PRIMARY KEY,
    entity_id                  TEXT NOT NULL,
    registration_type          TEXT NOT NULL CHECK (registration_type IN ('formation','foreign_registration','tax','license','boi','other')),
    jurisdiction               TEXT NOT NULL,
    registration_number        TEXT,
    status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','pending','expired','unknown')),
    registration_date          TEXT,
    expiration_date            TEXT,
    document_record_id         TEXT,
    notes                      TEXT,
    FOREIGN KEY (entity_id)          REFERENCES entity(id),
    FOREIGN KEY (document_record_id) REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: document_template (Documents, Media, and Templates)
CREATE TABLE document_template (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  storage_type TEXT NOT NULL DEFAULT 'external' CHECK (storage_type IN ('r2','external','google_drive','other')),
  external_url TEXT,
  media_asset_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (media_asset_id) REFERENCES media_asset(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: employee (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee (
    id                       TEXT PRIMARY KEY,
    user_id                  TEXT NOT NULL UNIQUE,
    employee_number          TEXT UNIQUE,
    staff_code               TEXT UNIQUE,
    employment_status        TEXT NOT NULL DEFAULT 'active'
                                  CHECK (employment_status IN ('active','on_leave','terminated','contractor','inactive')),
    job_title                TEXT,
    department               TEXT,
    qualification            TEXT,
    login_status             TEXT NOT NULL DEFAULT 'enabled'
                                  CHECK (login_status IN ('enabled','disabled','locked','pending','unknown')),
    show_in_staff_list       INTEGER NOT NULL DEFAULT 1 CHECK (show_in_staff_list IN (0,1)),
    hire_date                TEXT,
    termination_date         TEXT,
    review_cycle_anchor_date TEXT,
    last_review_date         TEXT,
    last_review_notes        TEXT,
    next_review_date         TEXT,
    employee_folder_url      TEXT,
    private_hr_folder_url    TEXT,
    pto_policy_id            TEXT,
    pto_balance_hours        REAL NOT NULL DEFAULT 0,
    pay_type                 TEXT NOT NULL DEFAULT 'hourly' CHECK (pay_type IN ('hourly','salary','contract')),
    current_pay_rate         REAL CHECK (current_pay_rate IS NULL OR current_pay_rate >= 0),
    pay_rate_effective_date  TEXT,
    staff_created_date       TEXT,
    user_created_date        TEXT,
    employee_image_media_id  TEXT,
    ssn_last4                TEXT,
    ssn           TEXT,
    emergency_contact_name   TEXT,
    emergency_contact_phone  TEXT,
    notes                    TEXT,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT, is_1099_vendor INTEGER NOT NULL DEFAULT 0 CHECK (is_1099_vendor IN (0,1)),
    FOREIGN KEY (user_id)                 REFERENCES user(id),
    FOREIGN KEY (employee_image_media_id) REFERENCES media_asset(id),
    FOREIGN KEY (pto_policy_id)           REFERENCES hr_policy(id)
);

-- ----------------------------------------------------------------------
-- table: employee_certification (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_certification (
    id                          TEXT PRIMARY KEY,
    employee_id                 TEXT NOT NULL,
    certification_type_lookup_id TEXT,
    certification_type          TEXT NOT NULL,
    description                 TEXT NOT NULL,
    issuing_state               TEXT,
    issuing_authority           TEXT,
    registration_number         TEXT,
    issue_date                  TEXT,
    expiration_date             TEXT,
    status                      TEXT NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','expired','pending','revoked','inactive')),
    document_record_id          TEXT,
    notes                       TEXT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT,
    FOREIGN KEY (employee_id)                  REFERENCES employee(id),
    FOREIGN KEY (certification_type_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (document_record_id)           REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: employee_pay_rate (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_pay_rate (
    id                   TEXT PRIMARY KEY,
    employee_id          TEXT NOT NULL,
    rate_type            TEXT NOT NULL CHECK (rate_type IN ('hourly','salary','contract')),
    rate_amount          REAL NOT NULL CHECK (rate_amount >= 0),
    effective_date       TEXT NOT NULL,
    end_date             TEXT,
    approved_by_user_id  TEXT,
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id)         REFERENCES employee(id),
    FOREIGN KEY (approved_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: employee_pto_ledger (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_pto_ledger (
    id                       TEXT PRIMARY KEY,
    employee_id              TEXT NOT NULL,
    employee_time_event_id   TEXT,
    policy_id                TEXT,
    ledger_date              TEXT NOT NULL,
    entry_type               TEXT NOT NULL CHECK (entry_type IN ('accrual','usage','holiday','adjustment','carryover','cashout')),
    hours_delta              REAL NOT NULL,
    balance_after_hours      REAL,
    notes                    TEXT,
    created_by_user_id       TEXT NOT NULL,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id)            REFERENCES employee(id),
    FOREIGN KEY (employee_time_event_id) REFERENCES employee_time_event(id),
    FOREIGN KEY (policy_id)              REFERENCES hr_policy(id),
    FOREIGN KEY (created_by_user_id)     REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: employee_review_event (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_review_event (
    id                   TEXT PRIMARY KEY,
    employee_id          TEXT NOT NULL,
    review_type          TEXT NOT NULL CHECK (review_type IN ('annual','probationary','disciplinary','performance','other')),
    review_date          TEXT NOT NULL,
    reviewer_user_id     TEXT NOT NULL,
    outcome              TEXT CHECK (outcome IS NULL OR outcome IN ('satisfactory','needs_improvement','unsatisfactory','excellent','not_applicable')),
    notes                TEXT,
    document_record_id   TEXT,
    next_review_date     TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (employee_id)        REFERENCES employee(id),
    FOREIGN KEY (reviewer_user_id)   REFERENCES user(id),
    FOREIGN KEY (document_record_id) REFERENCES document_record(id)
);

-- ----------------------------------------------------------------------
-- table: employee_time_card (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_time_card (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  pay_period_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','approved','reopened','exported')),
  employee_approved_by_user_id TEXT,
  employee_approved_at TEXT,
  locked_at TEXT,
  reopened_by_user_id TEXT,
  reopened_at TEXT,
  payroll_exported_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT, manager_approved_by_user_id TEXT, manager_approved_at TEXT,
  UNIQUE (employee_id, pay_period_id),
  FOREIGN KEY (employee_id) REFERENCES employee(id),
  FOREIGN KEY (pay_period_id) REFERENCES pay_period(id),
  FOREIGN KEY (employee_approved_by_user_id) REFERENCES user(id),
  FOREIGN KEY (reopened_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: employee_time_event (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_time_event (
    id                         TEXT PRIMARY KEY,
    employee_id                TEXT NOT NULL,
    pay_period_id              TEXT,
    work_date                  TEXT NOT NULL,
    start_at                   TEXT,
    end_at                     TEXT,
    break_minutes              INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
    hours                      REAL NOT NULL CHECK (hours >= 0),
    pay_rate                   REAL CHECK (pay_rate IS NULL OR pay_rate >= 0),
    time_type                  TEXT NOT NULL DEFAULT 'regular'
                                    CHECK (time_type IN ('regular','overtime','pto','holiday','sick','unpaid','other')),
    status                     TEXT NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft','submitted','approved','rejected','paid')),
    pay_period_start           TEXT,
    pay_period_end             TEXT,
    is_pto_accrual_eligible    INTEGER NOT NULL DEFAULT 1 CHECK (is_pto_accrual_eligible IN (0,1)),
    pto_accrual_rate           REAL CHECK (pto_accrual_rate IS NULL OR pto_accrual_rate >= 0),
    pto_hours_accrued          REAL NOT NULL DEFAULT 0,
    submitted_at               TEXT,
    approved_by_user_id        TEXT,
    approved_at                TEXT,
    rejected_by_user_id        TEXT,
    rejected_at                TEXT,
    rejection_reason           TEXT,
    payroll_exported_at        TEXT,
    notes                      TEXT,
    created_by_user_id         TEXT NOT NULL,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT, time_card_id TEXT,
    FOREIGN KEY (employee_id)         REFERENCES employee(id),
    FOREIGN KEY (pay_period_id)       REFERENCES pay_period(id),
    FOREIGN KEY (approved_by_user_id) REFERENCES user(id),
    FOREIGN KEY (rejected_by_user_id) REFERENCES user(id),
    FOREIGN KEY (created_by_user_id)  REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: employee_time_punch (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE employee_time_punch (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  time_card_id TEXT NOT NULL,
  punch_type TEXT NOT NULL CHECK (punch_type IN ('clock_in','clock_out')),
  occurred_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  source TEXT NOT NULL DEFAULT 'button' CHECK (source IN ('button','auto_break_resume','employee_correction','manager_correction','system')),
  correction_reason TEXT,
  supersedes_punch_id TEXT,
  voided_at TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), idempotency_key TEXT,
  FOREIGN KEY (employee_id) REFERENCES employee(id),
  FOREIGN KEY (time_card_id) REFERENCES employee_time_card(id),
  FOREIGN KEY (supersedes_punch_id) REFERENCES employee_time_punch(id),
  FOREIGN KEY (created_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: entity_event (Business Entities)
CREATE TABLE entity_event (
    id                   TEXT PRIMARY KEY,
    entity_id            TEXT NOT NULL,
    matter_id            TEXT,
    event_type_lookup_id TEXT NOT NULL,
    subject              TEXT NOT NULL,
    event_date           TEXT,
    due_date             TEXT,
    is_complete          INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0,1)),
    assigned_to_user_id  TEXT,
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (entity_id)            REFERENCES entity(id),
    FOREIGN KEY (matter_id)            REFERENCES matter(id),
    FOREIGN KEY (event_type_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (assigned_to_user_id)  REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: event (Calendar and Events)
CREATE TABLE event (
    id                    TEXT PRIMARY KEY,
    matter_id             TEXT,
    related_client_id     TEXT,
    related_individual_id TEXT,
    related_entity_id     TEXT,
    user_id               TEXT,
    assigned_to_user_id   TEXT,
    organizer_name        TEXT,
    event_type_lookup_id  TEXT,
    subject               TEXT NOT NULL,
    notes                 TEXT,
    event_date            TEXT,
    start_at              TEXT,
    end_at                TEXT,
    location              TEXT,
    status                TEXT NOT NULL DEFAULT 'scheduled'
                               CHECK (status IN ('scheduled','completed','cancelled','rescheduled','no_show')),
    due_date              TEXT,
    is_complete           INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0,1)),
    source_system         TEXT,
    import_batch_id       TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    FOREIGN KEY (matter_id)             REFERENCES matter(id),
    FOREIGN KEY (related_client_id)     REFERENCES client(id),
    FOREIGN KEY (related_individual_id) REFERENCES individual(id),
    FOREIGN KEY (related_entity_id)     REFERENCES entity(id),
    FOREIGN KEY (user_id)               REFERENCES user(id),
    FOREIGN KEY (assigned_to_user_id)   REFERENCES user(id),
    FOREIGN KEY (event_type_lookup_id)  REFERENCES lookup(id),
    FOREIGN KEY (import_batch_id)       REFERENCES import_batch(id)
);

-- ----------------------------------------------------------------------
-- table: event_participant (Calendar and Events)
CREATE TABLE event_participant (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT,
  client_id TEXT,
  individual_id TEXT,
  entity_id TEXT,
  participant_role TEXT NOT NULL DEFAULT 'attendee',
  display_name TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','accepted','declined','tentative','attended','no_show','not_required')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL,
  FOREIGN KEY (individual_id) REFERENCES individual(id) ON DELETE SET NULL,
  FOREIGN KEY (entity_id) REFERENCES entity(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: expense_entry (Time and Expenses)
CREATE TABLE expense_entry (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL,
  user_id TEXT,
  expense_date TEXT NOT NULL,
  expense_category TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_cost REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  billing_status TEXT NOT NULL DEFAULT 'unbilled' CHECK (billing_status IN ('unbilled','billed','non_billable','written_off')),
  invoice_id TEXT,
  source_system TEXT,
  source_record_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (matter_id) REFERENCES matter(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoice(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: external_source_map (External Integrations and Import)
CREATE TABLE external_source_map (
    id                  TEXT PRIMARY KEY,
    import_batch_id     TEXT,
    source_system       TEXT NOT NULL DEFAULT 'LEAP',
    source_table        TEXT,
    source_file_name    TEXT,
    source_row_number   INTEGER,
    source_record_id    TEXT,
    source_key          TEXT,
    target_table        TEXT NOT NULL,
    target_id           TEXT NOT NULL,
    target_field        TEXT,
    source_json         TEXT,
    mapping_status      TEXT NOT NULL DEFAULT 'mapped'
                            CHECK (mapping_status IN ('staged','mapped','ignored','needs_review','failed')),
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(id)
);

-- ----------------------------------------------------------------------
-- table: firm_holiday (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE firm_holiday (
    id              TEXT PRIMARY KEY,
    policy_id       TEXT,
    holiday_name    TEXT NOT NULL,
    observed_rule   TEXT,
    fixed_month     INTEGER CHECK (fixed_month IS NULL OR fixed_month BETWEEN 1 AND 12),
    fixed_day       INTEGER CHECK (fixed_day IS NULL OR fixed_day BETWEEN 1 AND 31),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_paid         INTEGER NOT NULL DEFAULT 1 CHECK (is_paid IN (0,1)),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT,
    FOREIGN KEY (policy_id) REFERENCES hr_policy(id)
);

-- ----------------------------------------------------------------------
-- table: funding_action (Estate Planning, Assets, and Funding)
CREATE TABLE funding_action (
    id                        TEXT PRIMARY KEY,
    asset_id                  TEXT NOT NULL,
    matter_id                 TEXT NOT NULL,
    action_type               TEXT NOT NULL
                                  CHECK (action_type IN (
                                      'RetitleToTrust','PreparePOD','PrepareTOD',
                                      'ChangeBeneficiary','PrepareDeed',
                                      'PrepareEntityAssignment','RequestDocuments',
                                      'ReviewOnly','NoActionNeeded','Other')),
    action_description        TEXT NOT NULL,
    priority                  TEXT NOT NULL DEFAULT 'Normal'
                                  CHECK (priority IN ('High','Normal','Low')),
    attorney_review_required  INTEGER NOT NULL DEFAULT 0 CHECK (attorney_review_required IN (0,1)),
    assigned_to_user_id       TEXT,
    status                    TEXT NOT NULL DEFAULT 'Open'
                                  CHECK (status IN (
                                      'Open','WaitingOnClient','WaitingOnInstitution',
                                      'Drafted','SentForSignature','Signed',
                                      'Submitted','ConfirmedComplete','Closed')),
    notes                     TEXT,
    created_at                TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT,
    FOREIGN KEY (asset_id)            REFERENCES asset(id),
    FOREIGN KEY (matter_id)           REFERENCES matter(id),
    FOREIGN KEY (assigned_to_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: hr_policy (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE hr_policy (
    id                    TEXT PRIMARY KEY,
    policy_code           TEXT NOT NULL UNIQUE,
    policy_type           TEXT NOT NULL CHECK (policy_type IN ('pto','holiday_pay','timekeeping','start_stop','payroll','general')),
    title                 TEXT NOT NULL,
    effective_date        TEXT,
    end_date              TEXT,
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
    summary               TEXT,
    policy_text           TEXT,
    settings_json         TEXT,
    created_by_user_id    TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    FOREIGN KEY (created_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: hr_policy_rule (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE hr_policy_rule (
    id                       TEXT PRIMARY KEY,
    policy_id                TEXT NOT NULL,
    rule_type                TEXT NOT NULL CHECK (rule_type IN ('pto_accrual_tier','holiday','eligibility','other')),
    rule_label               TEXT NOT NULL,
    service_months_min       INTEGER CHECK (service_months_min IS NULL OR service_months_min >= 0),
    service_months_max       INTEGER CHECK (service_months_max IS NULL OR service_months_max >= 0),
    accrual_rate_per_hour    REAL CHECK (accrual_rate_per_hour IS NULL OR accrual_rate_per_hour >= 0),
    max_hours_per_year       REAL CHECK (max_hours_per_year IS NULL OR max_hours_per_year >= 0),
    paid_hours               REAL CHECK (paid_hours IS NULL OR paid_hours >= 0),
    rule_json                TEXT,
    sort_order               INTEGER NOT NULL DEFAULT 0,
    is_active                INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT,
    FOREIGN KEY (policy_id) REFERENCES hr_policy(id)
);

-- ----------------------------------------------------------------------
-- table: import_batch (External Integrations and Import)
CREATE TABLE import_batch (
    id                 TEXT PRIMARY KEY,
    source_system      TEXT NOT NULL DEFAULT 'LEAP',
    source_file_name   TEXT NOT NULL,
    source_file_type   TEXT,
    file_sha256        TEXT,
    row_count          INTEGER CHECK (row_count IS NULL OR row_count >= 0),
    imported_by_user_id TEXT,
    imported_at        TEXT NOT NULL DEFAULT (datetime('now')),
    status             TEXT NOT NULL DEFAULT 'staged'
                           CHECK (status IN ('staged','validated','imported','failed','superseded')),
    notes              TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT,
    FOREIGN KEY (imported_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: invoice (Billing, Ledger, Payments, and Trust)
CREATE TABLE invoice (
    id                   TEXT PRIMARY KEY,
    matter_id            TEXT NOT NULL,
    billing_profile_id   TEXT,
    billed_to_client_id  TEXT NOT NULL,
    invoice_number       TEXT NOT NULL UNIQUE,
    invoice_date         TEXT NOT NULL,
    period_start         TEXT,
    period_end           TEXT,
    due_date             TEXT,
    subtotal_amount      REAL NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
    discount_amount      REAL NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount           REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount         REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid          REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    balance_due          REAL NOT NULL DEFAULT 0,
    status               TEXT NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','sent','partially_paid','paid','overdue','void','written_off')),
    sent_at              TEXT,
    paid_at              TEXT,
    source_system        TEXT,
    source_invoice_number TEXT,
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT, ivid TEXT
    CHECK (ivid IS NULL OR (length(ivid) = 7 AND ivid NOT GLOB '*[^A-Z0-9]*')),
    FOREIGN KEY (matter_id)           REFERENCES matter(id),
    FOREIGN KEY (billing_profile_id)  REFERENCES matter_billing_profile(id),
    FOREIGN KEY (billed_to_client_id) REFERENCES client(id)
);

-- ----------------------------------------------------------------------
-- table: invoice_line_item (Billing, Ledger, Payments, and Trust)
CREATE TABLE invoice_line_item (
    id                    TEXT PRIMARY KEY,
    invoice_id            TEXT NOT NULL,
    matter_id             TEXT NOT NULL,
    time_entry_id         TEXT,
    fee_component_id      TEXT,
    ledger_entry_id       TEXT,
    line_type             TEXT NOT NULL DEFAULT 'time'
                               CHECK (line_type IN ('time','flat_fee','expense','expense_recovery','credit','discount','tax','adjustment','note')),
    activity_code         TEXT,
    description           TEXT NOT NULL,
    quantity              REAL NOT NULL DEFAULT 1,
    unit_rate             REAL NOT NULL DEFAULT 0,
    subtotal_amount       REAL NOT NULL DEFAULT 0,
    tax_amount            REAL NOT NULL DEFAULT 0,
    total_amount          REAL NOT NULL DEFAULT 0,
    display_on_invoice    INTEGER NOT NULL DEFAULT 1 CHECK (display_on_invoice IN (0,1)),
    sort_order            INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    FOREIGN KEY (invoice_id)       REFERENCES invoice(id),
    FOREIGN KEY (matter_id)        REFERENCES matter(id),
    FOREIGN KEY (time_entry_id)    REFERENCES time_entry(id),
    FOREIGN KEY (fee_component_id) REFERENCES matter_fee_component(id),
    FOREIGN KEY (ledger_entry_id)  REFERENCES ledger_entry(id)
);

-- ----------------------------------------------------------------------
-- table: kr_homebase_initialization (System Metadata and Configuration)
CREATE TABLE kr_homebase_initialization (
    id                          TEXT PRIMARY KEY,
    status                      TEXT NOT NULL DEFAULT 'not_started'
                                    CHECK (status IN ('not_started','initializing','initialized','locked')),
    bootstrap_user_id           TEXT,
    bootstrap_email             TEXT,
    bootstrap_provider          TEXT,
    bootstrap_provider_subject  TEXT,
    initialized_at              TEXT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT,
    notes                       TEXT,
    CHECK (id = 'global'),
    FOREIGN KEY (bootstrap_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: kr_note (Notes, Communications, Tasks, and Reminders)
CREATE TABLE kr_note (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('client','matter','individual','entity','document','asset','invoice','public_inquiry','general')),
  owner_id TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general',
  subject TEXT,
  body TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'plain' CHECK (body_format IN ('plain','markdown','html')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','client_visible','private','system')),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
  is_confidential INTEGER NOT NULL DEFAULT 0 CHECK (is_confidential IN (0,1)),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  archived_at TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: lead (Intake and Lead Management)
CREATE TABLE lead (
    id                   TEXT PRIMARY KEY,
    lcid                 TEXT UNIQUE,
    individual_id        TEXT NOT NULL,
    public_inquiry_id    TEXT,
    source               TEXT NOT NULL DEFAULT 'manual'
                           CHECK (source IN ('manual','public_inquiry','referral','website','other')),
    status               TEXT NOT NULL DEFAULT 'new'
                           CHECK (status IN ('new','contacted','qualified','proposal','won','lost','archived')),
    urgency              TEXT NOT NULL DEFAULT 'normal'
                           CHECK (urgency IN ('low','normal','high','urgent')),
    summary              TEXT,
    practice_area        TEXT,
    assigned_to_user_id  TEXT,
    received_at          TEXT NOT NULL DEFAULT (datetime('now')),
    last_action_at       TEXT,
    converted_client_id  TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (individual_id)       REFERENCES individual(id),
    FOREIGN KEY (assigned_to_user_id) REFERENCES user(id),
    FOREIGN KEY (converted_client_id) REFERENCES client(id)
);

-- ----------------------------------------------------------------------
-- table: ledger_audit_log (Billing, Ledger, Payments, and Trust)
CREATE TABLE ledger_audit_log (
    id                    TEXT PRIMARY KEY,
    ledger_entry_id        TEXT,
    invoice_id             TEXT,
    matter_id              TEXT,
    action                 TEXT NOT NULL
                               CHECK (action IN ('created','voided','corrected','note_added','system_reconciled')),
    actor_user_id          TEXT NOT NULL,
    action_at              TEXT NOT NULL DEFAULT (datetime('now')),
    previous_values_json   TEXT,
    new_values_json        TEXT,
    notes                  TEXT,
    FOREIGN KEY (ledger_entry_id) REFERENCES ledger_entry(id),
    FOREIGN KEY (invoice_id)      REFERENCES invoice(id),
    FOREIGN KEY (matter_id)       REFERENCES matter(id),
    FOREIGN KEY (actor_user_id)   REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: ledger_entry (Billing, Ledger, Payments, and Trust)
CREATE TABLE ledger_entry (
    id                      TEXT PRIMARY KEY,
    invoice_id              TEXT,
    matter_id               TEXT NOT NULL,
    client_id               TEXT,
    payment_id              TEXT,
    bank_deposit_id         TEXT,
    ledger_bucket           TEXT NOT NULL DEFAULT 'receivable'
                                 CHECK (ledger_bucket IN ('receivable','expense_paid','expense_recovery','trust','retainer_credit','wip','anticipated_expense','other')),
    entry_type              TEXT NOT NULL
                                 CHECK (entry_type IN ('charge','invoice','payment','credit','write_off','refund','adjustment','expense_paid','expense_recovery','retainer_credit','trust_deposit','trust_disbursement','opening_balance')),
    entry_direction         TEXT NOT NULL
                                 CHECK (entry_direction IN ('credit','debit')),
    payment_type_lookup_id  TEXT,
    amount                  REAL NOT NULL CHECK (amount >= 0),
    amount_ex_tax           REAL,
    tax_amount              REAL NOT NULL DEFAULT 0,
    amount_inc_tax          REAL,
    entry_date              TEXT NOT NULL,
    reference_number        TEXT,
    memo                    TEXT,
    notes                   TEXT,
    source_system           TEXT,
    source_record_id        TEXT,
    source_report_column    TEXT,
    received_by_user_id     TEXT,
    created_by_user_id      TEXT NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    voided_at               TEXT,
    voided_by_user_id       TEXT,
    void_reason             TEXT,
    FOREIGN KEY (invoice_id)             REFERENCES invoice(id),
    FOREIGN KEY (matter_id)              REFERENCES matter(id),
    FOREIGN KEY (client_id)              REFERENCES client(id),
    FOREIGN KEY (payment_id)             REFERENCES payment(id),
    FOREIGN KEY (bank_deposit_id)        REFERENCES bank_deposit(id),
    FOREIGN KEY (payment_type_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (received_by_user_id)    REFERENCES user(id),
    FOREIGN KEY (created_by_user_id)     REFERENCES user(id),
    FOREIGN KEY (voided_by_user_id)      REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: matter (Clients and Matters)
CREATE TABLE matter (
    id                          TEXT PRIMARY KEY,
    matter_number               TEXT NOT NULL UNIQUE,
    source_system               TEXT,
    source_matter_number        TEXT,
    title                       TEXT NOT NULL,
    description                 TEXT,
    matter_type_label           TEXT,
    jurisdiction_state          TEXT,
    practice_area_lookup_id     TEXT NOT NULL,
    status_lookup_id            TEXT NOT NULL,
    source_status_label         TEXT,
    opened_date                 TEXT,
    instruction_date            TEXT,
    closed_date                 TEXT,
    completed_date              TEXT,
    billing_category            TEXT,
    reporting_group             TEXT,
    other_side_name             TEXT,
    primary_attorney_user_id    TEXT,
    responsible_staff_user_id   TEXT,
    acting_staff_user_id        TEXT,
    assisting_staff_user_id     TEXT,
    originating_attorney_user_id TEXT,
    created_by_user_id          TEXT NOT NULL,
    cover_image_media_id        TEXT,
    import_batch_id             TEXT,
    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT,
    FOREIGN KEY (practice_area_lookup_id)     REFERENCES lookup(id),
    FOREIGN KEY (status_lookup_id)            REFERENCES lookup(id),
    FOREIGN KEY (primary_attorney_user_id)    REFERENCES user(id),
    FOREIGN KEY (responsible_staff_user_id)   REFERENCES user(id),
    FOREIGN KEY (acting_staff_user_id)        REFERENCES user(id),
    FOREIGN KEY (assisting_staff_user_id)     REFERENCES user(id),
    FOREIGN KEY (originating_attorney_user_id) REFERENCES user(id),
    FOREIGN KEY (created_by_user_id)          REFERENCES user(id),
    FOREIGN KEY (cover_image_media_id)        REFERENCES media_asset(id),
    FOREIGN KEY (import_batch_id)             REFERENCES import_batch(id)
);

-- ----------------------------------------------------------------------
-- table: matter_balance_snapshot (Billing, Ledger, Payments, and Trust)
CREATE TABLE matter_balance_snapshot (
    id                              TEXT PRIMARY KEY,
    matter_id                       TEXT,
    matter_number                   TEXT NOT NULL,
    snapshot_date                   TEXT NOT NULL,
    source_system                   TEXT NOT NULL DEFAULT 'LEAP',
    import_batch_id                 TEXT,
    source_row_number               INTEGER,
    matter_type                     TEXT,
    client_name                     TEXT,
    matter_description              TEXT,
    staff_responsible_code          TEXT,
    staff_acting_code               TEXT,
    staff_assisting_code            TEXT,
    originating_attorney_code       TEXT,
    trust_balance                   REAL NOT NULL DEFAULT 0,
    wip_inc_tax                     REAL NOT NULL DEFAULT 0,
    wip_ex_tax                      REAL NOT NULL DEFAULT 0,
    receivables_inc_tax             REAL NOT NULL DEFAULT 0,
    receivables_ex_tax              REAL NOT NULL DEFAULT 0,
    retainer_credits                REAL NOT NULL DEFAULT 0,
    expense_recoveries_inc_tax      REAL NOT NULL DEFAULT 0,
    expense_recoveries_ex_tax       REAL NOT NULL DEFAULT 0,
    expense_journal_inc_tax         REAL NOT NULL DEFAULT 0,
    expense_journal_ex_tax          REAL NOT NULL DEFAULT 0,
    expenses_inc_tax                REAL NOT NULL DEFAULT 0,
    expenses_ex_tax                 REAL NOT NULL DEFAULT 0,
    anticipated_expenses_inc_tax    REAL NOT NULL DEFAULT 0,
    anticipated_expenses_ex_tax     REAL NOT NULL DEFAULT 0,
    staff_responsible_name          TEXT,
    staff_acting_name               TEXT,
    staff_assisting_name            TEXT,
    originating_attorney_name       TEXT,
    receivable_name                 TEXT,
    billing_category                TEXT,
    reporting_group                 TEXT,
    created_at                      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (matter_id)       REFERENCES matter(id),
    FOREIGN KEY (import_batch_id) REFERENCES import_batch(id)
);

-- ----------------------------------------------------------------------
-- table: matter_billing_profile (Billing, Ledger, Payments, and Trust)
CREATE TABLE matter_billing_profile (
    id                         TEXT PRIMARY KEY,
    matter_id                  TEXT NOT NULL UNIQUE,
    billing_client_id          TEXT,
    receivable_client_id       TEXT,
    fee_arrangement            TEXT NOT NULL DEFAULT 'hourly'
                                   CHECK (fee_arrangement IN ('hourly','flat_fee','mixed','internal','pro_bono','other')),
    billing_category           TEXT,
    reporting_group            TEXT,
    default_hourly_rate        REAL CHECK (default_hourly_rate IS NULL OR default_hourly_rate >= 0),
    flat_fee_amount            REAL CHECK (flat_fee_amount IS NULL OR flat_fee_amount >= 0),
    retainer_required          INTEGER NOT NULL DEFAULT 0 CHECK (retainer_required IN (0,1)),
    trust_balance_required     INTEGER NOT NULL DEFAULT 0 CHECK (trust_balance_required IN (0,1)),
    default_invoice_visibility TEXT NOT NULL DEFAULT 'show_billable'
                                   CHECK (default_invoice_visibility IN ('show_billable','show_all_time','hide_flat_fee_time','manual')),
    invoice_delivery_method    TEXT,
    notes                      TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT,
    FOREIGN KEY (matter_id)            REFERENCES matter(id),
    FOREIGN KEY (billing_client_id)    REFERENCES client(id),
    FOREIGN KEY (receivable_client_id) REFERENCES client(id)
);

-- ----------------------------------------------------------------------
-- table: matter_party (Clients and Matters)
CREATE TABLE matter_party (
    id                    TEXT PRIMARY KEY,
    matter_id             TEXT NOT NULL,
    client_id             TEXT,
    individual_id         TEXT,
    entity_id             TEXT,
    party_role_lookup_id  TEXT NOT NULL,
    is_primary_client     INTEGER NOT NULL DEFAULT 0 CHECK (is_primary_client IN (0,1)),
    is_responsible_party  INTEGER NOT NULL DEFAULT 0 CHECK (is_responsible_party IN (0,1)),
    receives_bill         INTEGER NOT NULL DEFAULT 0 CHECK (receives_bill IN (0,1)),
    signs_engagement      INTEGER NOT NULL DEFAULT 0 CHECK (signs_engagement IN (0,1)),
    added_date            TEXT,
    notes                 TEXT,
    CHECK (
        (CASE WHEN client_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN individual_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN entity_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    ),
    FOREIGN KEY (matter_id)            REFERENCES matter(id),
    FOREIGN KEY (client_id)            REFERENCES client(id),
    FOREIGN KEY (individual_id)        REFERENCES individual(id),
    FOREIGN KEY (entity_id)            REFERENCES entity(id),
    FOREIGN KEY (party_role_lookup_id) REFERENCES lookup(id)
);

-- ----------------------------------------------------------------------
-- table: matter_fee_component (Billing, Ledger, Payments, and Trust)
CREATE TABLE matter_fee_component (
    id                  TEXT PRIMARY KEY,
    matter_id           TEXT NOT NULL,
    billing_profile_id  TEXT,
    component_code      TEXT,
    title               TEXT NOT NULL,
    description         TEXT,
    fee_type            TEXT NOT NULL DEFAULT 'flat_fee'
                             CHECK (fee_type IN ('flat_fee','hourly_cap','retainer','expense_allowance','other')),
    amount              REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
    tax_amount          REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount        REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    display_on_invoice  INTEGER NOT NULL DEFAULT 1 CHECK (display_on_invoice IN (0,1)),
    status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','superseded')),
    sort_order          INTEGER NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    FOREIGN KEY (matter_id)          REFERENCES matter(id),
    FOREIGN KEY (billing_profile_id) REFERENCES matter_billing_profile(id)
);

-- ----------------------------------------------------------------------
-- table: matter_access (Matter Participation and Access)
CREATE TABLE matter_access (
    id                   TEXT PRIMARY KEY,
    matter_id            TEXT NOT NULL,
    user_id              TEXT NOT NULL,
    access_level         TEXT NOT NULL DEFAULT 'read_write'
                              CHECK (access_level IN (
                                  'owner','responsible_attorney','assigned_staff',
                                  'billing','read_write','read_only','blocked')),
    access_source        TEXT NOT NULL DEFAULT 'explicit'
                              CHECK (access_source IN ('explicit','matter_assignment','role_default','system')),
    is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    granted_by_user_id   TEXT,
    granted_at           TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_by_user_id   TEXT,
    revoked_at           TEXT,
    notes                TEXT,
    FOREIGN KEY (matter_id)          REFERENCES matter(id),
    FOREIGN KEY (user_id)            REFERENCES user(id),
    FOREIGN KEY (granted_by_user_id) REFERENCES user(id),
    FOREIGN KEY (revoked_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: matter_activity_log (Notes, Communications, Tasks, and Reminders)
CREATE TABLE matter_activity_log (
    id                   TEXT PRIMARY KEY,
    matter_id            TEXT NOT NULL,
    project_identifier   TEXT,
    activity_date        TEXT NOT NULL DEFAULT (date('now')),
    activity_type        TEXT NOT NULL DEFAULT 'note'
                           CHECK (activity_type IN ('note','task_assignment','status_change','billing','document','call','meeting','email','system')),
    subject              TEXT NOT NULL,
    description          TEXT,
    task_id              TEXT,
    task_assignment      TEXT,
    assigned_to_user_id  TEXT,
    performed_by_user_id TEXT NOT NULL,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (matter_id)            REFERENCES matter(id),
    FOREIGN KEY (task_id)              REFERENCES task(id),
    FOREIGN KEY (assigned_to_user_id)  REFERENCES user(id),
    FOREIGN KEY (performed_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: matter_staff_assignment (Matter Participation and Access)
CREATE TABLE matter_staff_assignment (
    id                   TEXT PRIMARY KEY,
    matter_id            TEXT NOT NULL,
    user_id              TEXT,
    assignment_role      TEXT NOT NULL CHECK (assignment_role IN ('primary_attorney','responsible','acting','assisting','originating_attorney','billing','other')),
    staff_code           TEXT,
    staff_name_snapshot  TEXT,
    assigned_date        TEXT,
    ended_date           TEXT,
    is_current           INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
    source_system        TEXT,
    notes                TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (matter_id) REFERENCES matter(id),
    FOREIGN KEY (user_id)   REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: matter_stage_history (Clients and Matters)
CREATE TABLE matter_stage_history (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL,
  previous_status_lookup_id TEXT,
  next_status_lookup_id TEXT,
  previous_status_label TEXT,
  next_status_label TEXT NOT NULL,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  note TEXT,
  FOREIGN KEY (matter_id) REFERENCES matter(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_status_lookup_id) REFERENCES lookup(id) ON DELETE SET NULL,
  FOREIGN KEY (next_status_lookup_id) REFERENCES lookup(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: media_asset (Documents, Media, and Templates)
CREATE TABLE media_asset (
    id                   TEXT PRIMARY KEY,
    r2_bucket            TEXT NOT NULL DEFAULT 'krfirm-app-private',
    r2_key               TEXT NOT NULL UNIQUE,
    owner_type           TEXT NOT NULL CHECK (owner_type IN ('client','individual','user','matter','employee','entity','asset','system','temp')),
    owner_id             TEXT,
    purpose              TEXT NOT NULL CHECK (purpose IN (
                              'profile_image','card_image','matter_cover_image',
                              'document_original','document_version','employee_file',
                              'certification_document','review_document','temp_upload',
                              'system_export','thumbnail','preview','other')),
    content_type         TEXT NOT NULL,
    byte_size            INTEGER NOT NULL CHECK (byte_size >= 0),
    original_filename    TEXT,
    file_ext             TEXT,
    sha256               TEXT,
    width                INTEGER,
    height               INTEGER,
    visibility           TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
    status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','replaced','deleted','quarantined')),
    uploaded_by_user_id  TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    deleted_at           TEXT,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: media_variant (Documents, Media, and Templates)
CREATE TABLE media_variant (
    id              TEXT PRIMARY KEY,
    media_asset_id  TEXT NOT NULL,
    variant_name    TEXT NOT NULL,
    r2_bucket       TEXT NOT NULL DEFAULT 'krfirm-app-private',
    r2_key          TEXT NOT NULL UNIQUE,
    content_type    TEXT NOT NULL,
    byte_size       INTEGER NOT NULL CHECK (byte_size >= 0),
    width           INTEGER,
    height          INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (media_asset_id) REFERENCES media_asset(id),
    UNIQUE (media_asset_id, variant_name)
);

-- ----------------------------------------------------------------------
-- table: user (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE user (
    id                      TEXT PRIMARY KEY,
    individual_id           TEXT,
    email                   TEXT NOT NULL UNIQUE,
    password_hash           TEXT NOT NULL,
    role                    TEXT NOT NULL DEFAULT 'staff'
                                CHECK (role IN (
                                    'super_admin','attorney','paralegal','staff',
                                    'billing','client','external_cpa')),
    profile_image_media_id  TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    last_login              TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT, role_set_id TEXT NOT NULL DEFAULT 'role_staff', account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','pending','deactivated')),
    FOREIGN KEY (individual_id)          REFERENCES individual(id),
    FOREIGN KEY (profile_image_media_id) REFERENCES media_asset(id)
);

-- ----------------------------------------------------------------------
-- table: pay_period (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE pay_period (
    id                    TEXT PRIMARY KEY,
    period_start          TEXT NOT NULL,
    period_end            TEXT NOT NULL,
    pay_date              TEXT,
    status                TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','submitted','processing','closed','paid','void')),
    payroll_batch_ref     TEXT,
    processed_by_user_id  TEXT,
    processed_at          TEXT,
    notes                 TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    UNIQUE (period_start, period_end),
    FOREIGN KEY (processed_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: payment (Billing, Ledger, Payments, and Trust)
CREATE TABLE payment (
    id                      TEXT PRIMARY KEY,
    payment_number          TEXT UNIQUE,
    source_receipt_number   TEXT,
    matter_id               TEXT,
    client_id               TEXT,
    received_date           TEXT NOT NULL,
    payment_type_lookup_id  TEXT,
    amount                  REAL NOT NULL CHECK (amount >= 0),
    unapplied_amount        REAL NOT NULL DEFAULT 0 CHECK (unapplied_amount >= 0),
    bank_account_id         TEXT,
    reference_number        TEXT,
    memo                    TEXT,
    source_system           TEXT,
    source_record_id        TEXT,
    import_batch_id         TEXT,
    received_by_user_id     TEXT,
    created_by_user_id      TEXT NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT,
    voided_at               TEXT,
    voided_by_user_id       TEXT,
    void_reason             TEXT, refund_provider_id TEXT, refund_status TEXT, refund_amount REAL, refund_reference TEXT, refund_reference_type TEXT, refund_reference_status TEXT, refunded_at TEXT,
    FOREIGN KEY (matter_id)              REFERENCES matter(id),
    FOREIGN KEY (client_id)              REFERENCES client(id),
    FOREIGN KEY (payment_type_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (bank_account_id)        REFERENCES firm_bank_account(id),
    FOREIGN KEY (import_batch_id)        REFERENCES import_batch(id),
    FOREIGN KEY (received_by_user_id)    REFERENCES user(id),
    FOREIGN KEY (created_by_user_id)     REFERENCES user(id),
    FOREIGN KEY (voided_by_user_id)      REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: payment_provider (Billing, Ledger, Payments, and Trust)
CREATE TABLE payment_provider (
    id                              TEXT PRIMARY KEY,
    ppid                            INTEGER NOT NULL DEFAULT 1 CHECK (ppid > 0),
    provider                        TEXT NOT NULL CHECK (provider IN ('stripe')),
    environment                     TEXT NOT NULL CHECK (environment IN ('live', 'sandbox')),
    display_name                    TEXT,
    is_enabled                      INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
    account_id                      TEXT CHECK (account_id IS NULL OR account_id GLOB 'acct_*'),
    account_email                   TEXT,
    publishable_key                 TEXT CHECK (publishable_key IS NULL OR publishable_key GLOB 'pk_*'),
    secret_key_name                 TEXT,
    secret_key_prefix               TEXT,
    secret_key_hash                 TEXT CHECK (secret_key_hash IS NULL OR length(secret_key_hash) = 64),
    secret_key_ciphertext           TEXT CHECK (secret_key_ciphertext IS NULL OR secret_key_ciphertext GLOB 'v1:*'),
    secret_key_set_at               TEXT,
    secret_key_set_by_user_id       TEXT,
    webhook_secret_name             TEXT,
    webhook_secret_hash             TEXT CHECK (webhook_secret_hash IS NULL OR length(webhook_secret_hash) = 64),
    webhook_secret_ciphertext       TEXT CHECK (webhook_secret_ciphertext IS NULL OR webhook_secret_ciphertext GLOB 'v1:*'),
    webhook_secret_set_at           TEXT,
    webhook_secret_set_by_user_id   TEXT,
    api_version                     TEXT,
    default_currency                TEXT NOT NULL DEFAULT 'usd',
    last_verified_at                TEXT,
    last_verified_status            TEXT,
    notes                           TEXT,
    created_by_user_id              TEXT,
    updated_by_user_id              TEXT,
    created_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at                      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (ppid),
    FOREIGN KEY (secret_key_set_by_user_id)     REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (webhook_secret_set_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id)            REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by_user_id)            REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: public_content (Public Content Publishing)
CREATE TABLE public_content (
    id                         TEXT PRIMARY KEY,
    content_type               TEXT NOT NULL CHECK (content_type IN ('article', 'answer')),
    title                      TEXT NOT NULL,
    slug                       TEXT NOT NULL,
    topic_slug                 TEXT,
    canonical_path             TEXT NOT NULL UNIQUE,
    status                     TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'archived')),
    summary                    TEXT NOT NULL,
    thumbnail_r2_key           TEXT,
    thumbnail_public_url       TEXT,
    thumbnail_alt              TEXT NOT NULL DEFAULT '',
    body_format                TEXT NOT NULL DEFAULT 'sanitized_html' CHECK (body_format = 'sanitized_html'),
    sanitized_html             TEXT NOT NULL,
    source_upload_r2_key       TEXT,
    sanitized_snapshot_r2_key  TEXT,
    asset_manifest_json        TEXT,
    seo_title                  TEXT,
    seo_description            TEXT,
    author_id                  TEXT,
    author_display_name        TEXT,
    category                   TEXT,
    category_label             TEXT,
    pillar                     TEXT,
    reading_time_minutes       INTEGER CHECK (reading_time_minutes IS NULL OR reading_time_minutes >= 0),
    published_at               TEXT,
    unpublished_at             TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                 TEXT,
    archived_at                TEXT,
    created_by_user_id         TEXT,
    updated_by_user_id         TEXT,
    last_publication_r2_key    TEXT, display_sequence INTEGER, display_code TEXT,
    CHECK (content_type = 'article' OR pillar IS NOT NULL),
    CHECK (content_type = 'article' OR topic_slug IS NOT NULL),
    CHECK (content_type = 'answer' OR category IS NOT NULL),
    CHECK (content_type = 'answer' OR canonical_path LIKE '/articles/%'),
    CHECK (content_type = 'article' OR canonical_path LIKE '/answers/%'),
    FOREIGN KEY (author_id) REFERENCES content_author(id),
    FOREIGN KEY (created_by_user_id) REFERENCES user(id),
    FOREIGN KEY (updated_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: reminder (Notes, Communications, Tasks, and Reminders)
CREATE TABLE reminder (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('task','event','matter','client','communication','note','custom')),
  owner_id TEXT NOT NULL,
  user_id TEXT,
  remind_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'in_app' CHECK (method IN ('in_app','email','sms','phone','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed','snoozed','cancelled','failed')),
  snoozed_until TEXT,
  sent_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: requested_document (Documents, Media, and Templates)
CREATE TABLE requested_document (
    id                       TEXT PRIMARY KEY,
    matter_id                TEXT NOT NULL,
    client_id                TEXT,
    requested_from_client_id TEXT,
    document_category_lookup_id TEXT,
    title                    TEXT NOT NULL,
    description              TEXT,
    status                   TEXT NOT NULL DEFAULT 'requested'
                                 CHECK (status IN ('requested','received','waived','not_applicable','overdue')),
    requested_date           TEXT NOT NULL DEFAULT (date('now')),
    due_date                 TEXT,
    received_date            TEXT,
    document_record_id       TEXT,
    received_media_asset_id  TEXT,
    notes                    TEXT,
    created_by_user_id       TEXT NOT NULL,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT,
    FOREIGN KEY (matter_id)                   REFERENCES matter(id),
    FOREIGN KEY (client_id)                   REFERENCES client(id),
    FOREIGN KEY (requested_from_client_id)    REFERENCES client(id),
    FOREIGN KEY (document_category_lookup_id) REFERENCES lookup(id),
    FOREIGN KEY (document_record_id)          REFERENCES document_record(id),
    FOREIGN KEY (received_media_asset_id)     REFERENCES media_asset(id),
    FOREIGN KEY (created_by_user_id)          REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: risk_flag (Estate Planning, Assets, and Funding)
CREATE TABLE risk_flag (
    id                   TEXT PRIMARY KEY,
    asset_id             TEXT NOT NULL,
    flag_code            TEXT NOT NULL,
    flagged_by_user_id   TEXT NOT NULL,
    flagged_at           TEXT NOT NULL DEFAULT (datetime('now')),
    resolved             INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
    resolved_at          TEXT,
    notes                TEXT,
    FOREIGN KEY (asset_id)           REFERENCES asset(id),
    FOREIGN KEY (flagged_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: team (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE team (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: time_entry (Time and Expenses)
CREATE TABLE time_entry (
    id                       TEXT PRIMARY KEY,
    matter_id                TEXT NOT NULL,
    user_id                  TEXT NOT NULL,
    employee_id              TEXT,
    activity_code_id         TEXT,
    activity_code            TEXT,
    activity_description     TEXT,
    entry_date               TEXT NOT NULL,
    hours                    REAL NOT NULL CHECK (hours >= 0),
    rate                     REAL NOT NULL DEFAULT 0 CHECK (rate >= 0),
    amount_ex_tax            REAL NOT NULL DEFAULT 0,
    tax_amount               REAL NOT NULL DEFAULT 0,
    amount_inc_tax           REAL NOT NULL DEFAULT 0,
    billing_mode             TEXT NOT NULL DEFAULT 'hourly_billable'
                                  CHECK (billing_mode IN ('hourly_billable','flat_fee_tracked','flat_fee_billable','non_billable','no_charge','pro_bono','internal')),
    billing_status           TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (billing_status IN ('draft','billable','billed','not_billable','written_off','held')),
    fee_arrangement          TEXT NOT NULL DEFAULT 'hourly'
                                  CHECK (fee_arrangement IN ('hourly','flat_fee','mixed','internal','pro_bono','other')),
    display_on_invoice       INTEGER NOT NULL DEFAULT 1 CHECK (display_on_invoice IN (0,1)),
    included_in_flat_fee     INTEGER NOT NULL DEFAULT 0 CHECK (included_in_flat_fee IN (0,1)),
    flat_fee_component_id    TEXT,
    description              TEXT NOT NULL,
    is_billed                INTEGER NOT NULL DEFAULT 0 CHECK (is_billed IN (0,1)),
    invoice_id               TEXT,
    source_system            TEXT,
    source_record_id         TEXT,
    import_batch_id          TEXT,
    source_row_number        INTEGER,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT, bcid TEXT
    CHECK (bcid IS NULL OR (length(bcid) = 7 AND bcid NOT GLOB '*[^A-Z0-9]*')),
    FOREIGN KEY (matter_id)             REFERENCES matter(id),
    FOREIGN KEY (user_id)               REFERENCES user(id),
    FOREIGN KEY (employee_id)           REFERENCES employee(id),
    FOREIGN KEY (activity_code_id)      REFERENCES billing_activity_code(id),
    FOREIGN KEY (flat_fee_component_id) REFERENCES matter_fee_component(id),
    FOREIGN KEY (invoice_id)            REFERENCES invoice(id),
    FOREIGN KEY (import_batch_id)       REFERENCES import_batch(id)
);

-- ----------------------------------------------------------------------
-- table: timer_session (Time and Expenses)
CREATE TABLE timer_session (
  id TEXT PRIMARY KEY,
  matter_id TEXT,
  user_id TEXT NOT NULL,
  activity_code_id TEXT,
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_seconds >= 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','stopped','converted','discarded')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (matter_id) REFERENCES matter(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_code_id) REFERENCES billing_activity_code(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: trust_request (Billing, Ledger, Payments, and Trust)
CREATE TABLE trust_request (
  id TEXT PRIMARY KEY,
  matter_id TEXT NOT NULL,
  client_id TEXT,
  request_number TEXT NOT NULL,
  requested_amount REAL NOT NULL CHECK (requested_amount >= 0),
  request_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partially_paid','paid','cancelled','void')),
  memo TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (matter_id) REFERENCES matter(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: user_invite (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE user_invite (
    id                  TEXT PRIMARY KEY,
    email               TEXT NOT NULL,
    role                TEXT NOT NULL CHECK (role IN (
                            'super_admin','attorney','paralegal','staff',
                            'billing','client','external_cpa')),
    invited_user_id     TEXT,
    invited_by_user_id  TEXT,
    invite_token_hash   TEXT NOT NULL UNIQUE,
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','revoked','expired')),
    expires_at          TEXT NOT NULL,
    sent_at             TEXT,
    accepted_at         TEXT,
    accepted_user_id    TEXT,
    email_provider      TEXT,
    email_provider_message_id TEXT,
    resend_message_id   TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    notes               TEXT, worker_classification TEXT NOT NULL DEFAULT 'employee' CHECK (worker_classification IN ('employee','vendor','unspecified')),
    FOREIGN KEY (invited_user_id)    REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (invited_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (accepted_user_id)   REFERENCES user(id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: user_permission_override (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE user_permission_override (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    permission_key      TEXT NOT NULL,
    permission_action   TEXT NOT NULL CHECK (permission_action IN ('create','read','update','delete','approve','send')),
    override_effect     TEXT NOT NULL CHECK (override_effect IN ('allow','deny')),
    reason              TEXT,
    expires_at          TEXT,
    created_by_user_id  TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT,
    revoked_at          TEXT,
    revoked_by_user_id  TEXT,
    revoke_reason       TEXT,
    FOREIGN KEY (user_id)            REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
    UNIQUE (user_id, permission_key, permission_action)
);

-- ----------------------------------------------------------------------
-- table: user_role_set (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE user_role_set (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL,
    role_set_id           TEXT NOT NULL,
    is_primary            INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
    is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    assigned_by_user_id   TEXT,
    assigned_at           TEXT NOT NULL DEFAULT (datetime('now')),
    starts_at             TEXT,
    expires_at            TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT,
    FOREIGN KEY (user_id)             REFERENCES user(id) ON DELETE CASCADE,
    FOREIGN KEY (role_set_id)         REFERENCES role_set(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
    UNIQUE (user_id, role_set_id)
);

-- ----------------------------------------------------------------------
-- table: user_sso_identity (Users, Roles, Permissions, Sessions, and Audit)
CREATE TABLE user_sso_identity (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    provider          TEXT NOT NULL CHECK (provider IN ('google','microsoft','apple','saml','sso')),
    provider_subject  TEXT NOT NULL,
    email             TEXT NOT NULL,
    email_verified    INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0,1)),
    display_name      TEXT,
    given_name        TEXT,
    family_name       TEXT,
    avatar_url        TEXT,
    hosted_domain     TEXT,
    last_login_at     TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT,
    FOREIGN KEY (user_id) REFERENCES user(id),
    UNIQUE (provider, provider_subject),
    UNIQUE (provider, email)
);

-- ----------------------------------------------------------------------
-- table: workstream_activity (Notes, Communications, Tasks, and Reminders)
CREATE TABLE "workstream_activity" (
    id                   TEXT NOT NULL PRIMARY KEY,
    wsid                 TEXT NOT NULL UNIQUE
                           CHECK (length(wsid) = 7 AND wsid NOT GLOB '*[^A-Z0-9]*'),
    client_id            TEXT,
    lead_id              TEXT,
    matter_id            TEXT,
    subgroup             TEXT NOT NULL
                           CHECK (subgroup IN ('PhoneCalls','Emails','Notes','Tasks','ReceivedFiles','SentFiles','WIP')),
    activity_at          TEXT NOT NULL DEFAULT (datetime('now')),
    subject              TEXT NOT NULL,
    note_body            TEXT,
    note_format          TEXT NOT NULL DEFAULT 'html'
                           CHECK (note_format IN ('plain','markdown','html')),
    next_steps_json      TEXT,
    document_record_id   TEXT,
    document_url         TEXT,
    document_label       TEXT,
    task_id              TEXT,
    assignee_user_id     TEXT,
    assignee_contact_id  TEXT,
    assignee_label       TEXT,
    visibility           TEXT NOT NULL DEFAULT 'internal'
                           CHECK (visibility = 'internal'),
    performed_by_user_id TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT,
    FOREIGN KEY (client_id)            REFERENCES client(id),
    FOREIGN KEY (lead_id)              REFERENCES lead(id),
    FOREIGN KEY (matter_id)            REFERENCES matter(id),
    FOREIGN KEY (document_record_id)   REFERENCES document_record(id),
    FOREIGN KEY (assignee_user_id)     REFERENCES user(id),
    FOREIGN KEY (performed_by_user_id) REFERENCES user(id),
    CHECK ((client_id IS NOT NULL AND lead_id IS NULL) OR (client_id IS NULL AND lead_id IS NOT NULL))
);

-- ----------------------------------------------------------------------
-- table: payment_application (Billing, Ledger, Payments, and Trust)
CREATE TABLE payment_application (
    id                TEXT PRIMARY KEY,
    payment_id        TEXT NOT NULL,
    invoice_id        TEXT,
    matter_id         TEXT NOT NULL,
    ledger_entry_id   TEXT,
    amount            REAL NOT NULL CHECK (amount >= 0),
    applied_date      TEXT NOT NULL,
    notes             TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT,
    FOREIGN KEY (payment_id)         REFERENCES payment(id),
    FOREIGN KEY (invoice_id)         REFERENCES invoice(id),
    FOREIGN KEY (matter_id)          REFERENCES matter(id),
    FOREIGN KEY (ledger_entry_id)    REFERENCES ledger_entry(id),
    FOREIGN KEY (created_by_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: payment_request (Billing, Ledger, Payments, and Trust)
CREATE TABLE payment_request (
    id                          TEXT PRIMARY KEY,
    prid                        TEXT NOT NULL UNIQUE CHECK (length(prid) = 7),
    invoice_id                  TEXT NOT NULL,
    invoice_ivid                TEXT NOT NULL,
    invoice_number              TEXT NOT NULL,
    client_id                   TEXT NOT NULL,
    client_number               TEXT NOT NULL,
    environment                 TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
    token_hash                  TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    token_hint                  TEXT NOT NULL,
    status                      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'posted', 'expired', 'revoked')),
    expires_at                  TEXT NOT NULL,
    sent_document_number        TEXT,
    first_viewed_at             TEXT,
    last_viewed_at              TEXT,
    view_count                  INTEGER NOT NULL DEFAULT 0,
    intent_created_at           TEXT,
    intent_attempts             INTEGER NOT NULL DEFAULT 0,
    stripe_payment_intent_id    TEXT UNIQUE,
    stripe_event_id             TEXT,
    payer_email                 TEXT,
    paid_amount                 REAL,
    paid_at                     TEXT,
    payment_id                  TEXT UNIQUE,
    payment_number              TEXT,
    posted_at                   TEXT,
    post_error                  TEXT,
    revoked_at                  TEXT,
    revoked_by_user_id          TEXT,
    revoke_reason               TEXT,
    created_by_user_id          TEXT,
    created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), link_source TEXT NOT NULL DEFAULT 'email' CHECK (link_source IN ('email', 'print')),
    FOREIGN KEY (invoice_id)         REFERENCES invoice(id) ON DELETE RESTRICT,
    FOREIGN KEY (client_id)          REFERENCES client(id)  ON DELETE RESTRICT,
    FOREIGN KEY (payment_id)         REFERENCES payment(id) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by_user_id) REFERENCES user(id)    ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES user(id)    ON DELETE SET NULL
);

-- ----------------------------------------------------------------------
-- table: publication_event (Public Content Publishing)
CREATE TABLE publication_event (
    id                         TEXT PRIMARY KEY,
    content_type               TEXT NOT NULL CHECK (content_type IN ('article', 'answer')),
    content_id                 TEXT NOT NULL,
    event_type                 TEXT NOT NULL CHECK (event_type IN ('save', 'publish', 'unpublish', 'archive', 'deleteArchived')),
    event_at                   TEXT NOT NULL,
    actor_user_id              TEXT,
    actor_role                 TEXT,
    status_after               TEXT NOT NULL CHECK (status_after IN ('draft', 'review', 'published', 'archived')),
    past_publication_r2_key    TEXT,
    snapshot_json              TEXT,
    created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (content_id) REFERENCES public_content(id) ON DELETE CASCADE,
    FOREIGN KEY (actor_user_id) REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: task (Notes, Communications, Tasks, and Reminders)
CREATE TABLE task (
    id                       TEXT PRIMARY KEY,
    matter_id                TEXT,
    client_id                TEXT,
    project_identifier       TEXT,
    title                    TEXT NOT NULL,
    description              TEXT,
    type_label               TEXT,
    status                   TEXT NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open','in_progress','waiting','completed','cancelled')),
    priority                 TEXT NOT NULL DEFAULT 'normal'
                               CHECK (priority IN ('low','normal','high','urgent')),
    assigned_to_user_id      TEXT,
    assigned_by_user_id      TEXT,
    lead_user_id             TEXT,
    workstream_activity_wsid TEXT,
    billing_value            REAL CHECK (billing_value IS NULL OR billing_value >= 0),
    billing_status           TEXT NOT NULL DEFAULT 'not_ready'
                               CHECK (billing_status IN ('not_ready','ready','converted','not_billable')),
    billing_description      TEXT,
    due_date                 TEXT,
    completed_at             TEXT,
    created_by_user_id       TEXT NOT NULL,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT,
    FOREIGN KEY (matter_id)                 REFERENCES matter(id),
    FOREIGN KEY (client_id)                 REFERENCES client(id),
    FOREIGN KEY (assigned_to_user_id)       REFERENCES user(id),
    FOREIGN KEY (assigned_by_user_id)       REFERENCES user(id),
    FOREIGN KEY (lead_user_id)              REFERENCES user(id),
    FOREIGN KEY (workstream_activity_wsid)  REFERENCES workstream_activity(wsid),
    FOREIGN KEY (created_by_user_id)        REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: team_lead (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE team_lead (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE (team_id, user_id, starts_at)
);

-- ----------------------------------------------------------------------
-- table: team_member (Employees, Timekeeping, Payroll, and Teams)
CREATE TABLE team_member (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  FOREIGN KEY (team_id) REFERENCES team(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employee(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES user(id) ON DELETE SET NULL,
  UNIQUE (team_id, employee_id, starts_at)
);

-- ----------------------------------------------------------------------
-- table: workstream_activity_comment (Notes, Communications, Tasks, and Reminders)
CREATE TABLE workstream_activity_comment (
    id                     TEXT PRIMARY KEY,
    workstream_activity_id TEXT NOT NULL,
    user_id                TEXT NOT NULL,
    note_body              TEXT NOT NULL,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at             TEXT,
    FOREIGN KEY (workstream_activity_id) REFERENCES workstream_activity(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)                REFERENCES user(id)
);

-- ----------------------------------------------------------------------
-- table: task_assignee (Notes, Communications, Tasks, and Reminders)
CREATE TABLE task_assignee (
    id                  TEXT PRIMARY KEY,
    task_id             TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    assignment_role     TEXT NOT NULL DEFAULT 'assignee'
                          CHECK (assignment_role IN ('assignee','collaborator')),
    assigned_by_user_id TEXT,
    assigned_at         TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at            TEXT,
    is_current          INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0,1)),
    FOREIGN KEY (task_id)             REFERENCES task(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)             REFERENCES user(id),
    FOREIGN KEY (assigned_by_user_id) REFERENCES user(id),
    UNIQUE (task_id, user_id, assignment_role, is_current)
);

-- ======================================================================
-- INDEXES
CREATE INDEX idx_action_review_funding_action ON action_review_stamp(funding_action_id);
CREATE INDEX idx_address_city_state ON address(city, state);
CREATE INDEX idx_address_postal_code ON address(postal_code);
CREATE INDEX idx_address_source ON address(source_system, address_quality);
CREATE INDEX idx_asset_category ON asset(asset_category);
CREATE INDEX idx_asset_matter ON asset(matter_id);
CREATE INDEX idx_asset_planning_status ON asset(planning_status);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_matter ON audit_log(matter_id);
CREATE INDEX idx_audit_request_id ON audit_log(request_id);
CREATE INDEX idx_audit_resource_action ON audit_log(resource, action);
CREATE INDEX idx_audit_success ON audit_log(success, created_at);
CREATE INDEX idx_audit_target ON audit_log(target_table, target_id);
CREATE INDEX idx_bank_deposit_account ON bank_deposit(bank_account_id);
CREATE INDEX idx_bank_deposit_date ON bank_deposit(deposit_date, status);
CREATE INDEX idx_bank_deposit_item_deposit ON bank_deposit_item(bank_deposit_id);
CREATE INDEX idx_bank_deposit_item_matter ON bank_deposit_item(matter_id);
CREATE INDEX idx_bank_deposit_item_payment ON bank_deposit_item(payment_id);
CREATE INDEX idx_beneficiary_asset ON beneficiary_designation(asset_id);
CREATE INDEX idx_billing_activity_active ON billing_activity_code(is_active, jurisdiction_state);
CREATE INDEX idx_client_card_image ON client(card_image_media_id);
CREATE INDEX idx_client_entity ON client(entity_id);
CREATE INDEX idx_client_individual ON client(individual_id);
CREATE INDEX idx_client_short_name ON client(short_name);
CREATE INDEX idx_client_source ON client(source_system, source_client_number);
CREATE INDEX idx_client_status ON client(status);
CREATE INDEX idx_client_type ON client(client_type);
CREATE INDEX idx_client_lead_profile_assignee ON client_lead_profile(assigned_to_user_id, lead_status);
CREATE INDEX idx_client_lead_profile_individual ON client_lead_profile(individual_id);
CREATE INDEX idx_client_lead_profile_stage ON client_lead_profile(pipeline_stage_id, lead_status);
CREATE INDEX idx_client_member_client ON client_member(client_id, is_primary);
CREATE INDEX idx_client_member_entity ON client_member(entity_id);
CREATE INDEX idx_client_member_individual ON client_member(individual_id);
CREATE INDEX idx_communication_attachment_comm ON communication_attachment(communication_id);
CREATE INDEX idx_communication_client ON communication_log(client_id, occurred_at);
CREATE INDEX idx_communication_matter ON communication_log(matter_id, occurred_at);
CREATE INDEX idx_communication_owner ON communication_log(owner_type, owner_id, occurred_at);
CREATE INDEX idx_communication_source ON communication_log(source_system, source_record_id);
CREATE INDEX idx_communication_participant_comm ON communication_participant(communication_id, participant_role);
CREATE INDEX idx_communication_participant_person ON communication_participant(individual_id, entity_id, user_id);
CREATE INDEX idx_compliance_due_date ON compliance_filing(due_date);
CREATE INDEX idx_compliance_entity ON compliance_filing(entity_id);
CREATE INDEX idx_compliance_status ON compliance_filing(status);
CREATE INDEX idx_conflict_checked_by ON conflict_check(checked_by_user_id);
CREATE INDEX idx_conflict_matter ON conflict_check(matter_id);
CREATE INDEX idx_conflict_party_check ON conflict_check_party(conflict_check_id, party_role);
CREATE INDEX idx_conflict_party_name ON conflict_check_party(party_name);
CREATE INDEX idx_conflict_result_check ON conflict_check_result(conflict_check_id, disposition);
CREATE INDEX idx_conflict_result_match ON conflict_check_result(matched_owner_type, matched_owner_id);
CREATE INDEX idx_contact_resolution_source ON contact_resolution(source_kind, source_contact_id);
CREATE INDEX idx_contact_resolution_source_client ON contact_resolution(source_client_id);
CREATE INDEX idx_contact_resolution_target ON contact_resolution(target_kind, target_contact_id);
CREATE INDEX idx_content_asset_content
    ON content_asset(content_id, usage);
CREATE INDEX idx_content_asset_public_url
    ON content_asset(public_url);
CREATE INDEX idx_content_revision_content
    ON content_revision(content_id, revision_number DESC);
CREATE INDEX idx_custom_field_definition_set ON custom_field_definition(set_id, is_active, sort_order);
CREATE INDEX idx_custom_field_set_owner ON custom_field_set(owner_type, is_active, sort_order);
CREATE INDEX idx_custom_field_value_definition ON custom_field_value(definition_id);
CREATE INDEX idx_custom_field_value_owner ON custom_field_value(owner_type, owner_id);
CREATE INDEX idx_document_client ON document_record(client_id);
CREATE INDEX idx_document_employee ON document_record(employee_id);
CREATE INDEX idx_document_entity ON document_record(entity_id);
CREATE INDEX idx_document_external_provider ON document_record(external_provider);
CREATE INDEX idx_document_individual ON document_record(individual_id);
CREATE INDEX idx_document_matter ON document_record(matter_id);
CREATE INDEX idx_document_media ON document_record(primary_media_asset_id);
CREATE INDEX idx_document_owner ON document_record(owner_type, owner_id);
CREATE INDEX idx_document_storage_type ON document_record(storage_type);
CREATE INDEX idx_document_template_category ON document_template(category, is_active);
CREATE INDEX idx_employee_next_review ON employee(next_review_date);
CREATE INDEX idx_employee_show_staff ON employee(show_in_staff_list);
CREATE INDEX idx_employee_staff_code ON employee(staff_code);
CREATE INDEX idx_employee_status ON employee(employment_status);
CREATE INDEX idx_employee_user ON employee(user_id);
CREATE INDEX idx_employee_cert_employee ON employee_certification(employee_id);
CREATE INDEX idx_employee_cert_expiration ON employee_certification(expiration_date);
CREATE INDEX idx_employee_pay_rate_effective ON employee_pay_rate(employee_id, effective_date);
CREATE INDEX idx_employee_pay_rate_employee ON employee_pay_rate(employee_id);
CREATE INDEX idx_employee_pto_employee ON employee_pto_ledger(employee_id, ledger_date);
CREATE INDEX idx_employee_pto_event ON employee_pto_ledger(employee_time_event_id);
CREATE INDEX idx_employee_review_date ON employee_review_event(review_date);
CREATE INDEX idx_employee_review_employee ON employee_review_event(employee_id);
CREATE INDEX idx_employee_time_card_employee ON employee_time_card(employee_id, status);
CREATE INDEX idx_employee_time_card_period ON employee_time_card(pay_period_id, status);
CREATE INDEX idx_employee_time_employee ON employee_time_event(employee_id);
CREATE INDEX idx_employee_time_pay_period ON employee_time_event(pay_period_id, employee_id);
CREATE INDEX idx_employee_time_pto ON employee_time_event(employee_id, is_pto_accrual_eligible, work_date);
CREATE INDEX idx_employee_time_status ON employee_time_event(status);
CREATE INDEX idx_employee_time_work_date ON employee_time_event(work_date);
CREATE INDEX idx_employee_time_punch_card ON employee_time_punch(time_card_id, occurred_at);
CREATE INDEX idx_employee_time_punch_employee ON employee_time_punch(employee_id, occurred_at);
CREATE INDEX idx_employee_time_punch_local_date ON employee_time_punch(local_date, employee_id);
CREATE UNIQUE INDEX uq_employee_time_punch_idempotency
  ON employee_time_punch(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_entity_boi_status ON entity(boi_status);
CREATE UNIQUE INDEX idx_entity_ecid ON entity(ecid) WHERE ecid IS NOT NULL;
CREATE INDEX idx_entity_legal_name ON entity(legal_name);
CREATE INDEX idx_entity_status ON entity(entity_status);
CREATE INDEX idx_entity_address_address ON entity_address(address_id);
CREATE INDEX idx_entity_address_current ON entity_address(entity_id, valid_to, is_primary);
CREATE INDEX idx_entity_address_entity ON entity_address(entity_id);
CREATE INDEX idx_entity_contact_entity ON entity_contact(entity_id);
CREATE INDEX idx_entity_contact_individual ON entity_contact(individual_id);
CREATE INDEX idx_entity_contact_method_current ON entity_contact_method(entity_id, valid_to, is_primary);
CREATE INDEX idx_entity_contact_method_entity ON entity_contact_method(entity_id);
CREATE INDEX idx_entity_contact_method_value ON entity_contact_method(contact_type, value);
CREATE INDEX idx_entity_dba_entity ON entity_dba(entity_id);
CREATE INDEX idx_entity_event_due_date ON entity_event(due_date);
CREATE INDEX idx_entity_event_entity ON entity_event(entity_id);
CREATE INDEX idx_entity_registration_entity ON entity_registration(entity_id);
CREATE INDEX idx_entity_registration_expiration ON entity_registration(expiration_date);
CREATE INDEX idx_event_due_date ON event(due_date);
CREATE INDEX idx_event_matter ON event(matter_id);
CREATE INDEX idx_event_user ON event(user_id);
CREATE INDEX idx_event_participant_event ON event_participant(event_id, status);
CREATE INDEX idx_event_participant_user ON event_participant(user_id, status);
CREATE INDEX idx_expense_entry_billing ON expense_entry(billing_status, expense_date);
CREATE INDEX idx_expense_entry_matter ON expense_entry(matter_id, expense_date);
CREATE UNIQUE INDEX idx_external_integration_provider_account ON external_integration_account(provider, external_account_id);
CREATE INDEX idx_external_source_batch ON external_source_map(import_batch_id, mapping_status);
CREATE INDEX idx_external_source_source ON external_source_map(source_system, source_table, source_record_id);
CREATE INDEX idx_external_source_target ON external_source_map(target_table, target_id);
CREATE INDEX idx_external_sync_state_resource ON external_sync_state(resource_type, last_success_at);
CREATE UNIQUE INDEX idx_external_webhook_provider_event ON external_webhook_event(provider, external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX idx_external_webhook_status ON external_webhook_event(processing_status, received_at);
CREATE INDEX idx_firm_bank_account_type ON firm_bank_account(account_type, is_active);
CREATE INDEX idx_firm_holiday_policy ON firm_holiday(policy_id, is_active, sort_order);
CREATE INDEX idx_funding_action_asset ON funding_action(asset_id);
CREATE INDEX idx_funding_action_matter ON funding_action(matter_id);
CREATE INDEX idx_funding_action_status ON funding_action(status);
CREATE INDEX idx_hr_policy_type ON hr_policy(policy_type, status);
CREATE INDEX idx_hr_policy_rule_policy ON hr_policy_rule(policy_id, rule_type, sort_order);
CREATE INDEX idx_import_batch_source ON import_batch(source_system, source_file_name);
CREATE INDEX idx_import_batch_status ON import_batch(status, imported_at);
CREATE UNIQUE INDEX idx_individual_icid ON individual(icid) WHERE icid IS NOT NULL;
CREATE INDEX idx_individual_name ON individual(last_name, first_name);
CREATE INDEX idx_individual_address_address ON individual_address(address_id);
CREATE INDEX idx_individual_address_current ON individual_address(individual_id, valid_to, is_primary);
CREATE INDEX idx_individual_address_individual ON individual_address(individual_id);
CREATE INDEX idx_individual_contact_current ON individual_contact_method(individual_id, valid_to, is_primary);
CREATE INDEX idx_individual_contact_individual ON individual_contact_method(individual_id);
CREATE INDEX idx_individual_contact_value ON individual_contact_method(contact_type, value);
CREATE INDEX idx_individual_relationship_a ON individual_relationship(individual_a_id);
CREATE INDEX idx_individual_relationship_b ON individual_relationship(individual_b_id);
CREATE INDEX idx_individual_relationship_status ON individual_relationship(relationship_status);
CREATE INDEX idx_invoice_billed_to ON invoice(billed_to_client_id);
CREATE UNIQUE INDEX idx_invoice_ivid ON invoice(ivid) WHERE ivid IS NOT NULL;
CREATE INDEX idx_invoice_matter ON invoice(matter_id);
CREATE INDEX idx_invoice_period ON invoice(period_start, period_end);
CREATE INDEX idx_invoice_source ON invoice(source_system, source_invoice_number);
CREATE INDEX idx_invoice_status ON invoice(status);
CREATE INDEX idx_invoice_line_invoice ON invoice_line_item(invoice_id, sort_order);
CREATE INDEX idx_invoice_line_matter ON invoice_line_item(matter_id);
CREATE INDEX idx_invoice_line_time ON invoice_line_item(time_entry_id);
CREATE INDEX idx_kr_crud_worker_smoke_test_test_key   ON kr_crud_worker_smoke_test(test_key);
CREATE INDEX idx_kr_homebase_initialization_bootstrap_user ON kr_homebase_initialization(bootstrap_user_id);
CREATE INDEX idx_kr_homebase_initialization_status ON kr_homebase_initialization(status);
CREATE INDEX idx_kr_note_created_by ON kr_note(created_by_user_id, created_at);
CREATE INDEX idx_kr_note_owner ON kr_note(owner_type, owner_id, created_at);
CREATE INDEX idx_lead_individual ON lead(individual_id);
CREATE UNIQUE INDEX idx_lead_lcid ON lead(lcid) WHERE lcid IS NOT NULL;
CREATE INDEX idx_lead_public_inquiry ON lead(public_inquiry_id);
CREATE INDEX idx_lead_status_received ON lead(status, received_at DESC);
CREATE INDEX idx_lead_source_channel ON lead_source(channel, is_active);
CREATE INDEX idx_ledger_audit_entry ON ledger_audit_log(ledger_entry_id);
CREATE INDEX idx_ledger_audit_invoice ON ledger_audit_log(invoice_id);
CREATE INDEX idx_ledger_bucket ON ledger_entry(matter_id, ledger_bucket, entry_date);
CREATE INDEX idx_ledger_client ON ledger_entry(client_id);
CREATE INDEX idx_ledger_deposit ON ledger_entry(bank_deposit_id);
CREATE INDEX idx_ledger_entry_date ON ledger_entry(entry_date);
CREATE INDEX idx_ledger_invoice ON ledger_entry(invoice_id);
CREATE INDEX idx_ledger_matter ON ledger_entry(matter_id);
CREATE INDEX idx_ledger_payment ON ledger_entry(payment_id);
CREATE INDEX idx_ledger_source ON ledger_entry(source_system, source_record_id);
CREATE INDEX idx_ledger_voided ON ledger_entry(voided_at);
CREATE INDEX idx_lookup_active ON lookup(category, is_active, sort_order);
CREATE INDEX idx_lookup_category ON lookup(category);
CREATE INDEX idx_matter_jurisdiction ON matter(jurisdiction_state);
CREATE INDEX idx_matter_number ON matter(matter_number);
CREATE INDEX idx_matter_practice_area ON matter(practice_area_lookup_id);
CREATE INDEX idx_matter_primary_attorney ON matter(primary_attorney_user_id);
CREATE INDEX idx_matter_reporting ON matter(billing_category, reporting_group);
CREATE INDEX idx_matter_source ON matter(source_system, source_matter_number);
CREATE INDEX idx_matter_staff_roles ON matter(responsible_staff_user_id, acting_staff_user_id, assisting_staff_user_id);
CREATE INDEX idx_matter_status ON matter(status_lookup_id);
CREATE INDEX idx_matter_access_lookup ON matter_access(matter_id, user_id, is_active);
CREATE INDEX idx_matter_access_matter ON matter_access(matter_id, is_active);
CREATE INDEX idx_matter_access_user ON matter_access(user_id, is_active);
CREATE INDEX idx_matter_balance_import ON matter_balance_snapshot(import_batch_id);
CREATE INDEX idx_matter_balance_matter ON matter_balance_snapshot(matter_id, snapshot_date);
CREATE INDEX idx_matter_balance_number ON matter_balance_snapshot(matter_number, snapshot_date);
CREATE INDEX idx_matter_billing_arrangement ON matter_billing_profile(fee_arrangement);
CREATE INDEX idx_matter_billing_client ON matter_billing_profile(billing_client_id);
CREATE INDEX idx_matter_fee_component_matter ON matter_fee_component(matter_id, status, sort_order);
CREATE INDEX idx_matter_party_client ON matter_party(client_id);
CREATE INDEX idx_matter_party_entity ON matter_party(entity_id);
CREATE INDEX idx_matter_party_individual ON matter_party(individual_id);
CREATE INDEX idx_matter_party_matter ON matter_party(matter_id);
CREATE INDEX idx_matter_staff_code ON matter_staff_assignment(staff_code);
CREATE INDEX idx_matter_staff_matter ON matter_staff_assignment(matter_id, assignment_role, is_current);
CREATE INDEX idx_matter_staff_user ON matter_staff_assignment(user_id, is_current);
CREATE INDEX idx_matter_stage_history_matter ON matter_stage_history(matter_id, changed_at);
CREATE INDEX idx_media_owner ON media_asset(owner_type, owner_id, purpose, status);
CREATE INDEX idx_media_r2_key ON media_asset(r2_key);
CREATE INDEX idx_media_status ON media_asset(status);
CREATE INDEX idx_media_uploaded_by ON media_asset(uploaded_by_user_id);
CREATE INDEX idx_media_variant_asset ON media_variant(media_asset_id);
CREATE INDEX idx_pay_period_dates ON pay_period(period_start, period_end);
CREATE INDEX idx_pay_period_status ON pay_period(status, pay_date);
CREATE INDEX idx_payment_client ON payment(client_id);
CREATE INDEX idx_payment_matter ON payment(matter_id);
CREATE INDEX idx_payment_received ON payment(received_date);
CREATE INDEX idx_payment_source ON payment(source_system, source_record_id);
CREATE UNIQUE INDEX ux_payment_source_record_active ON payment(source_system, source_record_id) WHERE source_record_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX idx_payment_application_invoice ON payment_application(invoice_id);
CREATE INDEX idx_payment_application_matter ON payment_application(matter_id);
CREATE INDEX idx_payment_application_payment ON payment_application(payment_id);
CREATE INDEX idx_payment_provider_provider_environment ON payment_provider(provider, environment);
CREATE INDEX idx_payment_request_client_status ON payment_request(client_id, status);
CREATE INDEX idx_payment_request_invoice ON payment_request(invoice_id, created_at);
CREATE UNIQUE INDEX ux_payment_request_open_email ON payment_request(client_id) WHERE status = 'open' AND link_source = 'email';
CREATE UNIQUE INDEX idx_public_content_answer_route
    ON public_content(pillar, topic_slug)
    WHERE content_type = 'answer';
CREATE UNIQUE INDEX idx_public_content_article_slug
    ON public_content(slug)
    WHERE content_type = 'article';
CREATE INDEX idx_public_content_category
    ON public_content(category, status, published_at DESC)
    WHERE content_type = 'article';
CREATE UNIQUE INDEX idx_public_content_display_code
  ON public_content(display_code)
  WHERE display_code IS NOT NULL;
CREATE INDEX idx_public_content_pillar
    ON public_content(pillar, status, published_at DESC)
    WHERE content_type = 'answer';
CREATE INDEX idx_public_content_status_type
    ON public_content(content_type, status, published_at DESC);
CREATE INDEX idx_public_content_type_sequence
  ON public_content(content_type, display_sequence);
CREATE INDEX idx_publication_event_content
    ON publication_event(content_id, event_at DESC);
CREATE INDEX idx_publication_event_type
    ON publication_event(event_type, event_at DESC);
CREATE INDEX idx_reminder_due ON reminder(status, remind_at);
CREATE INDEX idx_reminder_owner ON reminder(owner_type, owner_id);
CREATE INDEX idx_reminder_user ON reminder(user_id, status, remind_at);
CREATE INDEX idx_requested_document_matter ON requested_document(matter_id);
CREATE INDEX idx_requested_document_status ON requested_document(status);
CREATE INDEX idx_risk_flag_asset ON risk_flag(asset_id);
CREATE INDEX idx_risk_flag_resolved ON risk_flag(resolved);
CREATE INDEX idx_role_set_family ON role_set(role_family, is_active, sort_order);
CREATE INDEX idx_role_set_key ON role_set(role_key);
CREATE INDEX idx_role_set_permission_key ON role_set_permission(permission_key);
CREATE INDEX idx_role_set_permission_role ON role_set_permission(role_set_id, permission_group);
CREATE INDEX idx_role_set_permission_scope_role
  ON role_set_permission_scope(role_set_id, permission_key, scope);
CREATE INDEX idx_task_assigned_to ON task(assigned_to_user_id, status, due_date);
CREATE INDEX idx_task_billing_status ON task(billing_status, due_date);
CREATE INDEX idx_task_client_status_due ON task(client_id, status, due_date);
CREATE INDEX idx_task_lead_status_due ON task(lead_user_id, status, due_date);
CREATE INDEX idx_task_matter ON task(matter_id, status, due_date);
CREATE INDEX idx_task_project_identifier ON task(project_identifier);
CREATE INDEX idx_task_status_due ON task(status, due_date);
CREATE INDEX idx_task_type_status_due ON task(type_label, status, due_date);
CREATE INDEX idx_task_workstream_activity ON task(workstream_activity_wsid, status, due_date);
CREATE INDEX idx_team_active ON team(is_active, name);
CREATE INDEX idx_team_lead_team_active
  ON team_lead(team_id, is_active, starts_at, ends_at);
CREATE INDEX idx_team_lead_user_active
  ON team_lead(user_id, is_active, starts_at, ends_at);
CREATE INDEX idx_team_member_employee_active
  ON team_member(employee_id, is_active, starts_at, ends_at);
CREATE INDEX idx_team_member_team_active
  ON team_member(team_id, is_active, starts_at, ends_at);
CREATE INDEX idx_time_entry_activity ON time_entry(activity_code, entry_date);
CREATE UNIQUE INDEX idx_time_entry_bcid ON time_entry(bcid) WHERE bcid IS NOT NULL;
CREATE INDEX idx_time_entry_billing ON time_entry(matter_id, billing_mode, billing_status);
CREATE INDEX idx_time_entry_invoice ON time_entry(invoice_id);
CREATE INDEX idx_time_entry_matter ON time_entry(matter_id);
CREATE INDEX idx_time_entry_source ON time_entry(source_system, source_record_id);
CREATE INDEX idx_time_entry_user ON time_entry(user_id);
CREATE INDEX idx_timer_session_matter ON timer_session(matter_id, started_at);
CREATE INDEX idx_timer_session_user_status ON timer_session(user_id, status, started_at);
CREATE INDEX idx_trust_request_matter ON trust_request(matter_id, status, request_date);
CREATE UNIQUE INDEX idx_trust_request_number ON trust_request(request_number);
CREATE INDEX idx_user_individual ON user(individual_id);
CREATE INDEX idx_user_profile_image ON user(profile_image_media_id);
CREATE INDEX idx_user_role ON user(role);
CREATE INDEX idx_user_role_set ON user(role_set_id);
CREATE INDEX idx_user_invite_accepted_user ON user_invite(accepted_user_id);
CREATE INDEX idx_user_invite_email_status ON user_invite(email, status);
CREATE INDEX idx_user_invite_invited_by ON user_invite(invited_by_user_id);
CREATE INDEX idx_user_invite_invited_user ON user_invite(invited_user_id);
CREATE INDEX idx_user_permission_override_key ON user_permission_override(permission_key, permission_action, override_effect);
CREATE INDEX idx_user_permission_override_user ON user_permission_override(user_id, revoked_at, expires_at);
CREATE INDEX idx_user_role_set_role_active
    ON user_role_set(role_set_id, is_active);
CREATE INDEX idx_user_role_set_user_active
    ON user_role_set(user_id, is_active, starts_at, expires_at);
CREATE UNIQUE INDEX uq_user_role_set_primary
    ON user_role_set(user_id)
    WHERE is_active = 1 AND is_primary = 1;
CREATE INDEX idx_user_sso_identity_email ON user_sso_identity(provider, email);
CREATE INDEX idx_user_sso_identity_subject ON user_sso_identity(provider, provider_subject);
CREATE INDEX idx_user_sso_identity_user ON user_sso_identity(user_id);
CREATE INDEX idx_workstream_activity_lead_ledger ON workstream_activity(lead_id, matter_id, activity_at DESC, created_at DESC);
CREATE INDEX idx_workstream_activity_lead_subgroup ON workstream_activity(lead_id, matter_id, subgroup, activity_at DESC);
CREATE INDEX idx_workstream_activity_ledger ON workstream_activity(client_id, matter_id, activity_at DESC, created_at DESC);
CREATE INDEX idx_workstream_activity_subgroup ON workstream_activity(client_id, matter_id, subgroup, activity_at DESC);
CREATE INDEX idx_workstream_activity_task ON workstream_activity(task_id);
CREATE INDEX idx_workstream_activity_comment_history
    ON workstream_activity_comment(workstream_activity_id, created_at);

-- ======================================================================
-- VIEWS
CREATE VIEW invoice_ledger_summary AS
SELECT
    i.id AS invoice_id,
    i.matter_id,
    i.billed_to_client_id,
    i.invoice_number,
    i.total_amount,
    COALESCE(SUM(CASE WHEN le.voided_at IS NULL AND le.ledger_bucket = 'receivable' AND le.entry_direction = 'credit' THEN le.amount ELSE 0 END), 0) AS total_credits,
    COALESCE(SUM(CASE WHEN le.voided_at IS NULL AND le.ledger_bucket = 'receivable' AND le.entry_direction = 'debit' THEN le.amount ELSE 0 END), 0) AS total_debits,
    i.total_amount
      - COALESCE(SUM(CASE WHEN le.voided_at IS NULL AND le.ledger_bucket = 'receivable' AND le.entry_direction = 'credit' THEN le.amount ELSE 0 END), 0)
      + COALESCE(SUM(CASE WHEN le.voided_at IS NULL AND le.ledger_bucket = 'receivable' AND le.entry_direction = 'debit' THEN le.amount ELSE 0 END), 0) AS balance_due
FROM invoice i
LEFT JOIN ledger_entry le ON le.invoice_id = i.id
GROUP BY i.id;

CREATE VIEW matter_ledger_bucket_summary AS
SELECT
    matter_id,
    client_id,
    ledger_bucket,
    COALESCE(SUM(CASE WHEN voided_at IS NULL AND entry_direction = 'debit' THEN amount ELSE 0 END), 0) AS total_debits,
    COALESCE(SUM(CASE WHEN voided_at IS NULL AND entry_direction = 'credit' THEN amount ELSE 0 END), 0) AS total_credits,
    COALESCE(SUM(CASE WHEN voided_at IS NULL AND entry_direction = 'debit' THEN amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN voided_at IS NULL AND entry_direction = 'credit' THEN amount ELSE 0 END), 0) AS net_debit_balance
FROM ledger_entry
GROUP BY matter_id, client_id, ledger_bucket;

CREATE VIEW public_published_content AS
SELECT
    id,
    content_type,
    title,
    slug,
    topic_slug,
    canonical_path,
    summary,
    thumbnail_r2_key,
    thumbnail_public_url,
    thumbnail_alt,
    body_format,
    sanitized_html,
    seo_title,
    seo_description,
    author_id,
    author_display_name,
    category,
    category_label,
    pillar,
    reading_time_minutes,
    published_at,
    updated_at
FROM public_content
WHERE status = 'published'
  AND content_type IN ('article', 'answer');

-- ======================================================================
-- TRIGGERS
CREATE TRIGGER public_content_sequence_after_insert
AFTER INSERT ON public_content
WHEN NEW.content_type IN ('article', 'answer')
  AND (NEW.display_sequence IS NULL OR NEW.display_code IS NULL)
BEGIN
  INSERT OR IGNORE INTO content_sequence (content_type, next_sequence, updated_at)
  VALUES (NEW.content_type, 1, datetime('now'));

  UPDATE public_content
  SET
    display_sequence = COALESCE(
      NEW.display_sequence,
      (SELECT next_sequence FROM content_sequence WHERE content_type = NEW.content_type)
    ),
    display_code = COALESCE(
      NEW.display_code,
      CASE NEW.content_type
        WHEN 'answer' THEN 'Answer ' || printf('%03d', COALESCE(
          NEW.display_sequence,
          (SELECT next_sequence FROM content_sequence WHERE content_type = NEW.content_type)
        ))
        ELSE 'Article ' || printf('%03d', COALESCE(
          NEW.display_sequence,
          (SELECT next_sequence FROM content_sequence WHERE content_type = NEW.content_type)
        ))
      END
    )
  WHERE id = NEW.id;

  UPDATE content_sequence
  SET
    next_sequence = CASE
      WHEN next_sequence <= (SELECT display_sequence FROM public_content WHERE id = NEW.id)
        THEN (SELECT display_sequence FROM public_content WHERE id = NEW.id) + 1
      ELSE next_sequence
    END,
    updated_at = datetime('now')
  WHERE content_type = NEW.content_type;
END;
