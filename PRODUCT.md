# Marketplace Pick & Pack

## Product

Marketplace Pick & Pack is an internal warehouse operations application for owners and workers handling marketplace orders, consignments, product inventory, imports, marking, assembly, packing, exceptions, accounts, users, reports, and system administration.

## Platform

web

## Users and jobs

- Owners configure seller accounts, import marketplace data, review operational health, resolve exceptions, manage product/process truth, administer workers, and protect retained warehouse data.
- Workers scan or find exact account-scoped work, perform Pick, Mark, Assembly, and Pack tasks, preserve quantities and provenance, and report problems without crossing permissions or seller accounts.
- The interface must support desktop administration and dense warehouse use on handheld/mobile-sized screens.

## Product truths

- Seller-account isolation, role and capability permissions, auditability, idempotency, preserved source data, and explicit workflow state are non-negotiable.
- The browser interface is an operational tool, not a marketing surface. It should optimize recognition, safe action, speed, error recovery, and legibility under repeated use.
- Marketplace-specific identities and workflows must be explicit. Amazon and Flipkart are not interchangeable labels or import paths.
- A scan or search never mutates work by itself. State-changing actions remain explicit and confirmable.
- Missing instructions, identifiers, images, mappings, or permissions must be stated honestly; the UI must not invent warehouse facts.
- Current business logic, routes, database behavior, permissions, imports, reports, workflows, and the mobile app are frozen during Phase 7.4 UI work unless a later task explicitly changes that scope.

## Voice

Direct, calm, operational, and specific. Prefer short labels, concrete quantities, marketplace/account context, and actionable recovery guidance. Avoid promotional language, whimsy, decorative metaphors, and vague success messages.

## Accessibility and device constraints

- Keyboard access and visible focus are required.
- Operational targets should be at least 44 CSS pixels; scanner-first controls may be larger.
- Information cannot rely on color alone.
- Reduced-motion preferences must be respected. High-frequency worker actions should not use decorative motion.
- At 390 px, workflows must remain usable without document-level horizontal scrolling.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, Prisma, SQLite for current local/staging operation, and a maintained PostgreSQL schema/migration track for the planned production transition.

## Current phase

Phase 7.4A is an audit and design-system planning checkpoint. It documents current behavior and proposes bounded implementation chunks; it does not authorize runtime UI changes, business-logic changes, database migration, mobile-app changes, deployment, or merging.
