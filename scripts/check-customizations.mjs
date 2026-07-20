import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const AGENTS_ROOT = join(ROOT, '.github/agents');
const AGENT_PROFILES = [
  {
    file: 'EncodeDecodeAgent.agent.md',
    name: 'EncodeDecodeAgent',
    required: [
      '.github/skills/hallmark/SKILL.md',
      '**default**',
      '**audit**',
      '**redesign**',
      '**study**',
      'npm run build',
      'npm run check:customizations',
    ],
  },
  {
    file: 'PlayfulWorkbenchAgent.agent.md',
    name: 'PlayfulWorkbenchAgent',
    required: [
      '.github/skills/hallmark/SKILL.md',
      'references/genres/playful.md',
      'references/themes/hum.md',
      'prefers-reduced-motion',
      'npm run verify',
      'npm run check:customizations',
    ],
  },
];
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

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed;
}

function parseProfile(source) {
  check(source.startsWith('---\n'), 'frontmatter must start with ---');
  const delimiter = source.indexOf('\n---\n', 4);
  check(delimiter !== -1, 'frontmatter must end with ---');

  const frontmatter = {};
  for (const [index, line] of source.slice(4, delimiter).split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/);
    check(match, `unsupported frontmatter syntax on line ${index + 2}`);
    frontmatter[match[1]] = parseScalar(match[2]);
  }

  return {
    frontmatter,
    prompt: source.slice(delimiter + '\n---\n'.length),
  };
}

function validateAgent(source, profile) {
  const agent = parseProfile(source);
  check(
    agent.frontmatter.name === profile.name,
    `${profile.name} name is invalid`,
  );
  check(
    typeof agent.frontmatter.description === 'string' &&
      agent.frontmatter.description.trim(),
    `${profile.name} description must be non-empty`,
  );
  check(
    agent.frontmatter['user-invocable'] === true,
    `${profile.name} must be user-invocable`,
  );

  const promptCharacters = Array.from(agent.prompt).length;
  const profileBytes = Buffer.byteLength(source);
  check(
    promptCharacters < MAX_PROMPT_CHARACTERS,
    `${profile.name} prompt exceeds ${MAX_PROMPT_CHARACTERS} characters`,
  );
  check(
    profileBytes < MAX_PROFILE_BYTES,
    `${profile.name} profile exceeds ${MAX_PROFILE_BYTES} bytes`,
  );
  for (const required of profile.required) {
    check(source.includes(required), `${profile.name} must retain "${required}"`);
  }

  return { name: profile.name, promptCharacters, profileBytes };
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

async function main() {
  const [skillSource, licenseBytes, upstreamSource, readmeSource] =
    await Promise.all([
      readFile(SKILL_PATH, 'utf8'),
      readFile(LICENSE_PATH),
      readFile(UPSTREAM_PATH, 'utf8'),
      readFile(README_PATH, 'utf8'),
    ]);

  const agentFiles = (await readdir(AGENTS_ROOT))
    .filter(file => file.endsWith('.agent.md'))
    .sort();
  const expectedAgentFiles = AGENT_PROFILES.map(profile => profile.file).sort();
  check(
    JSON.stringify(agentFiles) === JSON.stringify(expectedAgentFiles),
    `agent inventory mismatch: expected ${expectedAgentFiles.join(', ')}`,
  );

  const agentResults = await Promise.all(
    AGENT_PROFILES.map(async profile =>
      validateAgent(
        await readFile(join(AGENTS_ROOT, profile.file), 'utf8'),
        profile,
      ),
    ),
  );

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
    readmeSource.includes('](.github/agents/EncodeDecodeAgent.agent.md)'),
    'README must discover the primary agent',
  );
  check(
    readmeSource.includes('](.github/agents/PlayfulWorkbenchAgent.agent.md)'),
    'README must discover the playful agent',
  );
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

main().catch(error => {
  console.error(`NG: ${error.message}`);
  process.exitCode = 1;
});
