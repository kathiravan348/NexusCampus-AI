# Nexus Control — guide for our staff

> State as of: 2026-11-23 (Stage 2 complete through NEX-137: Nexus Control prototype + real Control backend for all P01–P18 pages, M84 install agent & D60 signed pull-only commands, P04 provisioning & four-eyes offboarding with signed shred certificates, P07 release publishing & rollouts, P10 access broker, P18 7-step portability moves, D62 Razorpay INR payment links, OpenBao root-token revocation, and NEX-110/137 security & release checks).
> Plain language for provider staff: sales, billing, support, implementation, release managers, site reliability,
> security officers and partners. Default English texts are in **bold**.

## What Nexus Control is

Nexus Control is where we run the business: customers, plans and quotes, billing, licences, the fleet of cells and
installs, releases, support and partners. It holds **business and technical records only**. It never holds an
institution's learners, families or staff — and nobody here can open them. Support access to an institution's data
happens only when **that institution** approves a request in its own app, for a limited time, and every action is
recorded in its own activity log.

## Signing in

- **Demo:** open Nexus Control, pick a staff member on **Sign in to Nexus Control**, and you see it with their roles.
  The yellow bar **Demo data. Nothing on this screen is real.** is always shown in the demo.
- **Real installations:** sign in with your work email and password, then the 6-digit **one-time code** from an
  authenticator app on your phone (any TOTP app). The first time, the sign-in page shows a QR code to set the app up.
  Every sign-in asks for a new code — a password alone never gets you in. Your session lasts at most 60 minutes.
  The green shield next to your name means **Multi-factor login verified**. Start with **Sign in with your work
  account**; **Sign out** ends your session in Nexus Control and in the sign-in service.
- **For developers:** `uv run --project backend nexus-control-dev` (Control backend, port 8100) and
  `pnpm --dir frontend dev:control:real` (the app on port 3200, talking to it).
- **Sign out** with the arrow button at the top. Closing the browser tab also signs you out; Nexus Control keeps no
  data in the browser.

## The screen

- The menu shows only the pages your roles allow. Your name and **Roles: …** are at the top.
- If you open a page your roles do not include, you see **No access**. Ask a super admin if you need it.
- **Language** (bottom of the menu): English, Hindi or Tamil. The moon/sun button switches dark and light.
- Demo only: the staff picker at the top (tablet and wider) switches to another staff member.

### Accounts

Menu **Accounts** (roles with account access: super admin, sales, billing, support, implementation, security
officer, partner).

- The list shows every customer you may see: name, **Type**, **Model** (SaaS shared, SaaS dedicated, Self-hosted,
  Hybrid), **Stage** (Lead, Trial, Customer, Churned), **Learners** (a count only), **Health** and **Renewal**.
  Health: 70 or more **Healthy**, 50–69 **Watch**, under 50 **At risk**.
- **Search accounts**, **Stage** and **Delivery model** narrow the list. Click a name to open the account.
- The account page shows a **Summary** and four tabs: **Contacts** (the customer's billing, technical, executive and
  data-protection contacts), **Opportunities**, **Contracts** and **Notes**.
- **Notes:** sales and super admins type a note and press **Add note**. Write business notes only — never personal
  details of the institution's learners, families or staff. Other roles read notes.
- **Partners** see only the customers their own company manages; any other account says it does not exist.

### Pricing & quotes

Menu **Pricing & quotes** (super admin, sales, billing, partner).

- **Catalogue:** every plan, add-on, AI credit pack, self-hosted licence edition and support contract. Pick a
  country under **Prices for** to see its price and tax rate; items we do not sell there say **Not sold here**.
- **Quotes:** number, account, status (Draft, Sent, Accepted, Expired), total with tax and **Valid until**.
- **Send** a draft quote (sales, super admin, partner for their own customers). A quote marked **AI draft** was
  written by AI: the dialog asks you to check every line, quantity and discount, and **Send quote** stays off until
  you tick **I checked this AI draft**.

### Billing

Menu **Billing** (super admin, billing).

- **Invoices:** number, account, status (**Open**, **Overdue**, **Paid** …), issue and due dates, tax (**GST**,
  **VAT** or **No tax**) and total in the invoice's currency.
