import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const AGENTS_ROOT = join(ROOT, '.github/agents');
const HALLMARK_ROOT = join(ROOT, '.github/skills/hallmark');
const SKILL_PATH = join(HALLMARK_ROOT, 'SKILL.md');
const REFERENCES_ROOT = join(HALLMARK_ROOT, 'references');
const LICENSE_PATH = join(HALLMARK_ROOT, 'LICENSE');
const UPSTREAM_PATH = join(HALLMARK_ROOT, 'UPSTREAM.md');
const README_PATH = join(ROOT, 'README.md');
const EXPECTED_VERSION = '1.1.0';
const EXPECTED_COMMIT = 'aeb42fb354ff4efa36ab475773a082315a3af2ce';
const EXPECTED_CANONICAL_FILES = 106;
const EXPECTED_CANONICAL_BYTES = 675_085;
const EXPECTED_LICENSE_SHA256 =
  '06088a8b94598626f27612dea42300154bf7be967c85d9d3eee4490cb056af7d';
const MAX_PROMPT_CHARACTERS = 30_000;
const MAX_PROFILE_BYTES = 24_000;
const REQUIRED_AGENT_PROMPT_MARKERS = [
  ['## Work coordination', 'a work coordination section'],
  ['compact parent coordinator', 'a compact parent coordinator'],
  ['fresh, task-specific child session', 'fresh task-specific child sessions'],
  ['one focused task and branch', 'one focused task and branch per child'],
  ['at most three active children', 'a three-child concurrency limit'],
  ['compact completion report', 'a compact completion report'],
  ['durable Git checkpoint or handoff', 'a durable cleanup gate'],
];

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function stripInlineComment(value) {
  let quote;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (character === "'") {
        if (value[index + 1] === "'") {
          index += 1;
        } else {
          quote = undefined;
        }
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }

  return value.trimEnd();
}

function parseScalar(value, lineNumber) {
  const trimmed = stripInlineComment(value).trim();
  check(trimmed, `frontmatter value on line ${lineNumber} must not be empty`);
  if (
    trimmed.startsWith('"') ||
    trimmed.startsWith("'")
  ) {
    const quote = trimmed[0];
    check(
      trimmed.length >= 2 && trimmed.endsWith(quote),
      `unterminated quoted frontmatter value on line ${lineNumber}`,
    );
    if (quote === '"') {
      try {
        return JSON.parse(trimmed);
      } catch {
        throw new Error(`invalid double-quoted frontmatter value on line ${lineNumber}`);
      }
    }
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  return trimmed;
}

function readIndentedBlock(lines, start, end) {
  const block = [];
  let index = start;
  while (index < end) {
    const line = lines[index];
    if (!line) {
      block.push('');
      index += 1;
      continue;
    }
    if (!/^[ \t]/.test(line)) break;
    block.push(line.replace(/^[ \t]+/, ''));
    index += 1;
  }
  while (block.length && block[block.length - 1] === '') {
    block.pop();
  }
  return { block, nextIndex: index };
}

function foldBlock(lines) {
  return lines
    .join('\n')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function parseProfile(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  check(lines[0] === '---', 'frontmatter must start with ---');
  const delimiter = lines.indexOf('---', 1);
  check(delimiter !== -1, 'frontmatter must end with ---');

  const frontmatter = {};
  for (let index = 1; index < delimiter; ) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      index += 1;
      continue;
    }
    check(
      !/^[ \t]/.test(line),
      `unsupported top-level frontmatter syntax on line ${index + 1}`,
    );
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):(?:[ \t]*(.*))?$/);
    check(match, `unsupported frontmatter syntax on line ${index + 1}`);
    const [, key, value = ''] = match;
    check(
      !Object.hasOwn(frontmatter, key),
      `duplicate frontmatter key "${key}" on line ${index + 1}`,
    );

    const blockIndicator = value.match(/^([>|])[-+]?$/);
    if (blockIndicator) {
      const { block, nextIndex } = readIndentedBlock(lines, index + 1, delimiter);
      frontmatter[key] =
        blockIndicator[1] === '|' ? block.join('\n').trim() : foldBlock(block);
      index = nextIndex;
      continue;
    }

    if (!value.trim()) {
      const { block, nextIndex } = readIndentedBlock(lines, index + 1, delimiter);
      frontmatter[key] = block.length ? block : null;
      index = nextIndex;
      continue;
    }

    const scalar = parseScalar(value, index + 1);
    const { block, nextIndex } = readIndentedBlock(lines, index + 1, delimiter);
    check(
      !block.length || typeof scalar === 'string',
      `frontmatter scalar on line ${index + 1} cannot use an indented continuation`,
    );
    frontmatter[key] = block.length ? foldBlock([scalar, ...block]) : scalar;
    index = nextIndex;
  }

  return {
    frontmatter,
    prompt: lines.slice(delimiter + 1).join('\n'),
  };
}

