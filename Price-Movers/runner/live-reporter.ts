import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep,
} from '@playwright/test/reporter';

/**
 * Sends live progress to the test runner page (runner/server.mjs).
 * Each event is one stdout line: @@RUNNER@@{json}
 */
const PREFIX = '@@RUNNER@@';
const stripAnsi = (s = '') => s.replace(/\u001b\[[0-9;]*m/g, '');

function emit(event: Record<string, unknown>) {
  process.stdout.write(PREFIX + JSON.stringify(event) + '\n');
}

/** Deepest test.step that failed — that's "where it failed". */
function failedStepPath(steps: TestStep[]): string | undefined {
  for (const step of steps) {
    if (step.category !== 'test.step' || !step.error) continue;
    return failedStepPath(step.steps) ?? step.titlePath().join(' › ');
  }
  return undefined;
}

export default class LiveReporter implements Reporter {
  onBegin(_config: FullConfig, suite: Suite) {
    emit({ type: 'begin', tests: suite.allTests().map((t) => t.title) });
  }

  onTestBegin(test: TestCase) {
    emit({ type: 'testBegin', title: test.title });
  }

  onStepBegin(test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category !== 'test.step') return;
    emit({ type: 'step', title: test.title, step: step.titlePath().join(' › ') });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const error = result.error;
    emit({
      type: 'testEnd',
      title: test.title,
      status: result.status, // passed | failed | timedOut | skipped | interrupted
      duration: result.duration,
      failedStep: result.status === 'passed' ? undefined : failedStepPath(result.steps),
      error: error ? stripAnsi(error.message ?? error.value ?? '').split('\n').slice(0, 12).join('\n') : undefined,
      location: error?.location ? `${error.location.file.split(/[\\/]/).slice(-2).join('/')}:${error.location.line}` : undefined,
      results: [...new Set(
        test.annotations
          .concat(result.annotations ?? [])
          .filter((a) => a.description)
          .map((a) => `${a.type}: ${a.description}`),
      )],
    });
  }

  onEnd(result: FullResult) {
    emit({ type: 'end', status: result.status });
  }

  printsToStdio() {
    return false;
  }
}
