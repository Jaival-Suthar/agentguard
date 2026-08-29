import type { ExecutionContract } from "../contract/types.js";

export interface RecoveryAttempt<T> {
  attempt: number;
  retry: number;
  success: boolean;
  result?: T;
  error?: unknown;
}

export interface RecoveryResult<T> {
  result: T;
  attempts: number;
  retries: number;
  recovered: boolean;
  history: readonly RecoveryAttempt<T>[];
}

export type RecoveryExecutor<T> = () => Promise<T> | T;

export interface RecoveryOptions {
  /**
   * Called after a failed attempt and before the next retry.
   *
   * The value is the retry number that is about to begin:
   * 1 for attempt 2, 2 for attempt 3, etc.
   */
  onRetry?: (
    retry: number,
    error: unknown,
  ) => void | Promise<void>;
}

export class RecoveryExhaustedError<T = unknown> extends Error {
  readonly attempts: number;
  readonly retries: number;
  readonly history: readonly RecoveryAttempt<T>[];
  readonly lastError: unknown;

  constructor(
    attempts: number,
    retries: number,
    history: readonly RecoveryAttempt<T>[],
    lastError: unknown,
  ) {
    super(
      `Recovery exhausted after ${attempts} attempt${attempts === 1 ? "" : "s"} (${retries} retr${retries === 1 ? "y" : "ies"} allowed).`,
    );
    this.name = "RecoveryExhaustedError";
    this.attempts = attempts;
    this.retries = retries;
    this.history = history;
    this.lastError = lastError;
  }
}

export function assertValidRetryLimit(
  contract: ExecutionContract,
): void {
  const { maxRetries } = contract.limits;

  if (
    !Number.isInteger(maxRetries) ||
    maxRetries < 0
  ) {
    throw new RangeError(
      `Execution contract maxRetries must be a non-negative integer; received ${String(maxRetries)}.`,
    );
  }
}
