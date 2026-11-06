-- =============================================================================
-- LEGACY NOTE: retained for pre-Schema_6.0 reference only. Do not use this
-- file for KR Homebase Front End Publishing after Patch 98; use
-- schema_public_content_v6.sql, which supports only Article and Answer.
-- Schema_Articles_v1 seed data
-- Database name: krhomebase_articles_06_01_2026
-- Source: MWZ marcus-wireframe_05_28 route/content prototype
-- =============================================================================

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO article_author (id, display_name, role_label, initials, public_bio_url) VALUES
('author_marcus_richard', 'Marcus Richard', 'Partner', 'MR', '/attorneys#marcus-richard'),
('author_daniel_krueger', 'Daniel Krueger', 'Partner', 'DK', '/attorneys#daniel-krueger');

INSERT OR IGNORE INTO content_category (id, slug, label, description, sort_order) VALUES
('cat_estate_planning', 'estate-planning', 'Estate Planning', 'Wills, trusts, powers of attorney, beneficiary planning, and trust funding audits.', 10),
('cat_medicaid_planning', 'medicaid-planning', 'Medicaid & Elder Law', 'Lookback analysis, MAPTs, spousal protection, crisis planning, guardianship, and Department of Veterans Affairs coordination.', 20),
('cat_business_succession', 'business-succession', 'Business Succession', 'Buy-sell mechanics, transition planning, and governance design.', 30),
('cat_entity_structure', 'entity-structure', 'Entity & Structure', 'LLCs, PLLCs, corporations, series LLCs, holding-company architecture, and owner records.', 40),
('cat_tax_planning', 'tax-planning', 'Tax Planning', 'Federal exemption modeling, portability, and sunset planning.', 50),
('cat_probate_trust_admin', 'probate-trust-administration', 'Probate & Trust Administration', 'Executor, trustee, creditor, and distribution administration.', 60),
('cat_litigation_probate', 'litigation-probate', 'Litigation & Probate', 'Will contests, fiduciary disputes, probate venue, and trust litigation.', 70);

