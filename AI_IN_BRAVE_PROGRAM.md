# AI in the BRAVE Program

How the program team leveraged AI to design, build, and run the BRAVE entrepreneurship program and its dashboard. **Scope: program-side AI usage only — this does not cover how students used AI in their ventures.**

## Executive Summary

AI was used at two levels:

1. **To BUILD the platform** — the entire full-stack dashboard (3 role-based dashboards, 40+ database tables, 43 API modules) was delivered in under 3 months using AI-assisted development, allowing a small team to ship at the pace of a much larger one.
2. **RUNNING INSIDE the platform** — AI works daily in production: auditing revenue proofs, analysing weekly student journals, flagging at-risk teams, generating marketing content, and answering student questions via a chatbot.

## 1. AI to Build the Platform

| Metric | Value |
|---|---|
| Development timeline | Apr 16, 2026 → Jul 9, 2026 (~12 weeks) |
| Total commits | 566 |
| Codebase size (TS/TSX, excl. generated code) | ~84,600 lines |
| API route modules | 43 |
| Database tables | 40 |
| Frontend pages | 71 |
| Reusable frontend components | 94 |
| Role-based dashboards | 3 (Student/Team, Campus Coordinator, NIAT Admin) |
| Users served in production | ~4,600 (target: 7,500 across 19–20 campuses) |
| Team size | [fill] |

The platform — covering team formation, project tracking, order book and revenue verification, leaderboards, Demo Day applications, journals, notifications, announcements, and a full admin console — was built with AI-assisted development end to end. New requirements (e.g. the GRIT Miles rollout, campus insights, membership approval flows) were typically shipped within [fill: hours/days] of being requested, with an average of ~47 commits per week over the 12-week build.

## 2. AI Running Inside the Program

Four AI capabilities run live in production:

### BRD AI Analysis (revenue verification)
Every revenue entry's BRD document is analysed by Gemini before human review — scored for **relevancy** (does the document actually evidence the claimed revenue?) and **uniqueness** (is it a duplicate/re-submission of an already-approved BRD?).
**Impact:** admins review a pre-scored queue instead of reading every PDF cold; duplicate or weak submissions are flagged automatically.
**In production:** 551 AI analyses run across 428 revenue entries submitted; 293 entries verified after AI pre-screening.

### Weekly Journal AI Analysis (early-warning system)
Each weekly team journal is analysed in a single AI call: summarised, categorised, and **blockers extracted and prioritised** (high/medium/low). High-priority blockers feed the Success Coach → COS → Admin escalation chain.
**Impact:** at-risk teams surface automatically instead of depending on someone reading ~1,000 journals a week.
**In production:** 2,394 weekly journals submitted; 837 AI-analysed so far, surfacing 270 medium/high-priority blockers (68 high) and 92 logged escalations.

### AI-Generated Instagram Reel Scripts (marketing)
The same journal analysis call also spots strong, story-worthy moments and generates ready-to-shoot Instagram reel scripts, bucketed by theme, into a reels library.
**Impact:** the marketing team gets a continuous pipeline of authentic student-story content with zero extra data collection.
**In production:** 501 ready-to-shoot reel scripts generated from 486 reel-worthy journal moments.

### In-Product AI Chatbot (student support)
A chatbot answers student questions over a BRAVE knowledge base, available directly inside the dashboard.
**Impact:** first-line support is instant and 24/7, reducing repetitive questions to coordinators.
**In production:** 1,324 questions answered for 265 distinct students.

## 3. AI / Technology Stack

| Layer | Technology |
|---|---|
| Document & journal analysis | Google Gemini 2.5 Flash |
| Chatbot | Llama 3.1 8B via Cerebras + Cloudflare Workers AI |
| Frontend | React + Vite + Tailwind (shadcn/ui) |
| Backend | Express 5 + PostgreSQL (Drizzle ORM) |
| Contract-first API | OpenAPI spec + generated client hooks/schemas |
| Hosting | Replit (autoscale deployment) |

## 4. Open Items

- [ ] Team size ([fill] in §1 metrics table)
- [ ] Typical requirement-to-ship turnaround ([fill] in §1 closing paragraph)
- [ ] Any "Nx faster than traditional development" multiplier, if leadership wants one quoted — not derivable from the repo, needs a team estimate
