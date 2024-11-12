import { Serializable } from "../sequential-invocation-queue/sequential-invocation-queue.js";
import { IAccumulator } from "./i-accumulator.js";

/**
 * A distributed window implementation that can be used to accumulate elements and drain them in a window of specific size.
 */
export class DistributedWindow<T extends Serializable> {

    /**
     * Creates a new instance of DistributedWindow.
     * @param windowSize The size of the window. Should be more greater than 0.
     * @param distributedAccumulator The distributed accumulator to accumulate elements.
     * @throws Error if windowSize is less than or equal to 0.
     */
    constructor(private readonly windowSize: number, private readonly distributedAccumulator: IAccumulator<T>) {
        if (windowSize <= 0) throw new Error("windowSize must be greater than 0");
        if (windowSize === 1) this.window = async (newValue: T) => [[newValue]];//Optimization for windowSize === 1, which is just a pass-through.
    }

    /**
     * Accumulates a new element and returns the window if the window is full.
     * @param element The new element to be accumulated.
     * @returns The window if the window size is met , otherwise undefined. It can return multiple windows if the previous windows are not drained.
     * @remarks The sequence of elements can change if the drain implementation returns elements not in the multiple of window size.
     */
    public async window(element: T): Promise<T[][] | undefined> {
        const accumulatedLength = await this.distributedAccumulator.add(element);//Instruction 1
        if (accumulatedLength % this.windowSize === 0) {
            const result = new Array<T[]>();
            const allElements = await this.distributedAccumulator.drain(accumulatedLength); //Instruction 2
            if (allElements.length === 0) return undefined;//This happens when some other thread has already drained the elements, which is simple delay between Instruction 1 and Instruction 2.

            while (allElements.length % this.windowSize !== 0) {
                const innerWindows = await this.window(allElements.pop());//Re-accumulate the elements until multiple of window size. This can change the sequence of elements
                if (innerWindows !== undefined) {
                    result.push(...innerWindows);
                }
            }

            for (let index = 0; index < allElements.length; index += this.windowSize) {
                result.push(allElements.slice(index, index + this.windowSize));
            }
            return result;
        }
        else {
            return undefined;
        }
    }

    /**
     * Flushes all elements from the accumulator and returns the windows.
     * @returns The windows.
     */
    public async flush(): Promise<T[][]> {
        const result = new Array<T[]>();
        const allElements = await this.distributedAccumulator.flush();
        for (let index = 0; index < allElements.length; index += this.windowSize) {
            result.push(allElements.slice(index, index + this.windowSize));
        }
        return result;
    }
}

//TODO:
//Take care Identity of elements.
//1. Duplicates
//2. Gaps 
//3. Stable sort may require duplicates.
//4. Different Timeouts strategy "ExpireFromLastElement" | "ExpireFromFirstElement" | "ExpireOnAbsoluteTime";