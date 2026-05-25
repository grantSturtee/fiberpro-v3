# GrantEd — Open Items

## Company Portal
- [ ] Add /company/profile route so company users can edit their profile (avatar is currently non-clickable)
- [ ] Decide: should PMs be able to submit projects from the projects list page? Currently gated to company_admin only. PMs can still access /company/submit directly.

## Status System
- [ ] Legacy status/billing_status columns still referenced in ~350 read/filter paths — migration 20260520000004 is staged and ready to apply once all read paths are switched to unified_status
- [ ] displayStatus variable in admin/projects/[id]/page.tsx still used by resolveActiveTab — needs cleanup when tab routing pass happens

## Pre-existing Bugs (unrelated to current work)
- [ ] src/app/(admin)/admin/settings/authorities/actions.ts:128 — TS2353: success not in AuthorityActionState
- [ ] src/app/(admin)/admin/users/page.tsx:45 — TS2538: null as index type
