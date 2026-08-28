---
{
  "id": "heat.registration-pack",
  "title": "Heat network registration information pack",
  "kind": "heat_registration",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["heat.regulator", "heat.registration-deadline", "heat.unauthorised-offence", "heat.who-operates"],
  "one_per": "building",
  "notes": "The list of information Ofgem asks for at registration has not been published in final form. It is declared here, in the template, rather than as columns in the database, so that adding or dropping a field is a one-file change. The form the user fills in is generated from this list.",
  "fields": [
    { "key": "operator_name",      "label": "Name of the company that would register", "group": "Who you are", "required": true },
    { "key": "operator_role",      "label": "The role it would register in", "group": "Who you are", "required": true, "help": "Operator, supplier, or both. If you are unsure, run the scope test first." },
    { "key": "company_number",     "label": "Companies House number", "group": "Who you are", "required": true },
    { "key": "registered_office",  "label": "Registered office address", "group": "Who you are", "required": true },
    { "key": "contact_name",       "label": "Named contact", "group": "Who you are", "required": true },
    { "key": "contact_email",      "label": "Contact email", "group": "Who you are", "required": true },
    { "key": "contact_phone",      "label": "Contact phone", "group": "Who you are", "required": false },

    { "key": "network_name",       "label": "Name the network is known by", "group": "The network", "required": true, "help": "Usually just the building name." },
    { "key": "network_address",    "label": "Where the plant is", "group": "The network", "required": true },
    { "key": "dwellings_supplied", "label": "Number of homes supplied", "group": "The network", "required": true },
    { "key": "nondomestic_supplied", "label": "Number of business premises supplied", "group": "The network", "required": false },
    { "key": "technology",         "label": "What generates the heat", "group": "The network", "required": true, "help": "Gas boilers, heat pump, CHP engine, or a connection into a wider district network." },
    { "key": "fuel",               "label": "What it runs on", "group": "The network", "required": true },
    { "key": "commissioned_on",    "label": "Roughly when it was installed", "group": "The network", "required": false },
    { "key": "annual_heat_kwh",    "label": "Heat supplied in a year, in kWh", "group": "The network", "required": false, "help": "An estimate from the gas bills is fine. Say that it is an estimate." },

    { "key": "metering",           "label": "How heat is measured in each home", "group": "Charging", "required": true, "help": "A meter in every flat, heat cost allocators, or not measured at all and shared through the service charge." },
    { "key": "charging_basis",     "label": "How residents are charged", "group": "Charging", "required": true },
    { "key": "unit_rate",          "label": "Unit rate charged, if there is one", "group": "Charging", "required": false },
    { "key": "standing_charge",    "label": "Standing charge, if there is one", "group": "Charging", "required": false },
    { "key": "billing_frequency",  "label": "How often residents are billed", "group": "Charging", "required": false },

    { "key": "maintenance",        "label": "Who maintains the plant", "group": "Running it", "required": true },
    { "key": "out_of_hours",       "label": "What happens when it fails out of hours", "group": "Running it", "required": true },
    { "key": "outage_record",      "label": "Where outages are recorded", "group": "Running it", "required": false },
    { "key": "complaints_route",   "label": "How a resident complains", "group": "Running it", "required": true },
    { "key": "vulnerable_register","label": "Whether residents needing extra help are recorded", "group": "Running it", "required": false, "help": "For example someone dependent on heat for medical reasons." }
  ]
}
---
HEAT NETWORK REGISTRATION — INFORMATION PACK
{{ building.name }}
Prepared {{ produced_on }}

This pack gathers, in one place, what is expected to be needed to
register this building's heat network with Ofgem. It is a working
document to take to the registration itself. It is not a submission and
it has not been sent to anybody.

{{ deadline.sentence }}

--------------------------------------------------------------------
{{#each groups}}
{{ this.name }}

{{#each this.rows}}
{{ this.label_col }}{{ this.value }}
{{/each}}

{{/each}}
--------------------------------------------------------------------
STILL MISSING

{{#if gaps_any}}
These are the entries the pack is expected to need, and this building
does not have them yet:

{{#each gaps}}
- {{ this }}
{{/each}}
{{/if}}
{{#unless gaps_any}}
Nothing. Every entry this pack asks for has been filled in.
{{/unless}}

--------------------------------------------------------------------
SCOPE

{{ scope.summary }}

--------------------------------------------------------------------
ABOUT THIS PACK

{{ format_note }}

The list of information above is Blockclerk's working list, version
{{ meta.template_version }}, dated {{ meta.template_dated }}. Ofgem's
own list is expected to differ. Check it against Ofgem's published
requirements before registering, and treat anything extra there as a
gap in this pack.

WHAT THIS PACK RESTS ON

{{ basis }}

{{ not_advice }}
