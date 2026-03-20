import { ChildProcess, spawn } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

export interface StartedProcess {
  child: ChildProcess;
  stop: () => Promise<void>;
}

export function startManagedProcess(
  command: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  },
): StartedProcess {
  const [file, ...args] = command;

  if (!file) {
    throw new Error('Cannot start benchmark process without a command');
  }

  const child = spawn(file, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  });

  return {
    child,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      child.kill('SIGTERM');

      const deadline = Date.now() + 10_000;
      while (child.exitCode === null && child.signalCode === null) {
        if (Date.now() >= deadline) {
          child.kill('SIGKILL');
          break;
        }

        await delay(100);
      }
    },
  };
}
