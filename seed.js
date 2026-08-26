// Sets up the approved templates and, with --demo, some example people so you
// can see the daily list working before importing anything real.
import { db, setSetting, today, addDays } from "./db.js";

const TEMPLATES = [
  {
    key: "new_connection", label: "Just connected - say hello",
    body: "Thanks for connecting. I had a look at your profile - {something_specific}. I'm a mortgage and pensions adviser here in {area}, so I mostly talk to people about the boring-but-important stuff. No pitch from me. What are you working on at the moment?",
    guidance: "Warmest, shortest message of the lot. Absolutely no mention of products or services beyond one clause saying what he does.",
  },
  {
    key: "nudge_one", label: "First nudge - no reply yet",
    body: "I know a message from someone you've just connected with is easy to scroll past. No agenda here - I just like knowing who's in my network. If mortgages or pensions ever come up for you, you know where I am.",
    guidance: "Light and self-aware. Must not repeat the first message's content.",
  },
  {
    key: "nudge_two", label: "Last nudge before dropping off",
    body: "Last one from me, I promise. If it's not a useful time, no problem at all - I'll leave you be. My door's open if anything changes.",
    guidance: "Genuinely final. Give them a graceful exit. Very short - under 45 words.",
  },
  {
    key: "reply_waiting", label: "They replied - keep it going",
    body: "Picking up on what you said - happy to talk it through properly whenever suits. A quick call is usually enough to work out whether there's anything worth doing.",
    guidance: "This is a warm lead. Reference their reply. Offer a call without pressing for a date.",
  },
  {
    key: "conversation_stalled", label: "Conversation went quiet",
    body: "Our conversation drifted off - entirely my fault for not coming back to you. Still happy to pick it up if it's useful.",
    guidance: "Take the blame for the silence. Zero guilt-tripping.",
  },
  {
    key: "meeting_followup", label: "After a call or meeting",
    body: "Good to speak the other day. I've had a think about what you mentioned. Anything you'd like me to look into before we speak again?",
    guidance: "Assumes a real conversation happened. Do not restate what was discussed - he knows, they know.",
  },
  {
    key: "rate_expiry", label: "Fixed rate ending soon",
    body: "A quick note because your fixed rate is coming to an end. Most lenders let you line something up around six months ahead, so there's no rush - but it's worth knowing your options before you roll onto the standard variable rate. Want me to have a look at what's available to you?",
    guidance: "The most commercially important message in the system. Factual, calm, zero urgency language. Never state or imply a rate or saving.",
  },
  {
    key: "review_due", label: "Annual review due",
    body: "It's about time for your annual review. Things change - income, family, plans - and it's worth a look even if nothing's moved. Shall I put something in the diary?",
    guidance: "Routine and low-key. This is a service message to an existing client.",
  },
  {
    key: "client_checkin", label: "Existing client - been a while",
    body: "It's been a while since we last spoke and I wanted to check in rather than only appearing when there's paperwork. Anything changed your end that I should know about?",
    guidance: "Relationship maintenance, not a sales message. No product mentions at all.",
  },
  {
    key: "dormant", label: "Dormant contact - light touch",
    body: "It's been a long time since we spoke, so this is really just a hello. If mortgages or pensions are on your mind at some point, I'm easy to find.",
    guidance: "Extremely light. No ask, no question that demands an answer.",
  },
];

const up = db.prepare(`
  INSERT INTO templates (key, label, body, guidance) VALUES (@key, @label, @body, @guidance)
  ON CONFLICT(key) DO UPDATE SET label=excluded.label, body=excluded.body, guidance=excluded.guidance
`);
for (const t of TEMPLATES) up.run(t);
console.log(`${TEMPLATES.length} templates ready.`);

if (!db.prepare("SELECT 1 FROM settings WHERE key='cold_limit'").get()) {
  setSetting("cold_limit", "15");        // max cold outreach per day (warm is uncapped)
  setSetting("invites_per_day", "20");   // stays well under LinkedIn's weekly ceiling
  setSetting("adviser_name", "Your name");
  setSetting("area", "your area");
  setSetting("disclosure", "");          // network wording appended to promotional messages
}

if (process.argv.includes("--demo")) {
  const c = db.prepare(`
    INSERT INTO contacts (name, first_name, headline, company, linkedin_url, stage,
                          connected_on, last_contact, last_reply, touches, mortgage_end,
                          review_due, notes)
    VALUES (@name,@first_name,@headline,@company,@url,@stage,@connected_on,@last_contact,
            @last_reply,@touches,@mortgage_end,@review_due,@notes)
  `);
  const demo = [
    { name:"Sarah Whitfield", first_name:"Sarah", headline:"Practice Manager", company:"Ellwood Dental",
      url:"https://linkedin.com/in/example1", stage:"client", connected_on:addDays(-800),
      last_contact:addDays(-210), last_reply:null, touches:0, mortgage_end:addDays(95),
      review_due:null, notes:"Bought her first flat through him in 2022. Two young kids." },
    { name:"Dev Raman", first_name:"Dev", headline:"Head of Operations", company:"Northgate Logistics",
      url:"https://linkedin.com/in/example2", stage:"in_conversation", connected_on:addDays(-40),
      last_contact:addDays(-9), last_reply:addDays(-2), touches:2, mortgage_end:null,
      review_due:null, notes:"Asked what a broker actually does differently to going direct." },
    { name:"Marie Okonkwo", first_name:"Marie", headline:"Founder", company:"Okonkwo Interiors",
      url:"https://linkedin.com/in/example3", stage:"new_connection", connected_on:addDays(-3),
      last_contact:null, last_reply:null, touches:0, mortgage_end:null, review_due:null,
      notes:"Self-employed - three years of accounts now, which matters for lending." },
    { name:"Tom Bexley", first_name:"Tom", headline:"Site Foreman", company:"Halloran Construction",
      url:"https://linkedin.com/in/example4", stage:"messaged", connected_on:addDays(-30),
      last_contact:addDays(-8), last_reply:null, touches:1, mortgage_end:null, review_due:null, notes:null },
    { name:"Priya Nandra", first_name:"Priya", headline:"Consultant Anaesthetist", company:"NHS",
      url:"https://linkedin.com/in/example5", stage:"client", connected_on:addDays(-1100),
      last_contact:addDays(-330), last_reply:null, touches:0, mortgage_end:null,
      review_due:addDays(14), notes:"NHS pension plus a small SIPP. Annual review each spring." },
  ];
  const seen = db.prepare("SELECT 1 FROM contacts WHERE name = ?");
  let n = 0;
  for (const d of demo) if (!seen.get(d.name)) { c.run(d); n++; }
  console.log(`${n} demo contacts added.`);
}
