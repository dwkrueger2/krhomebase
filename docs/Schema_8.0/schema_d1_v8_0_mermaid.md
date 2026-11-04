# Schema 8.0 Mermaid ERD source

One diagram per domain. Paste a block into any Mermaid renderer.

## Identity and Parties

```mermaid
erDiagram
  individual {
    TEXT id PK
  }
  individual_relationship {
    TEXT id PK
    TEXT individual_a_id FK
    TEXT individual_b_id FK
    TEXT a_to_b_relationship_lookup_id FK
    TEXT b_to_a_relationship_lookup_id FK
  }
  contact_resolution {
    TEXT id PK
  }
  individual ||--o{ individual_relationship : "individual_a_id"
  individual ||--o{ individual_relationship : "individual_b_id"
```

## Contacts, Addresses, and Communication Methods

```mermaid
erDiagram
  address {
    TEXT id PK
  }
  individual_address {
    TEXT id PK
    TEXT individual_id FK
    TEXT address_id FK
    TEXT address_type_lookup_id FK
  }
  individual_contact_method {
    TEXT id PK
    TEXT individual_id FK
    TEXT subtype_lookup_id FK
  }
  entity_address {
    TEXT id PK
    TEXT entity_id FK
    TEXT address_id FK
    TEXT address_type_lookup_id FK
  }
  entity_contact {
    TEXT id PK
    TEXT entity_id FK
    TEXT individual_id FK
    TEXT role_lookup_id FK
  }
  entity_contact_method {
    TEXT id PK
    TEXT entity_id FK
    TEXT subtype_lookup_id FK
  }
  address ||--o{ individual_address : "address_id"
  address ||--o{ entity_address : "address_id"
```

## Clients and Matters

```mermaid
erDiagram
  client {
    TEXT id PK
    TEXT individual_id FK
    TEXT entity_id FK
    TEXT card_image_media_id FK
    TEXT import_batch_id FK
  }
  client_member {
    TEXT id PK
    TEXT client_id FK
    TEXT individual_id FK
    TEXT entity_id FK
  }
  matter {
    TEXT id PK
    TEXT practice_area_lookup_id FK
    TEXT status_lookup_id FK
    TEXT primary_attorney_user_id FK
    TEXT responsible_staff_user_id FK
    TEXT acting_staff_user_id FK
    TEXT assisting_staff_user_id FK
    TEXT originating_attorney_user_id FK
    TEXT created_by_user_id FK
    TEXT cover_image_media_id FK
    TEXT import_batch_id FK
  }
  matter_party {
    TEXT id PK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT individual_id FK
    TEXT entity_id FK
    TEXT party_role_lookup_id FK
  }
  matter_stage_history {
    TEXT id PK
    TEXT matter_id FK
    TEXT previous_status_lookup_id FK
    TEXT next_status_lookup_id FK
    TEXT changed_by_user_id FK
  }
  client ||--o{ client_member : "client_id"
  matter ||--o{ matter_party : "matter_id"
  client ||--o{ matter_party : "client_id"
  matter ||--o{ matter_stage_history : "matter_id"
```

## Matter Participation and Access

```mermaid
erDiagram
  matter_staff_assignment {
    TEXT id PK
    TEXT matter_id FK
    TEXT user_id FK
  }
  matter_access {
    TEXT id PK
    TEXT matter_id FK
    TEXT user_id FK
    TEXT granted_by_user_id FK
    TEXT revoked_by_user_id FK
  }
```

## Intake and Lead Management

```mermaid
erDiagram
  lead {
    TEXT id PK
    TEXT individual_id FK
    TEXT assigned_to_user_id FK
    TEXT converted_client_id FK
  }
  lead_source {
    TEXT id PK
  }
  lead_pipeline_stage {
    TEXT id PK
  }
  client_lead_profile {
    TEXT id PK
    TEXT individual_id FK
    TEXT source_id FK
    TEXT pipeline_stage_id FK
    TEXT assigned_to_user_id FK
  }
  client_lead_profile_legacy_orphan {
    TEXT id PK
  }
  lead_source ||--o{ client_lead_profile : "source_id"
  lead_pipeline_stage ||--o{ client_lead_profile : "pipeline_stage_id"
```

## Notes, Communications, Tasks, and Reminders