export function validateAgent(source, file) {
  const agent = parseProfile(source);
  const name = agent.frontmatter.name;
  check(
    typeof name === 'string' && name.trim() === file.replace(/\.agent\.md$/, ''),
    `${file} name must match its filename`,
  );
  check(
    typeof agent.frontmatter.description === 'string' &&
      agent.frontmatter.description.trim(),
    `${name} description must be non-empty`,
  );
  check(
    agent.frontmatter['user-invocable'] === true,
    `${name} must be user-invocable`,
  );
  check(
    agent.prompt.trim(),
    `${name} prompt must be non-empty`,
  );

  const promptCharacters = Array.from(agent.prompt).length;
  const profileBytes = Buffer.byteLength(source);
  check(
    promptCharacters < MAX_PROMPT_CHARACTERS,
    `${name} prompt exceeds ${MAX_PROMPT_CHARACTERS} characters`,
  );
  check(
    profileBytes < MAX_PROFILE_BYTES,
    `${name} profile exceeds ${MAX_PROFILE_BYTES} bytes`,
  );
  for (const [marker, description] of REQUIRED_AGENT_PROMPT_MARKERS) {
    check(agent.prompt.includes(marker), `${name} must retain ${description}`);
  }

  return { file, name, promptCharacters, profileBytes };
}

export async function validateAgentProfiles({ agentsRoot = AGENTS_ROOT, readmeSource }) {
  check(typeof readmeSource === 'string', 'README source is required');
  const agentFiles = (await readdir(agentsRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.agent.md'))
    .map(entry => entry.name)
    .sort();
  check(agentFiles.length > 0, 'at least one agent profile is required');

  const results = await Promise.all(
    agentFiles.map(async file =>
      validateAgent(await readFile(join(agentsRoot, file), 'utf8'), file),
    ),
  );
  for (const result of results) {
    check(
      readmeSource.includes(`](.github/agents/${result.file})`),
      `README must discover ${result.name}`,
    );
  }
  return results;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function validateMarkdownLinks(files) {
  let checked = 0;
  let upstreamOnly = 0;

  for (const file of files.filter(path => path.endsWith('.md'))) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, '');
      if (
        !target ||
        target.startsWith('#') ||
        /^[a-z][a-z0-9+.-]*:/i.test(target)
      ) {
        continue;
      }

      const relativeTarget = decodeURIComponent(target.split('#', 1)[0]);
      const resolved = resolve(dirname(file), relativeTarget);
      const fromRoot = relative(HALLMARK_ROOT, resolved);
      checked += 1;

      if (fromRoot.startsWith('..')) {
        const upstreamPath = target.replace(/^(\.\.\/)+/, '');
        check(
          /^(docs|site)\//.test(upstreamPath),
          `unexpected external Hallmark reference in ${relative(ROOT, file)}: ${target}`,
        );
        upstreamOnly += 1;
      } else {
        check(
          await exists(resolved),
          `broken Hallmark reference in ${relative(ROOT, file)}: ${target}`,
        );
      }
    }
  }

  return { checked, upstreamOnly };
}

async function resolveUpstream(root) {
  const repositorySkill = join(root, 'skills/hallmark');
  if (await exists(join(repositorySkill, 'SKILL.md'))) {
    return { skill: repositorySkill, license: join(root, 'LICENSE') };
  }
  return { skill: root, license: join(root, 'LICENSE') };
}

async function validateParity(upstreamRoot, localCanonicalFiles) {
  const upstream = await resolveUpstream(resolve(upstreamRoot));
  const upstreamFiles = [
    join(upstream.skill, 'SKILL.md'),
    ...(await collectFiles(join(upstream.skill, 'references'))),
  ].sort();
  const upstreamRelative = upstreamFiles.map(path => relative(upstream.skill, path));
  const localRelative = localCanonicalFiles.map(path => relative(HALLMARK_ROOT, path));

  check(
    JSON.stringify(upstreamRelative) === JSON.stringify(localRelative),
    'canonical Hallmark file lists differ from upstream',
  );

  for (let index = 0; index < localCanonicalFiles.length; index += 1) {
    const [upstreamBytes, localBytes] = await Promise.all([
      readFile(upstreamFiles[index]),
      readFile(localCanonicalFiles[index]),
    ]);
    check(
      upstreamBytes.equals(localBytes),
      `byte mismatch: ${localRelative[index]}`,
    );
  }

  const [upstreamLicense, localLicense] = await Promise.all([
    readFile(upstream.license),
    readFile(LICENSE_PATH),
  ]);
  check(upstreamLicense.equals(localLicense), 'Hallmark LICENSE differs from upstream');
  console.log(
    `OK: upstream byte parity ${localCanonicalFiles.length}/${upstreamFiles.length} plus LICENSE`,
  );
}

