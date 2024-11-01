# Sequential Invocation Queue

A utility class that ensures asynchronous functions are executed sequentially, one after the other, in the order they were added to the queue. This is useful when you need to control the order of execution of asynchronous operations to avoid race conditions or ensure data consistency.

#### Example Usage

``` typescript

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))
const epoch = Date.now();

async function sensitiveWork(args: number[]) {
    const [delay = 1000, id] = args;
    await sleep(delay);
    console.log(`sensitive work done ${id} ${Date.now() - epoch}`);
}

async function main() {
    console.log(`start ${Date.now() - epoch}`);

    sensitiveWork([undefined, 0]);  // No control on how the sensitiveWork will be called by a caller out of our scope
    sensitiveWork([undefined, 0]);
    sensitiveWork([undefined, 0]);

    await sensitiveWork([5000, 3]);
    console.log("done")
}

main()
    .then(() => console.log("main done"))
    .catch(console.error)

//output
// start 0
// sensitive work done 0 1007
// sensitive work done 0 1008
// sensitive work done 0 1009
// sensitive work done 3 5020
// done
// main done

// vs what we want the output to be 
// start 0
// sensitive work done 0 1012
// sensitive work done 1 2128
// sensitive work done 2 3208
// sensitive work done 3 8306
// done
// main done

```

To achieve the above output we can make simple modifications to our code using `SequentialInvocationQueue` class

```typescript

const sleep = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay))
const epoch = Date.now();
const lock = new SpinWaitLock();
const invocationSerializer = new SequentialInvocationQueue<number[], void>(lock, sensitiveWork);

async function sensitiveWork(args: number[]) {
    const [delay = 1000, id] = args;
    await sleep(delay);
    console.log(`sensitive work done ${id} ${Date.now() - epoch}`);
}



async function main() {
    console.log(`start ${Date.now() - epoch}`);
    const p1 = invocationSerializer.invoke([undefined, 0]);
    const p2 = invocationSerializer.invoke([undefined, 1]);
    const p3 = invocationSerializer.invoke([undefined, 2]);

    await invocationSerializer.invoke([5000, 3]);
    console.log("done")
}

main()
    .then(() => console.log("main done"))
    .catch(console.error)

//output
// start 0
// sensitive work done 0 1012
// sensitive work done 1 2128
// sensitive work done 2 3208
// sensitive work done 3 8306
// done
// main done

```

## Features
1. Since this is based on the spin-lock concept this can be used across threads and also within main thread.
2. Queue length can be customized to reject anything above a specific size.