```mermaid
erDiagram
  kr_note {
    TEXT id PK
    TEXT created_by_user_id FK
    TEXT updated_by_user_id FK
  }
  communication_log {
    TEXT id PK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT individual_id FK
    TEXT entity_id FK
    TEXT created_by_user_id FK
  }
  communication_participant {
    TEXT id PK
    TEXT communication_id FK
    TEXT individual_id FK
    TEXT entity_id FK
    TEXT user_id FK
  }
  communication_attachment {
    TEXT id PK
    TEXT communication_id FK
    TEXT document_record_id FK
    TEXT media_asset_id FK
  }
  workstream_activity {
    TEXT id PK
    TEXT client_id FK
    TEXT lead_id FK
    TEXT matter_id FK
    TEXT document_record_id FK
    TEXT assignee_user_id FK
    TEXT performed_by_user_id FK
  }
  workstream_activity_comment {
    TEXT id PK
    TEXT workstream_activity_id FK
    TEXT user_id FK
  }
  matter_activity_log {
    TEXT id PK
    TEXT matter_id FK
    TEXT task_id FK
    TEXT assigned_to_user_id FK
    TEXT performed_by_user_id FK
  }
  task {
    TEXT id PK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT assigned_to_user_id FK
    TEXT assigned_by_user_id FK
    TEXT lead_user_id FK
    TEXT workstream_activity_wsid FK
    TEXT created_by_user_id FK
  }
  task_assignee {
    TEXT id PK
    TEXT task_id FK
    TEXT user_id FK
    TEXT assigned_by_user_id FK
  }
  reminder {
    TEXT id PK
    TEXT user_id FK
  }
  communication_log ||--o{ communication_participant : "communication_id"
  communication_log ||--o{ communication_attachment : "communication_id"
  workstream_activity ||--o{ workstream_activity_comment : "workstream_activity_id"
  task ||--o{ matter_activity_log : "task_id"
  workstream_activity ||--o{ task : "workstream_activity_wsid"
  task ||--o{ task_assignee : "task_id"
```

## Calendar and Events

```mermaid
erDiagram
  event {
    TEXT id PK
    TEXT matter_id FK
    TEXT related_client_id FK
    TEXT related_individual_id FK
    TEXT related_entity_id FK
    TEXT user_id FK
    TEXT assigned_to_user_id FK
    TEXT event_type_lookup_id FK
    TEXT import_batch_id FK
  }
  event_participant {
    TEXT id PK
    TEXT event_id FK
    TEXT user_id FK
    TEXT client_id FK
    TEXT individual_id FK
    TEXT entity_id FK
  }
  event ||--o{ event_participant : "event_id"
```

## Conflict Checking

```mermaid
erDiagram
  conflict_check {
    TEXT id PK
    TEXT matter_id FK
    TEXT checked_against_client_id FK
    TEXT checked_against_individual_id FK
    TEXT checked_against_entity_id FK
    TEXT checked_by_user_id FK
  }
  conflict_check_party {
    TEXT id PK
    TEXT conflict_check_id FK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT individual_id FK
    TEXT entity_id FK
  }
  conflict_check_result {
    TEXT id PK
    TEXT conflict_check_id FK
  }
  conflict_check ||--o{ conflict_check_party : "conflict_check_id"
  conflict_check ||--o{ conflict_check_result : "conflict_check_id"
```

## Time and Expenses

```mermaid
erDiagram
  time_entry {
    TEXT id PK
    TEXT matter_id FK
    TEXT user_id FK
    TEXT employee_id FK
    TEXT activity_code_id FK
    TEXT flat_fee_component_id FK
    TEXT invoice_id FK
    TEXT import_batch_id FK
  }
  timer_session {
    TEXT id PK
    TEXT matter_id FK
    TEXT user_id FK
    TEXT activity_code_id FK
  }
  expense_entry {
    TEXT id PK
    TEXT matter_id FK
    TEXT user_id FK
    TEXT invoice_id FK
  }
  billing_activity_code {
    TEXT id PK
  }
  billing_activity_code ||--o{ time_entry : "activity_code_id"
  billing_activity_code ||--o{ timer_session : "activity_code_id"
```

## Billing, Ledger, Payments, and Trust

