import { InjectableConstructor } from "../injectable-constructor/injectable-constructor.js";
import { Serializable } from "../sequential-invocation-queue/sequential-invocation-queue.js";
import { DistributedWindow } from "./distributed-window.js";
import { IAccumulator } from "./i-accumulator.js";
import { IDistributedSortedSet } from "./i-distributed-sorted-set.js";

/**
 * A distributed window implementation that can be used to accumulate elements and drain them in a window of specific size, by their given identity.
 */
export class DistributedWindowIdentity<T extends Serializable> {

    /**
     * Creates a new instance of DistributedWindowIdentity.
     * @param countWindowSize The size of the counting window. Should be more greater than 0.
     * @param identityWindowSize The size of the identity window. Should be more greater than 0.
     * @param distributedSortedSet The distributed sorted set to manage the identity windows.
     * @param distributedAccumulatorResolver The distributed accumulator resolver to resolve the accumulator for each identity window.
     * @param injectableConstructor The injectable constructor to create the distributed window instances.
     * @throws Error if countWindowSize is less than or equal to 0.
     * @throws Error if identityWindowSize is less than or equal to 0.
     */
    constructor(
        private readonly countWindowSize: number,
        private readonly identityWindowSize: number,
        private readonly distributedSortedSet: IDistributedSortedSet<string>,
        private readonly distributedAccumulatorResolver: (key: string) => IAccumulator<T>,
        private readonly injectableConstructor: InjectableConstructor = new InjectableConstructor()
    ) {
        if (identityWindowSize <= 0) throw new Error("identityWindowSize must be greater than 0");
        if (countWindowSize <= 0) throw new Error("countWindowSize must be greater than 0");
        if (identityWindowSize === 1) this.window = async (identity: number, payload: T) => [[payload]];//Optimization for identityWindowSize === 1, which is just a pass-through.
    }

    /**
     * Accumulates a new element and returns the window if the window is full.
     * @param identity The identity of the payload.
     * @param element The new element to be accumulated.
     * @returns The window if the window size is met , otherwise undefined. It can return multiple windows if the previous windows are not drained.
     * @remarks The sequence of elements can change if the drain implementation returns elements not in the multiple of countWindowSize.
     */
    public async window(identity: number, element: T): Promise<T[][] | undefined> {
        const identityBucket = identity - (identity % this.identityWindowSize);
        const bucketKey = `${identityBucket}`;
        const dw = await this.distributedWindowResolver(bucketKey);
        const results = await dw.window(element) ?? new Array<T[]>();
        const inserted = await this.distributedSortedSet.add(bucketKey, identityBucket);// Instruction 1
        if (inserted === true) {
            const oldBuckets = await this.distributedSortedSet.drain(identityBucket, "lt");// Instruction 2
            for (const oldBucket of oldBuckets) {
                const dw = await this.distributedWindowResolver(oldBucket);
                const records = await dw.flush();
                if (records.length > 0) {
                    results.push(...records);
                }
            }
        }
        return results.length === 0 ? undefined : results;
    }

    /**
     * Tick the identity and flush the windows if the identity window is full. Use full in scenarios where the identity is time based.
     * @param identity The identity to be ticked.
     * @returns The windows if the identity window is full, otherwise empty array.
     */
    public async tickIdentity(identity: number): Promise<T[][]> {
        const identityBucket = identity - (identity % this.identityWindowSize);
        const bucketKey = `${identityBucket}`;
        const results = new Array<T[]>();
        const inserted = await this.distributedSortedSet.add(bucketKey, identityBucket);// Instruction 1
        if (inserted === true) {
            const oldBuckets = await this.distributedSortedSet.drain(identityBucket, "lt");// Instruction 2
            for (const oldBucket of oldBuckets) {
                const dw = await this.distributedWindowResolver(oldBucket);
                const records = await dw.flush();
                if (records.length > 0) {
                    results.push(...records);
                }
            }
        }
        return results;
    }

    /**
     * Flushes all elements from the accumulator and returns the windows.
     * @returns All the pending windows.
     */
    public async flush(): Promise<T[][]> {
        const allBuckets = await this.distributedSortedSet.flush();
        const results = new Array<T[]>();
        for (const bucket of allBuckets) {
            const dw = await this.distributedWindowResolver(bucket);
            const records = await dw.flush();
            results.push(...records);
        }
        return results;
    }

    private async distributedWindowResolver(key: string): Promise<DistributedWindow<T>> {
        const acc = await this.distributedAccumulatorResolver(key);
        return this.injectableConstructor.createInstance<DistributedWindow<T>>(DistributedWindow<T>, [this.countWindowSize, acc]);
    }

}