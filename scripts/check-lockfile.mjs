import fs from 'node:fs';

const ALLOWED_REGISTRY_HOSTS = new Set(['registry.npmjs.org']);

const packageManifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lockfile = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const errors = [];
const stableJson = value => {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableJson(nestedValue)]),
    );
  }
  return value;
};

if (lockfile.lockfileVersion !== 3) {
  errors.push(
    `package-lock.json must use lockfileVersion 3, found ${lockfile.lockfileVersion}`,
  );
}

const root = lockfile.packages?.[''];
if (!root) {
  errors.push('package-lock.json is missing its root package entry');
} else {
  for (const field of [
    'name',
    'version',
    'dependencies',
    'devDependencies',
    'engines',
  ]) {
    const manifestValue = packageManifest[field] ?? {};
    const lockValue = root[field] ?? {};
    if (
      JSON.stringify(stableJson(manifestValue)) !==
      JSON.stringify(stableJson(lockValue))
    ) {
      errors.push(`package-lock.json root ${field} does not match package.json`);
    }
  }
}

let checkedPackages = 0;
for (const [packagePath, entry] of Object.entries(lockfile.packages ?? {})) {
  if (!packagePath || entry.link || entry.inBundle) continue;
  checkedPackages += 1;

  if (
    typeof entry.resolved !== 'string' ||
    typeof entry.integrity !== 'string'
  ) {
    errors.push(`${packagePath} is missing resolved URL or integrity metadata`);
    continue;
  }

  let resolved;
  try {
    resolved = new URL(entry.resolved);
  } catch {
    errors.push(`${packagePath} has an invalid resolved URL`);
    continue;
  }

  if (
    resolved.protocol !== 'https:' ||
    !ALLOWED_REGISTRY_HOSTS.has(resolved.hostname)
  ) {
    errors.push(`${packagePath} resolves outside the approved npm registry`);
  }
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity)) {
    errors.push(`${packagePath} must use SHA-512 integrity`);
  }
}

if (errors.length > 0) {
  console.error(`Lockfile validation failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(
    `OK: ${checkedPackages} packages use approved HTTPS registry URLs and SHA-512 integrity`,
  );
}