```mermaid
erDiagram
  matter_billing_profile {
    TEXT id PK
    TEXT matter_id FK
    TEXT billing_client_id FK
    TEXT receivable_client_id FK
  }
  matter_fee_component {
    TEXT id PK
    TEXT matter_id FK
    TEXT billing_profile_id FK
  }
  matter_balance_snapshot {
    TEXT id PK
    TEXT matter_id FK
    TEXT import_batch_id FK
  }
  invoice {
    TEXT id PK
    TEXT matter_id FK
    TEXT billing_profile_id FK
    TEXT billed_to_client_id FK
  }
  invoice_line_item {
    TEXT id PK
    TEXT invoice_id FK
    TEXT matter_id FK
    TEXT time_entry_id FK
    TEXT fee_component_id FK
    TEXT ledger_entry_id FK
  }
  ledger_entry {
    TEXT id PK
    TEXT invoice_id FK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT payment_id FK
    TEXT bank_deposit_id FK
    TEXT payment_type_lookup_id FK
    TEXT received_by_user_id FK
    TEXT created_by_user_id FK
    TEXT voided_by_user_id FK
  }
  ledger_audit_log {
    TEXT id PK
    TEXT ledger_entry_id FK
    TEXT invoice_id FK
    TEXT matter_id FK
    TEXT actor_user_id FK
  }
  payment {
    TEXT id PK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT payment_type_lookup_id FK
    TEXT bank_account_id FK
    TEXT import_batch_id FK
    TEXT received_by_user_id FK
    TEXT created_by_user_id FK
    TEXT voided_by_user_id FK
  }
  payment_application {
    TEXT id PK
    TEXT payment_id FK
    TEXT invoice_id FK
    TEXT matter_id FK
    TEXT ledger_entry_id FK
    TEXT created_by_user_id FK
  }
  payment_request {
    TEXT id PK
    TEXT invoice_id FK
    TEXT client_id FK
    TEXT payment_id FK
    TEXT revoked_by_user_id FK
    TEXT created_by_user_id FK
  }
  payment_provider {
    TEXT id PK
    TEXT secret_key_set_by_user_id FK
    TEXT webhook_secret_set_by_user_id FK
    TEXT created_by_user_id FK
    TEXT updated_by_user_id FK
  }
  bank_deposit {
    TEXT id PK
    TEXT bank_account_id FK
    TEXT deposited_by_user_id FK
    TEXT source_document_id FK
    TEXT created_by_user_id FK
  }
  bank_deposit_item {
    TEXT id PK
    TEXT bank_deposit_id FK
    TEXT payment_id FK
    TEXT ledger_entry_id FK
    TEXT matter_id FK
  }
  firm_bank_account {
    TEXT id PK
  }
  trust_request {
    TEXT id PK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT created_by_user_id FK
  }
  matter_billing_profile ||--o{ matter_fee_component : "billing_profile_id"
  matter_billing_profile ||--o{ invoice : "billing_profile_id"
  invoice ||--o{ invoice_line_item : "invoice_id"
  matter_fee_component ||--o{ invoice_line_item : "fee_component_id"
  ledger_entry ||--o{ invoice_line_item : "ledger_entry_id"
  invoice ||--o{ ledger_entry : "invoice_id"
  payment ||--o{ ledger_entry : "payment_id"
  bank_deposit ||--o{ ledger_entry : "bank_deposit_id"
  ledger_entry ||--o{ ledger_audit_log : "ledger_entry_id"
  invoice ||--o{ ledger_audit_log : "invoice_id"
  firm_bank_account ||--o{ payment : "bank_account_id"
  payment ||--o{ payment_application : "payment_id"
  invoice ||--o{ payment_application : "invoice_id"
  ledger_entry ||--o{ payment_application : "ledger_entry_id"
  invoice ||--o{ payment_request : "invoice_id"
  payment ||--o{ payment_request : "payment_id"
  firm_bank_account ||--o{ bank_deposit : "bank_account_id"
  bank_deposit ||--o{ bank_deposit_item : "bank_deposit_id"
  payment ||--o{ bank_deposit_item : "payment_id"
  ledger_entry ||--o{ bank_deposit_item : "ledger_entry_id"
```

## Documents, Media, and Templates

