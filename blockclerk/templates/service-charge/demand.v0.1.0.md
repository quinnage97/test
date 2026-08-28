---
{
  "id": "sc.demand",
  "title": "Service charge demand",
  "kind": "demand",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["lafra.standard-demand", "sc.demand.name-address", "sc.demand.summary-of-rights", "sc.trust", "sc.reasonableness"],
  "one_per": "unit",
  "notes": "A working layout. It carries the information a demand needs today, arranged so it can be read. It is NOT the standardised form: that form has not been published. When it is, add a new file with the real layout and set superseded_by on this one."
}
---
SERVICE CHARGE DEMAND
{{ building.name }}

To
{{ unit.leaseholder }}
{{ unit.ref }}
{{? unit.address }}

Issued {{ produced_on }}
Charge period: {{ year.label }}

--------------------------------------------------------------------
WHAT IS BEING ASKED FOR

{{ demand.headline_label }}{{ demand.headline }}

{{? demand.due_line }}
{{? demand.pay_line }}

--------------------------------------------------------------------
HOW THAT FIGURE WAS REACHED

Total cost of running the building      {{ totals.expenditure_col }}
{{#if totals.income_any}}
Less income received by the building    {{ totals.income_col }}
Net cost shared between the flats       {{ totals.net_col }}
{{/if}}

Your share of the building is {{ unit.share }}.

Your share of the net cost              {{ demand.share_col }}
{{#if demand.on_account_any}}
Less paid on account in the year        {{ demand.on_account_col }}
{{ demand.balance_label }}{{ demand.balance_col }}
{{/if}}

--------------------------------------------------------------------
WHAT THE MONEY WENT ON

{{#each lines}}
{{ this.category_col }}{{ this.amount_col }}{{ this.share_col }}
{{/each}}
{{ totals.label_col }}{{ totals.expenditure_col }}{{ demand.share_col }}

{{#if reserve.any}}
--------------------------------------------------------------------
RESERVE FUND

Held at the start of the year           {{ reserve.open_col }}
Paid in during the year                 {{ reserve.in_col }}
Spent during the year                   {{ reserve.out_col }}
Held at the end of the year             {{ reserve.close_col }}

Reserve fund money is held on trust for the leaseholders of this
building. It belongs to them, not to the company.
{{/if}}

--------------------------------------------------------------------
WHO IS ASKING

{{ building.entity_name }}
{{ building.entity_address }}
{{? building.agent_line }}

That is the name and address of the party demanding this service
charge, and the address in England or Wales at which notices may be
served on it.

--------------------------------------------------------------------
WHAT COMES WITH THIS DEMAND

{{ attachments }}

--------------------------------------------------------------------
IF YOU THINK THIS IS WRONG

Write to the address above and say which figure you are querying and
why. A leaseholder may apply to the First-tier Tribunal (Property
Chamber) for a decision on whether a service charge is payable and,
if so, how much. Paying under protest does not stop that.

--------------------------------------------------------------------
ABOUT THIS FORM

{{ format_note }}

WHAT THIS DOCUMENT RESTS ON

{{ basis }}

{{ not_advice }}
