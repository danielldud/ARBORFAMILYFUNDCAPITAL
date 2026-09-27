import {build} from 'esbuild';
await build({entryPoints:['src/main.tsx'],outfile:'docs/assets/app.js',bundle:true,minify:true,jsx:'automatic',platform:'browser',target:['es2022'],define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
console.log('Ready: docs/ contains the public static frontend.');
