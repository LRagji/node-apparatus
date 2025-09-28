import { IORedisClientPool } from "redis-abstraction";
import { DistributedAutoIncrementingPrimaryKey } from "../index.js";

// Example usage of DistributedAutoIncrementingPrimaryKey
const myIdentity = "ME";//`${process.pid}-${process.hrtime().toString()}`;
const singleNodeRedisConnectionString = "redis://localhost:6379";
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString]);
const redisPool = new IORedisClientPool(connectionInjector, 2);
const daipk = new DistributedAutoIncrementingPrimaryKey(redisPool, myIdentity);

async function runExample() {
    // Insert primary keys
    const insertResult = await daipk.insert(['user:alice', 'user:bob', 'user:charlie']);
    console.log("Insert Result:", insertResult);
    // Fetch unique IDs for primary keys
    const fetchResult = await daipk.fetchUniqueIds(['user:alice', 'user:bob', 'user:charlie', 'user:dave']);
    console.log("Fetch Result:", fetchResult);
}

runExample().then(() => {
    console.log("Example completed.");
    process.exit(0);
}).catch((err) => {
    console.error("Error running example:", err);
    process.exit(1);
}).finally(() => {
    redisPool.shutdown();
});