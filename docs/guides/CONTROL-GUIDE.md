# Nexus Control — guide for our staff

> State as of: 2026-11-21 (Stage 2 prototype: sign-in, menu and home (NEX-071); Accounts (NEX-072); Pricing & quotes (NEX-073); Billing (NEX-074); Provisioning (NEX-075); Licences (NEX-076); Fleet (NEX-077); Releases (NEX-078); Extensions (NEX-079); Support (NEX-080); Access requests (NEX-081); Usage (NEX-082); Partners (NEX-083); Staff (NEX-084)).
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
- **Real installations** (later): staff single sign-on with multi-factor login. Every staff session needs
  multi-factor login; the green shield next to your name means **Multi-factor login verified**.
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
  Card and bank numbers are never stored.
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
  shows the new tenant id.
- **Offboarding:** customers leaving — their encrypted export, the destruction of their keys (the data becomes
  unreadable) and the signed **Key-destruction certificate** with the key ids, time and signing key.

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

### Releases

Menu **Releases** (super admin, release manager; support, implementation and site reliability read).

- One release train for SaaS and self-hosted. The table shows version, channel, status (**Draft**, **Published**,
  **Withdrawn**), publish date, **Signed** and **Offline bundle** (for air-gapped sites). **AI-drafted notes** marks
  notes written by AI.
- **Details** shows the oldest version that can upgrade directly, the migration notes (migrations only go forward)
  and the rollout rings: ring 0 is our own cell, ring 3 is everyone on the channel.
- **Sign and publish** a draft (release managers). For AI-drafted notes you must tick **I reviewed the AI-drafted
  release notes** first. **Start ring** rolls out the next ring once the earlier rings are done; the deployments in
  it then show the new version under **Fleet**.

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
  unassigned ticket assigns it to you; a reply to the customer sets **Waiting for customer**. Never paste learner,
  family or staff records — ask for a scrubbed diagnostic bundle instead.

### Access requests

Menu **Access requests** (super admin, support; site reliability and security officers read).

- We never open an institution's data on our own. **Requests** lists every request: institution, modules and
  **read only** or **read and edit**, hours, the status the institution set (**The institution decides**,
  **Approved by the institution**, **Denied by the institution**, **Revoked by the institution**, **Ended**), who
  asked and the reason.
- **Request access** (support): pick the institution, an optional ticket, the modules (the data vault itself can
  never be chosen), read or edit, 1–72 hours and a reason the institution will read, then **Send request**. The
  institution's admin sees it under **Data vault & access** in their own app and approves or denies it.
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

- This is the prototype on demo data. Pages are added one module at a time.
