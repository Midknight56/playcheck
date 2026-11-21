// Tests for tools/check-manifest.mjs. Written before the checker.
// Each case builds a valid repository in a temporary folder, applies one edit,
// and runs the checker on it. The real repository is never written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'check-manifest.mjs');

// The module is loaded inside each case, so a missing module fails each case alone.
async function load() {
  return import('./check-manifest.mjs');
}

const SKILL = [
  '---',
  'name: playcheck',
  'description: How to play a game through the five kit tools and report what happened.',
  'triggers: [playcheck, playtest, new_game, play a level]',
  'always: false',
  '---',
  '',
  '# Playcheck',
  '',
  'Body text.',
  '',
].join('\n');

function validManifest() {
  return {
    name: 'playcheck',
    version: '0.1.0',
    displayName: 'Playcheck',
    description: 'A Crew agent that plays a game built with the kit.',
    author: 'someone',
    license: 'MIT',
    minKiroCrewVersion: '0.12.2',
    tags: ['testing', 'games', 'mcp'],
    agents: ['agents/playtester.json'],
    skills: ['skills/playcheck'],
    mcpServers: {
      'playcheck-garden': {
        command: 'node',
        args: ['<KIT_REPO>/kit/mcp/dist/server.js', '--game', '<KIT_REPO>/apps/garden'],
      },
      'playcheck-commits': {
        command: 'node',
        args: ['<APP_DIR>/tools/commit-watch.mjs', '<KIT_REPO>', '--state', '<APP_DIR>/data'],
      },
    },
    crons: [
      {
        name: 'nightly-play',
        cron_expr: '0 3 * * *',
        agent: 'playcheck-tester',
        enabled: false,
        message: 'List the levels with new_game. Play the first three to a won status.',
      },
    ],
    dependencies: { commands: ['node'] },
    permissions: { cron: true },
  };
}

function validAgent() {
  return {
    name: 'playcheck-tester',
    model: 'auto',
    description: 'Plays a game through the tool door and reports what it saw.',
    prompt: 'You are a playtester.',
    tools: ['@playcheck:playcheck-garden', '@playcheck:playcheck-commits'],
  };
}

// edit receives { manifest, agent, skill, raw, remove }.
// raw maps a relative file name to text that replaces the serialized file.
// remove lists relative files to delete after writing.
function makeRepo(t, edit) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playcheck-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ctx = { manifest: validManifest(), agent: validAgent(), skill: SKILL, raw: {}, remove: [] };
  if (edit) edit(ctx);
  const files = {
    'app.json': JSON.stringify(ctx.manifest, null, 2) + '\n',
    'agents/playtester.json': JSON.stringify(ctx.agent, null, 2) + '\n',
    'skills/playcheck/SKILL.md': ctx.skill,
    'README.md': 'Replace <KIT_REPO> with the path of the kit repository.\n',
    'LICENSE': 'MIT License\n',
    ...ctx.raw,
  };
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
  }
  for (const name of ctx.remove) fs.rmSync(path.join(root, name), { force: true });
  return root;
}

async function run(t, edit, options) {
  const { checkRepo } = await load();
  return checkRepo(makeRepo(t, edit), options);
}

function rules(problems) {
  return problems.map((p) => p.rule);
}

function assertRule(problems, rule) {
  assert.ok(rules(problems).includes(rule), `expected rule ${rule}, got ${JSON.stringify(problems)}`);
}

test('valid repository has no problem', async (t) => {
  assert.deepEqual(await run(t), []);
});

test('valid repository, strict off, placeholder in args and README is no problem', async (t) => {
  const root = makeRepo(t);
  assert.match(fs.readFileSync(path.join(root, 'app.json'), 'utf8'), /<KIT_REPO>/);
  assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /<KIT_REPO>/);
  const { checkRepo } = await load();
  assert.deepEqual(checkRepo(root, { strict: false }), []);
});

test('strict reports the placeholder once', async (t) => {
  const problems = await run(t, null, { strict: true });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].rule, 'placeholder');
});

