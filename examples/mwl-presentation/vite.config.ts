import { exampleConfig } from '../vite.shared.ts';
import { resolve } from 'node:path';
export default { ...exampleConfig(import.meta.dirname), publicDir: resolve(import.meta.dirname, 'assets') };
