import esbuild from 'esbuild';
import fs from 'fs';
await esbuild.build({
  entryPoints: ['test/harness/entry.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'test/.out/harness.js',
  alias: { obsidian: './test/harness/obsidian-mock.ts', child_process: './test/harness/stub.js', path: './test/harness/stub.js' },
  define: {
    OLD_MD: JSON.stringify(fs.readFileSync('test/harness/old.md', 'utf8')),
    NEW_MD: JSON.stringify(fs.readFileSync('test/harness/new.md', 'utf8')),
  },
  logLevel: 'warning',
});
const css = fs.readFileSync('styles.css', 'utf8');
const theme = fs.readFileSync('test/harness/theme.css', 'utf8');
for (const mode of ['light', 'dark']) {
  fs.writeFileSync(`test/.out/${mode}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${theme}</style><style>${css}</style></head>
<body class="theme-${mode}"><div id="host"></div><script src="harness.js"></script></body></html>`);
}
