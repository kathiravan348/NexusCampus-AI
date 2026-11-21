# Nexus Control — guide for our staff

> State as of: 2026-11-21 (Stage 2 prototype: sign-in, menu and home (NEX-071); Accounts (NEX-072); Pricing & quotes (NEX-073); Billing (NEX-074); Provisioning (NEX-075); Licences (NEX-076)).
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
