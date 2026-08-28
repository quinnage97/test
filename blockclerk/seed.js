// npm run seed            settings only
// npm run seed -- --demo  settings plus one example building to click around
//
// Deliberately does NOT invent the summary of rights and obligations. That
// wording is prescribed word for word, and an approximation of it is worth
// nothing. The app asks you to paste the real thing in once, and until you do,
// every document run tells you it is missing. That is the correct behaviour,
// so the demo ships with it missing on purpose.

import { db, setting, setSetting, today } from "./db.js";
import { parseMoney } from "./lib/money.js";

const demo = process.argv.includes("--demo");

const DEFAULTS = {
  payment_terms: "Payable within 28 days of the date of this demand, as provided by the lease.",
  payment_details: "By bank transfer, quoting your flat number as the reference.",
  issued_by: "",
};

for (const [k, v] of Object.entries(DEFAULTS)) {
  if (setting(k) === null) setSetting(k, v);
}

console.log("Settings ready.");

if (!setting("rights_summary_text")) {
  console.log(
    "\n  The summary of rights and obligations has not been entered yet.\n" +
    "  Open Settings in the app and paste it in from SI 2007/1257:\n" +
    "  https://www.legislation.gov.uk/uksi/2007/1257/made\n" +
    "  Until then, demands will be produced with that gap flagged.\n");
}

if (!demo) process.exit(0);

if (db.prepare("SELECT COUNT(*) n FROM buildings").get().n > 0) {
  console.log("There are already buildings here, so the example was not added.");
  process.exit(0);
}

const b = db.prepare(`
  INSERT INTO buildings (name, address, postcode, entity_kind, entity_name, entity_address,
    agent_name, units_count, year_end, communal_heating, insurer, broker, policy_number,
    policy_start, policy_end, sum_insured_pence, premium_pence, insured_risks, commission_note)
  VALUES (@name, @address, @postcode, @entity_kind, @entity_name, @entity_address,
    @agent_name, @units_count, @year_end, @communal_heating, @insurer, @broker, @policy_number,
    @policy_start, @policy_end, @sum_insured_pence, @premium_pence, @insured_risks, @commission_note)`)
  .run({
    name: "Marlborough Court",
    address: "14 Marlborough Road, Reading",
    postcode: "RG1 5QT",
    entity_kind: "rmc",
    entity_name: "Marlborough Court (Reading) Management Company Limited",
    entity_address: "14 Marlborough Road, Reading RG1 5QT",
    agent_name: "",
    units_count: 12,
    year_end: "03-31",
    communal_heating: 1,
    insurer: "Aviva Insurance Limited",
    broker: "Hamilton Fraser",
    policy_number: "RE/882140/26",
    policy_start: "2026-04-01",
    policy_end: "2027-03-31",
    sum_insured_pence: parseMoney("4,250,000"),
    premium_pence: parseMoney("11,480.00"),
    insured_risks: "Fire, flood, escape of water, storm, subsidence, property owners' liability\nand loss of rent. Excess £500, rising to £2,500 for escape of water.",
    commission_note: "The broker receives commission of 12.5% of the premium. No commission or\nother payment is received by the management company or any director.",
  }).lastInsertRowid;

// Twelve flats. Eight two-bed at 9%, four one-bed at 7% - which comes to 100%.
const unit = db.prepare(`
  INSERT INTO units (building_id, ref, leaseholder, email, share_percent, method)
  VALUES (?, ?, ?, ?, ?, ?)`);
const NAMES = ["A Whitfield", "M Oyelaran", "S and J Barker", "P Nkemelu", "R Traynor",
               "C Beaumont", "H Iqbal", "D and E Rowntree", "L Marchetti", "T Osei",
               "G Fairhurst", "V Kowalczyk"];
NAMES.forEach((name, i) => {
  const twoBed = i < 8;
  unit.run(b, `Flat ${i + 1}`, name,
           `flat${i + 1}@example.invalid`, twoBed ? 9 : 7,
           i % 4 === 0 ? "email" : "post");
});

