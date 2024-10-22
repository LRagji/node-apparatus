# Stateful Threads

The idea is to provide long running stateful threads which can help with holding states like cache, file handle, iterators etc.

## Usage
This is a 2 step process.
1. Simply create a extended class of `StatefulRecipient` and a separate file which exports a instance of the extended class.
2. Using the `StatefulProxyManager` pass the information like number of instances(worker threads) required interact with you class on different threads or self thread as well.

```javascript
// calculator.js
const { StatefulRecipient } = require('stateful-threads');

class ThreadCalculator extends StatefulRecipient {
    constructor() {
        super();
        this.resultState = 0;
    }

    fetchState()
    {
        return this.resultState
    }

    add(value) {
        this.resultState += value;
        return this.resultState;
    }

    subtract(value) {
        this.resultState -= value;
        return this.resultState;
    }

    divide(value) {
        if (value === 0) {
            throw new Error('Division by zero');
        }
        this.resultState /= value;
        return this.resultState;
    }
}

module.exports = new ThreadCalculator();
```

```javascript
// main.js
const { StatefulProxyManager } = require('stateful-threads');
const calculator = require('./calculator');

const manager = new StatefulProxyManager(
     2, // Number of worker threads, if zero is passed then the instance in created on main thread instead of separate thread
    "calculator.js" // path of the calculator class
);
//Perform some operation
const returnValue = await manager.invokeMethod("add",[1,5],0);

//Check if the state is maintained after the operation
const Thread0StateValue = await manager.invokeMethod("fetchState",[],0);
const Thread1StateValue = await manager.invokeMethod("fetchState",[],1);

//Results
console.log(returnValue);//prints 6
console.log(Thread0StateValue);//prints 6
console.log(Thread1StateValue);//prints 0

//Dispose all the thread so the event loop can be free to close the process.
await manager[Symbol.asyncDispose]();//This intern disposes threads as well.
```