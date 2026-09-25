# Tabs — product requirements

Shared expenses for friends, flatmates and trips: who paid, who owes, and the fewest payments
that settle everyone up. A Splitwise-class web app, ready for real users.

Tabs today is a single-page app on a Node server that stores groups in a JSON file: anyone with
a group's link can read and change it, there are no accounts, and "members" are names. This spec
takes it from that to a product people can sign up for, share with each other, and trust with
their money. What it already does well stays: amounts are integer minor units (never floats),
and settlement uses the fewest transfers.

## Hard constraints

- **Hosted on Vercel.** Everything must run there — serverless functions, no long-running
  process, no local disk that outlives a request.
- **Persistent storage that works on Vercel** (a managed database). Nothing a user saves may be
  lost on a redeploy or a cold start. Schema changes are migrations, applied on deploy.
- **Real accounts.** Every read and write of a group's data is checked against who is asking.
- **Money is exact.** Integer minor units end to end; a split never loses or invents a paisa —
  the parts always sum to the whole, and the remainder rule is stated and tested.
- **Secrets only from environment variables**, each documented in the README with what it is
  for. The app starts and says clearly what is missing when one is not set.

## Users and accounts

- Sign up and sign in with email and password. Passwords are hashed with a slow, salted hash;
  sessions are secure, http-only cookies; signing out ends the session on the server.
- Failed sign-ins are rate-limited. Error messages never reveal whether an email is registered.
- A profile: display name and default currency.
- Password reset by email, when an email provider is configured (its key an environment
  variable). Without one, the reset page says it is unavailable rather than failing.
- A user can delete their account. Their name stays on past expenses as a former member;
  balances they are part of must be settled first, or the app says why it cannot delete.

## Groups and members

- Create a group with a name, a currency and an optional type (trip, home, couple, other).
- **Invite by link:** the owner shares a join link; anyone signed in who opens it joins the group.
  The owner can turn the link off or make a new one, which kills the old.
- **Placeholder members:** a member can be added by name before they have an account, so a trip
  can be recorded before everyone signs up. When they join through the link they claim that
  placeholder, and everything recorded for it becomes theirs.
- Roles: the creator is the owner; the owner can rename the group, remove members, and archive
  the group. A member with a non-zero balance cannot be removed until it is settled.
- Any member can leave a group whose balance for them is zero.
- A user sees only the groups they belong to.

## Expenses

- An expense has a description, an amount, a date, who paid, and how it is split. Optional: a
  category (food, travel, rent, utilities, shopping, entertainment, other) and a note.
- **Who paid:** one member, or several members each paying part (the parts sum to the total).
- **Split types:** equally among chosen members; by exact amounts; by percentages; by shares.
  Each is validated — exact amounts must sum to the total, percentages to 100 — with the error
  naming what is off and by how much. Members can be left out of a split.
- The rounding remainder of an equal or percentage split goes to a stated member (the payer),
  so the parts always sum to the whole.
- Any member can edit or delete an expense. Every change is recorded in the activity feed with
  who made it and what changed.
- Expenses list newest first, filterable by member and category, searchable by description.

## Balances and settling up

- Per group: each member's net balance, and the simplified debts — who pays whom, the fewest
  transfers (the algorithm Tabs has today).
- Across groups: on the home screen, "you owe" and "you are owed" in total and per person.
- **Settle up:** record a payment from one member to another, in full or in part. It moves the
  balances and appears in the feed. A payment can be deleted by the members it involves.
- A group whose balances are all zero says so clearly.

## Activity

- A feed per group and one across all of a user's groups: expense added, edited, deleted;
  payment recorded; member joined, left or removed — each with who and when.

## Experience

- Mobile-first and responsive; it works well on a phone browser and on a laptop.
- Every page has a clear heading hierarchy (one h1), labelled controls, keyboard access and
  visible focus. Empty, loading and error states are designed, not left blank.
- Amounts are shown in the group's currency with the correct symbol and separators.
- Fast: the main screens load in under a second on an ordinary connection.

## Operations

- A health endpoint that checks the database is reachable.
- A seed for development and for QA: a few users, groups with expenses of every split type,
  payments, a placeholder member.
- The README says how to deploy to Vercel from scratch: which database to add, which
  environment variables to set, and how migrations run.

## Not in this version

Native mobile apps. Paying through the app (UPI, cards). Receipt photos and scanning. Recurring
expenses. Multiple currencies inside one group, and exchange rates. Charts and spending reports.
Email notifications other than password reset. These are later, and the design should not make
them hard — but none of them is built now.

## Order of work

1. Accounts, sessions, and a persistent database on Vercel — with the current groups, expenses
   and settlement moved onto it, and every group read and write checked against its members.
2. Groups with invite links, placeholder members and claiming, roles, leave and remove.
3. Expenses with multiple payers, all four split types, categories, edit and delete.
4. Settle up with partial payments; balances across groups on the home screen.
5. The activity feed, search and filters, account deletion, password reset.
