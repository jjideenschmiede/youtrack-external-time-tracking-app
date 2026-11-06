# YouTrack External Time Tracking App

A YouTrack app that connects YouTrack with external time tracking systems such as clocko:do: log time directly in issues, see tracked time per issue, open your weekly timesheet and get time reports per project.

---

<div>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/youtrack-certified-partner-white.svg">
    <img src="docs/images/youtrack-certified-partner-black.svg" alt="YouTrack Certified Partner" align="middle">
  </picture>
  <img src="docs/images/spacer.png" width="40" height="1" alt="" align="middle">
  <img src="docs/images/youtrack-honored-app-creator.png" alt="Honored YouTrack App Creator" height="120" align="middle">
</div>

## YouTrack Apps, TeamCity Plugins & more

### J&J Ideenschmiede GmbH - Your Partner for JetBrains Solutions

We are **YouTrack Certified** and **TeamCity Certified** developers, specializing in custom solutions for JetBrains products.

👉🏼 Visit our [website](https://www.jj-ideenschmiede.de) to learn more about our services.

---

## Features

The App lets every user connect their own account of an external time tracking system and log time without leaving YouTrack. Entries are created directly in the time tracking system, so it stays the single source of truth. Currently clocko:do is supported.

- Personal connection to the time tracking system in the YouTrack profile, credentials are verified before saving and never sent back to the browser
- Time Tracking panel in the issue sidebar with the total tracked time and a form for new entries
- Clock in the issue panel: start the clock of the time tracking system with one click, see the elapsed time and stop it again, also from the weekly timesheet, optionally rounded to blocks of 5, 10, 15, 30 or 60 minutes
- Optional comparison of the tracked time with the estimation of the issue, also without YouTrack's built-in time tracking
- "Log Time" dialog in the issue options menu
- Edit your own time entries from the issue panel and the weekly timesheet, as long as the editing lock of the time tracking system allows it
- Weekly timesheet in the YouTrack main menu, issue IDs in entry descriptions are linked to their issues
- Time Tracking tab in each project with a weekly or monthly report grouped by issue, person, customer, project or service, including CSV export
- Automatic preselection of customer, project and service based on YouTrack issue fields
- Remembers the last selected values per project
- MCP tools for AI assistants: ask for project reports and the time on an issue, load your own entries, log time and start or stop the clock
- User interface in English and German, based on the user's YouTrack language

## Requirements

- YouTrack 2026.2 or later
- An account in a supported time tracking system (clocko:do) with API access

## Installation

1. Download the latest release from the [marketplace](https://plugins.jetbrains.com/plugin/35793-external-time-tracking)
2. Go to the YouTrack Administration area
3. Navigate to Apps
4. Click "Upload app zip"
5. Select the downloaded zip file
6. Attach the app to the projects in which time should be tracked

## Configuration

Each user connects their own account in the YouTrack profile under "Time Tracking". For clocko:do, this requires the e-mail address and the API key of the user.

The Time Tracking panel and the "Log Time" dialog in issues are only visible to users who can add work items (`Create Work Items`), so reporters in helpdesk projects don't see who logged how much time. The Time Tracking tab in projects is only visible to users with the permission to update work items of other users (`Update Not Own Work Items`). Project and system administrators have it by default; grant it to other roles, for example a manager role, to give them access to the report.

Optionally, administrators can map YouTrack fields to the customer, project and service of the time tracking system in the app settings, either globally or per project. If an issue field contains a value, the matching entry is preselected in the form.

Clock entries can be rounded with the app settings "Clock rounding" and "Rounding mode", either globally or per project. With "15 minutes" and "Round up", every started quarter of an hour counts, so 31 minutes are logged as 45 minutes. Manually entered durations are never rounded.

To compare the tracked time with an estimation, enter the name of a period field, for example "Estimation", in the app setting "Estimation field". The issue panel then shows the estimation and how much of it has been used, and the project report shows the estimation per issue. The field works independently of YouTrack's built-in time tracking. Periods are converted with 8 hours per day and 5 days per week.

The issue panel and the project report show the time entries that were logged via the app. Changes made directly in the time tracking system are synchronized when the person who logged the entry opens the issue, at most every 10 minutes. Customers, projects, services, absences and public holidays are cached per user for 10 minutes, so new entries in these lists appear in the form after at most 10 minutes.

> [!NOTE]
> Always install updates over the existing app. Deleting the app removes the connected accounts and the overview of logged time on issues in YouTrack. The time entries themselves remain in the time tracking system.

### App settings

All settings are optional and can be set globally or per project. MCP tools always use the global settings.

| Setting | Description |
| --- | --- |
| Customer field, Project field, Service field | Names of YouTrack fields whose values match customers, projects or services of the time tracking system. The matching entry is preselected in the form. |
| Estimation field | Name of a period field with the estimation, for example "Estimation". |
| Clock rounding | Rounds stopped clock entries to blocks of 5, 10, 15, 30 or 60 minutes. "Off" by default. |
| Rounding mode | "Round up" counts every started block, "Round to nearest" rounds to the closest block. At least one block is always logged. |

## MCP Tools

The app provides tools for AI assistants that are connected to YouTrack via the [YouTrack MCP server](https://www.jetbrains.com/help/youtrack/server/model-context-protocol-server.html). Custom tools have to be enabled in the MCP endpoint URL:

```
https://<your-youtrack>/mcp?customToolPackages=external-time-tracking
```

| Tool | Description |
| --- | --- |
| `time_tracking_project_report` | Time logged in a project for a date range, grouped by issue, user, customer, project or service. Requires `Update Not Own Work Items` in the project. |
| `time_tracking_issue_time` | Total time, estimation, entries and the running clock of an issue. |
| `time_tracking_my_entries` | Your own entries from the time tracking system for up to 62 days. |
| `time_tracking_log_time` | Logs time on an issue, for example "log 1h 30m on DEMO-3 for the review". |
| `time_tracking_start_clock` | Starts the clock for an issue. |
| `time_tracking_stop_clock` | Stops the running clock and adds the entry to its issue. |
| `time_tracking_job_result` | Returns the result of the tools above that call the time tracking system. |

Every tool runs with the permissions of the connected user, who needs `Create Work Items` for the issue tools and a connected account for the tools that call the time tracking system. These tools answer with a job ID right away, and the assistant gets the result with `time_tracking_job_result`. Customer, project and service default to the last selection of the user in the issue project; the assistant can pass other names. After the app is installed or updated, reconnect the assistant to see new tools.

## Development

> [!NOTE]
> You need to have Node.js and npm installed to install, build, and pack the app.

You can clone this repository and build the app locally. Make sure you have Node.js and npm installed. Install the dependencies and build the app using:

```bash
npm install
```

After that, you can run the following command to build the app:

```bash
npm run build
```

If you want to pack the app for distribution, you can use:

```bash
npm run pack
```

## Help & Support

If you have any questions or need support, feel free to reach out to us via [e-mail](mailto:support@jj-ideenschmiede.de) or visit our [website](https://www.jj-ideenschmiede.de).
