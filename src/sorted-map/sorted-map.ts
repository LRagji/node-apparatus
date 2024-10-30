/**
 * A sorted map that maintains the order associated with elements.
 */
export class SortedMap<ValueType> {

    /**
     * The maximum order of the elements in the map.
    */
    private maxOrder = Number.MIN_SAFE_INTEGER;

    constructor(
        private readonly map: Map<string, ValueType> = new Map<string, ValueType>(),
        private readonly sortedKeys: Map<string, number> = new Map<string, number>()
    ) { }

    /**
     * Set a key-value pair in the map.
     * @param key The key of the element.
     * @param value The value of the element.
     * @param order The order of the element or undefined if you want to maintain insertion order.
     * @throws If the order is not a valid 32 bit finite number.
     * @returns The map instance.
    */
    public set(key: string, value: ValueType, order: number | undefined = undefined) {
        if (order !== undefined && (Number.isNaN(order) || (!Number.isSafeInteger(order)))) throw new Error('Order must be a valid 32 bit finite number');

        if (order !== undefined) {
            this.maxOrder = Math.max(this.maxOrder, order);
        }
        else {
            order = ++this.maxOrder;
        }
        this.map.set(key, value);
        this.sortedKeys.set(key, order);
    }

    /**
     * Get the value of a key in the map.
     * @param key The key of the element.
     * @returns The value of the element or undefined if the key does not exist.    
    */
    public get(key: string): ValueType | undefined {
        return this.map.get(key);
    }

    /**
     * Sorts the map based on the order of the elements.
     * @returns A new map instance with the elements sorted based on the order.
     * @remarks This method does not modify the original map.
     * @remarks This method has a time complexity of O(n log n).
     * @remarks This method has a space complexity of O(n).
     * @remarks This method is not stable.
    */
    public sort(): Map<string, ValueType> {
        const sortedKeys = Array.from(this.sortedKeys.entries())
            .sort((a, b) => a[1] - b[1]);
        const sortedMap = new Map<string, ValueType>();
        for (const [key, order] of sortedKeys) {
            const value = this.map.get(key);
            if (value === undefined) continue;
            sortedMap.set(key, value);
        }
        return sortedMap;
    }

    /**
     * Clears the map.
    */
    public clear() {
        this.map.clear();
        this.sortedKeys.clear();
        this.maxOrder = Number.MIN_SAFE_INTEGER;
    }

    public [Symbol.dispose]() {
        this.clear();
    }
}