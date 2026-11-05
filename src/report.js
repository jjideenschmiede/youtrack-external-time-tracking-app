const entities = require('@jetbrains/youtrack-scripting-api/entities');
const common = require('./common');

const MAX_RANGE_DAYS = 366;

function readRange(body) {
  const range = common.readRange(body.from, body.to, MAX_RANGE_DAYS, 'reportRangeTooLong');
  return {from: new Date(range.from).getTime(), to: new Date(range.to).getTime()};
}

function scanProject(project) {
  const found = [];
  project.issues.forEach((issue) => {
    if (common.readIssueEntries(issue).length > 0) {
      found.push(issue.id);
    }
  });
  return found;
}

function loadIndex(project) {
  const index = common.readProjectIndex(project) || {complete: false, issues: []};
  if (!index.complete) {
    scanProject(project).forEach((id) => {
      if (index.issues.indexOf(id) === -1) {
        index.issues.push(id);
      }
    });
    index.complete = true;
    common.writeProjectIndex(project, index);
  }
  return index;
}

function findIssue(id) {
  try {
    return entities.Issue.findById(id);
  } catch {
    return null;
  }
}

function projectIssues(project, user) {
  const index = loadIndex(project);
  const kept = [];
  const visible = [];
  index.issues.forEach((id) => {
    const issue = findIssue(id);
    if (!issue || issue.project.key !== project.key || kept.indexOf(issue.id) !== -1) {
      return;
    }
    kept.push(issue.id);
    if (issue.isVisibleTo(user)) {
      visible.push(issue);
    }
  });
  if (kept.length !== index.issues.length || kept.some((id, i) => id !== index.issues[i])) {
    common.writeProjectIndex(project, {complete: true, issues: kept});
  }
  return visible;
}

function hasRefs(entry) {
  return !!entry.refs && ['customer', 'project', 'service'].some((key) => !!entry.refs[key]);
}

function needsRefs(entry, range) {
  const start = new Date(entry.start).getTime();
  return !entry.deleted && !entry.refsChecked && !hasRefs(entry) && start >= range.from && start < range.to;
}

exports.readRange = readRange;
exports.projectIssues = projectIssues;
exports.hasRefs = hasRefs;
exports.needsRefs = needsRefs;
