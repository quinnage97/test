---
{
  "id": "sc.insurance",
  "title": "Insurance disclosure",
  "kind": "insurance",
  "version": "0.1.0",
  "dated": "2026-08-28",
  "status": "expected",
  "basis": ["lafra.insurance-disclosure"],
  "one_per": "building",
  "notes": "The list of insurance information to be disclosed, and the form it takes, are expected to be set by regulations and have not been published. This layout covers the details leaseholders most often ask for, including commission."
}
---
BUILDINGS INSURANCE — INFORMATION FOR LEASEHOLDERS
{{ building.name }}
Issued {{ produced_on }}

--------------------------------------------------------------------
THE POLICY

Insurer                    {{ insurance.insurer }}
{{? insurance.broker_line }}
Policy number              {{ insurance.policy_number }}
Period of cover            {{ insurance.period }}
Sum insured                {{ insurance.sum_insured }}
Premium for the year       {{ insurance.premium }}

--------------------------------------------------------------------
WHAT IS COVERED

{{ insurance.risks }}

--------------------------------------------------------------------
COMMISSION AND OTHER PAYMENTS

{{ insurance.commission }}

--------------------------------------------------------------------
SEEING THE POLICY

A leaseholder may ask to see the policy itself and the schedule that
goes with it. Write to {{ building.entity_name }} at
{{ building.entity_address }}.

--------------------------------------------------------------------
ABOUT THIS FORMAT

{{ format_note }}

WHAT THIS DOCUMENT RESTS ON

{{ basis }}

{{ not_advice }}
