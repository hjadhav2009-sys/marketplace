# Phase 7.3.6 Stage 4.2B Design Lab Guide

Open http://127.0.0.1:3188/__qa/design-lab in private synthetic staging.

Available galleries: design system, navigation, dashboard, Product Inventory,
Product Details, imports, work cards, route dialogs, scanner, problems, Data
Management and empty/loading/error.

Each gallery presents Current, Draft A and Draft B. These are audit-only
synthetic component variants and do not call production business mutations.
Without `STAGING_UI_AUDIT=true`, all Design Lab routes return 404.
