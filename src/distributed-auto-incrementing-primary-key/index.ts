
import { IRedisClientPool } from "redis-abstraction";
import { randomUUID } from "node:crypto";

export type primaryKeyType = string | number | boolean;
export type uniqueIdType = string;
export type insertResponseType = { inserted: Map<primaryKeyType, uniqueIdType>, overflow: primaryKeyType[] };
export type fetchResponseType = { found: Map<primaryKeyType, uniqueIdType>, notFound: primaryKeyType[] };

export class DistributedAutoIncrementingPrimaryKey {

    private readonly redisHashKey = this.redisKeyBuilder('map', this.separatorCharacter, this.identity);
    private readonly redisCounterKey = this.redisKeyBuilder('ctr', this.separatorCharacter, this.identity);
    private readonly redisRefurbishedListKey = this.redisKeyBuilder('refurbished', this.separatorCharacter, this.identity);

    /**
     * Constructor for DistributedAutoIncrementingPrimaryKey
     * @param redisClient  Redis connection pool to be used for all operations.
     * @param identity Unique identity for this dictionary instance. If not provided, a random UUID will be generated.
     * @param existingDictionary Optional, existing dictionary to chain with. If provided, insert and fetch operations will first be attempted on this dictionary before falling back to the current instance. 
     * @param separatorCharacter Optional, Character used to separate different parts of the Redis keys. Default is '-'.
     * @param redisKeyBuilder Optional, Function to build Redis keys. If not provided, a default function will be used that incorporates the identity and separator character.
     * @param maxCapacity Optional, Maximum capacity of the dictionary. Supported values are 'i64', 'u8', 'u16', 'u32'. Default is 'i64'.
     * 
     * This class provides a distributed auto-incrementing primary key dictionary using Redis as the backend.
     * It supports chaining with an existing dictionary, allowing for hierarchical key management.
     * The class ensures thread and multi-process safety for all operations. 
     */
    constructor(
        private readonly redisClient: IRedisClientPool,
        public readonly identity: string = randomUUID(),
        private readonly existingDictionary: DistributedAutoIncrementingPrimaryKey | undefined = undefined,
        private readonly separatorCharacter: string = '-',
        private readonly redisKeyBuilder: (suffix: string, separatorCharacter: string, identity: string) => string = this.constructRedisKey,
        public readonly maxCapacity: 'i64' | 'u8' | 'u16' | 'u32' = 'i64'
    ) {
    }

    /**
     *  Inserts primary keys into the distributed auto-incrementing primary key dictionary.
     *  If a primary key already exists, it will not be inserted again.
     * @param primaryKeys  Array of primary keys to insert
     * @returns An object containing a map of successfully inserted primary keys to their unique IDs and an array of primary keys that were not inserted due to overflow in dictionaries unique key capacity. 
     * 
     * This method first checks if there is an existing dictionary to handle the insertion. If so, it delegates the insertion to that dictionary.
     * It then validates the primary keys to ensure they are not undefined, null, or duplicates within the same local batch.
     * It acquires a unique token from the Redis connection pool and attempts to acquire a connection.
     * It calculates the number of unique IDs required and retrieves them from a refurbished list or generates new ones using a Redis BITFIELD command.
     * It prepares HSET commands to insert the primary keys and their corresponding unique IDs into a Redis hash(Global dictionary).
     * After executing the commands in a pipeline, it checks the results to determine which primary keys were successfully inserted.
     * Any unique IDs that were not used (due to existing primary keys) are pushed back to the refurbished list for future use.
     * Finally, it releases the Redis connection and returns the result of the insertion operation.
     * This is a thread & multi-process safe operation.
     * Best case performance: N+2 roundtrips to redis, where N is the number of unique ids required.
     * Worst case performance:N+3 roundtrips to redis.
     * All operations are O(1) time complexity.
     */
    public async insert(primaryKeys: primaryKeyType[]): Promise<insertResponseType> {
        //Invoke chaining dictionary first if any
        let existingDictionaryInsertResponse: insertResponseType = { inserted: new Map<primaryKeyType, uniqueIdType>(), overflow: primaryKeys };
        if (this.existingDictionary != undefined) {
            existingDictionaryInsertResponse = await this.existingDictionary.insert(primaryKeys);
        }
        else {
            //Validations (only the base dictionary should do this,only once for performance reasons)
            existingDictionaryInsertResponse.overflow = this.validatePrimaryKeys(existingDictionaryInsertResponse.overflow);
        }

        //If no overflow, return(short-circuit)
        if (existingDictionaryInsertResponse.overflow.length === 0) {
            return existingDictionaryInsertResponse;
        }

        //Insertions into global dictionary
        const token = this.redisClient.generateUniqueToken(this.identity + "insert");
        try {
            await this.redisClient.acquire(token);

            //Acquire unique ids
            let uniqueIdsRequired = existingDictionaryInsertResponse.overflow.length;
            const uniqueIds = new Set<number>(await this.redisClient.run(token, [`lpop`, this.redisRefurbishedListKey, uniqueIdsRequired.toString()]) as number[]);
            uniqueIdsRequired -= uniqueIds.size;
            if (uniqueIdsRequired > 0) {
                const freshIdRange = await this.redisClient.run(token, ['bitfield', this.redisCounterKey, `get`, this.maxCapacity, `0`, `overflow`, `sat`, `incrby`, this.maxCapacity, `0`, uniqueIdsRequired.toString()]) as number[];//First acquire counter space.
                const startInclusiveId = freshIdRange[0];
                const endExclusiveId = freshIdRange[1];
                for (let i = startInclusiveId; i < endExclusiveId; i++) {
                    uniqueIds.add(i);
                }
            }
            //Create Key Value pairs
            const insertCommands = new Array<Array<string>>();
            const uniqueIdsArray = Array.from(uniqueIds);
            for (const id of uniqueIdsArray) {
                const fieldValue = `${this.identity}${this.separatorCharacter}${id}`;
                const fieldName = existingDictionaryInsertResponse.overflow.shift();
                if (fieldName === undefined) {
                    break;
                }
                /*
                The reason to use HSETNX instead of HMSET is to be able to check if the field was newly inserted or already existed.
                With HMSET, we would require an additional roundtrip to check if the field was inserted successfully with our provided key, which would be inefficient.
                Also HEXISTS works on a per field basis, so it would not be efficient for bulk operations.
                The best possible solution is to use HSETNX with pipeline, which returns 1 if the field was newly inserted and 0 if it already existed.
                */
                insertCommands.push(['hsetnx', this.redisHashKey, fieldName.toString(), fieldValue]);
            }

            //Insert Key Value pairs
            const insertResults = await this.redisClient.pipeline(token, insertCommands, false) as number[];
            for (let i = 0; i < insertResults.length; i++) {
                if (insertResults[i] === 1) {
                    //This means the field was newly inserted and was globally unique, so we can add it to the response
                    const primaryKey = insertCommands[i][2];
                    const fullyQualifiedUniqueId = insertCommands[i][3];
                    existingDictionaryInsertResponse.inserted.set(primaryKey, fullyQualifiedUniqueId);
                    const uniqueId = uniqueIdsArray[i];
                    uniqueIds.delete(uniqueId);
                }
            }

            //Push reclaimed ids to refurbished list for future use
            if (uniqueIds.size > 0) {
                await this.redisClient.run(token, ['lpush', this.redisRefurbishedListKey, ...uniqueIds.values() as unknown as string[]]);
            }
        }
        finally {
            await this.redisClient.release(token);
        }

        return existingDictionaryInsertResponse;
    }

