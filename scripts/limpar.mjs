// Apaga a pasta dist/ antes de compilar, para não ficarem ficheiros antigos.
import { rmSync } from 'node:fs';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
