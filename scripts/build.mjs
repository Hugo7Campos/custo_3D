import { mkdir, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const entry of ['index.html', 'icon.svg', 'manifest.webmanifest', 'sw.js', 'src']) {
  await cp(entry, `dist/${entry}`, { recursive: true });
}
console.log('Custo3D pronto para publicação: pasta dist/');
