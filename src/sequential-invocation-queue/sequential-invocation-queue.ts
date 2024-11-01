import { SpinWaitLock, SpinWaitLockState } from "../spin-wait-lock/spin-wait-lock";

type stringable = string | string[];
type numberable = number | number[];
export type serializable = stringable | numberable | Record<string | number, stringable | numberable>;

export interface InvocationResult<Treturn> {
    result?: Treturn;
    state: "success" | "error:queue-empty" | "error:queue-full";
}

/**
 * A class that allows for the sequential invocation of a function.
 */
export class SequentialInvocationQueue<Targs extends serializable, Treturn extends serializable | void> {

    private readonly invocationQueue = new Array<Targs>();

    /**
     * @param lock The lock to used for synchronization.
     * @param invocationFunction The function to invoke.
     * @param maxQueueLength The maximum length of the queue.
     */
    constructor(private readonly lock = new SpinWaitLock(), private readonly invocationFunction: (args: Targs) => Promise<Treturn>, private readonly maxQueueLength = Number.MAX_SAFE_INTEGER) { }

    /**
     * Invokes the function with the given arguments, if an execution is already underway en-ques the current invocation.
     * @param args The arguments to pass to the invocationFunction.
     * @param spinTime The time to wait between attempts to acquire the lock.
     * @param index The index to replace in the queue, if an execution is already active.
     * @returns A promise that resolves to the result of the invocation.
     */
    public async invoke(args: Targs, spinTime = 100, index: number | undefined = undefined): Promise<InvocationResult<Treturn>> {
        if (this.invocationQueue.length >= this.maxQueueLength) return { state: "error:queue-full" };
        if (index !== undefined) {
            this.invocationQueue[index] = args;
        }
        else {
            this.invocationQueue.push(args);
        }
        try {
            const lockResult = await this.lock.acquire(spinTime, () => this.invocationQueue.length <= 0);
            if (lockResult === SpinWaitLockState.Condition) {
                return { state: "error:queue-empty" };
            }
            else {
                if (this.invocationQueue.length === 0) return { state: "error:queue-empty" };
                const invocationParams = this.invocationQueue.shift();
                const result = await this.invocationFunction(invocationParams);
                return { result, state: "success" };
            }
        }
        finally {
            this.lock.release();
        }
    }

    /**
     * Deletes the invocation at the given index.
     * @param index The index of the invocation to delete.
     * @returns void
     */
    public delete(index: number): void {
        this.invocationQueue.splice(index, 1);
    }

    /**
     * Returns an iterator for the invocation queue.
     * @returns An iterator for the invocation queue.
     * @example
     * ```typescript
     * const invocationQueue = new SequentialInvocationQueue<number[], void>(new SpinWaitLock(), sensitiveWork);
     * invocationQueue.invoke([undefined, 0]);
     * invocationQueue.invoke([undefined, 1]);
     * invocationQueue.invoke([undefined, 2]);
     * for (const invocation of invocationQueue) {
     *    console.log(invocation);
     * }
     * ```
     */
    public [Symbol.iterator](): IterableIterator<Targs> {
        return this.invocationQueue[Symbol.iterator]();
    }

    /**
     * Clears the invocation queue.
     * @returns void
     */
    public clear() {
        this.invocationQueue.length = 0;
    }

    public [Symbol.asyncDispose]() {
        this.invocationQueue.length = 0;
        this.lock.release();
    }

}