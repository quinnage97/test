# Follow-up

A daily list for a UK mortgage and pensions adviser: who to talk to today, and
the message already written.

It does not touch LinkedIn. It writes, he pastes. That is a deliberate design
decision, not a missing feature — see [Why there's no bot](#why-theres-no-bot).

## What it does

**Today** — the list. Anyone whose fixed rate is ending, whose review is due, who
replied and is waiting, or who has gone quiet. Each one comes with a message
drafted from a network-approved template, personalised to them. He reads it,
edits if he wants, presses one green button. That copies the text, opens their
profile, and logs it.

**New people** — a paced queue of connection requests with the invitation note
written. Capped at a safe daily number.

**Post ideas** — three LinkedIn posts on demand. One post reaches more people
than a hundred messages and carries no risk at all.

**Everyone** — the database. Import LinkedIn connections in one go, or add
people by hand. Two fields do most of the work: *fixed rate ends* and *review due*.

## Getting started

```bash
npm install
cp .env.example .env      # add your Anthropic API key and a password
npm run seed              # loads the templates (add --demo for example people)
npm start                 # http://localhost:4600
```

Set `PORT` in `.env` to use a different one. If that port is already taken the
app moves to the next free port and prints the address it actually opened on.

## How the daily list is decided

`lib/rules.js` holds every rule in one readable list, highest priority first.
First match wins.

| Rule | Fires when | Why it's there |
|---|---|---|
| `reply_waiting` | They replied and haven't been answered | The most expensive leak there is |
| `rate_expiry` | Fixed rate ends within 6 months | The single biggest source of recurring income |
| `review_due` | Annual review within 30 days | Service obligation and a natural reason to talk |
| `meeting_followup` | 5 days after a call with nothing logged | Deals die here |
| `conversation_stalled` | Conversation quiet 5 days | Cheap to revive |
| `new_connection` | Connected, never messaged | Warmest a stranger will ever be |
| `nudge_one` / `nudge_two` | 6 and 16 days, no reply | Two chases, then stop |
| `client_checkin` | Client, 6 months silent | Retention, and referrals come from here |
| `dormant` | 4 months silent | One light touch |

**Warm rules are never capped.** A client whose rate is expiring is money on the
table, and hiding that behind a daily limit is the exact problem this exists to
solve. **Cold rules are capped** (default 15/day, `cold_limit` in settings)
because a short list gets finished and a long one gets abandoned.

**Nobody is chased forever.** Three unanswered messages and they drop off until
they reply or a real event brings them back.

## Compliance

He's an appointed representative, so every message is a financial promotion his
network is accountable for. Three things follow from that:

1. **Templates are the approved wording.** They live in `seed.js` and the
   `templates` table. Get the network to sign them off, then record who and when
   in `approved_by` / `approved_on`. The AI personalises within a template — it
   never invents a promotion.
2. **Every draft is checked** against `lib/compliance.js` before he sees it —
   guarantees, "best rate", pressure language, specific savings figures, and
   anything that reads as advice before a fact-find. Hits are shown in red on
   the card. It's a warning, not a block: he's the adviser, he decides.
3. **Nothing is ever deleted.** Every message drafted and sent is kept in
   `messages`. `/export` produces the CSV the network will ask for.

This does not make him compliant. Network sign-off on the templates does. This
just makes it hard to drift away from what was signed off.

## Why there's no bot

The obvious build is a tool that auto-sends connections and auto-replies. It was
rejected for two reasons:

**LinkedIn bans it.** Automation tools breach the User Agreement, and enforcement
is account restriction or permanent removal. For an adviser whose entire pipeline
*is* his network, losing the account ends the business. The upside doesn't cover it.

**Volume isn't the constraint anyway.** LinkedIn caps invitations at roughly
100–200 a week per account no matter what tool you use, so automation buys the
same ceiling with the ban risk attached. And blasting hurts: templated cold DMs
reply at ~1–3%, personalised and well-timed at 15–30%. Ten good messages beat
forty bad ones on absolute replies, not just on taste.

The real volume is in the database. Every fixed rate ends — that's a guaranteed
recurring event per client, forever. A book of 500 past clients is 500 remortgage
conversations on a rolling cycle, with the highest conversion rate he'll ever see,
and it needs no new outreach at all. That's what the warm rules are for.

## Layout

```
server.js              routes; roughly 250 lines, all of it plain Express
db.js                  SQLite connection, date helpers
schema.sql             the whole data model
lib/rules.js           who to contact today, and why
lib/ai.js              drafting: messages, invitation notes, posts
lib/compliance.js      the wording gate
lib/import.js          LinkedIn Connections.csv
views/render.js        server-rendered HTML
seed.js                approved templates (--demo adds example people)
scripts/backup.js      timestamped database copies, last 30 kept
```

No build step, no framework, no client-side app. If the AI is unreachable the
list still renders with the plain approved template — his day is never blocked
by an API.