INSERT OR IGNORE INTO article (id, slug, title, summary, dek, body_markdown, category_slug, category_label, author_id, author_display_name, status, reading_minutes, thumbnail_alt, published_at, canonical_path, sort_order) VALUES
('article_buy_sell_that_wasnt', 'buy-sell-agreement-that-wasnt', 'The buy-sell agreement that wasn’t.', 'A funded buy-sell is not the same as a signed one. The gap that takes down family businesses.', 'A buy-sell agreement that triggers on death, divorce, or departure protects nothing if it is not funded. The gap that takes down family businesses.', '## The signature is not the plan.
Every closely-held business eventually faces the same three-question problem: what if an owner dies, divorces, or wants out? The standard answer is a buy-sell agreement, but a contract alone does not create liquidity, authority, or a family transition path.

## Trigger, valuation, funding — the three legs.
A buy-sell stands on trigger language, valuation language, and funding. Drop one and the table falls. Trigger language defines the event. Valuation language decides the price. Funding explains how the money actually shows up.

## What to ask of your own plan.
Is the trigger language current with the ownership and family structure? Is the funding mechanism in place today? Does the estate plan acknowledge the buy-sell, and does the buy-sell acknowledge the estate plan?', 'business-succession', 'Estate Planning', 'author_marcus_richard', 'Marcus Richard', 'published', 8, 'Business succession article thumbnail', '2026-05-14T12:00:00.000Z', '/articles/buy-sell-agreement-that-wasnt', 10),
('article_five_year_lookback_plain_english', 'five-year-lookback-in-plain-english', 'Five-year lookback, in plain English.', 'What the lookback actually measures, when the clock starts, and the three mistakes that reset it.', 'The Medicaid lookback is not a myth or a simple waiting period. It is an evidence review that has to be mapped before filing.', '## What the lookback measures
The lookback reviews transfers during the agency review period. It asks what changed hands, when it changed hands, why it changed hands, and whether value was received.

## When the clock starts
The clock is driven by the program rules and the filing timeline. Families should inventory transfers before the application so the written position matches the records.

## The mistakes that reset confidence
Unexplained gifts, informal loans, and partial records can create avoidable follow-up questions. A clean map gives the family and the agency the same fact pattern.', 'medicaid-planning', 'Medicaid', 'author_marcus_richard', 'Marcus Richard', 'published', 12, 'Medicaid lookback article thumbnail', '2026-05-16T12:00:00.000Z', '/articles/five-year-lookback-in-plain-english', 20),
('article_three_horizons_family_business', 'three-horizons-for-family-business-owners', 'Three horizons for family-business owners.', 'Day one, transition, generational — and the document that maps all three together.', 'Family-business planning works best when the first year, the transition period, and the next generation are planned together.', '## Horizon one: day one
The operating documents need to match the current owners, roles, capital accounts, and signing authority.

## Horizon two: transition
The plan should define what happens when an owner slows down, becomes disabled, sells, divorces, or dies.

## Horizon three: generational
The estate plan, tax plan, and governance plan should show the family how ownership and control pass without turning business pressure into family litigation.', 'business-succession', 'Succession', 'author_marcus_richard', 'Marcus Richard', 'published', 10, 'Family business horizons article thumbnail', '2026-05-18T12:00:00.000Z', '/articles/three-horizons-for-family-business-owners', 30),
('article_series_llcs_when_they_earn_their_keep', 'series-llcs-when-they-earn-their-keep', 'Series LLCs: when they earn their keep.', 'Series LLCs solve one problem and create three. A Texas-specific examination of when the math works.', 'A series LLC can be efficient, but only when the recordkeeping and risk profile justify the structure.', '## The problem they solve
A series LLC can separate assets or activities under one parent structure. That may reduce administrative friction for the right portfolio.

## The problems they create
Banking, insurance, contracts, bookkeeping, and owner discipline all become more important. The liability theory only helps if the formalities are real.

## When the math works
The structure deserves consideration when multiple similar assets need segmented records and the owners will maintain the paperwork.', 'entity-structure', 'Entity', 'author_marcus_richard', 'Marcus Richard', 'published', 7, 'Series LLC article thumbnail', '2026-05-20T12:00:00.000Z', '/articles/series-llcs-when-they-earn-their-keep', 40),
('article_tcja_sunset_three_scenarios', 'tax-cuts-and-jobs-act-sunset-in-three-scenarios', 'The Tax Cuts and Jobs Act sunset, in three scenarios.', 'What happens to estate exemptions in 2026, and the three families who should care most.', 'Estate-tax planning should be modeled by family scenario, not guessed at from headlines.', '## Scenario planning beats guessing
The exemption conversation changes depending on asset value, asset type, business ownership, and family goals.

## Who should care most
Families with appreciating businesses, ranch land, closely held entities, or concentrated investment assets should model options before the deadline controls the decision.

## Coordinate the documents
Tax strategy should not contradict the trust, the buy-sell agreement, Medicaid planning, or the administration plan.', 'tax-planning', 'Tax', 'author_daniel_krueger', 'Daniel Krueger', 'published', 15, 'Estate tax scenario article thumbnail', '2026-05-21T12:00:00.000Z', '/articles/tax-cuts-and-jobs-act-sunset-in-three-scenarios', 50),
('article_executor_will_not_communicate', 'when-the-executor-will-not-communicate', 'When the executor will not communicate.', 'Texas probate provides tools for stalled administrations. The sequence to follow.', 'Silence from a fiduciary is not just frustrating. It can signal a stalled estate administration that needs a formal response.', '## Start with the record
Before escalating, collect the letters, filings, accountings, emails, and unanswered requests. The record tells whether the issue is delay, confusion, or misconduct.

## Ask in writing
A clear written request narrows the dispute and gives the fiduciary an opportunity to respond.

## Use the court tools when needed
Texas probate provides mechanisms for accountings, status conferences, and fiduciary accountability when communication breaks down.', 'probate-trust-administration', 'Probate', 'author_daniel_krueger', 'Daniel Krueger', 'published', 9, 'Executor communication article thumbnail', '2026-05-22T12:00:00.000Z', '/articles/when-the-executor-will-not-communicate', 60),
('article_will_contests_four_early_signals', 'will-contests-the-four-early-signals', 'Will contests: the four early signals.', 'By the time a contest is filed, it has usually been forming for two years. The signs to watch.', 'A will contest often starts long before a pleading is filed. The early signals help families preserve records while memories are fresh.', '## Isolation
A vulnerable person becomes harder to reach, and one family member controls access.

## Sudden document changes
New beneficiaries, changed fiduciaries, or unexplained codicils deserve careful documentation.

## Capacity concerns
Medical records, witness notes, and contemporaneous observations matter more than family impressions.

## Missing explanations
The more surprising the plan, the more important it is to preserve the reasons for it.', 'litigation-probate', 'Litigation', 'author_daniel_krueger', 'Daniel Krueger', 'published', 11, 'Will contest article thumbnail', '2026-05-23T12:00:00.000Z', '/articles/will-contests-the-four-early-signals', 70),
('article_spousal_protection_medicaid_crisis', 'spousal-protection-in-a-medicaid-crisis', 'Spousal protection in a Medicaid crisis.', 'The community-spouse rules that protect the house, the income, and the dignity.', 'Medicaid crisis planning is a household-stability analysis. The spouse still at home needs a written protection strategy.', '## Start with the household
A Medicaid crisis is rarely only a benefits question. It is usually a household stability question. The first review is what must be preserved for the spouse still living at home.

## Then map the assets
The house, retirement accounts, bank accounts, vehicles, and exempt resources should be mapped before anyone transfers property. Transfers without a plan can create avoidable penalty periods.

## Build the written position
A strong application explains the facts clearly and keeps backup records attached to each claim. That written position matters when the agency asks follow-up questions.', 'medicaid-planning', 'Elder Law', 'author_marcus_richard', 'Marcus Richard', 'published', 6, 'Spousal Medicaid protection article thumbnail', '2026-05-24T12:00:00.000Z', '/articles/spousal-protection-in-a-medicaid-crisis', 80),
('article_trust_funding_plan', 'trust-funding-is-the-plan', 'Trust funding is the plan.', 'A signed trust with nothing in it does nothing. The audit few firms run — until it is too late.', 'The trust document is only the beginning. Funding is the step that makes the plan work in the real world.', '## Signing is not funding
A trust can be beautifully drafted and still fail if the assets remain outside it. Deeds, account titles, beneficiary designations, and business interests all need their own review.

## The audit is the deliverable
Every estate-planning engagement should end with a written funding map: what moved, what did not move, and what the client must still confirm.

## Revisit after life changes
New accounts, refinanced property, and changed family roles can knock a plan out of alignment. A periodic audit catches the drift.', 'estate-planning', 'Estate', 'author_daniel_krueger', 'Daniel Krueger', 'published', 14, 'Trust funding article thumbnail', '2026-05-25T12:00:00.000Z', '/articles/trust-funding-is-the-plan', 90);

INSERT OR IGNORE INTO question_pillar (id, slug, title, description, accent_css, sort_order) VALUES
('pillar_estate_planning', 'estate-planning', 'Estate planning', 'Wills, trusts, powers of attorney, beneficiary planning, and the audits that make sure paper actually protects.', 'var(--mfe-deep-navy)', 10),
('pillar_medicaid_planning', 'medicaid-planning', 'Medicaid & elder law', 'Lookback analysis, Medicaid Asset Protection Trust structuring, spousal protection, crisis planning, guardianship, Department of Veterans Affairs coordination.', 'var(--mfe-warm-camel)', 20),
('pillar_business_succession', 'business-succession', 'Business & succession', 'Entity design, buy-sell mechanics, transfer planning, governance architecture across the three horizons.', 'var(--mfe-dark-camel)', 30),
('pillar_litigation_probate', 'litigation-probate', 'Litigation & probate', 'Will contests, fiduciary disputes, probate venue, trust litigation, breach-of-fiduciary-duty claims.', 'var(--mfe-light-denim)', 40);

INSERT OR IGNORE INTO answer_topic (id, pillar_slug, slug, question, summary, answer_markdown, status, author_id, author_display_name, published_at, sort_order) VALUES
('answer_will_or_trust', 'estate-planning', 'do-i-need-a-will-or-a-trust', 'Do I need a will or a trust?', 'If your estate is composed largely of real estate or you want to avoid probate, you likely need a revocable living trust and a pour-over will.', '## The short version.
Wills and trusts solve overlapping problems. Both designate who receives what. Only one of them keeps your estate out of probate. Both can name guardians for minor children through coordinated documents.

## The decision factors.
You likely need a trust if you own real estate, wish to keep your estate private, have a blended family, have substantial net assets, or want continuity if you become incapacitated. A will alone may suffice if your estate is mostly beneficiary-designated accounts, you accept probate, and your estate is small enough for simplified procedures.

## Key law and facts.
Texas provides independent administration, while Kansas generally requires a more formal probate process by default. Revocable living trusts are governed by state trust law and still require correct funding.', 'published', 'author_daniel_krueger', 'Daniel Krueger', '2026-05-28T12:00:00.000Z', 10),
('answer_trust_funding', 'estate-planning', 'what-does-it-mean-to-fund-a-trust', 'What does it mean to fund a trust?', 'Funding is the process of aligning account titles, deeds, and beneficiary designations with the plan.', 'A trust is funded when the right assets have been moved into it or coordinated with it. Real estate may need a deed. Bank and investment accounts may need new ownership forms. Retirement and insurance assets usually need beneficiary-designation review instead of a retitle.

The important point is that signing a trust does not automatically move property. The funding checklist is where the legal plan becomes operational.', 'published', 'author_daniel_krueger', 'Daniel Krueger', '2026-05-28T12:00:00.000Z', 20),
('answer_medicaid_lookback', 'medicaid-planning', 'how-does-the-medicaid-lookback-work', 'How does the Medicaid lookback work?', 'The lookback is the agency review period for transfers that may affect eligibility.', 'The Medicaid lookback is a review period during which transfers can be examined for eligibility consequences. A transfer made without a planning reason can create a penalty period.

The analysis depends on the date, the asset, the recipient, the reason for the transfer, and the state program rules. Families should map transfers before filing, not after an agency question arrives.', 'published', 'author_marcus_richard', 'Marcus Richard', '2026-05-26T12:00:00.000Z', 30),
('answer_buy_sell', 'business-succession', 'why-does-my-estate-plan-need-my-buy-sell-agreement', 'Why does my estate plan need my buy-sell agreement?', 'The estate plan and the operating documents should name the same transition path.', 'The buy-sell agreement controls what happens to ownership interests when a trigger event occurs. The estate plan controls who can act for the owner and who receives value. If those documents conflict, the family and business can lose time and leverage.

A coordinated review checks ownership, valuation, funding, voting rights, and fiduciary authority in one place.', 'published', 'author_marcus_richard', 'Marcus Richard', '2026-05-22T12:00:00.000Z', 40);

INSERT OR IGNORE INTO answer_faq (id, answer_topic_id, question, answer, sort_order) VALUES
('faq_will_trust_tax', 'answer_will_or_trust', 'Does a trust mean I avoid estate tax?', 'No. A revocable living trust is tax-neutral. Federal estate tax is determined by the size of the taxable estate, not the container that holds assets.', 10),
('faq_will_trust_online', 'answer_will_or_trust', 'Can I create my own trust online?', 'You can sign a document labeled as a trust online, but whether it works depends on titling, beneficiary designations, powers of attorney, and state-law fit.', 20),
('faq_will_trust_move_states', 'answer_will_or_trust', 'What if I move states?', 'A trust drafted in one state generally remains valid in another, but powers of attorney, healthcare directives, and local probate mechanics often need review.', 30),
('faq_trust_funding_assets', 'answer_trust_funding', 'Does every asset go into a trust?', 'No. Retirement accounts, insurance, and some transfer-on-death assets often coordinate by beneficiary designation.', 10),
('faq_trust_funding_later', 'answer_trust_funding', 'Can funding be done later?', 'Sometimes, but delay is where many trust plans fail. Funding should be tracked while the file is open.', 20),
('faq_medicaid_impossible', 'answer_medicaid_lookback', 'Does the lookback mean planning is impossible?', 'No. It means timing and documentation are critical.', 10),
('faq_medicaid_house', 'answer_medicaid_lookback', 'Should we transfer the house immediately?', 'Not without advice. The home may receive special treatment, but facts matter.', 20),
('faq_buy_sell_operating_agreement', 'answer_buy_sell', 'Is an operating agreement enough?', 'Usually not. It should be coordinated with the trust, will, powers of attorney, and tax plan.', 10);

INSERT OR IGNORE INTO newsletter_issue (id, slug, title, summary, body_markdown, status, author_id, author_display_name, published_at, sort_order) VALUES
('issue_may_2026', 'may-2026-one-page-plan', 'The one-page plan that found the gap.', 'A short note on why estate, business, and Medicaid reviews belong on one map.', 'This issue looks at the one-page synthesis we use to show how a family, a business, and a long-term-care plan interact. The goal is not decoration. The goal is to see the gap before a deadline exposes it.', 'published', 'author_marcus_richard', 'Krueger & Richard', '2026-05-28T12:00:00.000Z', 10);