// playcheck-depth task 3: the app folder placeholder.
test('strict names both placeholders in its one problem', async (t) => {
  const problems = await run(t, null, { strict: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /<KIT_REPO>/);
  assert.match(problems[0].message, /<APP_DIR>/);
});

test('strict names <APP_DIR> alone when only that one is left', async (t) => {
  const problems = await run(t, (c) => {
    c.manifest.mcpServers['playcheck-garden'].args = ['C:/kit/kit/mcp/dist/server.js', '--game', 'C:/kit/apps/garden'];
    c.manifest.mcpServers['playcheck-commits'].args = ['<APP_DIR>/tools/commit-watch.mjs', 'C:/kit', '--state', '<APP_DIR>/data'];
  }, { strict: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /<APP_DIR>/);
  assert.doesNotMatch(problems[0].message, /<KIT_REPO>/);
});

test('strict passes when both placeholders are replaced', async (t) => {
  assert.deepEqual(await run(t, (c) => {
    c.manifest.mcpServers['playcheck-garden'].args = ['C:/kit/kit/mcp/dist/server.js', '--game', 'C:/kit/apps/garden'];
    c.manifest.mcpServers['playcheck-commits'].args = ['C:/app/tools/commit-watch.mjs', 'C:/kit', '--state', 'C:/app/data'];
  }, { strict: true }), []);
});

// playcheck-depth task 5: the state folder is named in app.json.
test('playcheck-commits without --state is a problem', async (t) => {
  assertRule(await run(t, (c) => {
    c.manifest.mcpServers['playcheck-commits'].args = ['<APP_DIR>/tools/commit-watch.mjs', '<KIT_REPO>'];
  }), 'state-arg');
});

test('playcheck-commits with --state and no folder after it is a problem', async (t) => {
  assertRule(await run(t, (c) => {
    c.manifest.mcpServers['playcheck-commits'].args = ['<APP_DIR>/tools/commit-watch.mjs', '<KIT_REPO>', '--state'];
  }), 'state-arg');
  assertRule(await run(t, (c) => {
    c.manifest.mcpServers['playcheck-commits'].args = ['<APP_DIR>/tools/commit-watch.mjs', '<KIT_REPO>', '--state', '--other'];
  }), 'state-arg');
});

test('strict names the state folder next to <APP_DIR>', async (t) => {
  const problems = await run(t, null, { strict: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /<APP_DIR>\/data/);
});

test('strict fails a state folder that is not under <APP_DIR> or a replaced app folder', async (t) => {
  const problems = await run(t, (c) => {
    c.manifest.mcpServers['playcheck-garden'].args = ['C:/kit/kit/mcp/dist/server.js', '--game', 'C:/kit/apps/garden'];
    c.manifest.mcpServers['playcheck-commits'].args = ['C:/app/tools/commit-watch.mjs', 'C:/kit', '--state', 'C:/tmp'];
  }, { strict: true });
  assertRule(problems, 'state-arg');
});

// playcheck-depth task 6: the README tells what the runs of 2026-11-20 showed.
test('the real README holds the run 2 text, copied unchanged from docs/crew-runs-2026-11-20.md', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  const runs = fs.readFileSync(path.join(repo, 'docs/crew-runs-2026-11-20.md'), 'utf8');
  const start = runs.indexOf('All six runner levels match.');
  const end = runs.indexOf('## Run 3');
  assert.ok(start > 0 && end > start);
  const quoted = runs.slice(start, end).trimEnd().split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
  assert.ok(readme.includes(quoted), 'run 2 is not in the README as a quoted block');
});

test('the real README names the three job steps, the manual run, and what was not run', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  for (const text of ['agent.apps_trusted', 'cron update <job id> --approval-mode auto', 'cron resume <job id>',
    'cron trigger <job id>', 'was not run on 2026-11-20', '--state',
    'Error: cannot reach gateway']) {
    assert.ok(readme.includes(text), `the README does not hold: ${text}`);
  }
  assert.doesNotMatch(readme, /This version of the job has not run/);
  assert.doesNotMatch(readme, /Version 0\.2\.0[^.]*has not been installed/);
});
// playcheck-depth task 7: the dashboard route was tried on 2026-11-20 (fact E).
test('the real README tells that the dashboard route was tried, and names Install from Path and the trust dialog', () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /dashboard route[^.]*was not tried/);
  for (const text of ['Install from Path', 'Manage app sources', 'Trust "Playcheck" to run its own code?',
    'Trust this app and enable', 'playcheck 0.2.1 disabled']) {
    assert.ok(readme.includes(text), `the README does not hold: ${text}`);
  }
});
test('bad JSON in app.json', async (t) => {
  assertRule(await run(t, (c) => { c.raw['app.json'] = '{'; }), 'json');
});

