// A small tool server for the playcheck app. Plain Node, no package.
// It speaks the Model Context Protocol over standard input and output:
// one JSON-RPC 2.0 message on each line.
//
// Usage: node commit-watch.mjs <kit folder> [--state <folder>]
//
// Tools:
//   kit_commit    the current commit of the kit repository, and whether it is new
//   kit_proof     a proof replay of the kit, or the list of levels with a proof
//   mark_checked  store the hash of a commit that was checked
//
// It runs no command but git. It reads files under <kit folder>/proofs.
// It writes one file, playcheck-commit-state.json, in the state folder:
// --state, else the folder in KIROCREW_APP_DATA, else the temp folder.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const SERVER_NAME = 'commit-watch';
const SERVER_VERSION = '0.1.0';
const LATEST_PROTOCOL = '2025-06-18';
const KNOWN_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const STATE_FILE = 'playcheck-commit-state.json';
const NAME_RE = /^[A-Za-z0-9-]+$/;
const HASH_RE = /^[0-9a-f]{40,64}$/;
const RESULT_MAX = 2000;
const NAME_RULE = 'may contain only letters, digits and hyphens';

function die(message) {
  process.stderr.write(`${SERVER_NAME}: ${message}\n`);
  process.exit(1);
}

function parseArguments(argv) {
  let kit = null;
  let state = null;
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (arg === '--state') {
      const value = argv[at + 1];
      if (value === undefined || value === '' || value.startsWith('--')) die('--state needs a folder. Use: node commit-watch.mjs <kit folder> [--state <folder>]');
      state = value;
      at += 1;
    } else if (arg.startsWith('--')) {
      die(`unknown option ${arg}. Use: node commit-watch.mjs <kit folder> [--state <folder>]`);
    } else if (kit === null) {
      kit = arg;
    } else {
      die(`unexpected argument ${arg}. Use: node commit-watch.mjs <kit folder> [--state <folder>]`);
    }
  }
  if (kit === null) die('the kit folder is missing. Use: node commit-watch.mjs <kit folder> [--state <folder>]');
  return { kit, state };
}

const options = parseArguments(process.argv.slice(2));
const kitFolder = path.resolve(options.kit);
try {
  if (!fs.statSync(kitFolder).isDirectory()) die(`${kitFolder} is not a folder`);
} catch {
  die(`the kit folder ${kitFolder} does not exist`);
}
const stateFolder = path.resolve(
  options.state ?? (process.env.KIROCREW_APP_DATA ? process.env.KIROCREW_APP_DATA : os.tmpdir()),
);
const stateFile = path.join(stateFolder, STATE_FILE);

// A failed tool call. It becomes a result with isError true.
class ToolError extends Error {}

function git(...args) {
  try {
    return execFileSync('git', ['-C', kitFolder, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
      windowsHide: true,
    }).trim();
  } catch (error) {
    const detail = String(error.stderr || error.message || 'unknown failure').trim().split('\n')[0];
    throw new ToolError(`git failed in the kit folder: ${detail}`);
  }
}

function readState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (saved && typeof saved === 'object' && typeof saved.hash === 'string' && HASH_RE.test(saved.hash)) return saved;
  } catch {
    // A missing or damaged state file means no hash was stored.
  }
  return null;
}

function checkName(label, value) {
  if (typeof value !== 'string' || !NAME_RE.test(value)) throw new ToolError(`"${label}" ${NAME_RULE}`);
}

function readJsonFile(file, describe) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') throw new ToolError(`no proof for ${describe}`);
    throw new ToolError(`the proof for ${describe} cannot be read`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ToolError(`the proof for ${describe} is not valid JSON`);
  }
}