    /**
     * 
     * @param primaryKeys Array of primary keys to fetch
     * @returns An object containing a map of found primary keys to their unique IDs and an array of primary keys that were not found in the dictionary.
     * 
     * This method first checks if there is an existing dictionary to handle the fetch operation. If so, it delegates the fetch to that dictionary.
     * It then validates the primary keys to ensure they are not undefined, null, or duplicates within the same local batch.
     * It acquires a unique token from the Redis connection pool and attempts to acquire a connection.
     * It prepares and executes an HMGET command to fetch the unique IDs corresponding to the primary keys from a Redis hash(Global dictionary).
     * Best and Worst case performance: 1 roundtrips to redis.
     * All operations are O(1) time complexity.
     */
    public async fetchUniqueIds(primaryKeys: primaryKeyType[]): Promise<fetchResponseType> {

        //Invoke chaining dictionary first if any
        let existingDictionaryFetchResponse: fetchResponseType = { found: new Map<primaryKeyType, uniqueIdType>(), notFound: primaryKeys };
        if (this.existingDictionary != undefined) {
            existingDictionaryFetchResponse = await this.existingDictionary.fetchUniqueIds(primaryKeys);
        } else {
            //Validations (only the base dictionary should do this,only once for performance reasons)
            existingDictionaryFetchResponse.notFound = this.validatePrimaryKeys(existingDictionaryFetchResponse.notFound);
        }

        //If no overflow, return(short-circuit)
        if (existingDictionaryFetchResponse.notFound.length === 0) {
            return existingDictionaryFetchResponse;
        }

        //Fetch from global dictionary
        const token = this.redisClient.generateUniqueToken(this.identity + "fetchUniqueIds");
        try {
            await this.redisClient.acquire(token);
            const newNotFoundPrimaryKeys = new Array<primaryKeyType>();
            const fetchResults = await this.redisClient.run(token, ['hmget', this.redisHashKey, ...existingDictionaryFetchResponse.notFound as string[]]) as (string | null)[];
            for (let i = 0; i < fetchResults.length; i++) {
                const uniqueId = fetchResults[i];
                const correspondingPrimaryKey = existingDictionaryFetchResponse.notFound[i];
                if (uniqueId !== null && correspondingPrimaryKey !== undefined) {
                    existingDictionaryFetchResponse.found.set(correspondingPrimaryKey, uniqueId);
                } else {
                    newNotFoundPrimaryKeys.push(correspondingPrimaryKey);
                }
            }
            existingDictionaryFetchResponse.notFound = newNotFoundPrimaryKeys;
        }
        finally {
            await this.redisClient.release(token);
        }

        return existingDictionaryFetchResponse;
    }

    private constructRedisKey(suffix: string, separatorCharacter: string, identity: string): string {
        return `${identity}${separatorCharacter}${suffix}`;
    }

    private validatePrimaryKeys(primaryKeys: primaryKeyType[]): Array<primaryKeyType> {
        const localDuplicates = new Set<primaryKeyType>();//Ensure no duplicates in the same batch, this helps with requesting less data from redis.
        for (const primaryKey of primaryKeys) {
            if (primaryKey !== undefined && primaryKey !== null //Check for undefined and null
                && (
                    (typeof primaryKey === 'string' && primaryKey.length > 0) //Check for string with length > 0
                    || (typeof primaryKey === 'number' && !Number.isNaN(primaryKey))//Check for valid number
                    || typeof primaryKey === 'boolean' //Check for boolean
                )) {
                localDuplicates.add(primaryKey);
            }
        }
        return Array.from(localDuplicates);
    }

}