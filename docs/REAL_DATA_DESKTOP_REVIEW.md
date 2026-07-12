# Real Data Desktop Review

After the deliberate migration succeeds, start the site:

```powershell
cd E:\marketplace1\marketplace
npm.cmd run real-review:start
```

Open `http://localhost:3001/owner/manual-review`, sign in as Owner, and select each seller account in turn. Review Dashboard, Accounts, Users, Imports, Listings, Marking Library, Process Rules, Customer Picker, Assembly, Customer Packing, Consignments, Consignment Pick/Mark/Pack, Universal Scanner, Problems, Reports, and System.

At 360, 390, 430, 768, 1024, and 1440 px check route errors, authorization, identifiers, image fallbacks, status text, action visibility, overflow, navigation overlap, and empty-state guidance. Empty pages remain empty until current data is imported or configured; never seed the real database to fill them.

Before review, run `npm.cmd run real-db:verify` and confirm the private backup still exists. Stop the server with `Ctrl+C` in its terminal.

## Issue Template

```text
Page:
Login user:
Selected account:
Record identifier:
Action:
Expected:
Actual:
Screenshot:
Severity: BLOCKER | WORKFLOW | PERMISSION | UI | TEXT | SUGGESTION
Notes:
```

Do not commit screenshots or customer/order data. Use masked identifiers in issue reports.
