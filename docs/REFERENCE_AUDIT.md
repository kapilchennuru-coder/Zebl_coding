# Reference audit: functional inventory

Scope: read-only structural pass over the 9 pages in the main menu of the provided account on 2026-11-09. Only labels, headings and controls were recorded. No records were opened, no action was clicked, no screenshots were kept and no patient data was captured.

| Reference area | Observed function | ZEBL module |
|---|---|---|
| Home | Launcher of product areas: AR follow-up, analytics, coding, billing, scribing and CDI, policy, assistant | Dashboard, menu |
| Case creation | Create a case, enter values, code a chart; views for full note, note summary, CDI issues, code summary | CaseCraft |
| Coding cases | Cases grouped in jobs; search all fields, job ID, FIN, datapoint ID, service date; archive; totals for all, completed, on hold | Encounters, Work queues |
| AR follow-up | Case search by job ID, archived jobs, data view | AR follow-up |
| Your tasks | Open and closed task lists, refresh | Your tasks |
| Policy review | Policy data view | Policy review |
| Assistant | Chat with link and document attachments | Assistant panel |
| Upload documents | Choose category, add files, upload | Upload documents |
| View uploads | Browse by feature, date and file, with a file viewer | View uploads |

## Unknown or not inspected

- Case detail, the coding screen itself and any record-level page, skipped to avoid patient data.
- Filter menus, dialogs and anything behind a click on a non-link control.
- Admin, user management, reports and settings. None appeared in this account's menu.
- The login page showed no MFA step for this account.

The ZEBL workspace, QA, RBAC and admin modules follow the written product specification, not observed reference behavior.
