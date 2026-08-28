---
{
  "id": "heat.conditions",
  "title": "Ongoing authorisation conditions",
  "kind": "heat_conditions",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["heat.conditions", "heat.regulator"],
  "one_per": "building",
  "notes": "A working set of the obligations a registered operator or supplier is expected to carry once authorised. Ofgem's published conditions will replace this wholesale: add a new version of this file and mark this one superseded.",
  "conditions": [
    { "id": "register",
      "title": "Register with Ofgem",
      "what": "Register the network, and the company's role in it, before the registration deadline.",
      "due_from": "heat.registration-deadline" },
    { "id": "customer-information",
      "title": "Tell residents what they are buying",
      "what": "Give every household written information about the network, what it costs them, how the charge is worked out, and who to contact." },
    { "id": "pricing-transparency",
      "title": "Show how the price is built up",
      "what": "Be able to show, on request, what makes up the heat charge — fuel, maintenance, standing costs, and anything else in it." },
    { "id": "metering-billing",
      "title": "Bill from what was actually used, where it is measured",
      "what": "Where flats are metered, bill from the meter readings, on a stated cycle, in a bill the resident can check." },
    { "id": "complaints",
      "title": "Have a complaints procedure",
      "what": "A written procedure, given to residents, saying how a complaint is made, how long it takes, and where it goes if the resident is still unhappy." },
    { "id": "vulnerability",
      "title": "Know who needs extra help",
      "what": "Keep a record of residents who would be at risk in an outage, and act on it when the heat goes off." },
    { "id": "reliability",
      "title": "Record outages and keep the heat on",
      "what": "Record every loss of heat or hot water, how long it lasted, and what was done. Have an out-of-hours route to an engineer." },
    { "id": "step-in",
      "title": "Plan for the operator failing",
      "what": "Have arrangements so residents keep their heat if the contractor or supplier goes out of business." },
    { "id": "reporting",
      "title": "Report to Ofgem",
      "what": "Make whatever periodic returns the authorisation requires, on time." }
  ]
}
---
HEAT NETWORK — AUTHORISATION CONDITIONS
{{ building.name }}
Position as at {{ produced_on }}

{{ deadline.sentence }}

--------------------------------------------------------------------
WHERE THIS BUILDING IS

Done                {{ tally.done }}
In progress         {{ tally.in_progress }}
Not started         {{ tally.not_started }}
Not applicable      {{ tally.n_a }}

--------------------------------------------------------------------
{{#each conditions}}
[{{ this.mark }}] {{ this.title }}
    {{ this.what }}
    {{? this.due_line }}
    {{? this.evidence_line }}

{{/each}}
--------------------------------------------------------------------
ABOUT THIS LIST

{{ format_note }}

This is Blockclerk's working set of conditions, version
{{ meta.template_version }}, dated {{ meta.template_dated }}. Ofgem's
published conditions are expected to differ, and to replace this list
entirely.

WHAT THIS LIST RESTS ON

{{ basis }}

{{ not_advice }}
