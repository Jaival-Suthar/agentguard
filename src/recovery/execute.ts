import type { ExecutionContract } from "../contract/types.js";
import {
  assertValidRetryLimit,
  RecoveryExhaustedError,
  type RecoveryAttempt,
  type RecoveryExecutor,
  type RecoveryOptions,
  type RecoveryResult,
} from "./types.js";

export async function executeWithRecovery<T>(
  contract: ExecutionContract,
  executor: RecoveryExecutor<T>,
  options: RecoveryOptions = {},
): Promise<RecoveryResult<T>> {
  assertValidRetryLimit(contract);
  const maxRetries = contract.limits.maxRetries;

  const history: RecoveryAttempt<T>[] = [];
  let retry = 0;

  while (true) {
    const attempt = retry + 1;

    try {
      const result = await executor();

      history.push({
        attempt,
        retry,
        success: true,
        result,
      });

      return {
        result,
        attempts: attempt,
        retries: retry,
        recovered: retry > 0,
        history,
      };
    } catch (error: unknown) {
      history.push({
        attempt,
        retry,
        success: false,
        error,
      });

      if (retry >= maxRetries) {
        throw new RecoveryExhaustedError(
          attempt,
          retry,
          history,
          error,
        );
      }

      retry += 1;

      if (options.onRetry) {
        await options.onRetry(retry, error);
      }
    }
  }
}
