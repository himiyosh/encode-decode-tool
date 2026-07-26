import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  parseProfile,
  validateAgent,
  validateAgentProfiles,
} from '../scripts/check-customizations.mjs';

const COORDINATION_RULES = `## Work coordination

Keep one compact parent coordinator. Start a fresh, task-specific child session for each independent slice; each child owns one focused task and branch, and there are at most three active children.

Send a compact completion report. Clean up only after a durable Git checkpoint or handoff.`;
const ROLE_SPECIFIC_MARKERS = {
  EncodeDecodeAgent: [
    '.github/skills/hallmark/SKILL.md',
    '**default**',
    '**audit**',
    '**redesign**',
    '**study**',
    'npm run build',
    'npm run check:customizations',
  ],
  PlayfulWorkbenchAgent: [
    '.github/skills/hallmark/SKILL.md',
    'references/genres/playful.md',
    'references/themes/hum.md',
    'prefers-reduced-motion',
    'npm run verify',
    'npm run check:customizations',
  ],
};

function agentProfile(name) {
  return `---
name: ${name}
description: >
  A test profile that supports structured
  frontmatter safely.
user-invocable: true
tools:
  - read
  - edit
metadata:
  owner: test
---

# ${name}

${COORDINATION_RULES}
`;
}

async function withTempAgents(run) {
  const directory = await mkdtemp(join(tmpdir(), 'encode-decode-customizations-'));
  const agentsRoot = join(directory, 'agents');
  await mkdir(agentsRoot);
  try {
    return await run(agentsRoot);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('profile parser accepts folded strings, nested lists, and CRLF frontmatter', () => {
  const { frontmatter, prompt } = parseProfile(
    agentProfile('StructuredAgent').replaceAll('\n', '\r\n'),
  );

  assert.equal(frontmatter.name, 'StructuredAgent');
  assert.equal(
    frontmatter.description,
    'A test profile that supports structured frontmatter safely.',
  );
  assert.equal(frontmatter['user-invocable'], true);
  assert.match(prompt, /## Work coordination/);
});

test('profile parser allows blank separators after boolean and null scalars', () => {
  const booleanProfile = parseProfile(`---
name: BooleanSeparatorAgent
description: "A profile with a boolean scalar."
user-invocable: true

owner: test
---
`);
  const nullProfile = parseProfile(`---
name: NullSeparatorAgent
description: "A profile with a null scalar."
user-invocable: true
optional: null

owner: test
---
`);

  assert.equal(booleanProfile.frontmatter['user-invocable'], true);
  assert.equal(booleanProfile.frontmatter.owner, 'test');
  assert.equal(nullProfile.frontmatter.optional, null);
  assert.equal(nullProfile.frontmatter.owner, 'test');
});

test('profile validation discovers every matching agent file without a fixed inventory', async () => {
  await withTempAgents(async agentsRoot => {
    const profiles = ['AlphaAgent', 'ZetaAgent'];
    await Promise.all(
      profiles.map(name =>
        writeFile(join(agentsRoot, `${name}.agent.md`), agentProfile(name)),
      ),
    );
    const readmeSource = profiles
      .map(name => `- [${name}](.github/agents/${name}.agent.md)`)
      .join('\n');

    const results = await validateAgentProfiles({ agentsRoot, readmeSource });

    assert.deepEqual(
      results.map(result => result.name),
      profiles,
    );
  });
});

test('profile validation rejects filename drift and undocumented profiles', async () => {
  await withTempAgents(async agentsRoot => {
    await writeFile(
      join(agentsRoot, 'WrongName.agent.md'),
      agentProfile('ActualAgent'),
    );
    await assert.rejects(
      validateAgentProfiles({ agentsRoot, readmeSource: '' }),
      /name must match its filename/,
    );

    await rm(join(agentsRoot, 'WrongName.agent.md'));
    await writeFile(
      join(agentsRoot, 'DocumentedAgent.agent.md'),
      agentProfile('DocumentedAgent'),
    );
    await assert.rejects(
      validateAgentProfiles({ agentsRoot, readmeSource: '' }),
      /README must discover DocumentedAgent/,
    );
  });
});

test('profile validation preserves role-specific Hallmark and QA contracts', async () => {
  for (const [name, markers] of Object.entries(ROLE_SPECIFIC_MARKERS)) {
    const file = `${name}.agent.md`;
    const source = await readFile(
      new URL(`../.github/agents/${file}`, import.meta.url),
      'utf8',
    );

    for (const marker of markers) {
      assert.throws(
        () =>
          validateAgent(
            source.replace(marker, 'removed-contract-marker'),
            file,
          ),
        /must retain/,
        `${name} must reject removal of ${marker}`,
      );
    }
  }
});
