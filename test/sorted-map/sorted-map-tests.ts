import assert from "node:assert";
import { describe, it, beforeEach, test } from "node:test";

import { SortedMap } from '../../src/index.js';

describe('sorted-Mmp', () => {
    let sortedMap;

    beforeEach(() => {
        sortedMap = new SortedMap<number>();
    });

    test('should set key-value pairs with & without order', () => {
        sortedMap.set('a', 1, 2);
        sortedMap.set('b', 2, 1);
        sortedMap.set('c', 3);

        assert.strictEqual(sortedMap.get('a'), 1);
        assert.strictEqual(sortedMap.get('b'), 2);
        assert.strictEqual(sortedMap.get('c'), 3);
    });

    test('should sort the map based on the order', () => {
        sortedMap.set('a', 1, 2);
        sortedMap.set('b', 2, 1);
        sortedMap.set('c', 3);

        const sorted = sortedMap.sort();
        assert.deepStrictEqual(Array.from(sorted.entries()), [['b', 2], ['a', 1], ['c', 3]]);
    });

    test('should clear the map', () => {
        sortedMap.set('a', 1, 2);
        sortedMap.clear();

        assert.equal(sortedMap.get('a'), undefined);
    });
});