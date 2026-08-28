# Blockclerk

Compliance documents for the people who are actually responsible for blocks of
flats in England: RMC and RTM directors who are volunteer leaseholders, and the
small managing agents who look after ten to fifty blocks and have the same
problems at portfolio scale.

Two products, one buyer.

**Service charge documents.** Take a building's year-end figures, produce the
leaseholder document pack, and record what was issued to whom and when.

**Heat network compliance.** Work out whether a block's communal heating is
likely to be in scope of Ofgem's regime, produce the registration information
pack, and track the conditions that run afterwards.

## Getting started

```bash
npm install
cp .env.example .env      # a password, if this is going anywhere but your laptop
npm run seed              # settings (add --demo for an example building)
npm start                 # http://localhost:4700
```

`npm test` and `npm run check` are both worth running before anything goes out
to a real leaseholder. What they check is described below.

## The four rules this is built around

Everything structural here follows from four rules, so they come first.

### 1. Nothing here is legal advice

Every document is produced from figures and details the user entered. Blockclerk
does not know what a lease says, whether a cost was reasonable, or whether an
obligation has been met. Every generated document carries that in plain words,
and `lib/guard.js` fails the build on any template that slips into telling the
reader what they must do.

### 2. Nothing unsettled is stated as settled

The Leasehold and Freehold Reform Act 2024 service charge measures are being
implemented by statutory instrument. The standardised demand form, the annual
report, the standardised accounts and the insurance disclosure have not been
published. Ofgem's heat network detail is still moving.

So the app cannot state a rule at all except by citing an entry in
[`law/provisions.json`](law/provisions.json), and every citation carries:

| | |
|---|---|
| `status` | `in_force`, or `expected` — never anything in between |
| `confidence` | `high`, or `check` where it has not been confirmed against the source |
| `source` | the Act, the SI, or the Ofgem programme |
| `url` | where to go and look |
| `checked_on` | the date a person last looked |

`lib/law.js` throws on any id that is not in that file. There is no way to put a
legal claim on a page without one. Anything not re-checked for 90 days shows as
overdue on the front page, on the year's checks, and in `npm run check` — because
an "expected" rule that nobody has looked at for six months is the failure mode
that matters here.

Ten of the nineteen entries are currently `expected`, and ten are marked as
needing confirmation. That is the honest position, and the app says so
everywhere rather than hiding it.

### 3. Statutory formats live in a swappable template layer

Not one word of any statutory document is written in the code. Each format is a
file in [`templates/`](templates) with a JSON header:

```
---
{ "id": "sc.demand", "version": "0.1.0", "dated": "2026-08-28",
  "status": "expected", "basis": ["lafra.standard-demand", "sc.demand.name-address"] }
---
SERVICE CHARGE DEMAND
{{ building.name }}
...
```

When an SI is finally made, the job is: add a file with the real layout, set
`superseded_by` on the old one, run `npm run check`. No JavaScript changes. The
loader refuses any template whose `basis` names a provision that does not exist,
and any template claiming to be `in_force` while resting on something that is not.

The template layer holds more than wording. The heat network scope questions and
the reasoning behind them, the list of information a registration is expected to
need, and the ongoing condition set are all declared in template metadata, not in
columns or code, because none of them are settled either. The registration form
the user fills in is generated from that declared field list.

**The one prescribed format that exists today is not reproduced from memory.**
The summary of rights and obligations that must accompany a demand is set out
word for word in SI 2007/1257. An approximation of a prescribed form is worth
nothing, so Blockclerk asks you to paste the real wording in once, records the
date you did, and until then flags every document run as incomplete.

### 4. Plain English

The reader is a retired volunteer who was made a company director by their
neighbours, not a solicitor. `lib/plain.js` flags legalese and sentences over 35
words in any template. `lib/prose.js` strips headings and column layouts first,
so the check looks only at what a person actually reads.

## What it does

### Service charges

Enter a building, its flats and their lease shares, then an accounting year of
figures — what was spent, when each cost was incurred, what came in, the reserve
fund movements. Blockclerk produces the pack:

| Document | Status of its format |
|---|---|
| Service charge demand, one per flat | expected |
| Summary of rights and obligations | in force — you supply the prescribed wording |
| Service charge accounts | expected |
| Annual report to leaseholders | expected |
| Insurance disclosure | expected |

Every share is apportioned by largest remainder, so the flats' shares add back
up to the building total exactly. Money is whole pence throughout. A service
charge that is a penny out is a service charge somebody writes a letter about.

Before anything is produced you get the checks: shares that do not total 100%,
costs incurred more than 18 months ago, works over the consultation threshold
with nothing recorded, a missing name and address for service, missing insurance
details, and anything you typed yourself that reads as advice. Two levels only —
*deal with this first*, which blocks saving the pack, and *worth a look*, which
does not.

Saving freezes each document: the exact wording, the template id and version, and
a snapshot of what the law was understood to say that day. A document produced
this year still explains itself next year, after the templates and the law have
both moved on.

Then you record what went to whom, when, and how. Nothing in that record is ever
edited or deleted — a mistake is corrected by recording again, and both entries
stay. `/documents/export` is the CSV somebody will eventually ask for.

### Heat networks

Six questions decide whether the block is *likely* in scope. The questions, the
rules and the wording of the reasons all live in
[`templates/heat-network/scope-test.v0.1.0.md`](templates/heat-network/scope-test.v0.1.0.md),
so refining the test means adding a version of that file. If the questions the
test turns on are unanswered, the answer is "cannot say yet" — it never guesses
in the confident direction, because getting this wrong that way is how somebody
ends up operating unauthorised while believing they were fine.

If it is likely in scope, the registration pack gathers what a registration is
expected to need and lists what is still missing. After that, the conditions
tracker carries the obligations that are expected to run for as long as the
network operates.

The registration date drives a countdown on the front page. That date is read out
of the law registry, not written into the code, so correcting it is one line in a
file a non-programmer can read — and it is displayed with its status and source
every single time, because it is one of the entries marked as not yet confirmed.

## Layout

```
server.js                routes, all of it plain Express
db.js                    SQLite connection, date helpers
schema.sql               the data model

law/provisions.json      every legal statement the app makes
lib/law.js               citation, staleness, the "not advice" note
templates/               every statutory format, versioned and dated
lib/templates.js         the template loader and engine

lib/servicecharge.js     figures in, document pack out, and the checks
lib/heat.js              scope test, registration pack, conditions
lib/money.js             pence, and apportionment that adds up
lib/guard.js             the wording gate: no advice, no false certainty
lib/plain.js             the plain-English check
lib/prose.js             pulling real sentences out of a laid-out document

views/                   server-rendered HTML
scripts/check.js         run before a release, and before a real document run
scripts/test.js          the invariants that would put a wrong number in front
                         of a leaseholder if they broke quietly
scripts/backup.js        timestamped database copies, last 30 kept
```

No build step, no framework, no client-side application, and no AI anywhere in
the product. That last one is deliberate: these are statutory documents produced
from a user's own figures, and a language model has no business generating them
or the arithmetic behind them. Everything here is deterministic and inspectable.

## Keeping it honest as the law lands

1. Open `law/provisions.json`. Check each `expected` entry against its `url`.
2. Where something has been made: change `status`, `confidence` and `checked_on`,
   and rewrite the `statement` to what the instrument actually says.
3. Where a format has been published: add a new file in `templates/` with the
   real layout, `"status": "in_force"`, and a `dated` of today. Set
   `"superseded_by"` on the old version. Keep the old file — documents already
   issued point at it.
4. `npm run check`, then `npm test`.

Step 3 is the whole reason the template layer exists. It should be an afternoon,
not a rewrite.

## What this does not do

It does not make anyone compliant, and it does not say that it does. It does not
read your lease, and almost every question that matters — whether a cost is
recoverable, whether your apportionment is right, whether you are the operator
of your heat network — turns on the lease and the contracts. Blockclerk produces
the documents and keeps the record. The judgement stays with the person who is
responsible for it, which is the same person who was responsible before.