```mermaid
erDiagram
  document_record {
    TEXT id PK
    TEXT client_id FK
    TEXT matter_id FK
    TEXT individual_id FK
    TEXT entity_id FK
    TEXT employee_id FK
    TEXT document_category_lookup_id FK
    TEXT primary_media_asset_id FK
    TEXT created_by_user_id FK
  }
  document_template {
    TEXT id PK
    TEXT media_asset_id FK
  }
  requested_document {
    TEXT id PK
    TEXT matter_id FK
    TEXT client_id FK
    TEXT requested_from_client_id FK
    TEXT document_category_lookup_id FK
    TEXT document_record_id FK
    TEXT received_media_asset_id FK
    TEXT created_by_user_id FK
  }
  repository {
    TEXT id PK
  }
  media_asset {
    TEXT id PK
    TEXT uploaded_by_user_id FK
  }
  media_variant {
    TEXT id PK
    TEXT media_asset_id FK
  }
  media_asset ||--o{ document_record : "primary_media_asset_id"
  media_asset ||--o{ document_template : "media_asset_id"
  document_record ||--o{ requested_document : "document_record_id"
  media_asset ||--o{ requested_document : "received_media_asset_id"
  media_asset ||--o{ media_variant : "media_asset_id"
```

## Estate Planning, Assets, and Funding

```mermaid
erDiagram
  asset {
    TEXT id PK
    TEXT matter_id FK
  }
  asset_detail_bank {
    TEXT id PK
    TEXT asset_id FK
  }
  asset_detail_digital {
    TEXT id PK
    TEXT asset_id FK
  }
  asset_detail_entity {
    TEXT id PK
    TEXT asset_id FK
    TEXT entity_id FK
    TEXT assignment_document_id FK
  }
  asset_detail_insurance {
    TEXT id PK
    TEXT asset_id FK
  }
  asset_detail_real_estate {
    TEXT id PK
    TEXT asset_id FK
    TEXT deed_document_id FK
  }
  asset_detail_retirement {
    TEXT id PK
    TEXT asset_id FK
  }
  asset_detail_tangible {
    TEXT id PK
    TEXT asset_id FK
    TEXT appraisal_document_id FK
  }
  asset_detail_vehicle {
    TEXT id PK
    TEXT asset_id FK
    TEXT title_document_id FK
  }
  asset_ownership {
    TEXT id PK
    TEXT asset_id FK
    TEXT owner_client_id FK
    TEXT owner_individual_id FK
    TEXT owner_entity_id FK
    TEXT co_owner_client_id FK
    TEXT co_owner_individual_id FK
    TEXT co_owner_entity_id FK
  }
  asset_valuation {
    TEXT id PK
    TEXT asset_id FK
  }
  beneficiary_designation {
    TEXT id PK
    TEXT asset_id FK
    TEXT beneficiary_client_id FK
    TEXT beneficiary_individual_id FK
    TEXT beneficiary_entity_id FK
  }
  funding_action {
    TEXT id PK
    TEXT asset_id FK
    TEXT matter_id FK
    TEXT assigned_to_user_id FK
  }
  action_review_stamp {
    TEXT id PK
    TEXT funding_action_id FK
    TEXT user_id FK
  }
  risk_flag {
    TEXT id PK
    TEXT asset_id FK
    TEXT flagged_by_user_id FK
  }
  asset ||--o{ asset_detail_bank : "asset_id"
  asset ||--o{ asset_detail_digital : "asset_id"
  asset ||--o{ asset_detail_entity : "asset_id"
  asset ||--o{ asset_detail_insurance : "asset_id"
  asset ||--o{ asset_detail_real_estate : "asset_id"
  asset ||--o{ asset_detail_retirement : "asset_id"
  asset ||--o{ asset_detail_tangible : "asset_id"
  asset ||--o{ asset_detail_vehicle : "asset_id"
  asset ||--o{ asset_ownership : "asset_id"
  asset ||--o{ asset_valuation : "asset_id"
  asset ||--o{ beneficiary_designation : "asset_id"
  asset ||--o{ funding_action : "asset_id"
  funding_action ||--o{ action_review_stamp : "funding_action_id"
  asset ||--o{ risk_flag : "asset_id"
```

## Business Entities