- **Record transfer** (billing staff) on an open or overdue invoice when the money arrived by bank transfer: type
  **Our bank reference** from our statement and press **Record payment**. Never type the customer's bank account
  details. The invoice becomes **Paid**, its reminders stop and a past-due subscription becomes active again.
- **Subscriptions:** plan and add-ons, status, monthly or annual, learners billed and the current period.
- **Payments:** method, the gateway (**Razorpay**, **Stripe** or **Bank (recorded by hand)**) with its reference.
  Card and bank numbers are never stored. For Indian INR invoices, Nexus Control creates a hosted **Razorpay** payment
  link (card, UPI, or netbanking only) and marks the invoice **Paid** automatically when Razorpay's signed webhook
  arrives, clearing reminders, reactivating past-due subscriptions, and notifying Lago.
- **Reminders:** each account's reminder stage. Reminders end at **Read-only** — the institution can still read and
  export everything; billing never deletes an institution's data.

### Provisioning

Menu **Provisioning** (super admin, implementation, site reliability to read).

- **New tenants:** one card per job with its five steps — create the tenant in its region cell, create its keys in
  the vault, apply the institution type profile, load starter settings, invite the institution owner — each marked
  **Waiting**, **Running**, **Done** or **Failed**.
- **Start trial tenant** (implementation, super admin): pick the account (leads and trials that are not
  self-hosted), **Data region** (the tenant's data never leaves it), institution type, plan, shared or dedicated
  cell and 1–60 trial days. In the demo, **Run next step** completes the next step; after the first one the card
  shows the new tenant id. In real mode (`dev:control:real`), **Start trial tenant** queues a signed provisioning
  command for the region cell and the job updates automatically as the cell finishes each step (manual **Run next
  step** is demo only; failed jobs can be retried).
- **Offboarding:** customers leaving — their encrypted export, the destruction of their keys (the data becomes
  unreadable) and the signed **Key-destruction certificate** with the key ids, time and signing key. In real mode,
  offboarding freezes writes on the cell, creates an encrypted export for the institution's public key, waits for staff
  to confirm the institution received the file, requires **two different staff members** to approve key destruction,
  and issues an Ed25519-signed certificate that anyone can verify offline using our published shred-certificate keys.
- **When a cell does not answer:** every instruction Control sends to a region cell is valid for a limited time. If the
  cell has not carried it out in time, the step that waited is marked **failed** (within about a minute, even if the
  cell is offline), and a failed provisioning, offboarding or move job can be retried, which sends a fresh
  instruction. A support access request whose instruction expired shows as **expired**; file a new one. Nothing is
  retried automatically: a person decides.

### Licences

Menu **Licences** (super admin, implementation, support to read).

- One card per self-hosted licence: edition (**Standard** or **Enterprise**), state (**Active**, **Grace period**,
  **Read-only**, **Expired**, **Revoked**), **Learners** used against the cap (only when the install reports counts;
  an air-gapped install says **Usage not reported**), expiry or **Perpetual**, **Support and updates until**, grace
  days, campuses, modules, online or offline activation, the signing key and the file fingerprint.
- When a licence expires the install keeps working during the grace period, then becomes read-only. It never loses
  data.
- **Renew for a year** (implementation, super admin): a term licence moves its expiry and support end by a year; a
  perpetual licence moves its support end. Then **Download licence file** and send it to the customer — for an
  air-gapped site on encrypted media.

### Fleet

Menu **Fleet** (super admin, site reliability, support, implementation, release manager, security officer).

- The top row counts deployments by health: **Healthy**, **Degraded**, **Down**, **Unknown**.
- The table lists every **Shared cell**, **Dedicated cell**, **Self-hosted** install and **Edge node** with its
  version and channel (**Stable**, **Long-term support**, **Preview**), health, last check-in and tenants. An
  air-gapped install says **Air-gapped — never checks in**: there is no network path into it, by design.
- **Show check-in** opens the latest check-in: uptime, error rate, response time, queue, disk and active users.
  Check-ins carry counts, rates and timings only — never personal data.
- **Signed commands:** Nexus Control never connects into a cell or self-hosted install. Instead, each connected install
  polls for signed work items with its own deployment token and reports back when done. Air-gapped installs never
  receive commands.

### Releases

Menu **Releases** (super admin, release manager; support, implementation and site reliability read).

- One release train for SaaS and self-hosted. The table shows version, channel, status (**Draft**, **Published**,
  **Withdrawn**), publish date, **Signed** and **Offline bundle** (for air-gapped sites). **AI-drafted notes** marks
  notes written by AI.
- **Details** shows the oldest version that can upgrade directly, the migration notes (migrations only go forward)
  and the rollout rings: ring 0 is our own cell, ring 3 is everyone on the channel.
- **Sign and publish** a draft (release managers). For AI-drafted notes you must tick **I reviewed the AI-drafted
  release notes** first. In real mode, a draft publishes only after its signed manifest has been imported and verified
  against our release signing keys. **Start ring** starts the next ring once earlier rings are done (in real mode the
  ring stays **Running** until every deployment in it checks in at the new version, then moves to **Done**).

### Extensions

Menu **Extensions** (super admin, release manager, support to read).

- Customer-specific work lives in signed extension packages, never in a copy of the product. Each card shows the
  package, its customer, version, build date and **Signed**.
- **Release checks** show how the package fares with upcoming releases: **Compatible**, **Works, needs attention**
  (with notes on what must change) or **Incompatible**. A check marked **AI-drafted check — a person must confirm
  it** was written by AI and is only advice until a release manager confirms it.

### Support

Menu **Support** (super admin, support, implementation, site reliability; partners read their customers' tickets).

- The ticket list shows subject and number, account, priority (**P1** urgent to **P4** low), status (**New**,
  **Open**, **Waiting for customer**, **Resolved**, **Closed**), **Respond by** with **SLA missed** when late, and who
  it is **Assigned to**. Filter by **Status**. Below it, **SLA targets** per support tier (hours per priority;
  **24/7** for enterprise).
- Open a ticket to read the conversation. **Internal note** entries are only for our staff; **AI draft, checked by
  staff** marks replies that began as an AI draft. A **Linked access request** shows the request the institution
  approves or denies in its own app — we never decide our own access.
- **Reply** (support staff): type and **Send**, or tick **Internal note (customer does not see it)**. Answering an
  unassigned ticket assigns it to you; a reply to the customer sets **Waiting for customer**, while an internal note
  opens a **New** ticket and keeps other statuses unchanged. Closed tickets are read-only. Never paste learner,
  family or staff records — ask for a scrubbed diagnostic bundle instead.
- **Partners** see only their own customers' tickets and replies; **SLA targets** and help articles are shown only to
  our staff. In real mode (`dev:control:real`), Support reads and saves replies directly in the Control database.

### Access requests

Menu **Access requests** (super admin, support; site reliability and security officers read).

- We never open an institution's data on our own. **Requests** lists every request: institution, modules and
  **read only** or **read and edit**, hours, the status the institution set (**The institution decides**,
  **Approved by the institution**, **Denied by the institution**, **Revoked by the institution**, **Ended**), who
  asked and the reason.
- **Request access** (support): pick the institution, an optional ticket, the modules (the data vault itself can
  never be chosen), read or edit, 1–72 hours and a reason the institution will read, then **Send request**. The
  institution's admin sees it under **Data vault & access** in their own app and approves or denies it. In real mode,
  Control queues a signed command for the institution's cell and updates the request when the cell reports the
  institution's decision back — Control never decides access itself.
- **Sessions:** each approved, time-boxed session, who used it, its window and how many actions were recorded.
- **Break-glass:** only for a legal order or a security incident, approved by two different people; the institution
  is told at once and later gets a report — **Report still owed to the institution** until it is delivered.

### Usage

Menu **Usage** (super admin, sales, billing, support, site reliability).

- One card per customer with the last period's **Learners**, **Staff**, **Storage (GB)**, **AI credits** and
  **Messages**. A metric with a cap shows a bar (amber from 80 %, red at the cap); without a cap it shows the count
  and **no cap**. Each line says whether it comes from a tenant in our cells or a self-hosted install.
- **Metric** narrows the cards. Only counts are metered — never who. Air-gapped installs report nothing.

### Partners

Menu **Partners** (super admin, sales, partner users).

- One card per reseller: tier (**Registered**, **Silver**, **Gold**), country, commission rate and start date, the
  **Customers** it manages, its **Deal registrations** and its **Commissions** (**Pending**, **Payable**, **Paid**).
- Partner users see only **Your deal registrations** for their own customers.

### Staff

Menu **Staff** (super admin, security officer).

- Everyone who can sign in to Nexus Control: name and work email, **Partner user** or **Inactive** when it applies,
  roles, **Multi-factor login** (**Enrolled**, or **Missing — cannot sign in**) and last sign-in.
- Every staff session needs multi-factor login. No role can read an institution's data — support access always needs
  the institution's approval.

### Trust

Menu **Trust** (super admin, security officer).

- **Certifications**: ISO/IEC 27001, ISO/IEC 27701, SOC 2 Type II and CERT-In empanelment with **Planned**,
  **In audit**, **Certified** (and the expiry date) or **Lapsed**.
- **Security incidents**: title, detection date and affected customers, severity, status and the **Breach
  notification** clock — **No personal data affected**, **Notify by** a date, or **Notified … on time / late**.
  Reports drafted by AI are marked; a security officer checks them.
- **Sub-processors**: company, purpose, country, whether the agreement is signed, and whether it can ever reach
  institution data (only the hosting provider can).
- **Customer data agreements**: the agreement version each customer signed and when.

### Projects

Menu **Projects** (super admin, implementation).

- One card per implementation project: customer, **Status** (**Planned**, **In progress**, **Live**, **On hold**),
  kind (**Onboarding**, **Data migration**, **Self-hosted install**, **Training**), lead consultant and go-live date.
- The checklist shows "2 of 3 tasks done", each task with its due date; an open task past its date is **Overdue**.
- **AI draft — check before sharing** marks a plan drafted by AI; a consultant checks it before the customer sees it.
- Use **Status** to show one status only.

### Analytics

Menu **Analytics** (super admin, sales, billing).

- The latest month: **Monthly recurring revenue**, **Annual recurring revenue**, **Active customers**, **Net revenue
  retention**, **Gross churn** and **Open tickets**, with the change from the month before (green when it is good).
- **Last 12 months**: revenue, customers, new and lost customers, retention and open tickets per month.
- **Customer health (AI estimate)**: score (0–100), **Churn risk** (**High** first) and the reasons in words. It is a
  hint from AI, not a decision — a person decides whether to act.

### Sandboxes

Menu **Sandboxes** (super admin, sales, implementation; release manager reads).

- Every **Sales demo** and **Staging clone**: customer (or **Not tied to a customer**), institution type and region,
  **Data** (**Synthetic data** for demos, **Masked copy** for staging clones), version, status and expiry date.
- A sandbox never holds real institution data, and every sandbox expires on its own.

### Moves

Menu **Moves** (super admin, implementation; site reliability reads).

- One card per tenant move: customer, status, direction (**SaaS → self-hosted**, **Self-hosted → SaaS**, **Region
  move**), region(s) and start date.
- Seven steps: **Pre-flight check**, **Encrypted export**, **Transfer**, **Import**, **Verify**, **Switch over**,
  **Destroy source keys** — each **Waiting**, **Running**, **Done** or **Failed**.
- The export is always encrypted with the tenant's own keys; we run the steps but never read it. In real mode, cell
  steps run as signed commands (`tenant.import_key`, `tenant.freeze`, `tenant.export`, `tenant.import`), staff confirm
  file placement, self-hosted steps and cutover, and **Destroy source keys** finishes once the source cell's four-eyes
  key-destruction certificate is issued.

## Roles

| Role | Typical work |
|---|---|
| **Super admin** | Everything in Nexus Control |
| **Sales** | Customers, quotes, trials and demo sandboxes |
| **Billing** | Subscriptions, invoices, payments |
| **Support** | Tickets; asks institutions for time-limited access |
| **Implementation** | New tenants, licences, installs, moves between SaaS and self-hosted |
| **Release manager** | Releases, channels, customer extensions |
| **Site reliability** | Fleet health; second approver for break-glass |
| **Security officer** | Trust and compliance, staff access; second approver for break-glass |
| **Partner** | Only the customers their partner company manages |

## Known limits

- Every P01–P18 screen runs on the real Control backend in real mode (`dev:control:real`); demo mode (`dev:control`) remains available for training and offline walkthroughs.
- Billing runs on Lago, our open-source billing engine inside our own systems; customers never see it. Hosted payment links are live for Indian INR invoices via **Razorpay** (NEX-107); European (EUR) invoices are paid by bank transfer, recorded by hand; a card payment page for Europe (Stripe) comes in a later stage.
- **Staff & security** (P13) is read-only in the app; provider staff accounts and mandatory MFA are managed in the `nexus-staff` sign-in realm.

## Operations: installing Nexus Control (NEX-108, NEX-110)

Operators deploy Nexus Control (control database, API, staff sign-in with mandatory MFA, Valkey, OpenBao signing keys,
and the self-hosted Lago billing engine) from one Docker Compose stack in `deploy/control/`:

```bash
deploy/control/scripts/install.sh                      # empty stack (production defaults)
NEXUS_CONTROL_DEMO=1 deploy/control/scripts/install.sh # with demo staff and commercial fixtures
```

Windows PowerShell: `powershell -File deploy/control/scripts/install.ps1 [-Demo]`.

- **Network exposure:** all services stay on the internal Docker network; only the Control API publishes
  `127.0.0.1:8100`. Put a TLS reverse proxy in front in production.
- **Secrets & keys:** generated once into git-ignored `deploy/control/.env` (never printed); OpenBao initialises
  the four non-exportable Ed25519 signing keys (`nexus-licence`, `nexus-release`, `nexus-command`, `nexus-shred`),
  revokes the OpenBao root token after setup, and keeps only the unseal key in `deploy/control/.env.vault-init.json`
  (back it up offline).
- **Upgrades & backups:** re-running the install script runs forward-only control migrations before restarting the API.
  See `deploy/control/README.md` for `control-db` / `lago-db` / OpenBao backup and key rotation steps.

## Operations: syncing billing to Lago (NEX-118, NEX-111)

Operators push Nexus Control's per-learner SaaS plans, subscribing accounts, active / trialing / past-due
subscriptions, cancellations and learner counts into Lago with:

```bash
uv run --project backend python -m nexus.devtools.billing_sync --dry-run   # preview without contacting Lago
uv run --project backend python -m nexus.devtools.billing_sync             # push to Lago (needs NEXUS_CONTROL_LAGO_API_KEY)
```

- **When to run:** after adding or repricing a per-learner SaaS plan, starting or cancelling a subscription, or
  recording a new period's learner counts. Re-running is safe and idempotent — plans and customers upsert, existing
  subscriptions are kept, cancelled subscriptions active in Lago are terminated, and each learner usage record uses
  its own id so nothing is counted twice.
- **Invoices from Lago:** Lago posts finalized invoices and payment status updates to
  `/control/api/v1/billing/lago-webhook` signed with `X-Lago-Signature` (HMAC-SHA256 using
  `NEXUS_CONTROL_LAGO_WEBHOOK_KEY`). Unsigned or mis-signed requests are refused (`401`); replayed bodies are ignored.
  In dev, `nexus-lago-dev` writes the key into `backend/.env` if missing (never printed) and registers the HMAC
  endpoint only when `NEXUS_CONTROL_LAGO_WEBHOOK_URL` is set: the dev Lago refuses private addresses, so dev tests
  post bodies signed with the same key. An invoice already paid when it arrives is stored as paid.
- **What crosses the boundary:** account id, account name, country, currency, plan codes and learner counts only —
  never contacts, e-mail addresses, phone numbers or institution data.
- **Skipped items:** add-ons, AI credit packs, self-hosted licences, support contracts, already-ended cancellations,
  and accounts whose country has no regional price on their plan are skipped with their id and reason printed (never
  guessed).
