
/**
 * Merges multiple sorted iterators into a single sorted iterator using a custom frame processing function.
 *
 * @template T - The type of elements in the iterators.
 * @param {AsyncIterableIterator<T>[]} iterators - An array of sorted iterators to be merged.
 * @param {(elements: (T | null)[]) => { yieldIndex: number | null, purgeIndexes: number[] }} frameProcessFunction - 
 *        A function that processes the current frame of elements from each iterator and determines which element to yield next 
 *        and which iterators to purge.
 * @returns {AsyncIterableIterator<T>} - An iterator that yields elements in sorted order from the merged iterators.
 * @throws {Error} - Throws an error if the frame processing function is indecisive, which could lead to an infinite loop.
 */
export async function* kWayMerge<T>(iterators: AsyncIterableIterator<T>[], frameProcessFunction: (elements: (T | null)[]) => { yieldIndex: number | null, purgeIndexes: number[] }): AsyncIterableIterator<T> {
    const compareFrame = new Array<T | null>();
    for (const cursor of iterators) {
        const result = await cursor.next();
        compareFrame.push(result.value);
    }
    let doneCounter = compareFrame.length;
    const endReachedIndexes = new Set<number>();
    while (doneCounter > 0) {
        const result = frameProcessFunction(compareFrame);
        const yieldIndex = result.yieldIndex;
        const purgeIndexes = result.purgeIndexes || [];
        let exitLoop = false;

        if (yieldIndex !== null && !Number.isNaN(yieldIndex) && yieldIndex >= 0 && yieldIndex < compareFrame.length && !endReachedIndexes.has(yieldIndex)) {
            yield compareFrame[yieldIndex];
            const nextCursor = await iterators[yieldIndex].next();
            compareFrame[yieldIndex] = nextCursor.value;
            if (nextCursor.done === true) {
                doneCounter--;
                endReachedIndexes.add(yieldIndex);
            }
        }
        else {
            exitLoop = true;
        }

        if (purgeIndexes.length > 0) {
            for (const purgeIndex of purgeIndexes) {
                if (purgeIndex !== -1 && !Number.isNaN(purgeIndex) && purgeIndex >= 0 && purgeIndex < compareFrame.length && !endReachedIndexes.has(purgeIndex)) {
                    const nextCursor = await iterators[purgeIndex].next();
                    compareFrame[purgeIndex] = nextCursor.value;
                    if (nextCursor.done === true) {
                        doneCounter--;
                        endReachedIndexes.add(purgeIndex);
                    }
                }
            }
        }
        else if (exitLoop === true) {
            //This means the iteration was in-decisive, so we exit the loop, to prevent infinite loop.
            throw new Error("Frame processing was in-decisive, either it is pointing to empty iterator or incorrect value.");
            break;
        }
    }
}