import { DistributedTimeWindow } from '../distributed-time-window.js';
import { IAccumulator } from '../i-accumulator';
import { IDistributedSortedSet } from '../i-distributed-sorted-set';
import { IORedisClientPool } from "redis-abstraction";

// Example implementation of IAccumulator
// This is for single thread only, For multi-threads implement this on SharedBuffer. For multi-process implement this on Redis
class ExampleAccumulator implements IAccumulator<string> {

    constructor(private readonly redisPool: IORedisClientPool, private readonly identity: string) { }

    public async add(value: string | string[]): Promise<number> {
        const token = this.redisPool.generateUniqueToken(this.identity);
        try {
            await this.redisPool.acquire(token);
            const values = Array.isArray(value) ? value : [value];
            return await this.redisPool.run(token, ['rpush', this.identity, ...values]) as number;
        }
        finally {
            await this.redisPool.release(token);
        }
    }

    public async drain(count: number): Promise<string[]> {
        const token = this.redisPool.generateUniqueToken(this.identity);
        try {
            await this.redisPool.acquire(token);
            return await this.redisPool.run(token, ['lpop', this.identity, count]) as string[];
        }
        finally {
            await this.redisPool.release(token);
        }
    }

    public async flush(): Promise<string[]> {
        const token = this.redisPool.generateUniqueToken(this.identity);
        try {
            await this.redisPool.acquire(token);
            const count = await this.redisPool.run(token, ['llen', this.identity]) as number;
            if (count > 0) {
                return await this.redisPool.run(token, ['lpop', this.identity, count]) as string[];
            }
            else {
                return [];
            }
        }
        finally {
            await this.redisPool.release(token);
        }
    }
}

// Example implementation of IDistributedSortedSet
// This is for single thread only, For multi-threads implement this on SharedBuffer. For multi-process implement this on Redis
class ExampleDistributedSortedSet implements IDistributedSortedSet<string> {
    constructor(private readonly redisPool: IORedisClientPool, private readonly identity: string) { }

    public async add(key: string, sortId: number): Promise<boolean> {
        const token = this.redisPool.generateUniqueToken(this.identity);
        try {
            await this.redisPool.acquire(token);
            const insertCount = await this.redisPool.run(token, ['zadd', this.identity, sortId, key]) as number;
            if (insertCount === 0) {
                return false;
            }
            else {
                return true;
            }
        }
        finally {
            await this.redisPool.release(token);
        }
    }

    public async drain(sortId: number, operator: "lt"): Promise<string[]> {
        // This function has to be atomic, redis does not support a single command to fetch and remove elements from a sorted set.
        // The idea is to fetch the elements that are less than the sortId, then remove them from the sorted set. 
        // If the deletion is successful then surely this client has got the elements and not shared with any other client, Thus creating atomic operation.
        if (operator !== "lt") {
            throw new Error("Invalid operator");
        }
        const token = this.redisPool.generateUniqueToken(this.identity);
        try {
            await this.redisPool.acquire(token);
            const members = await this.redisPool.run(token, ['zrangebyscore', this.identity, "-inf", `(${sortId}`]) as string[];
            const multiCommands = members.map((member: string) => ['zrem', this.identity, member]);
            if (multiCommands.length > 0) {
                const multiResponse = await this.redisPool.pipeline(token, multiCommands, true) as string[];
                const results = new Array<string>();
                for (const [index, deleted] of multiResponse.entries()) {
                    if (parseInt(deleted, 10) === 1) {
                        results.push(members[index]);
                    }
                }
                return results;

            }
            else {
                return [];
            }

        }
        finally {
            await this.redisPool.release(token);
        }
    }

    public async flush(): Promise<string[]> {
        const token = this.redisPool.generateUniqueToken(this.identity);
        try {
            await this.redisPool.acquire(token);
            const count = await this.redisPool.run(token, ['zcard', this.identity]) as number;
            if (count > 0) {
                return await this.redisPool.run(token, ['zpopmin', this.identity, count]) as string[];
            }
            else {
                return [];
            }
        }
        finally {
            await this.redisPool.release(token);
        }
    }
}

const myIdentity = "ME";//`${process.pid}-${process.hrtime().toString()}`;
const singleNodeRedisConnectionString = "redis://localhost:6379";
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString]);
const redisPool = new IORedisClientPool(connectionInjector, 2);
const dSortedSet = new ExampleDistributedSortedSet(redisPool, `${myIdentity}-sorted-set`);
const accumulatorList = new Map<string, ExampleAccumulator>();

// Resolver for Accumulator
const accumulatorResolver = (identity: string) => {
    let existingAcc = accumulatorList.get(identity);
    if (existingAcc === undefined) {
        existingAcc = new ExampleAccumulator(redisPool, `${myIdentity}-accumulator` + identity);
        accumulatorList.set(identity, existingAcc);
    }
    return existingAcc;
};

const countWindowSize = Number.MAX_SAFE_INTEGER;// Keeping it large to avoid any count based tick.
const timeoutInSeconds = 10;// Time after which the tick will be triggered in a distributed fashion.
// Create an instance of DistributedTimeWindow
const debouncer = new DistributedTimeWindow<string>(countWindowSize, timeoutInSeconds, dSortedSet, accumulatorResolver, tick);
debouncer.push("Trigger Me"); // Just a message to accumulate for a batch.

// Callback function to handle flushed windows
function tick(payloads: string[][]) {
    console.log(`${myIdentity}: Triggered at ${new Date().toISOString()}, payloads:${payloads.length}`);
    console.log(payloads);
    debouncer.push("Trigger Me");
}