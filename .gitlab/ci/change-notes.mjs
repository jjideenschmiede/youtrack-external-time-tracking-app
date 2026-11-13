import fs from 'node:fs';
import process from 'node:process';

const [notesPath, manifestPath] = process.argv.slice(2);

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sentence(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const sections = [];
fs.readFileSync(notesPath, 'utf8').split('\n').forEach((line) => {
  if (line.startsWith('## ')) {
    sections.push({title: line.slice(3).replace(/^[^A-Za-z]+/, ''), items: []});
  } else if (line.startsWith('- ') && sections.length > 0) {
    sections[sections.length - 1].items.push(sentence(line.slice(2).trim()));
  }
});

const html = sections
  .map((section) => '<b>' + escapeHtml(section.title) + '</b><ul>' +
    section.items.map((item) => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>')
  .join('');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (html) {
  manifest.changeNotes = html.slice(0, 65000);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
process.stdout.write((html || 'No change notes for this release.') + '\n');
