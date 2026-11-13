# Contact, Entity, Trust, and Lead Import JSONC Instructions

<small>Version 1.1.5</small><br>
<small>Updated Nov 12, 2026 3:27pm</small>

This is the old instruction file (its own version 1.2, Sep 28, 2026, prepared for KRHomebase v1.1.5 p 441), copied for the Firm Settings → Data Import page. The parts that no longer match KR Homebase are changed: the route names, what the contact create route saves, and lead rows, which wait for the Leads port.

## Readiness Summary

KR Homebase is ready to prepare structured import data for individual contacts, entities, trusts, and individual leads. The Firm Settings / Data Import staging panel can parse this JSONC, validate database-compatible fields, flag probable duplicates, and create safe non-duplicate contact rows through `POST /v1/contacts`. Lead rows are checked and shown in the review, but they are not imported until the Leads port: the review lists them as "Lead import waits for the Leads port."

The contact create route can create:

- individual records with first name and last name;
- entity records, including trusts represented as `entitySubtype: "trust"`;
- one primary email and one primary phone contact method for either an individual or an entity.

For entities and trusts the route saves `legalName`, `entitySubtype`, `notes`, email and phone. It saves every new entity as `entityStatus: "active"` and `boiStatus: "unknown"`; `entityStatus`, `boiStatus`, `stateOfFormation` and `ein` are checked by the importer but not saved yet. An `id` in the file is never used; KR Homebase makes its own ids.

The contact create route does not yet create address rows, relationship rows, trustee/officer links, entity registration rows, DBA rows, or multiple contact methods from a bulk payload. The JSONC may carry those fields as source context, but the current normalized importer does not persist them or guarantee that they remain visible after staging. Treat them as deferred work and call them out in `reviewIssues`.

The operational `lead` table is individual-only. An entity or trust can be imported as a contact, but it cannot become an operational lead through this importer until the entity-lead relationship model is defined.

## GPT Task

Transform the source contact, entity, and trust data into one JSONC object that matches the shape below. Preserve source evidence in `source` fields when available. Do not invent unknown facts. Use `null` for known-empty values and omit fields only when the source gives no signal at all.

Use camelCase property names in the JSONC. Use comments only for reviewer notes, not as a substitute for data.

## Normalization Rules

- `individuals` are natural people.
- `entities` are non-person organizations that are not trusts, such as LLCs, corporations, partnerships, estates, nonprofits, government agencies, and sole proprietorships.
- `trusts` are entity records with `entitySubtype: "trust"` and belong in the separate `trusts` array.
- Do not duplicate a trust in both `entities` and `trusts`; the importer already converts the `trusts` array into entity rows.
- `leads` are individual people who must be imported into the operational `lead` table. Do not repeat the same lead in `individuals` unless you intentionally want both a contact and a lead row.
- Required individual fields are `firstName` and `lastName`.
- Required entity/trust fields are `legalName` and `entitySubtype`.
- Allowed `entitySubtype` values are `llc`, `corporation`, `partnership`, `trust`, `estate`, `nonprofit`, `government`, `sole_prop`, and `unknown`.
- Allowed `partnershipType` values are `lp`, `llp`, `gp`, and `lllp`; use this only when `entitySubtype` is `partnership`.
- Allowed `managementStructure` values are `member_managed`, `manager_managed`, `board_managed`, and `unknown`.
- Allowed `entityStatus` values are `active`, `inactive`, `dissolved`, `forfeited`, `reinstated`, and `pending`; use `active` when the source implies an active current entity and nothing more specific is available.
- Allowed `boiStatus` values are `filed`, `not_required`, `pending`, `unknown`, and `exempt`; use `unknown` when the source does not say.
- Lead `status` values are `new`, `contacted`, `qualified`, `proposal`, `won`, `lost`, and `archived`; default KeyWave rows to `new` unless the source provides a reliable current status.
- Lead `urgency` values are `low`, `normal`, `high`, and `urgent`; default to `normal` when unknown.
- Lead `source` values are `manual`, `public_inquiry`, `referral`, `website`, and `other`. KeyWave is not a database enum value: use `source: "other"` and `sourceDetail: "KeyWave"` so the origin remains visible in the lead summary.
- `sourceMetadata` carries source row identifiers for a lead because `source` is reserved for the database-safe lead source enum.
- Dates must use `YYYY-MM-DD` when known.
- Boolean values must be real JSON booleans, `true` or `false`.
- Do not include full SSNs unless Dan explicitly authorizes that secure workflow. Prefer `ssnLast4` when only verification is needed.
- EIN values may be included only when present in the source. If only the last four digits are available, use `einLast4` and leave `ein` null.