const y = db.prepare(`
  INSERT INTO years (building_id, period_start, period_end, on_account_pence,
    reserve_open_pence, reserve_in_pence, reserve_out_pence, prepared_by, prepared_on, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(b, "2025-04-01", "2026-03-31", parseMoney("38,400.00"),
       parseMoney("21,300.00"), parseMoney("7,200.00"), parseMoney("0.00"),
       "the directors", "2026-06-14",
       "The lift refurbishment was consulted on in autumn 2024 under section 20.")
  .lastInsertRowid;

const line = db.prepare(`
  INSERT INTO lines (year_id, kind, category, description, amount_pence, incurred_on,
                     qualifying_works, consulted, supplier)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const SPEND = [
  ["Buildings insurance", "Annual premium", "10,940.00", "2025-04-01", 0, 0, "Hamilton Fraser"],
  ["Communal heating — gas", "Boiler house gas supply", "9,860.00", "2026-01-31", 0, 0, "British Gas"],
  ["Communal heating — maintenance", "Boiler service contract and two callouts", "2,640.00", "2025-11-12", 0, 0, "Thermal Care Ltd"],
  ["Cleaning", "Communal areas, fortnightly", "3,120.00", "2026-02-28", 0, 0, "Brightwell"],
  ["Gardening", "Grounds, March to October", "1,450.00", "2025-10-04", 0, 0, "Green Edge"],
  ["Electricity — communal", "Landlord's supply", "1,980.00", "2026-03-14", 0, 0, "Octopus"],
  ["Lift maintenance", "Service contract", "2,280.00", "2025-07-01", 0, 0, "Otis"],
  ["Lift refurbishment", "Controller replacement and doors", "14,600.00", "2025-09-22", 1, 1, "Otis"],
  ["Fire safety", "Alarm servicing and fire risk assessment", "1,340.00", "2025-05-19", 0, 0, "Sentinel Fire"],
  ["Accountancy", "Service charge accounts", "780.00", "2026-03-31", 0, 0, "Hallam & Co"],
  ["Company secretarial", "Confirmation statement and filings", "310.00", "2025-06-02", 0, 0, ""],
  ["Repairs — general", "Roof flashing, entry phone, two door closers", "1,865.00", "2025-08-30", 0, 0, ""],
];
for (const [category, description, amount, on, works, consulted, supplier] of SPEND) {
  line.run(y, "expenditure", category, description, parseMoney(amount), on, works, consulted, supplier);
}
line.run(y, "income", "Interest on the reserve account", "", parseMoney("412.00"), "2026-03-31", 0, 0, "");
line.run(y, "income", "Recharge to Flat 6", "Damage to the entry phone", parseMoney("180.00"), "2025-12-01", 0, 0, "");

// Heat network: communal boilers, run by the company, charged through the
// service charge. The shape of block that is most likely to be caught and
// least likely to know it.
const ans = db.prepare(`
  INSERT INTO heat_answers (building_id, question_id, answer, answered_on) VALUES (?, ?, ?, ?)`);
for (const [q, a] of Object.entries({
  communal: "yes", more_than_one: "yes", charged: "yes",
  third_party_operator: "no", third_party_supplier: "no", own_the_plant: "yes",
})) ans.run(b, q, a, today());

const fact = db.prepare(`
  INSERT INTO heat_facts (building_id, key, value, updated_at) VALUES (?, ?, ?, ?)`);
for (const [k, v] of Object.entries({
  operator_name: "Marlborough Court (Reading) Management Company Limited",
  operator_role: "Operator and supplier",
  company_number: "04182996",
  registered_office: "14 Marlborough Road, Reading RG1 5QT",
  contact_name: "A Whitfield, director",
  contact_email: "directors@marlboroughcourt.example.invalid",
  network_name: "Marlborough Court communal heating",
  network_address: "Boiler house, 14 Marlborough Road, Reading RG1 5QT",
  dwellings_supplied: "12",
  technology: "Two gas boilers in a shared plant room, serving radiators and hot water in every flat",
  fuel: "Mains gas",
  metering: "Not metered. The cost is shared through the service charge on the same shares as everything else.",
  charging_basis: "Through the service charge, on each flat's lease share.",
  maintenance: "Thermal Care Ltd, annual service contract",
  out_of_hours: "Thermal Care 24-hour line, number on the noticeboard in the entrance hall",
  complaints_route: "In writing to the directors, who reply within 21 days.",
})) fact.run(b, k, v, today());

console.log(`\nExample building added: Marlborough Court, 12 flats, one accounting year.`);
console.log(`Communal gas boilers, run by the company — so the heat network side has something to say.\n`);
