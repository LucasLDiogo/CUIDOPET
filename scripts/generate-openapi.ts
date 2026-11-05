import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../packages/contracts/src/openapi.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'api', 'openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(buildOpenApi(), null, 2) + '\n');
console.log('OpenAPI gravado em', out);
