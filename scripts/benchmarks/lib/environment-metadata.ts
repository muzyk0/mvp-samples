import { execFile } from 'child_process';
import { cpus, hostname, totalmem } from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER = 1024 * 1024;

export interface GitMetadata {
  commitSha: string;
  shortSha: string;
  branch: string;
  isDirty: boolean;
}

export interface RunnerMetadata {
  environmentLabel: string;
  hostname: string;
  platform: string;
  arch: string;
  cpuCount: number;
  cpuModel?: string;
  totalMemoryBytes: number;
}

export interface ToolchainMetadata {
  nodeVersion: string;
  npmVersion: string;
  bunVersion: string;
  goVersion: string;
  rustVersion: string;
}

async function runVersionCommand(
  command: string,
  args: string[],
): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      env: process.env,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: COMMAND_MAX_BUFFER,
    });
    const output = `${stdout}${stderr}`.trim();
    return output.length > 0 ? output.split('\n')[0].trim() : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

async function runGitCommand(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    env: process.env,
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_MAX_BUFFER,
  });
  return stdout.trim();
}

export async function collectGitMetadata(): Promise<GitMetadata> {
  const commitSha = await runGitCommand(['rev-parse', 'HEAD']);
  const shortSha = await runGitCommand(['rev-parse', '--short', 'HEAD']);
  const branch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);

  let isDirty = false;
  try {
    await execFileAsync(
      'git',
      ['diff', '--quiet', '--ignore-submodules', 'HEAD'],
      {
        env: process.env,
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER,
      },
    );
  } catch {
    isDirty = true;
  }

  return {
    commitSha,
    shortSha,
    branch,
    isDirty,
  };
}

export function collectRunnerMetadata(
  environmentLabel: string,
): RunnerMetadata {
  const cpuList = cpus();

  return {
    environmentLabel,
    hostname:
      process.env['BENCHMARK_INCLUDE_HOSTNAME'] === 'true'
        ? hostname()
        : 'redacted',
    platform: process.platform,
    arch: process.arch,
    cpuCount: cpuList.length,
    cpuModel: cpuList[0]?.model,
    totalMemoryBytes: totalmem(),
  };
}

export async function collectToolchainMetadata(): Promise<ToolchainMetadata> {
  return {
    nodeVersion: process.version,
    npmVersion: await runVersionCommand('npm', ['--version']),
    bunVersion: await runVersionCommand('bun', ['--version']),
    goVersion: await runVersionCommand('go', ['version']),
    rustVersion: await runVersionCommand('rustc', ['--version']),
  };
}
