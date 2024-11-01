export enum SpinWaitLockState {
    Acquired = 0,
    Condition = 2
}
/**
 * A spin-wait lock. Can be used for single threaded & multi threaded synchronization.
 */
export class SpinWaitLock {

    private readonly LOCK_INDEX = 0;
    private readonly lock = new Int32Array(this.serializedLock);
    private readonly contextQueue = new Array<string | string[] | number | number[]>();

    /**
     * @param serializedLock The serialized lock to use, should pass output of serialize method, default is a new SharedArrayBuffer(4).
     */
    constructor(private readonly serializedLock = new SharedArrayBuffer(4)) { }

    /**
     * Serializes the lock, used for passing the lock between threads.
     * @returns The serialized lock, a shared buffered instance.
     */
    public serialize(): SharedArrayBuffer {
        return this.serializedLock;
    }

    /**
     * Acquires the lock.
     * @param spinTime The time to wait between attempts to acquire the lock.
     * @param spinExitCondition The condition to exit the spin-wait loop.
     * @returns A promise that resolves to the state of the lock.
     */
    public async acquire(spinTime: number = 100, spinExitCondition: () => boolean = () => false): Promise<SpinWaitLockState> {
        while (Atomics.compareExchange(this.lock, this.LOCK_INDEX, 0, 1) !== 0) {
            if (spinExitCondition() === true) return SpinWaitLockState.Condition;
            await new Promise(resolve => setTimeout(resolve, spinTime));
        }
        return SpinWaitLockState.Acquired;
    }

    /**
     * Releases the lock.
     * @returns void
     */
    public release(): void {
        Atomics.store(this.lock, this.LOCK_INDEX, 0);
    }
}