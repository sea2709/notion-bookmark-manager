import esbuild, { type BuildOptions, type BuildContext } from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');
const outdir = 'dist';

// Copy a file to dist, preserving subdirectory structure relative to root
function copyFile(src: string): void {
  const dest = path.join(outdir, src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Copy all files in a directory recursively
function copyDir(src: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath);
    } else {
      copyFile(srcPath);
    }
  }
}

function copyStatic(): void {
  copyFile('manifest.json');
  copyDir('icons');
  copyDir('styles');

  // Copy HTML and CSS from popup (not JS/TS — those get bundled)
  for (const dir of ['popup']) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith('.js') && !entry.name.endsWith('.ts')) {
        copyFile(path.join(dir, entry.name));
      }
    }
  }

  console.log('Static files copied to dist/');
}

const buildOptions: BuildOptions = {
  entryPoints: [
    'background/service-worker.ts',
    'popup/popup.ts',
  ],
  bundle: true,
  outdir,
  platform: 'browser',
  format: 'esm',
  target: 'chrome110',
  sourcemap: isWatch ? 'inline' : false,
  minify: !isWatch,
};

if (isWatch) {
  copyStatic();
  const ctx: BuildContext = await esbuild.context({
    ...buildOptions,
    plugins: [{
      name: 'rebuild-notify',
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length > 0) {
            console.error('Build failed:', result.errors);
          } else {
            console.log(`[${new Date().toLocaleTimeString()}] Rebuilt successfully`);
          }
        });
      }
    }]
  });
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  fs.rmSync(outdir, { recursive: true, force: true });
  copyStatic();

  const result = await esbuild.build(buildOptions);
  if (result.errors.length > 0) {
    console.error('Build failed');
    process.exit(1);
  }
  console.log('Build complete → dist/');
}
