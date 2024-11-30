import assert from "node:assert";
import { describe, it } from "node:test";

import { kWayMergeAsync } from "../../src/k-way-merge/k-way-merge-async.js";


describe("K-Way-Async merging", () => {

    async function* toAsyncIterable<T>(array: T[]): AsyncIterableIterator<T> {
        for (const item of array) {
            yield item;
        }
    }

    async function asyncIterableToArray<T>(asyncIterable: AsyncIterable<T>): Promise<T[]> {
        const result: T[] = [];
        for await (const item of asyncIterable) {
            result.push(item);
        }
        return result;
    }

    it("Should merge distinct N array", async () => {
        const arr1 = toAsyncIterable([1, 3, 5, 7, 9]);
        const arr2 = toAsyncIterable([2, 4, 6, 8, 10]);
        const arr3 = toAsyncIterable([11, 13, 15, 17, 19]);

        const ascendingProcessFunction = (elements: (number | null)[]) => {
            let minIndex = -1;
            let minValue = Number.MAX_SAFE_INTEGER;
            for (let i = 0; i < elements.length; i++) {
                if (!Number.isNaN(elements[i] as number) && elements[i] !== null && elements[i] < minValue) {
                    minValue = elements[i] as number;
                    minIndex = i;
                }
            }
            return { yieldIndex: minIndex, purgeIndexes: [] };
        }

        const resultIterator = kWayMergeAsync<number>([arr1, arr2, arr3], ascendingProcessFunction);
        const result = await asyncIterableToArray(resultIterator);

        assert.deepStrictEqual(result, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19]);
    });

    it("Should merge N array with repeat elements", async () => {
        const arr1 = toAsyncIterable([-100, 1, 3, 5, 7, 9]);
        const arr2 = toAsyncIterable([-100, 2, 4, 6, 8, 10]);
        const arr3 = toAsyncIterable([-100, 11, 13, 15, 17, 19]);

        const ascendingProcessFunction = (elements: (number | null)[]) => {
            let minIndex = -1;
            let minValue = Number.MAX_SAFE_INTEGER;
            for (let i = 0; i < elements.length; i++) {
                if (!Number.isNaN(elements[i] as number) && elements[i] !== null && elements[i] < minValue) {
                    minValue = elements[i] as number;
                    minIndex = i;
                }
            }
            return { yieldIndex: minIndex, purgeIndexes: [] };
        }

        const resultIterator = kWayMergeAsync<number>([arr1, arr2, arr3], ascendingProcessFunction);
        const result = await asyncIterableToArray(resultIterator);

        assert.deepStrictEqual(result, [-100, -100, -100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19]);
    });

    it("Should exit on incorrect index returned.", () => {
        const arr1 = toAsyncIterable([null, - 100, 1, 3, 5, 7, 9]);
        const arr2 = toAsyncIterable([-100, 2, 4, 6, 8, 10]);
        const arr3 = toAsyncIterable([-100, 11, 13, 15, 17, 19]);

        const ascendingProcessFunction = (elements: (number | null)[]) => {
            return { yieldIndex: -1, purgeIndexes: [] };
        }

        const resultIterator = kWayMergeAsync<number>([arr1, arr2, arr3], ascendingProcessFunction);

        assert.rejects(async () => await asyncIterableToArray(resultIterator), { message: "Frame processing was in-decisive, either it is pointing to empty iterator or incorrect value." });
    });

    it("Should merge N array by excluding incorrect values", async () => {
        const arr1 = toAsyncIterable([-100, 1, null, 3, 5, 7, undefined, 9]);
        const arr2 = toAsyncIterable([-100, 2, null, 4, 6, 8, 10]);
        const arr3 = toAsyncIterable([Number.NaN, -100, 11, 13, 15, 17, 19]);

        const ascendingProcessFunction = (elements: (number | null)[]) => {
            let minIndex = -1;
            const dropIndexes = new Array<number>();
            let minValue = Number.MAX_SAFE_INTEGER;
            for (let i = 0; i < elements.length; i++) {
                if (Number.isNaN(elements[i] as number) || elements[i] == null) {
                    dropIndexes.push(i);
                    continue;
                }
                if (elements[i] < minValue) {
                    minValue = elements[i] as number;
                    minIndex = i;
                }
            }
            return { yieldIndex: minIndex, purgeIndexes: dropIndexes };
        }

        const resultIterator = kWayMergeAsync<number>([arr1, arr2, arr3], ascendingProcessFunction);
        const result = await asyncIterableToArray(resultIterator);

        assert.deepStrictEqual(result, [-100, -100, -100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19]);
    });

});