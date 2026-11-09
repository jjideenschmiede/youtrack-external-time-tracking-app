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
- Clock in the issue panel: start the clock of the time tracking system with one click, see the elapsed time and stop it again, also from the weekly timesheet, optionally rounded to blocks of 5, 10, 15, 30 or 60 minutes, with an optional reminder for clocks that are running for a long time
- Comparison of the tracked time with the estimation of the issue, based on the time tracking settings of the project or any other period field
- "Log Time" dialog in the issue options menu
- Edit your own time entries from the issue panel and the weekly timesheet, as long as the editing lock of the time tracking system allows it
- Weekly timesheet in the YouTrack main menu, issue IDs in entry descriptions are linked to their issues
- Time Tracking tab in each project with a weekly or monthly report grouped by issue, person, customer, project or service, including CSV export
- Automatic preselection of customer, project and service based on YouTrack issue fields, and of the customer based on the customer groups of helpdesk tickets
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

In helpdesk projects, the customer is also preselected from the customer groups of the ticket. If the ticket has several customer groups, the first one is used. A customer field from the app settings takes precedence when it contains a value. If no customer of the time tracking system has the name of the customer group, the last selected customer is kept.

Clock entries can be rounded with the app settings "Clock rounding" and "Rounding mode", either globally or per project. With "15 minutes" and "Round up", every started quarter of an hour counts, so 31 minutes are logged as 45 minutes. Manually entered durations are never rounded.

With the app setting "Clock reminder", users get an e-mail notification from YouTrack when a clock that they started in an issue has been running for 1, 2, 4 or 8 hours. The notification is sent to the e-mail address in the YouTrack profile, so YouTrack needs a configured mail server. Before the notification is sent, the app checks in the time tracking system that the clock is still running. Every clock is reminded only once. Clocks that were started directly in the time tracking system are not reminded.

The issue panel shows how much of the estimation of an issue has been used, and the project report shows the estimation per issue. The app finds the estimation field automatically: it uses the estimation field from the time tracking settings of the project, otherwise a period field named "Estimation", otherwise the only period field of the project apart from "Spent time". So the estimation also works without YouTrack's built-in time tracking. To use another period field, enter its name in the app setting "Estimation field". Periods are converted with 8 hours per day and 5 days per week.

The issue panel and the project report show the time entries that were logged via the app. Changes made directly in the time tracking system are synchronized when the person who logged the entry opens the issue, at most every 10 minutes. Customers, projects, services, absences and public holidays are cached per user for 10 minutes, so new entries in these lists appear in the form after at most 10 minutes.

> [!NOTE]
> Always install updates over the existing app. Deleting the app removes the connected accounts and the overview of logged time on issues in YouTrack. The time entries themselves remain in the time tracking system.

### App settings

All settings are optional and can be set globally or per project. MCP tools always use the global settings.

| Setting | Description |
| --- | --- |
| Customer field, Project field, Service field | Names of YouTrack fields whose values match customers, projects or services of the time tracking system. The matching entry is preselected in the form. |
| Estimation field | Name of a period field with the estimation, for example "Estimation". Only needed if the automatically detected estimation field is not the right one. |
| Clock rounding | Rounds stopped clock entries to blocks of 5, 10, 15, 30 or 60 minutes. "Off" by default. |
| Rounding mode | "Round up" counts every started block, "Round to nearest" rounds to the closest block. At least one block is always logged. |
| Clock reminder | Sends an e-mail notification to users when a clock started in an issue has been running for 1, 2, 4 or 8 hours. "Off" by default. |

## MCP Tools

The app provides tools for AI assistants that are connected to YouTrack via the [YouTrack MCP server](https://www.jetbrains.com/help/youtrack/server/model-context-protocol-server.html).

| Tool | Description |
| --- | --- |
| `time_tracking_project_report` | Time logged in a project for a date range, grouped by issue, user, customer, project or service. Requires `Update Not Own Work Items` in the project. |
| `time_tracking_issue_time` | Total time, estimation, entries and the running clock of an issue. |
| `time_tracking_my_entries` | Your own entries from the time tracking system for up to 62 days. |
| `time_tracking_log_time` | Logs time on an issue, for example "log 1h 30m on DEMO-3 for the review". |
| `time_tracking_start_clock` | Starts the clock for an issue. |
| `time_tracking_stop_clock` | Stops the running clock and adds the entry to its issue. |
| `time_tracking_job_result` | Returns the result of the tools above that call the time tracking system. |

Every tool runs with the permissions of the connected user, who needs `Create Work Items` for the issue tools and a connected account for the tools that call the time tracking system. These tools answer with a job ID right away, and the assistant gets the result with `time_tracking_job_result`. Customer, project and service default to the last selection of the user in the issue project; the assistant can pass other names.

### Connecting an AI assistant

JetBrains describes how to connect AI assistants to YouTrack, including authentication with OAuth or a permanent token, in the documentation of the MCP server for [YouTrack Cloud](https://www.jetbrains.com/help/youtrack/cloud/model-context-protocol-server.html) and [YouTrack Server](https://www.jetbrains.com/help/youtrack/server/model-context-protocol-server.html). Every user also finds the complete address of the MCP server for this app in the YouTrack profile under "Time Tracking".

For security reasons, YouTrack only offers tools of apps that are listed in the URL of the MCP server. Add the parameter `customToolPackages` to the URL of your YouTrack MCP server:

```
https://youtrack.example.com/mcp?customToolPackages=external-time-tracking
```

All built-in YouTrack tools keep working with this URL, so you can replace an existing YouTrack connection instead of adding a second one. If you already use tools of other apps, separate the app names with commas, for example `customToolPackages=other-app,external-time-tracking`.

**Claude (claude.ai and Claude Desktop):** Open Settings, then Connectors, remove an existing YouTrack connector and add a custom connector with the URL above. Sign in to YouTrack when you are asked to.

**Claude Code:** Create a [permanent token](https://www.jetbrains.com/help/youtrack/server/manage-permanent-token.html) in YouTrack and run:

```
claude mcp add --transport http youtrack "https://youtrack.example.com/mcp?customToolPackages=external-time-tracking" --header "Authorization: Bearer <token>"
```

**Cursor, VS Code and other clients:** Add the server to the MCP configuration of the client, for example in `mcp.json`:

```json
{
  "mcpServers": {
    "youtrack": {
      "url": "https://youtrack.example.com/mcp?customToolPackages=external-time-tracking",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

After the app is installed or updated, disconnect and reconnect the assistant, otherwise it doesn't see new tools.

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