const TOOLS = [
  {
    name: 'kit_commit',
    description: 'Gives the current commit of the kit repository as the full hash and its subject. "changed" is true when the hash differs from the one stored by mark_checked, or when none is stored. "stored" is the stored hash or null.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      const hash = git('rev-parse', 'HEAD');
      if (!HASH_RE.test(hash)) throw new ToolError('git gave a value that is not a commit hash');
      const subject = git('log', '-1', '--format=%s');
      const saved = readState();
      const stored = saved ? saved.hash : null;
      return { hash, subject, stored, changed: stored !== hash };
    },
  },
  {
    name: 'kit_proof',
    description: 'Gives the proof replay of one level of a game from the kit (proofs/<game>/<level>.json). The "replay" object can be given to the replay tool of that game. With "game" only, it lists the levels that have a proof. Names may contain only letters, digits and hyphens.',
    inputSchema: {
      type: 'object',
      properties: {
        game: { type: 'string', description: 'The game folder name, for example garden or runner.' },
        level: { type: 'string', description: 'The level id. Leave it out to list the levels.' },
      },
      required: ['game'],
      additionalProperties: false,
    },
    run(args) {
      checkName('game', args.game);
      const folder = path.join(kitFolder, 'proofs', args.game);
      if (args.level === undefined) {
        let entries;
        try {
          entries = fs.readdirSync(folder);
        } catch {
          throw new ToolError(`no proof for game ${args.game}`);
        }
        const levels = entries
          .filter((name) => name.endsWith('.json'))
          .map((name) => name.slice(0, -'.json'.length))
          .filter((name) => name !== 'index' && NAME_RE.test(name))
          .sort();
        return { game: args.game, levels };
      }
      checkName('level', args.level);
      if (args.level === 'index') throw new ToolError('"index" is the list of levels, not a level');
      const proof = readJsonFile(path.join(folder, `${args.level}.json`), `${args.game} ${args.level}`);
      if (!proof || typeof proof !== 'object' || !proof.replay || typeof proof.replay !== 'object' || Array.isArray(proof.replay)) {
        throw new ToolError(`the proof for ${args.game} ${args.level} has no replay object`);
      }
      return { game: args.game, level: args.level, replay: proof.replay };
    },
  },
  {
    name: 'mark_checked',
    description: 'Stores the hash of a kit commit that was checked, with a one line result, in the state file. After this, kit_commit gives changed false for that hash.',
    inputSchema: {
      type: 'object',
      properties: {
        hash: { type: 'string', description: 'The full commit hash from kit_commit.' },
        result: { type: 'string', description: `A one line result, at most ${RESULT_MAX} characters.` },
      },
      required: ['hash', 'result'],
      additionalProperties: false,
    },
    run(args) {
      if (typeof args.hash !== 'string' || !HASH_RE.test(args.hash)) throw new ToolError('"hash" must be a full commit hash in lower case hexadecimal');
      if (typeof args.result !== 'string' || args.result.trim() === '') throw new ToolError('"result" must be a non-empty text');
      const result = args.result.trim();
      if (result.length > RESULT_MAX) throw new ToolError(`"result" is longer than ${RESULT_MAX} characters`);
      const record = { hash: args.hash, result, checkedAt: new Date().toISOString() };
      try {
        fs.mkdirSync(stateFolder, { recursive: true });
        fs.writeFileSync(stateFile, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
      } catch (error) {
        throw new ToolError(`the state file cannot be written: ${error.code ?? error.message}`);
      }
      return { ok: true, stored: record.hash, file: stateFile };
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
}

function fail(id, code, message) {
  send({ id, error: { code, message } });
}

function textResult(value, isError) {
  const result = { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
  if (isError) result.isError = true;
  return result;
}

function callTool(params) {
  const tool = params && typeof params.name === 'string' ? TOOLS.find((item) => item.name === params.name) : undefined;
  if (!tool) return { code: -32602, message: `unknown tool: ${params && params.name}` };
  const args = params.arguments === undefined ? {} : params.arguments;
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return { result: textResult('the arguments must be an object', true) };
  try {
    return { result: textResult(tool.run(args), false) };
  } catch (error) {
    if (error instanceof ToolError) return { result: textResult(error.message, true) };
    return { result: textResult(`unexpected failure: ${error && error.message}`, true) };
  }
}

function handle(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    fail(null, -32700, 'the line is not valid JSON');
    return;
  }
  if (message === null || typeof message !== 'object' || Array.isArray(message)) {
    fail(null, -32600, 'a message must be one JSON object');
    return;
  }
  const hasId = message.id !== undefined && message.id !== null;
  if (typeof message.method !== 'string') {
    // A response from the client. This server asks for none.
    if (!('result' in message) && !('error' in message)) fail(hasId ? message.id : null, -32600, 'the message has no method');
    return;
  }
  if (!hasId) return; // A notification gets no answer.
  const { id, method, params } = message;
  if (method === 'initialize') {
    const asked = params && params.protocolVersion;
    send({
      id,
      result: {
        protocolVersion: KNOWN_PROTOCOLS.includes(asked) ? asked : LATEST_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
  } else if (method === 'ping') {
    send({ id, result: {} });
  } else if (method === 'tools/list') {
    send({ id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
  } else if (method === 'tools/call') {
    const outcome = callTool(params);
    if (outcome.code) fail(id, outcome.code, outcome.message);
    else send({ id, result: outcome.result });
  } else {
    fail(id, -32601, `method not found: ${method}`);
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  if (line.trim() !== '') handle(line);
});
