/**
 * Interface for a distributed sorted set.Implementation should be atomic for add, drain and flush operations.
*/
export interface IDistributedSortedSet<T> {

    /**
     * Add a key to the set with a sort id.
     * @param key The key to be added.
     * @param sortId The sort id of the key.
     * @returns True if the key is added, false if the key is already in the set.
     * @remarks Has to be atomic.
    */
    add(key: T, sortId: number): Promise<boolean>;

    /**
     * Drain(remove) all keys with sort id greater than or equal to the given sort id.
     * @param sortId The sort id to be compared.
     * @param operator The operator to be used for comparison.
     * @returns The drained keys.
     * @remarks Has to be atomic.
    */
    drain(sortId: number, operator: "lt"): Promise<T[]>;

    /**
    * Flush(remove) all elements from the accumulator atomically.
    * @returns The flushed elements.
    */
    flush(): Promise<T[]>;
}