test('name that is not kebab-case', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.name = 'Play_Check'; }), 'name');
});

test('version that is not semver', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.version = '0.1'; }), 'semver');
});

test('version 1.0.0 is not below 1', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.version = '1.0.0'; }), 'version-below-1');
});

test('empty description', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.description = ''; }), 'required-fields');
});

test('extra manifest key names the key', async (t) => {
  const problems = await run(t, (c) => { c.manifest.repo = 'x'; });
  assertRule(problems, 'allowed-keys');
  assert.ok(problems.some((p) => p.rule === 'allowed-keys' && p.message.includes('repo')));
});

test('extra agent key', async (t) => {
  assertRule(await run(t, (c) => { c.agent.includeMcpJson = true; }), 'allowed-keys');
});

test('extra server key', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.mcpServers['playcheck-garden'].autoApprove = ['act']; }), 'allowed-keys');
});

test('extra cron key', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.crons[0].schedule = '0 3 * * *'; }), 'allowed-keys');
});

test('agent without model', async (t) => {
  assertRule(await run(t, (c) => { delete c.agent.model; }), 'required-fields');
});

// playcheck-depth task 1: the agent tools and the declared servers must match.
test('agent tool names a server that mcpServers does not declare', async (t) => {
  const problems = await run(t, (c) => { c.agent.tools.push('@playcheck:playcheck-runner'); });
  assertRule(problems, 'agent-tools');
  assert.ok(problems.some((p) => p.rule === 'agent-tools' && p.message.includes('playcheck-runner')));
});

test('declared server is not in the agent tools', async (t) => {
  const problems = await run(t, (c) => {
    c.manifest.mcpServers['playcheck-runner'] = {
      command: 'node',
      args: ['<KIT_REPO>/kit/mcp/dist/server.js', '--game', '<KIT_REPO>/apps/runner'],
    };
  });
  assertRule(problems, 'agent-tools');
  assert.ok(problems.some((p) => p.rule === 'agent-tools' && p.message.includes('playcheck-runner')));
});

test('agent tool of another form is not judged', async (t) => {
  assert.deepEqual(await run(t, (c) => { c.agent.tools.push('@kirocrew-core'); }), []);
});

test('agent path goes up', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.agents = ['../x.json']; }), 'path-inside');
});

test('agent path is absolute', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.agents = [path.resolve('/x.json')]; }), 'path-inside');
});

test('agent path names a missing file', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.agents = ['agents/missing.json']; }), 'path-exists');
});

test('skill folder without SKILL.md', async (t) => {
  assertRule(await run(t, (c) => { c.remove.push('skills/playcheck/SKILL.md'); }), 'path-exists');
});

test('cron with both every and cron_expr', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.crons[0].every = 300; }), 'cron-schedule');
});

test('cron with neither every nor cron_expr', async (t) => {
  assertRule(await run(t, (c) => { delete c.manifest.crons[0].cron_expr; }), 'cron-schedule');
});

test('cron enabled is a string', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.crons[0].enabled = 'false'; }), 'cron-enabled-boolean');
});

test('cron enabled is true', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.crons[0].enabled = true; }), 'cron-ships-off');
});

test('cron enabled is missing', async (t) => {
  assertRule(await run(t, (c) => { delete c.manifest.crons[0].enabled; }), 'cron-ships-off');
});

test('door args end with --game', async (t) => {
  assertRule(await run(t, (c) => {
    c.manifest.mcpServers['playcheck-garden'].args = ['<KIT_REPO>/kit/mcp/dist/server.js', '--game'];
  }), 'door-args');
});

test('door --game is followed by a flag', async (t) => {
  assertRule(await run(t, (c) => {
    c.manifest.mcpServers['playcheck-garden'].args = ['<KIT_REPO>/kit/mcp/dist/server.js', '--game', '--x'];
  }), 'door-args');
});

test('dependencies.commands without node', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.dependencies.commands = []; }), 'dependencies');
});

test('crons without permissions.cron', async (t) => {
  assertRule(await run(t, (c) => { delete c.manifest.permissions; }), 'cron-permission');
});

