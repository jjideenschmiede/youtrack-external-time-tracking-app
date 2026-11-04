# YouTrack External Time Tracking App

A YouTrack app that connects YouTrack with external time tracking systems such as clocko:do: log time directly in issues, see tracked time per issue and open your weekly timesheet in YouTrack.

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
- Time Tracking panel in the issue sidebar with the total and your own tracked time and a form for new entries
- "Log Time" dialog in the issue options menu
- Weekly timesheet in the YouTrack main menu, issue IDs in entry descriptions are linked to their issues
- Time Tracking tab in each project with a weekly or monthly report grouped by issue, person, customer, project or service, including CSV export
- Automatic preselection of customer, project and service based on YouTrack issue fields
- Remembers the last selected values per project
- User interface in English and German, based on the user's YouTrack language

## Requirements

- YouTrack 2026.2 or later
- An account in a supported time tracking system (clocko:do) with API access

## Installation

1. Download the latest release from the [marketplace](https://plugins.jetbrains.com/)
2. Go to the YouTrack Administration area
3. Navigate to Apps
4. Click "Upload app zip"
5. Select the downloaded zip file
6. Attach the app to the projects in which time should be tracked

## Configuration

Each user connects their own account in the YouTrack profile under "Time Tracking". For clocko:do, this requires the e-mail address and the API key of the user.

The Time Tracking panel and the "Log Time" dialog in issues are only visible to users who can add work items (`Create Work Items`), so reporters in helpdesk projects don't see who logged how much time. The Time Tracking tab in projects is only visible to users with the permission to update work items of other users (`Update Not Own Work Items`). Project and system administrators have it by default; grant it to other roles, for example a manager role, to give them access to the report.

Optionally, administrators can map YouTrack fields to the customer, project and service of the time tracking system in the app settings, either globally or per project. If an issue field contains a value, the matching entry is preselected in the form.

> [!NOTE]
> Always install updates over the existing app. Deleting the app also removes the connected accounts and the tracked time stored on issues.

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
