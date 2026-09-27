import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['src/main.tsx'],outfile:'docs/assets/app.js',bundle:true,minify:true,jsx:'automatic',platform:'browser',target:['es2022'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
await copyFile('docs/assets/app.js','assets/app.js');
await copyFile('docs/index.html','index.html');
await copyFile('docs/config.js','config.js');
console.log('Ready: docs/ for GitHub Pages and root files for Vercel.');
