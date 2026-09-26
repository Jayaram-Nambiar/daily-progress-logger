# Architecture decision records

These records explain choices that are expensive to reverse. They are not a second copy of the runbook.

| Record | Decision |
|---|---|
| [001](001-incoming-webhooks.md) | Post with Chat incoming webhooks and stay on the default Apps Script project |
| [002](002-script-properties-for-secrets.md) | Store webhook URLs and the OpenRouter key in Script Properties |
| [003](003-pure-logic-module.md) | Keep testable rules in `src/logic.js` |
| [004](004-optional-openrouter-summaries.md) | Optional free-tier weekly summaries, with member text as the fallback |

Template for a new record: [template.md](template.md).
