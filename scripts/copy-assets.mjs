import { cpSync } from 'node:fs';
cpSync('ui', 'dist/ui', { recursive: true });
