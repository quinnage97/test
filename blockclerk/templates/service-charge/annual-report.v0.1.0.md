---
{
  "id": "sc.annual-report",
  "title": "Annual report to leaseholders",
  "kind": "annual_report",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["lafra.annual-report", "sc.summary-of-costs", "sc.reasonableness", "sc.trust"],
  "one_per": "building",
  "notes": "A working layout for the annual report the 2024 Act is expected to require. Neither its contents nor its deadline have been set. Written so that a building which starts producing one now has the habit and the figures ready, and so the layout can be swapped when the real one appears."
}
---
ANNUAL REPORT TO LEASEHOLDERS
{{ building.name }}
For the year {{ year.label }}

Prepared {{ produced_on }}{{? year.prepared_by_line }}

--------------------------------------------------------------------
1. THE BUILDING

{{ building.name }}
{{? building.address }}
Flats: {{ building.units_count }}
Managed by: {{ building.entity_name }} ({{ building.entity_role }})
{{? building.agent_line }}

--------------------------------------------------------------------
2. THE YEAR IN ONE PARAGRAPH

Running this building for {{ year.label }} cost
{{ totals.expenditure }}.{{? totals.income_sentence }} That was shared between
{{ building.units_count }} flats according to the shares set out in the leases.
{{? demand.outcome_sentence }}

--------------------------------------------------------------------
3. WHAT THE MONEY WENT ON

{{#each lines}}
{{ this.category_col }}{{ this.amount_col }}
{{? this.description_line }}
{{/each}}
{{ totals.label_col }}{{ totals.expenditure_col }}

{{#if income_lines_any}}
Income received by the building:

{{#each income_lines}}
{{ this.category_col }}{{ this.amount_col }}
{{/each}}
{{ totals.income_label_col }}{{ totals.income_col }}
{{/if}}

{{#if works.any}}
--------------------------------------------------------------------
4. LARGER PIECES OF WORK

{{#each works.rows}}
{{ this.category }} — {{ this.amount }}
  {{? this.description }}
  Consultation: {{ this.consultation }}
{{/each}}

Where a single piece of qualifying work would cost any one leaseholder
more than £250, leaseholders have to be consulted first. Where they are
not, recovery is capped at £250 each unless the tribunal says otherwise.
{{/if}}

{{#if reserve.any}}
--------------------------------------------------------------------
5. THE RESERVE FUND

Held at the start of the year           {{ reserve.open_col }}
Paid in during the year                 {{ reserve.in_col }}
Spent during the year                   {{ reserve.out_col }}
Held at the end of the year             {{ reserve.close_col }}

This money is held on trust for the leaseholders of this building.
{{/if}}

--------------------------------------------------------------------
6. INSURANCE

{{ insurance.block }}

--------------------------------------------------------------------
7. YOUR RIGHTS

A leaseholder may ask in writing for a summary of the costs that make up
the service charge, and may then inspect the invoices and accounts behind
it. A leaseholder may also apply to the First-tier Tribunal (Property
Chamber) for a decision on whether a service charge is payable.

Write to {{ building.entity_name }} at {{ building.entity_address }}.

--------------------------------------------------------------------
ABOUT THIS REPORT

{{ format_note }}

WHAT THIS DOCUMENT RESTS ON

{{ basis }}

{{ not_advice }}