## JSONC Shape

```jsonc
{
  "importMetadata": {
    "sourceSystem": "LEAP",
    "sourceFileName": "contacts-export.csv",
    "preparedBy": "GPT",
    "preparedDate": "2026-09-03",
    "notes": "Short description of source data and any known limitations."
  },
  "individuals": [
    {
      "source": {
        "sourceRowId": "row-12",
        "sourceLabel": "Original source name or file row label"
      },
      "id": null, // Optional. Leave null unless KR Homebase supplied a stable id.
      "titlePrefix": null,
      "firstName": "Jane",
      "middleName": "Q.",
      "lastName": "Client",
      "suffix": null,
      "preferredName": "Jane",
      "dob": null,
      "ssnLast4": null,
      "isMinor": false,
      "isAttorney": false,
      "notes": "Any source notes that should remain attached to the person.",
      "primaryEmail": "jane@example.com",
      "primaryPhone": "(555) 123-4567",
      "contactMethods": [
        {
          "contactType": "email",
          "value": "jane@example.com",
          "label": "Primary email",
          "useContext": "client_contact",
          "isPrimary": true,
          "canText": false,
          "doNotContact": false,
          "notes": null
        },
        {
          "contactType": "phone",
          "value": "(555) 123-4567",
          "label": "Primary phone",
          "useContext": "client_contact",
          "isPrimary": true,
          "canText": true,
          "doNotContact": false,
          "notes": null
        }
      ],
      "addresses": [
        {
          "street1": "100 Main St",
          "street2": "Suite 200",
          "city": "Austin",
          "state": "TX",
          "postalCode": "78701",
          "country": "US",
          "county": null,
          "useContext": "client_contact",
          "isPrimary": true,
          "addressQuality": "imported",
          "sourceRawText": "100 Main St, Suite 200, Austin, TX 78701",
          "notes": null
        }
      ]
    }
  ],
  "entities": [
    {
      "source": {
        "sourceRowId": "row-28",
        "sourceLabel": "Original source entity label"
      },
      "id": null,
      "legalName": "Example Holdings LLC",
      "entitySubtype": "llc",
      "partnershipType": null,
      "managementStructure": "member_managed",
      "ein": null,
      "einLast4": "1234",
      "stateOfFormation": "TX",
      "formationDate": null,
      "entityStatus": "active",
      "sosFileNumber": null,
      "stateTaxpayerNumber": null,
      "xtNumber": null,
      "registeredAgentName": null,
      "boiStatus": "unknown",
      "boiConfirmationNumber": null,
      "notes": null,
      "primaryEmail": "office@exampleholdings.com",
      "primaryPhone": "(555) 222-3333",
      "contactMethods": [
        {
          "contactType": "email",
          "value": "office@exampleholdings.com",
          "label": "Primary email",
          "useContext": "business",
          "isPrimary": true,
          "canText": false,
          "doNotContact": false,
          "notes": null
        }
      ],
      "addresses": [
        {
          "street1": "200 Entity Ave",
          "street2": null,
          "city": "Dallas",
          "state": "TX",
          "postalCode": "75201",
          "country": "US",
          "county": null,
          "useContext": "business",
          "isPrimary": true,
          "addressQuality": "imported",
          "sourceRawText": null,
          "notes": null
        }
      ],
      "relatedPeople": [
        {
          "individualMatch": {
            "firstName": "Jane",
            "lastName": "Client",
            "preferredName": "Jane"
          },
          "role": "member",
          "title": "Member",
          "ownershipPercent": null,
          "isPrimaryContact": true,
          "notes": "Use for future entity_contact or ownership import support."
        }
      ]
    }
  ],
  "trusts": [
    {
      "source": {
        "sourceRowId": "row-45",
        "sourceLabel": "Original source trust label"
      },
      "id": null,
      "legalName": "Jane Client Revocable Trust dated January 1, 2020",
      "entitySubtype": "trust",
      "entityStatus": "active",
      "stateOfFormation": "TX",
      "formationDate": "2020-01-01",
      "ein": null,
      "einLast4": null,
      "boiStatus": "not_required",
      "notes": "Trusts import through the entity table with entitySubtype trust.",
      "primaryEmail": null,
      "primaryPhone": null,
      "contactMethods": [],
      "addresses": [],
      "trustRoles": [
        {
          "individualMatch": {
            "firstName": "Jane",
            "lastName": "Client",
            "preferredName": "Jane"
          },
          "role": "settlor",
          "title": "Settlor",
          "startDate": null,
          "endDate": null,
          "notes": "Use for future relationship import support."
        },
        {
          "individualMatch": {
            "firstName": "Jane",
            "lastName": "Client",
            "preferredName": "Jane"
          },
          "role": "trustee",
          "title": "Trustee",
          "startDate": null,
          "endDate": null,
          "notes": "Use for future relationship import support."
        }
      ]
    }
  ],
  "leads": [
    {
      "sourceMetadata": {
        "sourceRowId": "Export_Contacts_undefined_Sep_2026_2_20_PM.csv:42",
        "sourceLabel": "KeyWave Contacts"
      },
      "importKey": "keywave_contact_42",
      "firstName": "Jane",
      "lastName": "Client",
      "preferredName": "Jane",
      "primaryEmail": "jane@example.com",
      "primaryPhone": "(555) 123-4567",
      "notes": "Imported from the KeyWave contact export.",
      "status": "new",
      "source": "other",
      "sourceDetail": "KeyWave",
      "urgency": "normal",
      "inquirySummary": "KeyWave lead awaiting initial outreach.",
      "practiceArea": "estate_planning"
    }
  ],
  "reviewIssues": [
    {
      "severity": "warning",
      "recordType": "individual",
      "sourceRowId": "row-12",
      "message": "Middle initial was present but no full middle name was supplied."
    }
  ]
}
```

