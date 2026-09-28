import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function gitValue(args: string[], fallback: string): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim() || fallback;
  } catch {
    return fallback;
  }
}

const commit = process.env.GITHUB_SHA?.slice(0, 12) ?? gitValue(['rev-parse', '--short=12', 'HEAD'], 'unknown');
const commitTime = gitValue(['log', '-1', '--format=%cI', process.env.GITHUB_SHA ?? 'HEAD'], new Date().toISOString());
const buildMetadata = { version: `v${packageJson.version}`, commit, commitTime };

export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
  define: {
    __APP_VERSION__: JSON.stringify(buildMetadata.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_COMMIT_TIME__: JSON.stringify(commitTime),
  },
  plugins: [{
    name: 'emit-build-metadata',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(buildMetadata) });
    },
  }],
});
