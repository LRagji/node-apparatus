## DistributedTimeWindow

The `DistributedTimeWindow` class is designed to manage and synchronize time windows across distributed systems. This class ensures that operations within a specified time window are coordinated and consistent across different nodes in a distributed environment.

### Features

- **Time Window Management**: Define and manage time windows for operations.
- **Purge on Time or Length**: Purge a window based on time or on length of accumulated elements in that window.
- **Synchronization**: Ensure time windows are synchronized across distributed nodes.
- **Distributed System**: Designed to be used in multi-threaded and multi-process environments.

### Usage
```typescript
import { DistributedTimeWindow } from './distributed-window/distributed-time-window';
import { IAccumulator } from './distributed-window/i-accumulator';
import { IDistributedSortedSet } from './distributed-window/i-distributed-sorted-set';

// Example implementation of IAccumulator
// This is for single thread only, For multi-threads implement this on SharedBuffer. For multi-process implement this on Redis
class ExampleAccumulator implements IAccumulator<string> {
    private elements: string[] = [];

    async add(value: string): Promise<number> {
        this.elements.push(value);
        return this.elements.length;
    }

    async drain(count: number): Promise<string[]> {
        return this.elements.splice(0, count);
    }

    async flush(): Promise<string[]> {
        const flushedElements = [...this.elements];
        this.elements = [];
        return flushedElements;
    }
}

// Example implementation of IDistributedSortedSet
// This is for single thread only, For multi-threads implement this on SharedBuffer. For multi-process implement this on Redis
class ExampleDistributedSortedSet implements IDistributedSortedSet<string> {
    private set: Map<string, number> = new Map();

    async add(key: string, sortId: number): Promise<boolean> {
        if (this.set.has(key)) return false;
        this.set.set(key, sortId);
        return true;
    }

    async drain(sortId: number, operator: "lt"): Promise<string[]> {
        const keysToDrain: string[] = [];
        for (const [key, value] of this.set.entries()) {
            if (value < sortId) {
                keysToDrain.push(key);
                this.set.delete(key);
            }
        }
        return keysToDrain;
    }

    async flush(): Promise<string[]> {
        const allKeys = Array.from(this.set.keys());
        this.set.clear();
        return allKeys;
    }
}

// Callback function to handle flushed windows
function handleFlushedWindows(windows: string[][]): void {
    console.log('Flushed windows:', windows);
}

// Create instances of the accumulator and sorted set
const accumulatorResolver = (key: string) => new ExampleAccumulator();
const sortedSet = new ExampleDistributedSortedSet();

// Create an instance of DistributedTimeWindow
const distributedTimeWindow = new DistributedTimeWindow<string>(
    3, // countWindowSize
    10, // timeoutInSeconds
    sortedSet,
    accumulatorResolver,
    handleFlushedWindows
);

// Push elements to the window
async function main() {
    await distributedTimeWindow.push('element1');
    await distributedTimeWindow.push('element2');
    await distributedTimeWindow.push('element3');
    await distributedTimeWindow.push('element4');

    // Flush remaining elements
    const remainingWindows = await distributedTimeWindow.flush();
    console.log('Remaining windows:', remainingWindows);
}

main().catch(console.error);
```