```mermaid
erDiagram
  entity {
    TEXT id PK
  }
  entity_dba {
    TEXT id PK
    TEXT entity_id FK
  }
  entity_registration {
    TEXT id PK
    TEXT entity_id FK
    TEXT document_record_id FK
  }
  entity_event {
    TEXT id PK
    TEXT entity_id FK
    TEXT matter_id FK
    TEXT event_type_lookup_id FK
    TEXT assigned_to_user_id FK
  }
  compliance_filing {
    TEXT id PK
    TEXT entity_id FK
    TEXT document_record_id FK
    TEXT assigned_to_user_id FK
  }
  entity ||--o{ entity_dba : "entity_id"
  entity ||--o{ entity_registration : "entity_id"
  entity ||--o{ entity_event : "entity_id"
  entity ||--o{ compliance_filing : "entity_id"
```

## Public Content Publishing

```mermaid
erDiagram
  public_content {
    TEXT id PK
    TEXT author_id FK
    TEXT created_by_user_id FK
    TEXT updated_by_user_id FK
  }
  content_author {
    TEXT id PK
  }
  content_asset {
    TEXT id PK
    TEXT content_id FK
  }
  content_revision {
    TEXT id PK
    TEXT content_id FK
    TEXT changed_by_user_id FK
  }
  content_sequence {
    TEXT content_type PK
  }
  publication_event {
    TEXT id PK
    TEXT content_id FK
    TEXT actor_user_id FK
  }
  content_author ||--o{ public_content : "author_id"
  public_content ||--o{ content_asset : "content_id"
  public_content ||--o{ content_revision : "content_id"
  public_content ||--o{ publication_event : "content_id"
```

## External Integrations and Import

```mermaid
erDiagram
  external_integration_account {
    TEXT id PK
  }
  external_sync_state {
    TEXT id PK
    TEXT integration_account_id FK
  }
  external_webhook_event {
    TEXT id PK
    TEXT integration_account_id FK
  }
  external_source_map {
    TEXT id PK
    TEXT import_batch_id FK
  }
  import_batch {
    TEXT id PK
    TEXT imported_by_user_id FK
  }
  external_integration_account ||--o{ external_sync_state : "integration_account_id"
  external_integration_account ||--o{ external_webhook_event : "integration_account_id"
  import_batch ||--o{ external_source_map : "import_batch_id"
```

## Users, Roles, Permissions, Sessions, and Audit

```mermaid
erDiagram
  user {
    TEXT id PK
    TEXT individual_id FK
    TEXT profile_image_media_id FK
  }
  user_invite {
    TEXT id PK
    TEXT invited_user_id FK
    TEXT invited_by_user_id FK
    TEXT accepted_user_id FK
  }
  user_sso_identity {
    TEXT id PK
    TEXT user_id FK
  }
  user_role_set {
    TEXT id PK
    TEXT user_id FK
    TEXT role_set_id FK
    TEXT assigned_by_user_id FK
  }
  role_set {
    TEXT id PK
  }
  role_set_permission {
    TEXT id PK
    TEXT role_set_id FK
  }
  role_set_permission_scope {
    TEXT id PK
    TEXT role_set_id FK
  }
  user_permission_override {
    TEXT id PK
    TEXT user_id FK
    TEXT created_by_user_id FK
    TEXT revoked_by_user_id FK
  }
  kr_session {
    TEXT id PK
  }
  audit_log {
    TEXT id PK
    TEXT actor_user_id FK
    TEXT matter_id FK
    TEXT client_id FK
  }
  user ||--o{ user_invite : "invited_user_id"
  user ||--o{ user_invite : "invited_by_user_id"
  user ||--o{ user_invite : "accepted_user_id"
  user ||--o{ user_sso_identity : "user_id"
  user ||--o{ user_role_set : "user_id"
  role_set ||--o{ user_role_set : "role_set_id"
  user ||--o{ user_role_set : "assigned_by_user_id"
  role_set ||--o{ role_set_permission : "role_set_id"
  role_set ||--o{ role_set_permission_scope : "role_set_id"
  user ||--o{ user_permission_override : "user_id"
  user ||--o{ user_permission_override : "created_by_user_id"
  user ||--o{ user_permission_override : "revoked_by_user_id"
  user ||--o{ audit_log : "actor_user_id"
```

