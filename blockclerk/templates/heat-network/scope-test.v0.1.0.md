---
{
  "id": "heat.scope-test",
  "title": "Heat network scope test",
  "kind": "scope_test",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["heat.regulator", "heat.regulation-start", "heat.who-operates"],
  "one_per": "building",
  "notes": "The questions and the reasoning both live here, versioned, because the test will be refined as Ofgem publishes more. Changing how scope is decided must mean adding a new version of this file, not editing code.",
  "required": ["communal", "more_than_one"],
  "questions": [
    { "id": "communal",
      "text": "Does heating, hot water or cooling reach the flats from a shared source?",
      "help": "One boiler, plant room, heat pump, or a pipe coming in from a district system — as opposed to every flat having its own boiler on the kitchen wall." },
    { "id": "more_than_one",
      "text": "Does that shared source serve more than one flat or business unit?",
      "help": "A boiler that heats only the entrance hall serves no dwelling. A boiler that heats twenty flats serves twenty." },
    { "id": "charged",
      "text": "Do the people who get that heat pay for it in any way?",
      "help": "Through the service charge counts. It does not have to be a separate metered bill." },
    { "id": "third_party_operator",
      "text": "Does an outside company run the system day to day under a contract?",
      "help": "An energy services company (ESCO), or a maintenance contractor with responsibility for operating the plant — not just an engineer who attends when it breaks." },
    { "id": "third_party_supplier",
      "text": "Does an outside company bill the residents for heat directly?",
      "help": "If residents get a bill from someone other than the company or its agent, say yes." },
    { "id": "own_the_plant",
      "text": "Does the company own, or hold the lease of, the plant and pipework?",
      "help": "Look at the demise in the lease and at the buildings insurance schedule if you are not sure." }
  ],
  "rules": [
    { "when": { "communal": "no" },
      "result": "likely_out",
      "because": "There is no shared source of heat, so there is nothing here that looks like a heat network." },
    { "when": { "more_than_one": "no" },
      "result": "likely_out",
      "because": "The shared source does not serve more than one dwelling or business unit." },
    { "when": { "communal": "yes", "more_than_one": "yes" },
      "result": "likely_in_scope",
      "because": "Heat reaches more than one dwelling from a shared source. That is the shape of a communal heat network, and communal heat networks are expected to be in scope." }
  ],
  "role_rules": [
    { "when": { "third_party_operator": "yes" },
      "role": "The outside company that runs the system is likely to be the operator. The company may still be treated as the supplier if it is the one charging residents for heat." },
    { "when": { "third_party_operator": "no", "own_the_plant": "yes" },
      "role": "With no outside operator and the plant in the company's hands, the company itself is the most likely operator." },
    { "when": { "third_party_supplier": "no", "charged": "yes" },
      "role": "Residents are charged for heat by the company rather than by anyone else, so the company is the most likely supplier." }
  ]
}
---
HEAT NETWORK — SCOPE ASSESSMENT
{{ building.name }}
Completed {{ produced_on }}

--------------------------------------------------------------------
THE ANSWER THIS GIVES

{{ outcome.headline }}

{{ outcome.explanation }}

--------------------------------------------------------------------
WHY

{{#each outcome.reasons}}
- {{ this }}
{{/each}}

{{#if outcome.role_notes_any}}
--------------------------------------------------------------------
WHO WOULD BE THE OPERATOR, AND WHO THE SUPPLIER

{{#each outcome.role_notes}}
- {{ this }}
{{/each}}

Which of those roles falls on the company is a question about the
contracts and the leases for this building. This assessment cannot
answer it and does not try to.
{{/if}}

--------------------------------------------------------------------
THE ANSWERS THIS WAS BASED ON

{{#each answers}}
{{ this.text }}
   {{ this.answer }}
{{/each}}

{{#if unknowns_any}}
Still unanswered:
{{#each unknowns}}
- {{ this }}
{{/each}}
{{/if}}

--------------------------------------------------------------------
WHAT HAPPENS NEXT

{{ outcome.next_step }}

--------------------------------------------------------------------
ABOUT THIS ASSESSMENT

This is a first sort, made from six answers, using version
{{ meta.template_version }} of Blockclerk's scope test, dated
{{ meta.template_dated }}. It is not a determination by Ofgem and it
does not bind anybody. Where it says "likely", it means likely.

WHAT THIS ASSESSMENT RESTS ON

{{ basis }}

{{ not_advice }}
