# `fuzzy-match` — Entity Resolution Library
<small>Version 1.1</small><br>
<small>Updated Nov 9, 2026 5:05pm</small>

**Ported Nov 9, 2026** from the old `hb-lib/hb-fuzzy-match` (plan stage 1d-3), whole and unchanged in behavior. Changes: the folder is `apps/web/lib/fuzzy-match/`; the import is `@/lib/fuzzy-match/fuzzyMatch`. This repository allows no `index.ts` files, so each folder's `index.ts` was renamed (`fuzzyMatch.ts`, `compare/compare.ts`, `indexing/indexing.ts`, `normalize/normalize.ts`, `score/weights.ts`, `decide/decide.ts`). The old unused `build/` copy of `indexing/` and the benchmark were left behind. A few `!` marks satisfy this repository's stricter type check. The tests are `fuzzyMatch.test.ts` with the made-up records in `testFixtures.ts`. The examples below still show the old import path.

## 1. What this is

`hb-fuzzy-match` is a deterministic TypeScript library for finding likely duplicate people, organizations, and trusts. It normalizes records, blocks a small candidate set, scores each field, applies explicit decision rules, and returns auditable explanations.

## 2. When to use it / when not to

Use it for interactive lookup, pre-insert duplicate checks, scoped trust lookup, and dry-run import planning. It is not AI, does not require training, does not make API calls, and never touches D1, the CRUD Worker, or the network.

The caller assembles complete canonical records from the schema. Employees and users are represented as `PERSON` records; the caller may derive `roles` from `entity_contact.role_lookup_id`, but roles never gate a match. Clients and employees therefore remain observations about the same person rather than separate search kinds.

## 3. Quick start

Lane A loads a corpus only when the module cache is cold. Lane B searches the resulting single-kind index:

```ts
import {
  checkForDuplicate,
  findMatches,
  getOrBuildIndex,
} from '@/hb-lib/hb-fuzzy-match'

const index = await getOrBuildIndex(
  'PERSON',
  corpusVersion,
  () => loadPeopleThroughTheApprovedCaller(),
)

const interactiveHits = findMatches('Krueger', index)
const duplicate = checkForDuplicate(incomingPerson, index)
```

`findMatches` and `checkForDuplicate` only receive an existing index. They do not fetch, build, or mutate it. `AUTO` remains a recommendation; only an explicitly configured import caller may act on it.

## 4. Architecture

There are two distinct inputs:

- Lane A is the complete canonical corpus of one kind, assembled by the caller from D1.
- Lane B is one untrusted free-text query or structured partial record.

Both inputs use the same normalizers. Index construction is amortized; blocking, scoring, deciding, and explaining happen per query.

```text
Lane A: canonical records -> normalize -> build/index/cache
                                      \
                                       -> block -> score -> decide -> explain -> results
                                      /
Lane B: query text/partial record -> normalize
```

`indexing/` is Lane A. The other folders provide the shared normalization and Lane B matching pipeline:

```text
hb-fuzzy-match/
├── index.ts          public import surface
├── config.ts         thresholds, weights, and constants
├── types.ts          public records, index, result, and plan types
├── normalize/        shared text, person, organization, and trust normalization
├── compare/          deterministic similarity primitives
├── score/            per-kind weighted scoring profiles
├── decide/           blockers, confirmers, thresholds, and explanations
├── indexing/         normalized records, blocking buckets, JSON, and cache
└── __tests__/        labeled fixtures and library-local tests
```

Indexes contain one `RecordKind` only. Candidate buckets hold integer positions into serializable normalized records, and ties are broken by record id ascending.

## 5. The three record kinds

| Kind | Schema assembly | Scoring profile |
| --- | --- | --- |
| `PERSON` | `individual`, with `user`/`employee` observations and related contact/address data | names, DOB, email, phone |
| `ORGANIZATION` | `entity`; LLCs are `entityType: 'LLC'`, not a separate kind | legal core, DBA, address, jurisdiction |
| `TRUST` | `entity` with `entity_subtype: 'trust'`, trust metadata, and `entity_contact` links | trust core, execution date, grantor surname, descriptors |

### Person weights

| Field | Weight |
| --- | ---: |
| Last name | 0.20 |
| First name | 0.15 |
| Full name | 0.10 |
| Date of birth | 0.10 |
| Email | 0.27 |
| Phone | 0.18 |

### Organization weights

| Field | Weight |
| --- | ---: |
| Legal-name core | 0.60 |
| DBA aliases | 0.15 |
| Address | 0.15 |
| Jurisdiction | 0.10 |

### Trust weights

| Field | Weight |
| --- | ---: |
| Boilerplate-stripped core | 0.65 |
| Execution date | 0.20 |
| Linked grantor surname | 0.10 |
| Descriptors | 0.05 |

Missing fields are redistributed across available fields rather than treated as mismatches. Government identifiers and exact email/name combinations are confirmers; conflicting SSN-last-4, DOB year tolerance, EIN, or kind are blockers.

## 6. Tuning

All numeric tuning values are in `config.ts`.