test('permissions.cron is not true', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.permissions.cron = 'yes'; }), 'cron-permission');
});

test('extra permissions key', async (t) => {
  assertRule(await run(t, (c) => { c.manifest.permissions.mcpTools = ['act']; }), 'allowed-keys');
});

test('skill without front matter', async (t) => {
  assertRule(await run(t, (c) => { c.skill = 'Just text.\n'; }), 'skill-front-matter');
});

test('skill without triggers', async (t) => {
  assertRule(await run(t, (c) => { c.skill = c.skill.replace(/^triggers:.*\n/m, ''); }), 'skill-front-matter');
});

test('skill name differs from the folder', async (t) => {
  assertRule(await run(t, (c) => { c.skill = c.skill.replace('name: playcheck', 'name: other'); }), 'skill-front-matter');
});

test('byte order mark in app.json', async (t) => {
  assertRule(await run(t, (c) => {
    c.raw['app.json'] = '\uFEFF' + JSON.stringify(c.manifest, null, 2) + '\n';
  }), 'encoding');
});

test('carriage return in SKILL.md', async (t) => {
  assertRule(await run(t, (c) => { c.skill = c.skill.replace(/\n/g, '\r\n'); }), 'encoding');
});

test('token-like text in a file', async (t) => {
  const token = 'ghp' + '_' + 'A'.repeat(36);
  assertRule(await run(t, (c) => { c.raw['notes.txt'] = `key ${token}\n`; }), 'secret');
});

test('Windows user folder in a file', async (t) => {
  const folder = 'C:' + '\\' + 'Users' + '\\' + 'someone' + '\\' + 'work';
  assertRule(await run(t, (c) => { c.raw['notes.txt'] = `path ${folder}\n`; }), 'secret');
});

function cli(root, ...flags) {
  return spawnSync(process.execPath, [script, ...flags, root], { encoding: 'utf8' });
}

test('command line, valid repository, exits 0 and prints ok', (t) => {
  const result = cli(makeRepo(t));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\bok\b/);
});

test('command line, bad repository, exits 1 and names the file and the rule', (t) => {
  const result = cli(makeRepo(t, (c) => { c.manifest.version = '1.0.0'; }));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /app\.json/);
  assert.match(result.stdout, /version-below-1/);
});

test('command line, --strict, exits 1 and names the placeholder', (t) => {
  const result = cli(makeRepo(t), '--strict');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /placeholder/);
});

// playcheck-depth task 8: the first runs of version 0.2.1 on Crew (20 Nov 2026).
function readRepoFile(name) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  return fs.readFileSync(path.join(repo, name), 'utf8');
}

test('the real README no longer says that 0.2.1 has not run or is switched off', () => {
  const readme = readRepoFile('README.md');
  assert.doesNotMatch(readme, /0\.2\.1 was not yet run/);
  assert.doesNotMatch(readme, /was not yet run on Crew/);
  assert.doesNotMatch(readme, /has not run on Crew/);
  assert.doesNotMatch(readme, /installed and switched off/);
});

test('the real README tells the runs 4 and 5 of version 0.2.1 and the data folder', () => {
  const readme = readRepoFile('README.md');
  for (const text of ['playcheck 0.2.1 enabled', 'Trust this app and enable',
    '46decffc1423863afb37ce4396f64c55e20c33cb', 'No new commit',
    '~/.kiro/crew/apps/playcheck/data/playcheck-commit-state.json',
    'I sent the proof\'s action lists for these two levels rather than finding my own.']) {
    assert.ok(readme.includes(text), `the README does not hold: ${text}`);
  }
  const runs = readRepoFile('docs/crew-runs-2026-11-20.md');
  assert.ok(runs.includes('No new commit. The hash is `46decffc1423863afb37ce4396f64c55e20c33cb`'));
});

test('the real README does not say the agent won runs 2 to 4 by hand, and has the limits line', () => {
  const readme = readRepoFile('README.md');
  assert.doesNotMatch(readme, /won[^.\n]*by hand/);
  assert.ok(readme.includes('The hand play in these runs replayed the proof\'s own action lists'), 'limits line is missing');
  assert.ok(readme.includes('it is not a test of how an agent finds a win'), 'limits line is missing');
});