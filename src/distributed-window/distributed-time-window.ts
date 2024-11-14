import { Serializable } from "../sequential-invocation-queue/sequential-invocation-queue.js";
import { DistributedWindowIdentity } from "./distributed-window-identity.js";
import { IAccumulator } from "./i-accumulator.js";
import { IDistributedSortedSet } from "./i-distributed-sorted-set.js";

/**
 * A distributed window implementation that can be used to accumulate elements and drain them in a window of specific size or by absolute time window.
 * It can be used to stead a frequency of elements from a mixed/different update rate.
 */
export class DistributedTimeWindow<T extends Serializable> {

    private readonly dataContainer: DistributedWindowIdentity<T>;
    private readonly intervalHandle: NodeJS.Timeout;

    /**
     * Creates a new instance of DistributedTimeWindow.
     * @param countWindowSize The size of the counting window. Should be more greater than 0.
     * @param timeoutInSeconds The timeout in seconds for the window.
     * @param distributedSortedSet The distributed sorted set to manage the identity windows.
     * @param distributedAccumulatorResolver The distributed accumulator resolver to resolve the accumulator for each identity window.
     * @param windowsFlushCallback The callback to be called when the windows are flushed.
     * @throws Error if timeoutInSeconds is less than or equal to 5.
     * @remarks Internally it uses setInterval to check the timed windows for expiry.
     */
    constructor(countWindowSize: number, timeoutInSeconds: number, distributedSortedSet: IDistributedSortedSet<string>, distributedAccumulatorResolver: (key: string) => IAccumulator<T>,
        private readonly windowsFlushCallback: (windows: T[][]) => void) {
        if (timeoutInSeconds <= 5) {
            throw new Error("Param 'timeoutInSeconds' must be greater then 5 second");
        }
        this.dataContainer = new DistributedWindowIdentity(countWindowSize, timeoutInSeconds * 1000, distributedSortedSet, distributedAccumulatorResolver);
        this.intervalHandle = setInterval(this.tick.bind(this), Math.floor(timeoutInSeconds / 2) * 1000);
    }

    /**
     * Push a new element to be window-ed.
     * @param element The new element to be pushed.
     */
    public async push(element: T): Promise<void> {
        const windows = await this.dataContainer.window(Date.now(), element);
        if (windows !== undefined && windows.length > 0) {
            this.windowsFlushCallback(windows);
        }
    }

    /**
     * Flushes all elements which are accumulated.
     * @returns Multiple windows.
     */
    public async flush(): Promise<T[][]> {
        return await this.dataContainer.flush();
    }

    public [Symbol.dispose]() {
        clearInterval(this.intervalHandle);
    }

    public async [Symbol.asyncDispose]() {
        this[Symbol.dispose]();
    }

    private async tick() {
        const windows = await this.dataContainer.tickIdentity(Date.now());
        if (windows !== undefined && windows.length > 0) {
            this.windowsFlushCallback(windows);
        }
    }
}