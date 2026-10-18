# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker    | Meaning                                  |
| -------------------------- | ----------------------- | ---------------------------------------- |
| `needs-triage`             | `state:needs-triage`    | Maintainer needs to evaluate this issue  |
| `needs-info`               | `state:needs-info`      | Waiting on reporter for more information |
| `ready-for-agent`          | `state:ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `state:ready-for-human` | Requires human implementation            |
| `wontfix`                  | `state:wontfix`         | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Additional labels

Not part of the triage state machine. Apply them when classifying an issue; skills don't require them.

**Type**: `type:bug`, `type:feature` (features and enhancements), `type:documentation`, `type:ui-ux`, `type:chore`

**Priority**
- `priority:p0`: drop everything
- `priority:p1`: high
- `priority:p2`: medium
- `priority:p3`: low

**Severity** (impact, mostly for bugs)
- `severity:blocker`: stops release or all work, no way around
- `severity:critical`: data loss, wrong money numbers, security
- `severity:major`: core flow broken, no workaround
- `severity:minor`: broken, workaround exists
- `severity:trivial`: cosmetic