## Employees, Timekeeping, Payroll, and Teams

```mermaid
erDiagram
  employee {
    TEXT id PK
    TEXT user_id FK
    TEXT pto_policy_id FK
    TEXT employee_image_media_id FK
  }
  employee_certification {
    TEXT id PK
    TEXT employee_id FK
    TEXT certification_type_lookup_id FK
    TEXT document_record_id FK
  }
  employee_pay_rate {
    TEXT id PK
    TEXT employee_id FK
    TEXT approved_by_user_id FK
  }
  employee_pto_ledger {
    TEXT id PK
    TEXT employee_id FK
    TEXT employee_time_event_id FK
    TEXT policy_id FK
    TEXT created_by_user_id FK
  }
  employee_review_event {
    TEXT id PK
    TEXT employee_id FK
    TEXT reviewer_user_id FK
    TEXT document_record_id FK
  }
  employee_time_event {
    TEXT id PK
    TEXT employee_id FK
    TEXT pay_period_id FK
    TEXT approved_by_user_id FK
    TEXT rejected_by_user_id FK
    TEXT created_by_user_id FK
  }
  employee_time_card {
    TEXT id PK
    TEXT employee_id FK
    TEXT pay_period_id FK
    TEXT employee_approved_by_user_id FK
    TEXT reopened_by_user_id FK
  }
  employee_time_punch {
    TEXT id PK
    TEXT employee_id FK
    TEXT time_card_id FK
    TEXT supersedes_punch_id FK
    TEXT created_by_user_id FK
  }
  pay_period {
    TEXT id PK
    TEXT processed_by_user_id FK
  }
  firm_holiday {
    TEXT id PK
    TEXT policy_id FK
  }
  hr_policy {
    TEXT id PK
    TEXT created_by_user_id FK
  }
  hr_policy_rule {
    TEXT id PK
    TEXT policy_id FK
  }
  team {
    TEXT id PK
    TEXT created_by_user_id FK
  }
  team_lead {
    TEXT id PK
    TEXT team_id FK
    TEXT user_id FK
    TEXT created_by_user_id FK
  }
  team_member {
    TEXT id PK
    TEXT team_id FK
    TEXT employee_id FK
    TEXT created_by_user_id FK
  }
  hr_policy ||--o{ employee : "pto_policy_id"
  employee ||--o{ employee_certification : "employee_id"
  employee ||--o{ employee_pay_rate : "employee_id"
  employee ||--o{ employee_pto_ledger : "employee_id"
  employee_time_event ||--o{ employee_pto_ledger : "employee_time_event_id"
  hr_policy ||--o{ employee_pto_ledger : "policy_id"
  employee ||--o{ employee_review_event : "employee_id"
  employee ||--o{ employee_time_event : "employee_id"
  pay_period ||--o{ employee_time_event : "pay_period_id"
  employee ||--o{ employee_time_card : "employee_id"
  pay_period ||--o{ employee_time_card : "pay_period_id"
  employee ||--o{ employee_time_punch : "employee_id"
  employee_time_card ||--o{ employee_time_punch : "time_card_id"
  employee_time_punch ||--o{ employee_time_punch : "supersedes_punch_id"
  hr_policy ||--o{ firm_holiday : "policy_id"
  hr_policy ||--o{ hr_policy_rule : "policy_id"
  team ||--o{ team_lead : "team_id"
  team ||--o{ team_member : "team_id"
  employee ||--o{ team_member : "employee_id"
```

## System Metadata and Configuration

```mermaid
erDiagram
  lookup {
    TEXT id PK
  }
  custom_field_set {
    TEXT id PK
  }
  custom_field_definition {
    TEXT id PK
    TEXT set_id FK
  }
  custom_field_value {
    TEXT id PK
    TEXT definition_id FK
    TEXT created_by_user_id FK
    TEXT updated_by_user_id FK
  }
  kr_homebase_initialization {
    TEXT id PK
    TEXT bootstrap_user_id FK
  }
  kr_maintenance_gate {
    TEXT id PK
  }
  kr_crud_worker_smoke_test {
    TEXT id PK
  }
  custom_field_set ||--o{ custom_field_definition : "set_id"
  custom_field_definition ||--o{ custom_field_value : "definition_id"
```
