// Tests for tools/commit-watch.mjs. Written before the server.
// Each case starts the server as a child process on a throwaway git repository
// that is made in a temporary folder. The real repository and the kit are never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, 'commit-watch.mjs');
const STATE_FILE = 'playcheck-commit-state.json';

function tempDir(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `commit-watch-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(folder, ...args) {
  return execFileSync(
    'git',
    ['-C', folder, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args],
    { encoding: 'utf8' },
  ).trim();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

const replayOf = (game, level, hash) => ({
  format: 1, game, rulesVersion: '1', level, seed: 1, actions: ['a', 'b*3'], finalHash: hash, finalPhase: 'won',
});

// A git repository with two commits and a proofs folder.
function makeKit(t) {
  const kit = tempDir(t, 'kit');
  git(kit, 'init', '-q');
  writeJson(path.join(kit, 'proofs/garden/g01.json'), { level: 'g01', replay: replayOf('garden', 'g01', 'aaaa000000000001') });
  writeJson(path.join(kit, 'proofs/garden/index.json'), { game: 'garden', levels: [{ id: 'g01', actions: 2 }] });
  git(kit, 'add', '-A');
  git(kit, 'commit', '-q', '-m', 'First commit');
  writeJson(path.join(kit, 'proofs/garden/g02.json'), { level: 'g02', replay: replayOf('garden', 'g02', 'aaaa000000000002') });
  writeJson(path.join(kit, 'proofs/runner/r01.json'), { level: 'r01', replay: replayOf('runner', 'r01', 'bbbb000000000001') });
  git(kit, 'add', '-A');
  git(kit, 'commit', '-q', '-m', 'Second commit: add g02 and r01');
  return kit;
}

// A JSON-RPC client for the child process. Every wait ends at 5 seconds or when the child exits.
function start(t, args, env = {}) {
  const childEnv = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete childEnv[key];
  const child = spawn(process.execPath, [server, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv });
  const messages = [];
  const waiters = [];
  let buffer = '';
  let stderr = '';
  let exited = null;
  const settle = () => {
    for (const waiter of [...waiters]) {
      const found = messages.find((message) => waiter.match(message));
      if (found) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(found);
      } else if (exited !== null) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.reject(new Error(`the server exited with code ${exited} before it answered. stderr: ${stderr.trim()}`));
      }
    }
  };
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      if (line.trim() === '') continue;
      messages.push(JSON.parse(line));
    }
    settle();
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  child.on('close', (code) => { exited = code ?? -1; settle(); });
  t.after(() => { child.kill(); });

  const wait = (match) => new Promise((resolve, reject) => {
    const waiter = { match, resolve, reject };
    waiters.push(waiter);
    const timer = setTimeout(() => {
      const at = waiters.indexOf(waiter);
      if (at >= 0) { waiters.splice(at, 1); reject(new Error(`no answer in 5 seconds. stderr: ${stderr.trim()}`)); }
    }, 5000);
    const done = () => clearTimeout(timer);
    waiter.resolve = (value) => { done(); resolve(value); };
    waiter.reject = (error) => { done(); reject(error); };
    settle();
  });

  let nextId = 1;
  const client = {
    child,
    messages,
    get stderr() { return stderr; },
    exit: () => new Promise((resolve) => { if (exited !== null) resolve(exited); else child.on('close', (code) => resolve(code)); }),
    send(object) { child.stdin.write(JSON.stringify(object) + '\n'); },
    sendRaw(text) { child.stdin.write(text + '\n'); },
    notify(method, params) { client.send({ jsonrpc: '2.0', method, params }); },
    request(method, params) {
      const id = nextId++;
      client.send({ jsonrpc: '2.0', id, method, params });
      return wait((message) => message.id === id);
    },
    // Calls a tool. Returns { isError, text, value } where value is the parsed text when it is JSON.
    async call(name, args = {}) {
      const answer = await client.request('tools/call', { name, arguments: args });
      assert.equal(answer.jsonrpc, '2.0');
      assert.ok(answer.result, `expected a result, got ${JSON.stringify(answer)}`);
      assert.equal(answer.result.content[0].type, 'text');
      const text = answer.result.content[0].text;
      let value;
      try { value = JSON.parse(text); } catch { /* an error text is plain */ }
      return { isError: answer.result.isError === true, text, value };
    },
    // The next error answer that arrives after this call.
    nextError() {
      const seen = messages.length;
      return wait((message) => message.error !== undefined && messages.indexOf(message) >= seen);
    },
  };
  return client;
}

async function open(t, kit, stateDir, env) {
  const client = start(t, [kit, '--state', stateDir], env);
  const init = await client.request('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' },
  });
  assert.ok(init.result, `initialize failed: ${JSON.stringify(init)}`);
  client.notify('notifications/initialized');
  return client;
}

test('initialize answers with a protocol version, tools capability and server name', async (t) => {
  const client = start(t, [makeKit(t), '--state', tempDir(t, 'state')]);
  const answer = await client.request('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' },
  });
  assert.equal(answer.jsonrpc, '2.0');
  assert.equal(answer.result.protocolVersion, '2025-03-26');
  assert.deepEqual(answer.result.capabilities, { tools: {} });
  assert.equal(answer.result.serverInfo.name, 'commit-watch');
});

test('initialize with a version the server does not know answers with its latest', async (t) => {
  const client = start(t, [makeKit(t), '--state', tempDir(t, 'state')]);
  const answer = await client.request('initialize', { protocolVersion: '1999-01-01', capabilities: {} });
  assert.equal(answer.result.protocolVersion, '2025-06-18');
});

test('a notification gets no answer, and ping answers an empty object', async (t) => {
  const client = start(t, [makeKit(t), '--state', tempDir(t, 'state')]);
  client.notify('notifications/initialized');
  client.notify('notifications/anything-else');
  const ping = await client.request('ping');
  assert.deepEqual(ping.result, {});
  assert.equal(client.messages.length, 1, `unexpected messages: ${JSON.stringify(client.messages)}`);
});

test('tools/list names the three tools, each with an object input schema', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  const { result } = await client.request('tools/list', {});
  assert.deepEqual(result.tools.map((tool) => tool.name).sort(), ['kit_commit', 'kit_proof', 'mark_checked']);
  for (const tool of result.tools) {
    assert.ok(tool.description.length > 0, `${tool.name} has no description`);
    assert.equal(tool.inputSchema.type, 'object');
  }
  const byName = Object.fromEntries(result.tools.map((tool) => [tool.name, tool.inputSchema]));
  assert.deepEqual(byName.kit_proof.required, ['game']);
  assert.deepEqual(byName.mark_checked.required.sort(), ['hash', 'result']);
});

test('tools/list works without initialize', async (t) => {
  const client = start(t, [makeKit(t), '--state', tempDir(t, 'state')]);
  const { result } = await client.request('tools/list');
  assert.equal(result.tools.length, 3);
});

test('kit_commit gives the full hash and the subject of the kit, stored null, changed true', async (t) => {
  const kit = makeKit(t);
  const client = await open(t, kit, tempDir(t, 'state'));
  const answer = await client.call('kit_commit');
  assert.equal(answer.isError, false);
  assert.equal(answer.value.hash, git(kit, 'rev-parse', 'HEAD'));
  assert.match(answer.value.hash, /^[0-9a-f]{40}$/);
  assert.equal(answer.value.subject, 'Second commit: add g02 and r01');
  assert.equal(answer.value.stored, null);
  assert.equal(answer.value.changed, true);
});

test('mark_checked writes one state file, and kit_commit then says changed false', async (t) => {
  const kit = makeKit(t);
  const state = tempDir(t, 'state');
  const client = await open(t, kit, state);
  const { value: commit } = await client.call('kit_commit');
  const marked = await client.call('mark_checked', { hash: commit.hash, result: '19 of 19 replays matched' });
  assert.equal(marked.isError, false);
  assert.equal(marked.value.ok, true);
  assert.equal(marked.value.stored, commit.hash);

  assert.deepEqual(fs.readdirSync(state), [STATE_FILE]);
  const saved = JSON.parse(fs.readFileSync(path.join(state, STATE_FILE), 'utf8'));
  assert.equal(saved.hash, commit.hash);
  assert.equal(saved.result, '19 of 19 replays matched');
  assert.ok(!Number.isNaN(Date.parse(saved.checkedAt)), 'checkedAt is a time');

  const again = await client.call('kit_commit');
  assert.equal(again.value.stored, commit.hash);
  assert.equal(again.value.changed, false);
});

test('the stored hash survives a restart, and a new commit makes changed true again', async (t) => {
  const kit = makeKit(t);
  const state = tempDir(t, 'state');
  const first = await open(t, kit, state);
  const { value: before } = await first.call('kit_commit');
  await first.call('mark_checked', { hash: before.hash, result: 'ok' });
  first.child.kill();

  const second = await open(t, kit, state);
  assert.equal((await second.call('kit_commit')).value.changed, false);

  writeJson(path.join(kit, 'proofs/garden/g03.json'), { level: 'g03', replay: replayOf('garden', 'g03', 'aaaa000000000003') });
  git(kit, 'add', '-A');
  git(kit, 'commit', '-q', '-m', 'Third commit');
  const after = await second.call('kit_commit');
  assert.equal(after.value.subject, 'Third commit');
  assert.notEqual(after.value.hash, before.hash);
  assert.equal(after.value.stored, before.hash);
  assert.equal(after.value.changed, true);
});

test('a state file that is not JSON counts as no stored hash', async (t) => {
  const state = tempDir(t, 'state');
  fs.writeFileSync(path.join(state, STATE_FILE), 'not json', 'utf8');
  const client = await open(t, makeKit(t), state);
  const answer = await client.call('kit_commit');
  assert.equal(answer.value.stored, null);
  assert.equal(answer.value.changed, true);
});

test('kit_proof with a level returns the replay object, as it is in the file', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  const answer = await client.call('kit_proof', { game: 'garden', level: 'g02' });
  assert.equal(answer.isError, false);
  assert.equal(answer.value.game, 'garden');
  assert.equal(answer.value.level, 'g02');
  assert.deepEqual(answer.value.replay, replayOf('garden', 'g02', 'aaaa000000000002'));
  const runner = await client.call('kit_proof', { game: 'runner', level: 'r01' });
  assert.equal(runner.value.replay.finalHash, 'bbbb000000000001');
});

test('kit_proof with a game only lists the levels, sorted, without the index file', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  const garden = await client.call('kit_proof', { game: 'garden' });
  assert.equal(garden.isError, false);
  assert.deepEqual(garden.value, { game: 'garden', levels: ['g01', 'g02'] });
  const runner = await client.call('kit_proof', { game: 'runner' });
  assert.deepEqual(runner.value.levels, ['r01']);
});

test('kit_proof refuses a game or level that is not letters, digits and hyphens', async (t) => {
  const kit = makeKit(t);
  // A file outside proofs that a path trick would reach.
  writeJson(path.join(kit, 'secret.json'), { replay: { x: 1 } });
  const client = await open(t, kit, tempDir(t, 'state'));
  const bad = [
    { game: '..', level: 'secret' },
    { game: '../proofs/garden', level: 'g01' },
    { game: 'garden', level: '../../secret' },
    { game: 'garden', level: 'g01.json' },
    { game: 'garden', level: 'g 01' },
    { game: 'gar_den', level: 'g01' },
    { game: 'garden/', level: 'g01' },
    { game: 'garden', level: '' },
    { game: '', level: 'g01' },
    { game: 'garden\\..', level: 'g01' },
    { game: 'garden', level: 'g01\u0000' },
    { game: 'gärden', level: 'g01' },
    { game: 5, level: 'g01' },
    { game: 'garden', level: 5 },
  ];
  for (const input of bad) {
    const answer = await client.call('kit_proof', input);
    assert.equal(answer.isError, true, `expected a refusal for ${JSON.stringify(input)}`);
    assert.match(answer.text, /letters, digits and hyphens/, JSON.stringify(input));
  }
  // The server is still alive after every refusal.
  assert.equal((await client.call('kit_proof', { game: 'garden', level: 'g01' })).isError, false);
});

test('kit_proof for a game or level without a proof is an error, and index is not a level', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  const noLevel = await client.call('kit_proof', { game: 'garden', level: 'g99' });
  assert.equal(noLevel.isError, true);
  assert.match(noLevel.text, /no proof/);
  const noGame = await client.call('kit_proof', { game: 'nothing' });
  assert.equal(noGame.isError, true);
  assert.match(noGame.text, /no proof/);
  const index = await client.call('kit_proof', { game: 'garden', level: 'index' });
  assert.equal(index.isError, true);
});

test('kit_proof on a file without a replay object is an error', async (t) => {
  const kit = makeKit(t);
  writeJson(path.join(kit, 'proofs/garden/g09.json'), { level: 'g09' });
  fs.writeFileSync(path.join(kit, 'proofs/garden/g10.json'), '{', 'utf8');
  const client = await open(t, kit, tempDir(t, 'state'));
  assert.equal((await client.call('kit_proof', { game: 'garden', level: 'g09' })).isError, true);
  assert.equal((await client.call('kit_proof', { game: 'garden', level: 'g10' })).isError, true);
});

test('mark_checked refuses a bad hash or an empty result, and writes nothing', async (t) => {
  const state = tempDir(t, 'state');
  const client = await open(t, makeKit(t), state);
  const bad = [
    { hash: 'abc', result: 'ok' },
    { hash: 'g'.repeat(40), result: 'ok' },
    { hash: '../../x', result: 'ok' },
    { hash: 'a'.repeat(40), result: '' },
    { hash: 'a'.repeat(40), result: '   ' },
    { hash: 'a'.repeat(40), result: 'x'.repeat(2001) },
    { hash: 'a'.repeat(40) },
    { result: 'ok' },
    { hash: 5, result: 'ok' },
  ];
  for (const input of bad) {
    const answer = await client.call('mark_checked', input);
    assert.equal(answer.isError, true, `expected a refusal for ${JSON.stringify(input).slice(0, 80)}`);
  }
  assert.deepEqual(fs.readdirSync(state), []);
});

test('mark_checked makes the state folder when it is missing', async (t) => {
  const state = path.join(tempDir(t, 'parent'), 'a', 'b');
  const client = await open(t, makeKit(t), state);
  const { value } = await client.call('kit_commit');
  assert.equal((await client.call('mark_checked', { hash: value.hash, result: 'ok' })).isError, false);
  assert.deepEqual(fs.readdirSync(state), [STATE_FILE]);
});

test('the server writes nothing in the kit folder', async (t) => {
  const kit = makeKit(t);
  const state = tempDir(t, 'state');
  const client = await open(t, kit, state);
  const { value } = await client.call('kit_commit');
  await client.call('kit_proof', { game: 'garden' });
  await client.call('kit_proof', { game: 'garden', level: 'g01' });
  await client.call('mark_checked', { hash: value.hash, result: 'ok' });
  assert.equal(git(kit, 'status', '--porcelain'), '');
});

test('the state folder is --state first, then KIROCREW_APP_DATA, then the temp folder', async (t) => {
  const kit = makeKit(t);
  const explicit = tempDir(t, 'explicit');
  const appData = tempDir(t, 'appdata');
  const tmp = tempDir(t, 'tmp');
  const hash = 'c'.repeat(40);
  const tmpEnv = { TEMP: tmp, TMP: tmp, TMPDIR: tmp };

  // --state wins over the environment variable.
  const one = start(t, [kit, '--state', explicit], { KIROCREW_APP_DATA: appData, ...tmpEnv });
  assert.equal((await one.call('mark_checked', { hash, result: 'one' })).isError, false);
  assert.deepEqual(fs.readdirSync(explicit), [STATE_FILE]);
  assert.deepEqual(fs.readdirSync(appData), []);

  // The environment variable is used when there is no --state.
  const two = start(t, [kit], { KIROCREW_APP_DATA: appData, ...tmpEnv });
  assert.equal((await two.call('mark_checked', { hash, result: 'two' })).isError, false);
  assert.deepEqual(fs.readdirSync(appData), [STATE_FILE]);
  assert.deepEqual(fs.readdirSync(tmp), []);

  // An empty variable counts as not set. Neither: the temp folder.
  const three = start(t, [kit], { KIROCREW_APP_DATA: '', ...tmpEnv });
  const marked = await three.call('mark_checked', { hash, result: 'three' });
  assert.equal(marked.isError, false);
  assert.deepEqual(fs.readdirSync(tmp), [STATE_FILE]);
  assert.equal(path.resolve(path.dirname(marked.value.file)), path.resolve(tmp));
  const four = start(t, [kit], { KIROCREW_APP_DATA: undefined, ...tmpEnv });
  assert.equal((await four.call('kit_commit')).value.stored, hash);
});

test('a missing kit folder: one line on standard error and exit code 1', async (t) => {
  const missing = path.join(tempDir(t, 'parent'), 'no-such-folder');
  const result = spawnSync(process.execPath, [server, missing], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^commit-watch: /);
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  assert.equal(result.stdout, '');
});

test('no kit folder argument: one line on standard error and exit code 1', () => {
  const result = spawnSync(process.execPath, [server], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^commit-watch: /);
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
});

test('--state without a folder: exit code 1', (t) => {
  const result = spawnSync(process.execPath, [server, makeKit(t), '--state'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^commit-watch: /);
});

test('a folder that is not a git repository: kit_commit is an error and the server stays up', async (t) => {
  const plain = tempDir(t, 'plain');
  const client = await open(t, plain, tempDir(t, 'state'));
  const answer = await client.call('kit_commit');
  assert.equal(answer.isError, true);
  assert.ok(answer.text.length > 0);
  assert.deepEqual((await client.request('ping')).result, {});
});

test('an unknown tool, an unknown method and a bad line are errors, and the server stays up', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  const tool = await client.request('tools/call', { name: 'run_command', arguments: { command: 'dir' } });
  assert.equal(tool.error.code, -32602);
  const method = await client.request('resources/list', {});
  assert.equal(method.error.code, -32601);
  client.sendRaw('this is not json');
  const parse = await client.nextError();
  assert.equal(parse.error.code, -32700);
  assert.equal(parse.id, null);
  assert.equal((await client.call('kit_commit')).isError, false);
});

test('tools/call with arguments left out still answers', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  const answer = await client.request('tools/call', { name: 'kit_commit' });
  assert.equal(answer.result.isError ?? false, false);
  const proof = await client.request('tools/call', { name: 'kit_proof' });
  assert.equal(proof.result.isError, true);
});

test('the server ends when standard input closes', async (t) => {
  const client = await open(t, makeKit(t), tempDir(t, 'state'));
  client.child.stdin.end();
  assert.equal(await client.exit(), 0);
});

test('the source runs no command but git, and imports no package', () => {
  const source = fs.readFileSync(server, 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  for (const name of imports) assert.match(name, /^node:/, `${name} is not a node: module`);
  assert.doesNotMatch(source, /\bspawn\w*\(|\bexec\(|\bexecSync\(|\bexecFile\(|\bfork\(/);
  const calls = [...source.matchAll(/execFileSync\(\s*([^,)]*)/g)].map((match) => match[1].trim());
  assert.ok(calls.length >= 1, 'expected at least one git call');
  for (const first of calls) assert.ok(first === "'git'" || first === 'GIT', `execFileSync starts ${first}`);
  assert.doesNotMatch(source, /shell\s*:\s*true/);
});
