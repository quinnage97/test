---
{
  "id": "sc.accounts",
  "title": "Service charge accounts",
  "kind": "accounts",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["lafra.standard-accounts", "sc.summary-of-costs", "sc.trust", "sc.eighteen-month-rule"],
  "one_per": "building",
  "notes": "A working statement of service charge income and expenditure. The standardised form of accounts has not been published, and neither has the form of the accountant's report on them. Both are expected."
}
---
SERVICE CHARGE ACCOUNTS
{{ building.name }}
For the year {{ year.label }}

Prepared {{ produced_on }}{{? year.prepared_by_line }}

--------------------------------------------------------------------
INCOME

{{#if income_lines_any}}
{{#each income_lines}}
{{ this.category_col }}{{ this.amount_col }}
{{/each}}
{{/if}}
{{ onaccount.label_col }}{{ onaccount.amount_col }}
{{ totals.income_total_label_col }}{{ totals.income_total_col }}

--------------------------------------------------------------------
EXPENDITURE

{{#each lines}}
{{ this.category_col }}{{ this.amount_col }}
{{/each}}
{{ totals.label_col }}{{ totals.expenditure_col }}

--------------------------------------------------------------------
RESULT FOR THE YEAR

{{ result.label_col }}{{ result.amount_col }}

{{ result.sentence }}

{{#if reserve.any}}
--------------------------------------------------------------------
RESERVE FUND

Held at the start of the year           {{ reserve.open_col }}
Paid in during the year                 {{ reserve.in_col }}
Spent during the year                   {{ reserve.out_col }}
Held at the end of the year             {{ reserve.close_col }}
{{/if}}

--------------------------------------------------------------------
HOW THE COST IS SHARED

{{#each unit_shares}}
{{ this.ref_col }}{{ this.share_col }}{{ this.amount_col }}
{{/each}}
{{ shares.label_col }}{{ shares.percent_col }}{{ totals.net_col }}

{{? shares.warning }}

--------------------------------------------------------------------
BASIS OF PREPARATION

These accounts were prepared on a cash basis from the figures entered
into Blockclerk by {{ year.prepared_by_or_dash }}. They cover money received
and money spent in the period {{ year.label }}.

Service charge money is held on trust for the leaseholders of this
building.

{{ accountant.line }}

--------------------------------------------------------------------
ABOUT THIS FORMAT

{{ format_note }}

WHAT THIS DOCUMENT RESTS ON

{{ basis }}

{{ not_advice }}
