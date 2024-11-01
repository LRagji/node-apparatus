# Spin Wait Lock

The `SpinWaitLock` class is a custom implementation of a spin-wait lock mechanism. This class provides a lightweight synchronization primitive that repeatedly checks a condition in a loop until it is met, which can be useful in scenarios where synchronization is required without sleeping the event loop.

### Methods

- **`Acquire()`**: Attempts to acquire the lock. If the lock is already held, it will spin in a loop until the lock becomes available.
- **`Release()`**: Releases the lock, allowing other threads to acquire it.

### Example Usage

```typescript
import { SpinWaitLock } from './SpinWaitLock';

const lock = new SpinWaitLock();

async function criticalSection() {
    lock.Acquire();
    try {
        // Critical section code goes here
        console.log('Lock acquired, executing critical section');
    } finally {
        lock.Release();
        console.log('Lock released');
    }
}

async function main() {
    await Promise.all([criticalSection(), criticalSection()]);
}

main()
.catch(console.error);

```