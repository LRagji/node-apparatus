/**
 * A thread-safe implementation for accumulating elements and draining, should be safe across sessions in single thread, multiple threads or multiple processes.
 * It can be implemented as a set if the order of elements is not important and duplicates are not allowed.
 * It can be implemented as a list or queue if the order of elements is important and duplicates are allowed.
 * The implementation should be atomic for append, drain and flush operations.
 */
export interface IAccumulator<T> {
    /**
     * Add a single element or multiple elements to the accumulator atomically.
     * @param value The element or elements to be added.
     * @returns The total number of elements in the accumulator after adding the new elements.
     */
    add(value: T | T[]): Promise<number>;

    /**
     * Drain(remove) a specific number of elements from the accumulator atomically.
     * @param count The number of elements to be drained.
     * @returns The drained elements.
     * @remarks The number of drained elements must be in multiple of requested count or zero, if this fails sequence of elements will change.
     */
    drain(count: number): Promise<T[]>;

    /**
     * Flush(remove) all elements from the accumulator atomically.
     * @returns The flushed elements.
     */
    flush(): Promise<T[]>;
}