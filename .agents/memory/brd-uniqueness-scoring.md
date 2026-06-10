---
name: BRD uniqueness scoring
description: How the single BRD "Uniqueness" score is computed (rule-based, no extra LLM, no PDF re-uploads).
---

# BRD uniqueness scoring

There is ONE uniqueness score (not two). The old "within-team" + "across-teams" split
was merged into a single strict score.

**Rule-based, computed in code — NOT by the LLM.** Gemini only does relevancy
(`brd_score`, Task 1) and structured `brd_summary` extraction. Uniqueness is computed
afterward in `computeUniqueness` (analyse-brd.ts) by comparing the new BRD's *stored*
`brd_summary` against the *stored* summaries of other approved BRDs.

**Why:** previous design re-uploaded prior BRD PDFs to Gemini for comparison, which was
slow and token-expensive. Now only the CURRENT BRD PDF is ever sent to Gemini.

**How to apply:**
- Candidate set = verified entries across ALL teams (same team included), `ne(self)`,
  `brdUrl` present, prefiltered by exact `amount` + exact `paymentDate`. NO row limit —
  the requirement is to compare against *all* approved BRDs (the exact amount+date
  prefilter keeps the set naturally tiny). Do not reintroduce a `.limit()`.
- Refine via stored `brd_summary`: same amount+date + (reference_id OR payer OR payee
  match) → duplicate (score 8); same amount+date only → suspicious (45); else unique (100).
- Score written to BOTH the `uniqueness_score` column and `aiAnalysisDetail.uniqueness`.

**Backward compat:** old rows stored legacy `uniqueness_comparison` + `cross_team_uniqueness`
shapes. Frontend (detailed-analysis.tsx) renders the unified section when
`detail.uniqueness` exists and falls back to the legacy sections otherwise. Route helpers
(enrichComparisonUrls/extractBrdSummaryText) no-op safely on the new shape.

**Do not touch** the relevancy score (`brd_score` / Task 1 in brd-prompt.ts) when editing
uniqueness — they are independent and the user explicitly scoped uniqueness only.