## Current API-Ready Minimal Payloads

Until the full bulk importer is built, these are the only fields the existing create helpers reliably use.

Individual through `POST /v1/contacts`:

```jsonc
{
  "kind": "individual",
  "firstName": "Jane",
  "middleName": "Q.",
  "lastName": "Client",
  "suffix": null,
  "preferredName": "Jane",
  "isAttorney": false,
  "notes": "Optional note.",
  "email": "jane@example.com",
  "phone": "(555) 123-4567"
}
```

Entity through `POST /v1/contacts` (`entityStatus`, `boiStatus`, `ein` and `stateOfFormation` are checked but not saved yet):

```jsonc
{
  "kind": "entity",
  "legalName": "Example Holdings LLC",
  "entitySubtype": "llc",
  "entityStatus": "active",
  "boiStatus": "unknown",
  "ein": null,
  "stateOfFormation": "TX",
  "notes": "Optional note.",
  "email": "office@exampleholdings.com",
  "phone": "(555) 222-3333"
}
```

Trust through `POST /v1/contacts` (the same fields as an entity):

```jsonc
{
  "kind": "entity",
  "legalName": "Jane Client Revocable Trust dated January 1, 2020",
  "entitySubtype": "trust",
  "entityStatus": "active",
  "boiStatus": "not_required",
  "stateOfFormation": "TX",
  "notes": "Optional note.",
  "email": null,
  "phone": null
}
```

Individual lead (waits for the Leads port; the importer checks these rows but does not send them yet):

```jsonc
{
  "firstName": "Jane",
  "lastName": "Client",
  "primaryEmail": "jane@example.com",
  "primaryPhone": "(555) 123-4567",
  "status": "new",
  "source": "other",
  "sourceDetail": "KeyWave",
  "urgency": "normal",
  "inquirySummary": "KeyWave lead awaiting initial outreach.",
  "practiceArea": "estate_planning"
}
```

In the old app, when a probable duplicate was an existing individual, the staging importer sent `individualId` to the leads route, which reused that individual and its lead. That path returns with the Leads port.

## Reviewer Checklist

- Every individual has `firstName` and `lastName`.
- Every entity has `legalName` and a valid `entitySubtype`.
- Every trust is in `trusts` with `entitySubtype: "trust"`, not duplicated in `entities`.
- Unknown BOI status is `unknown`, not blank.
- Phone and email values are attached as `primaryPhone`/`primaryEmail` and repeated in `contactMethods` when contact-method detail is available.
- Addresses may be included in the source JSONC for future support, but are not treated as create-ready or persisted by the current normalized importer/API v1 helpers.
- Relationship, trustee, ownership, and officer data may be included in `relatedPeople` or `trustRoles` for source review, but are not treated as create-ready or persisted by the current normalized importer/API v1 helpers.
- `reviewIssues` records any ambiguity GPT could not resolve from the source.
- Every `leads` row has individual name fields and database-compatible `status`, `source`, and `urgency` values.
- KeyWave rows use `source: "other"` plus `sourceDetail: "KeyWave"`; do not send `source: "keywave"`.
- A lead row is not also repeated in `individuals` unless the duplicate contact row is intentional.
