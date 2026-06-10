---
name: BRD uniqueness scoring
description: How the single BRD "Uniqueness" score is computed (Gemini AI compares stored summaries in batches; never re-uploads prior PDFs).
---

# BRD uniqueness scoring

There is ONE uniqueness score (not two). The old "within-team" + "across-teams" split
was merged into a single strict score.

**AI-driven, but text-only.** Gemini compares the CURRENT BRD's stored `brd_summary`
against the *stored summaries* of ALL approved BRDs. It is computed in `computeUniqueness`
(analyse-brd.ts) AFTER relevancy + summary extraction.

**Why:** the user explicitly chose "send all approved summaries to Gemini for a smarter
comparison" over the earlier pure rule-based approach. But prior BRD PDFs are STILL never
re-uploaded — only the current BRD PDF is ever sent to Gemini (for relevancy + summary).
Uniqueness sends only TEXT summaries, so it stays cheap.

**How to apply:**
- Candidate set = verified entries across ALL teams (same team included), `ne(self)`,
  `brdUrl` present, `aiAnalysisDetail` not null. Then a `usable` filter keeps any row whose
  stored summary has at least one of amount / reference_id / payer_name / payee_name /
  client_name non-empty (only entirely-blank summaries are skipped). NO row cap — compare
  against ALL of them.
- Candidates are relevance-sorted (same amount/date first) then split into batches of
  `AI_BATCH_SIZE` (400). EVERY batch is sent to Gemini text-only via `runAiUniquenessBatch`
  → `buildUniquenessPrompt` → `generateBrdAnalysis(apiKey, [], prompt)` (empty files array).
- **Batch-local ID validation is mandatory:** `runAiUniquenessBatch` builds its `byId` map
  from ONLY its own batch and validates AI-returned `entry_id`s against that. Never validate
  against a global map — a hallucinated id that happens to be a real candidate in another
  batch would be wrongly accepted. Do not reintroduce a shared/global `byId`.
- Merge across batches: worst flag via `worseFlag`; matches deduped by `entry_id` in a Map;
  `compared_count` = total usable candidates.
- **Final score is DERIVED from the worst flag** (duplicate=8, suspicious=45, unique=100),
  NOT min-merged from per-batch AI numbers — this guarantees score and flag never contradict.
- Per-batch AI failure is isolated: that batch falls back to `ruleBasedUniqueness` (the old
  deterministic logic, still present) so coverage is never lost. The outer
  `analyseRevenueEntryBrd` try/catch also prevents any throw to the caller.

**Stored shape (UnifiedUniqueness):** `{score, flag, summary, compared_count,
matches[{entry_id, team_id, team_name, client_name, status, brd_url, same_team,
match_flag, reason}]}`. Frontend (detailed-analysis.tsx, queue.tsx) expects exactly this —
do not change it. Old rows store legacy `uniqueness_comparison` / `cross_team_uniqueness`
shapes; frontend falls back to legacy sections when `detail.uniqueness` is absent.

**Do not touch** the relevancy score (`brd_score` / Task 1 in brd-prompt.ts) or the
`brd_summary` extraction (Task 2) when editing uniqueness — they are independent and the
user explicitly scoped uniqueness only.
