// Checks the playcheck app files against the Crew manifest page and the repository rules.
// Plain Node, no dependency. It reads files and writes nothing.
// Usage: node tools/check-manifest.mjs [--strict] [root]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED = {
  manifest: ['name', 'version', 'displayName', 'description', 'author', 'license',
    'minKiroCrewVersion', 'tags', 'agents', 'skills', 'mcpServers', 'crons', 'dependencies', 'permissions'],
  agent: ['name', 'model', 'description', 'prompt', 'tools'],
  cron: ['name', 'every', 'cron_expr', 'message', 'agent', 'enabled'],
  server: ['command', 'args', 'url', 'env'],
  dependencies: ['commands', 'optionalCommands'],
  // Crew 0.12.2 refused the install without permissions.cron when crons is declared (task 5).
  permissions: ['cron'],
  frontMatter: ['name', 'description', 'triggers', 'always'],
};

// Both are replaced by hand before install: the kit folder, and the folder that holds this app.
const PLACEHOLDERS = [
  ['<KIT_REPO>', 'the path of the kit repository'],
  ['<APP_DIR>', 'the path of the folder that holds this app (the state folder is <APP_DIR>/data, after --state)'],
];
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const SECRET_PATTERNS = [
  ['a GitHub token', /ghp_[A-Za-z0-9]{36}/],
  ['an AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['an API key', /sk-[A-Za-z0-9]{20,}/],
  ['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['a Windows user folder', /[A-Za-z]:[\\/]Users[\\/]/],
  ['a Unix home folder', /(?<![A-Za-z0-9._-])\/(?:Users|home)\/[A-Za-z0-9._-]+/],
];

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function listFiles(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

function frontMatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  const fields = {};
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) return null;
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return fields;
}

/** @returns {{ file: string, rule: string, message: string }[]} */
export function checkRepo(root, options = {}) {
  const problems = [];
  const add = (file, rule, message) => problems.push({ file, rule, message });
  const rootFull = path.resolve(root);

  const checkKeys = (file, label, object, allowed) => {
    for (const key of Object.keys(object)) {
      if (!allowed.includes(key)) add(file, 'allowed-keys', `${label} has the key "${key}", which is not on the allowed list`);
    }
  };

  const parseJson = (relative) => {
    const text = readText(path.join(rootFull, relative));
    if (text === null) {
      add(relative, 'json', 'the file cannot be read');
      return undefined;
    }
    try {
      return JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (error) {
      add(relative, 'json', `the file is not valid JSON: ${error.message}`);
      return undefined;
    }
  };

  const manifestFile = 'app.json';
  const manifest = parseJson(manifestFile);

  if (manifest !== undefined && !isPlainObject(manifest)) {
    add(manifestFile, 'json', 'the top level is not an object');
  } else if (manifest !== undefined) {
    checkKeys(manifestFile, 'the manifest', manifest, ALLOWED.manifest);

    for (const key of ['name', 'version', 'displayName', 'description']) {
      if (!isText(manifest[key])) add(manifestFile, 'required-fields', `"${key}" must be a non-empty string`);
    }
    if (isText(manifest.name) && !NAME_RE.test(manifest.name)) {
      add(manifestFile, 'name', `"${manifest.name}" is not kebab-case`);
    }
    if (isText(manifest.version)) {
      if (!SEMVER_RE.test(manifest.version)) {
        add(manifestFile, 'semver', `"${manifest.version}" is not X.Y.Z`);
      } else if (Number(manifest.version.split('.')[0]) !== 0) {
        add(manifestFile, 'version-below-1', `"${manifest.version}" is not below 1.0.0`);
      }
    }

    // agents and skills paths
    const checkPaths = (key, onInside) => {
      if (manifest[key] === undefined) return;
      if (!Array.isArray(manifest[key])) {
        add(manifestFile, 'path-inside', `"${key}" must be a list of paths`);
        return;
      }
      for (const entry of manifest[key]) {
        if (!isText(entry)) {
          add(manifestFile, 'path-inside', `"${key}" holds a value that is not a path`);
          continue;
        }
        const parts = entry.split(/[\\/]/);
        const absolute = path.isAbsolute(entry) || /^[A-Za-z]:/.test(entry) || entry.startsWith('/') || entry.startsWith('\\');
        const resolved = path.resolve(rootFull, entry);
        const relation = path.relative(rootFull, resolved);
        const inside = !absolute && !parts.includes('..') && relation !== '' && !relation.startsWith('..') && !path.isAbsolute(relation);
        if (!inside) {
          add(manifestFile, 'path-inside', `"${entry}" in "${key}" must be relative and stay inside the repository`);
          continue;
        }
        onInside(entry, resolved);
      }
    };

    checkPaths('agents', (entry, resolved) => {
      let stat = null;
      try { stat = fs.statSync(resolved); } catch { /* missing */ }
      if (!stat || !stat.isFile()) {
        add(manifestFile, 'path-exists', `"${entry}" in "agents" is not a file`);
        return;
      }
      const agent = parseJson(entry.replace(/\\/g, '/'));
      if (agent === undefined) return;
      if (!isPlainObject(agent)) {
        add(entry, 'json', 'the top level is not an object');
        return;
      }
      checkKeys(entry, 'the agent file', agent, ALLOWED.agent);
      for (const key of ['name', 'model', 'description', 'prompt']) {
        if (!isText(agent[key])) add(entry, 'required-fields', `"${key}" must be a non-empty string`);
      }
      if (!Array.isArray(agent.tools) || agent.tools.length === 0) {
        add(entry, 'required-fields', '"tools" must be a non-empty list');
      } else if (isText(manifest.name)) {
        // Entries of the form @<app>:<server> must match mcpServers both ways. Other forms are not judged.
        const declared = isPlainObject(manifest.mcpServers) ? Object.keys(manifest.mcpServers) : [];
        const prefix = `@${manifest.name}:`;
        const named = agent.tools.filter((tool) => typeof tool === 'string' && tool.startsWith(prefix)).map((tool) => tool.slice(prefix.length));
        for (const server of named) {
          if (!declared.includes(server)) add(entry, 'agent-tools', `the tool "${prefix}${server}" names a server that mcpServers does not declare`);
        }
        for (const server of declared) {
          if (!named.includes(server)) add(entry, 'agent-tools', `the server "${server}" is declared in mcpServers and is not in the agent tools as "${prefix}${server}"`);
        }
      }
    });

    checkPaths('skills', (entry, resolved) => {
      const skillFile = path.join(resolved, 'SKILL.md');
      let stat = null;
      try { stat = fs.statSync(skillFile); } catch { /* missing */ }
      if (!stat || !stat.isFile()) {
        add(manifestFile, 'path-exists', `"${entry}" in "skills" is not a folder with a SKILL.md`);
        return;
      }
      const relative = path.relative(rootFull, skillFile).replace(/\\/g, '/');
      const fields = frontMatter(readText(skillFile) ?? '');
      if (fields === null) {
        add(relative, 'skill-front-matter', 'the file does not start with front matter between two --- lines');
        return;
      }
      for (const key of ALLOWED.frontMatter) {
        if (!(key in fields)) add(relative, 'skill-front-matter', `the front matter has no "${key}"`);
      }
      for (const key of Object.keys(fields)) {
        if (!ALLOWED.frontMatter.includes(key)) add(relative, 'skill-front-matter', `the front matter has the key "${key}", which is not allowed`);
      }
      if ('name' in fields && fields.name !== path.basename(resolved)) {
        add(relative, 'skill-front-matter', `"name" is "${fields.name}" and must equal the folder name "${path.basename(resolved)}"`);
      }
      if ('always' in fields && fields.always !== 'true' && fields.always !== 'false') {
        add(relative, 'skill-front-matter', '"always" must be true or false');
      }
    });

    // mcpServers
    if (manifest.mcpServers !== undefined) {
      if (!isPlainObject(manifest.mcpServers)) {
        add(manifestFile, 'allowed-keys', '"mcpServers" must be an object');
      } else {
        for (const [serverName, server] of Object.entries(manifest.mcpServers)) {
          const label = `mcpServers "${serverName}"`;
          if (!isPlainObject(server)) {
            add(manifestFile, 'door-args', `${label} must be an object`);
            continue;
          }
          checkKeys(manifestFile, label, server, ALLOWED.server);
          if (!isText(server.command)) add(manifestFile, 'door-args', `${label} needs "command" as text`);
          if (!Array.isArray(server.args) || !server.args.every((item) => typeof item === 'string')) {
            add(manifestFile, 'door-args', `${label} needs "args" as a list of text`);
          } else {
            const at = server.args.indexOf('--game');
            if (at !== -1) {
              const value = server.args[at + 1];
              if (value === undefined || value === '' || value.startsWith('--')) {
                add(manifestFile, 'door-args', `${label}: "--game" must be followed by a game folder`);
              }
            }
          }
        }
      }
    }

    // playcheck-commits: a Crew run's temp folder is new each time, so the state needs --state.
    const commits = isPlainObject(manifest.mcpServers) ? manifest.mcpServers['playcheck-commits'] : undefined;
    if (isPlainObject(commits) && Array.isArray(commits.args)) {
      const at = commits.args.indexOf('--state');
      const value = at === -1 ? undefined : commits.args[at + 1];
      if (at === -1) {
        add(manifestFile, 'state-arg', 'mcpServers "playcheck-commits" needs "--state", "<APP_DIR>/data" in "args"; without it the state file is lost between runs');
      } else if (typeof value !== 'string' || value === '' || value.startsWith('--')) {
        add(manifestFile, 'state-arg', 'mcpServers "playcheck-commits": "--state" must be followed by a folder');
      } else if (options.strict) {
        const script = String(commits.args[0] ?? '').replace(/\\/g, '/');
        const expected = script.replace(/\/tools\/commit-watch\.mjs$/, '/data');
        if (expected !== script && value.replace(/\\/g, '/') !== expected) {
          add(manifestFile, 'state-arg', `mcpServers "playcheck-commits": "--state" must be "${expected}", the data folder of the app`);
        }
      }
    }

    // crons
    if (manifest.crons !== undefined) {
      if (!Array.isArray(manifest.crons)) {
        add(manifestFile, 'cron-schedule', '"crons" must be a list');
      } else {
        manifest.crons.forEach((cron, index) => {
          if (!isPlainObject(cron)) {
            add(manifestFile, 'cron-schedule', `crons[${index}] must be an object`);
            return;
          }
          const label = `cron "${cron.name ?? index}"`;
          checkKeys(manifestFile, label, cron, ALLOWED.cron);
          if (!isText(cron.name)) add(manifestFile, 'cron-schedule', `crons[${index}] needs a "name"`);
          if (!isText(cron.message)) add(manifestFile, 'cron-schedule', `${label} needs a non-empty "message"`);
          const hasEvery = cron.every !== undefined;
          const hasExpr = cron.cron_expr !== undefined;
          if (hasEvery === hasExpr) {
            add(manifestFile, 'cron-schedule', `${label} needs exactly one of "every" and "cron_expr"`);
          } else if (hasEvery && !(typeof cron.every === 'number' && cron.every > 0)) {
            add(manifestFile, 'cron-schedule', `${label}: "every" must be a positive number`);
          } else if (hasExpr && !isText(cron.cron_expr)) {
            add(manifestFile, 'cron-schedule', `${label}: "cron_expr" must be non-empty text`);
          }
          if ('enabled' in cron && typeof cron.enabled !== 'boolean') {
            add(manifestFile, 'cron-enabled-boolean', `${label}: "enabled" must be a JSON boolean`);
          } else if (cron.enabled !== false) {
            add(manifestFile, 'cron-ships-off', `${label} must ship with "enabled": false`);
          }
        });
      }
    }

    // permissions
    const permissions = manifest.permissions;
    if (permissions !== undefined && !isPlainObject(permissions)) {
      add(manifestFile, 'allowed-keys', '"permissions" must be an object');
    } else if (permissions) {
      checkKeys(manifestFile, '"permissions"', permissions, ALLOWED.permissions);
    }
    if (Array.isArray(manifest.crons) && manifest.crons.length > 0 && !(isPlainObject(permissions) && permissions.cron === true)) {
      add(manifestFile, 'cron-permission', '"crons" is declared, so "permissions.cron" must be true');
    }

    // dependencies
    const dependencies = manifest.dependencies;
    if (dependencies !== undefined && !isPlainObject(dependencies)) {
      add(manifestFile, 'dependencies', '"dependencies" must be an object');
    } else {
      if (dependencies) checkKeys(manifestFile, '"dependencies"', dependencies, ALLOWED.dependencies);
      if (!dependencies || !Array.isArray(dependencies.commands) || !dependencies.commands.includes('node')) {
        add(manifestFile, 'dependencies', '"dependencies.commands" must hold "node"');
      }
    }

    // strict: the placeholder must be replaced
    if (options.strict) {
      const text = readText(path.join(rootFull, manifestFile)) ?? '';
      const left = PLACEHOLDERS.filter(([name]) => text.includes(name));
      if (left.length > 0) {
        const names = left.map(([name]) => name).join(' and ');
        const advice = left.map(([name, meaning]) => `replace ${name} with ${meaning}`).join('; ');
        add(manifestFile, 'placeholder', `${names} ${left.length === 1 ? 'is' : 'are'} still in the file; ${advice}`);
      }
    }
  }

  // every text file: encoding and secrets
  for (const file of listFiles(rootFull)) {
    let bytes;
    try { bytes = fs.readFileSync(file); } catch { continue; }
    if (bytes.includes(0)) continue;
    const relative = path.relative(rootFull, file).replace(/\\/g, '/');
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      add(relative, 'encoding', 'the file starts with a byte order mark');
    }
    if (bytes.includes(13)) add(relative, 'encoding', 'the file holds a carriage return; use LF line endings');
    const text = bytes.toString('utf8');
    for (const [label, pattern] of SECRET_PATTERNS) {
      if (pattern.test(text)) add(relative, 'secret', `the file holds text that looks like ${label}`);
    }
  }

  return problems;
}

function main(argv) {
  const strict = argv.includes('--strict');
  const rest = argv.filter((arg) => !arg.startsWith('--'));
  const root = rest[0] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkRepo(root, { strict });
  if (problems.length === 0) {
    console.log('ok');
    return 0;
  }
  for (const problem of problems) console.log(`${problem.file}: ${problem.rule}: ${problem.message}`);
  return 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
