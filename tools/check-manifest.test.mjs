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
    tools: ['@playcheck-garden'],
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
