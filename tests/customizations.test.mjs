import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  parseProfile,
  validateAgentProfiles,
} from '../scripts/check-customizations.mjs';

const COORDINATION_RULES = `## Work coordination

Keep one compact parent coordinator. Start a fresh, task-specific child session for each independent slice; each child owns one focused task and branch, and there are at most three active children.

Send a compact completion report. Clean up only after a durable Git checkpoint or handoff.`;

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