export async function main() {
  const [skillSource, licenseBytes, upstreamSource, readmeSource] =
    await Promise.all([
      readFile(SKILL_PATH, 'utf8'),
      readFile(LICENSE_PATH),
      readFile(UPSTREAM_PATH, 'utf8'),
      readFile(README_PATH, 'utf8'),
    ]);

  const agentResults = await validateAgentProfiles({ readmeSource });

  const skill = parseProfile(skillSource);
  check(skill.frontmatter.name === 'hallmark', 'Hallmark name is invalid');
  check(
    skill.frontmatter.version === EXPECTED_VERSION,
    `Hallmark version must be ${EXPECTED_VERSION}`,
  );
  check(
    typeof skill.frontmatter.description === 'string' &&
      skill.frontmatter.description.trim(),
    'Hallmark description must be non-empty',
  );

  for (const required of [
    'references/contract.md',
    'references/study.md',
    'references/verbs/audit.md',
    'references/verbs/redesign.md',
  ]) {
    check(skillSource.includes(required), `Hallmark must retain "${required}"`);
  }

  const referenceFiles = (await collectFiles(REFERENCES_ROOT)).sort();
  const canonicalFiles = [SKILL_PATH, ...referenceFiles].sort();
  const canonicalBytes = (
    await Promise.all(canonicalFiles.map(path => stat(path)))
  ).reduce((sum, item) => sum + item.size, 0);
  check(
    canonicalFiles.length === EXPECTED_CANONICAL_FILES,
    `expected ${EXPECTED_CANONICAL_FILES} canonical files, found ${canonicalFiles.length}`,
  );
  check(
    canonicalBytes === EXPECTED_CANONICAL_BYTES,
    `expected ${EXPECTED_CANONICAL_BYTES} canonical bytes, found ${canonicalBytes}`,
  );
  check(
    referenceFiles.every(path => path.endsWith('.md')),
    'Hallmark references contain an unexpected non-Markdown file',
  );

  const licenseHash = createHash('sha256').update(licenseBytes).digest('hex');
  check(licenseHash === EXPECTED_LICENSE_SHA256, 'Hallmark LICENSE is not canonical');
  check(
    licenseBytes.includes(
      Buffer.from('Copyright (c) 2026 Hallmark contributors'),
    ),
    'Hallmark attribution is missing',
  );

  for (const required of [
    'https://github.com/nutlope/hallmark',
    `Version: Hallmark ${EXPECTED_VERSION}`,
    EXPECTED_COMMIT,
    'Source path: `skills/hallmark/`',
    'License: MIT',
  ]) {
    check(upstreamSource.includes(required), `UPSTREAM.md must retain "${required}"`);
  }

  check(
    readmeSource.includes('](.github/skills/hallmark/SKILL.md)'),
    'README must link to Hallmark',
  );
  check(!(await exists(join(HALLMARK_ROOT, 'docs'))), 'Hallmark docs must not be vendored');
  check(!(await exists(join(HALLMARK_ROOT, 'site'))), 'Hallmark site must not be vendored');

  const links = await validateMarkdownLinks(canonicalFiles);
  for (const result of agentResults) {
    console.log(
      `OK: ${result.name} prompt=${result.promptCharacters} characters, profile=${result.profileBytes} bytes`,
    );
  }
  console.log(
    `OK: Hallmark ${EXPECTED_VERSION}, ${canonicalFiles.length} files/${canonicalBytes} bytes, ${links.checked} links (${links.upstreamOnly} upstream-only)`,
  );
  console.log(`OK: MIT LICENSE sha256=${licenseHash}`);

  if (process.env.HALLMARK_UPSTREAM_ROOT) {
    await validateParity(process.env.HALLMARK_UPSTREAM_ROOT, canonicalFiles);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`NG: ${error.message}`);
    process.exitCode = 1;
  });
}
