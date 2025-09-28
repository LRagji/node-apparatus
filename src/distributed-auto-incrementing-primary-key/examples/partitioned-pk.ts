import { IORedisClientPool } from "redis-abstraction";
import { DistributedAutoIncrementingPrimaryKey } from "../index.js";

// Example usage of DistributedAutoIncrementingPrimaryKey with auto-partitioning
// Note: The biggest pitfall here is that if you key is partitioned in different space than it will lose its uniqueness
// This is why this is still a WIP feature.
const myIdentity = "ME";
const singleNodeRedisConnectionString = "redis://localhost:6379";
const connectionInjector = () => IORedisClientPool.IORedisClientClusterFactory([singleNodeRedisConnectionString]);
const redisPool = new IORedisClientPool(connectionInjector, 2);

async function runExample(maxCapacityPerShard = 'u4', maxBulkInsertPerCall = 10, maxKeysToGenerate = 255) {
    let startTime = Date.now();
    let counter = 0;
    let shardCount = 0;
    let hierarchicalShardInstance = new DistributedAutoIncrementingPrimaryKey(redisPool, `${myIdentity}_${shardCount}`, undefined, undefined, undefined, maxCapacityPerShard as any)
    do {
        const primarykeys = Array.from({ length: maxBulkInsertPerCall }, (_, i) => `user:${counter + i}`);
        let insertResult = await hierarchicalShardInstance.insert(primarykeys);
        if (insertResult.overflow.length > 0) {
            //need to switch to a new shard, which reference to old one still
            do {
                shardCount++;
                hierarchicalShardInstance = new DistributedAutoIncrementingPrimaryKey(redisPool, `${myIdentity}_${shardCount}`, hierarchicalShardInstance, undefined, undefined, maxCapacityPerShard as any);
                insertResult = await hierarchicalShardInstance.insert(insertResult.overflow);
            }
            while (insertResult.overflow.length > 0)
        }
        counter += primarykeys.length;
    }
    while (counter < maxKeysToGenerate);
    console.log(`Insert completed for ${counter} keys across ${shardCount} shards in ${Date.now() - startTime}ms.`);
    startTime = Date.now();

    const fetchResult = await hierarchicalShardInstance.fetchUniqueIds(Array.from({ length: counter }, (_, i) => `user:${i}`));
    console.log(`Fetch completed for ${counter} keys in ${Date.now() - startTime}ms with NotFound:${fetchResult.notFound.length} Found:${fetchResult.found.size} keys.`);
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