| Setting | Current value | What it controls | Change it when |
| --- | ---: | --- | --- |
| `DEFAULT_AUTO_THRESHOLD` | 0.93 | Automatic-confidence band | Raise it for too many false merges; lower only for missed obvious duplicates |
| `DEFAULT_REVIEW_THRESHOLD` | 0.72 | Human-review floor | Raise it for too many review candidates; lower for too many missed possible duplicates |
| `PHONETIC_ONLY_MAX_SCORE` | 0.72 | Prevents phonetic evidence alone from becoming `AUTO` | Lower it if sound-alike false positives are common |
| `SCOPED_TRUST_AUTO_THRESHOLD` / `SCOPED_TRUST_REVIEW_THRESHOLD` | 0.85 / 0.45 | Broader thresholds for already-linked trust pools | Raise them if scoped trust suggestions are too permissive |
| `INDEX_TTL_MS` | 60,000 | Warm isolate cache lifetime | Lower for fresher results; raise to reduce rebuilds when writes are infrequent |
| `MAX_INDEX_RECORDS` | 50,000 | Pure builder safety limit | Raise only after measuring memory and CPU at the real corpus size |
| `DEFAULT_MAX_CANDIDATES` | 5 | Result cap | Raise for a broader review UI; lower for smaller secure payloads |
| `JARO_WINKLER_*` | documented in `config.ts` | Short-string/name sensitivity | Tune only with known-pair false-positive and false-negative fixtures |
| `PERSON_WEIGHTS` | 0.20/0.15/0.10/0.10/0.27/0.18 | Person field influence | Increase a field only when it is reliably populated and audited |
| `ORGANIZATION_WEIGHTS` | 0.60/0.15/0.15/0.10 | Organization field influence | Increase legal core/DBA only when naming is reliable; increase address only when current |
| `TRUST_WEIGHTS` | 0.65/0.20/0.10/0.05 | Trust field influence | Increase date or grantor only when those schema links are consistently resolved |
| nickname/phonetic/postal constants | documented in `config.ts` | Bounds non-exact boosts and exact-ZIP address evidence | Change only with labeled fixtures and review of false merges |

Threshold overrides are per call. Changing a threshold does not change normalized data or cached indexes.

## 7. Adding a new record kind

Add the discriminated record and normalized record to `types.ts`; add all weights and thresholds to `config.ts`; add a normalizer under `normalize/`; add comparators or a scorer under `compare/` and `score/`; add decision explanations and blockers under `decide/`; extend `indexing/blocking.ts` and `indexing/build.ts`; update `match.ts`; add labeled positive and negative fixtures; update this README; then run the library test suite and Homebase typecheck. Keep the new kind out of mixed indexes.

## 8. Dictionaries

Nicknames live in `normalize/dictionaries/nicknames.ts`; entity suffixes live in `entity-suffixes.ts`; trust boilerplate lives in `trust-stopwords.ts`; name particles live in `name-particles.ts`. Add entries only with a labeled positive or negative fixture, because dictionary expansion changes blocking and can increase candidate volume.

## 9. Cloudflare integration

The approved placement plan is a D1-connected service boundary for full-roster matching, keeping the full roster server-side. The pure library is ready for that caller, but Worker integration is deliberately deferred in this pass. `pnpm run dev` / the existing Next.js Homebase dev path is the primary development assumption; Vinext remains a final deployment consideration and is not required for library development.

The planned CRUD Worker work is intentionally narrow and authorization-only:

1. Add allowlisted read-resource/table policies for the matchable corpus data the caller is authorized to assemble, including the existing person, organization, trust, contact, address, user, employee, and role-lookup resources as applicable.
2. If the approved freshness design uses `match_index_version`, add its schema migration separately and add only its read authorization policy. That table is not present in the current Schema 7.0 files, so no column is invented here.
3. Keep the existing signed/encrypted payload contract, CRUD action validation, response delivery, and resource gating. Do not add fuzzy scoring, normalization, index construction, cache state, or business merge behavior to the CRUD Worker.
4. Keep any match endpoint/orchestration in the approved caller/service layer. It may request authorized payloads through the CRUD Worker, pass `corpusVersion` to `getOrBuildIndex`, and invoke this pure library; it must cap returned results and never send the full index to a browser.

No CRUD Worker file, package manifest, schema migration, endpoint, or version metadata is changed by this library implementation. The future authorization changes require separate review and approval.

The module cache is a best-effort isolate optimization. `getOrBuildIndex` skips `loadCorpus` on a warm hit when the cached version and TTL are valid; a cold miss rebuilds from the caller's corpus. Correctness does not depend on cross-isolate invalidation. Precomputed normalization columns are not in use; they should be considered only if measured cold-start cost requires them.

## 10. Performance

The following measurements were taken with the pure builder in the local Node test runner on synthetic records. They are planning measurements, not Cloudflare CPU billing measurements; the Workers design target is a cold-start build under 30 ms at the real record count.

| Records | Build CPU time | Query time | Serialized index memory |
| ---: | ---: | ---: | ---: |
| 1,000 | 10.28 ms | 1.81 ms | 525.62 KiB |
| 5,000 | 47.99 ms | 1.54 ms | 2,705.07 KiB |
| 20,000 | 170.59 ms | 4.34 ms | 11,053.80 KiB |

Query time used a narrow blocking query against the synthetic corpus. Serialized index memory is the exact UTF-8 JSON payload size for the index shape and is a reproducible lower-bound planning measure; runtime heap overhead still needs measurement in the target Worker. The 20,000-record local build exceeds the 30 ms Worker design target, so a real-corpus Worker benchmark is required before full-roster deployment. The real corpus benchmark and any decision to persist normalized columns belong to the Worker-integration phase. The library's hard builder limit is 50,000 records.

## 11. Known limitations

- Phonetic matching is English-biased and intentionally acts as a blocking/boost signal, not identity proof.
- Nickname coverage is dictionary-limited.
- Name particles, suffixes, and trust boilerplate require maintained dictionaries.
- Cache freshness is TTL/version bounded rather than immediate across Cloudflare isolates.
- This library does not infer person-to-trust relationships; scoped trust matching uses caller-supplied `grantorIds` and `trusteeIds`.
- A full-roster caller must keep the index server-side and must not serialize it into browser payloads.
