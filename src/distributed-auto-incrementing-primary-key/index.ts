
import { IORedisClientPool } from "redis-abstraction";
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
     * @param redisConnection  Redis connection pool to be used for all operations.
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
        private readonly redisConnection: IORedisClientPool,
        private readonly identity: string = randomUUID(),
        private readonly existingDictionary: DistributedAutoIncrementingPrimaryKey | undefined = undefined,
        private readonly separatorCharacter: string = '-',
        private readonly redisKeyBuilder: (suffix: string, separatorCharacter: string, identity: string) => string = this.constructRedisKey,
        private readonly maxCapacity: 'i64' | 'u8' | 'u16' | 'u32' = 'i64'
    ) {
    }

    private constructRedisKey(suffix: string, separatorCharacter: string, identity: string): string {
        return `rhdict${separatorCharacter}${suffix}${this.separatorCharacter}${identity}`;
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
     */
    public async insert(primaryKeys: primaryKeyType[]): Promise<insertResponseType> {
        //Invoke chaining dictionary first if any
        let existingDictionaryInsertResponse: insertResponseType = { inserted: new Map<primaryKeyType, uniqueIdType>(), overflow: primaryKeys };
        if (this.existingDictionary != undefined) {
            existingDictionaryInsertResponse = await this.existingDictionary.insert(primaryKeys);
        }
        else {
            //Validations (only the base dictionary should do this,only once for performance reasons)
            const filteredValues = new Array<primaryKeyType>();
            const localDuplicates = new Set<primaryKeyType>();//Ensure no duplicates in the same batch, this helps with requesting less unique ids from redis.
            for (const v of existingDictionaryInsertResponse.overflow) {
                if (v !== undefined && v !== null //Check for undefined and null
                    && (
                        (typeof v === 'string' && v.length > 0) ||
                        (typeof v === 'number' && !isNaN(v)) ||
                        (typeof v === 'boolean')
                    ) //Check for valid types
                    && !localDuplicates.has(v)) //Check for local duplicates 
                {
                    filteredValues.push(v);
                    localDuplicates.add(v);
                }
            }
            localDuplicates.clear();
            existingDictionaryInsertResponse.overflow = filteredValues;
        }

        //If no overflow, return(short-circuit)
        if (existingDictionaryInsertResponse.overflow.length === 0) {
            return existingDictionaryInsertResponse;
        }

        //Insertions into global dictionary
        const token = this.redisConnection.generateUniqueToken(this.identity);
        try {
            await this.redisConnection.acquire(token);

            //Acquire unique ids
            let uniqueIdsRequired = existingDictionaryInsertResponse.overflow.length;
            const uniqueIds = new Set<number>(await this.redisConnection.run(token, [`LPOP`, this.redisRefurbishedListKey, uniqueIdsRequired]) as number[]);
            uniqueIdsRequired -= uniqueIds.size;
            const freshIdRange = await this.redisConnection.run(token, ['BITFIELD', this.redisCounterKey, `GET`, this.maxCapacity, `0`, `OVERFLOW`, `SAT`, `INCRBY`, this.maxCapacity, `0`, uniqueIdsRequired]) as number[];//First acquire counter space.
            const startInclusiveId = freshIdRange[0];
            const endExclusiveId = freshIdRange[1];
            for (let i = startInclusiveId; i < endExclusiveId; i++) {
                uniqueIds.add(i);
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
                insertCommands.push(['HSET', this.redisHashKey, fieldName.toString(), fieldValue]);
                uniqueIds.delete(id);
            }

            //Insert Key Value pairs
            const insertResults = await this.redisConnection.pipeline(token, insertCommands) as number[];
            for (let i = 0; i < insertResults.length; i++) {
                if (insertResults[i] === 0) {
                    //This means the field already existed, so we need to reclaim the id
                    const reclaimedId = uniqueIdsArray[i];
                    if (reclaimedId !== undefined) {
                        uniqueIds.add(reclaimedId);
                    }
                }
                else if (insertResults[i] === 1) {
                    //This means the field was newly inserted, so we can add it to the response
                    const primaryKey = insertCommands[i][2];
                    const uniqueId = insertCommands[i][3];
                    existingDictionaryInsertResponse.inserted.set(primaryKey, uniqueId);
                }
            }

            //Push reclaimed ids to refurbished list for future use
            if (uniqueIds.size > 0) {
                await this.redisConnection.run(token, ['LPUSH', this.redisRefurbishedListKey, ...uniqueIds.values()]);
            }
        }
        finally {
            await this.redisConnection.release(token);
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
     */
    public async fetchUniqueIds(primaryKeys: primaryKeyType[]): Promise<fetchResponseType> {

        //Invoke chaining dictionary first if any
        let existingDictionaryFetchResponse: fetchResponseType = { found: new Map<primaryKeyType, uniqueIdType>(), notFound: primaryKeys };
        if (this.existingDictionary != undefined) {
            existingDictionaryFetchResponse = await this.existingDictionary.fetchUniqueIds(primaryKeys);
        } else {
            //Validations (only the base dictionary should do this,only once for performance reasons)
            const filteredValues = new Array<primaryKeyType>();
            const localDuplicates = new Set<primaryKeyType>();//Ensure no duplicates in the same batch, this helps with requesting less data from redis.
            for (const primaryKey of existingDictionaryFetchResponse.notFound) {
                if (primaryKey !== undefined && primaryKey !== null //Check for undefined and null
                    && (typeof primaryKey === 'string' && primaryKey.length > 0)
                    || (typeof primaryKey === 'number' && !isNaN(primaryKey))
                    || typeof primaryKey === 'boolean' //Check for valid types
                    && !localDuplicates.has(primaryKey)) //Check for local duplicates 
                {
                    filteredValues.push(primaryKey);
                    localDuplicates.add(primaryKey);
                }
            }
            localDuplicates.clear();
            existingDictionaryFetchResponse.notFound = filteredValues;
        }

        //If no overflow, return(short-circuit)
        if (existingDictionaryFetchResponse.notFound.length === 0) {
            return existingDictionaryFetchResponse;
        }

        //Fetch from global dictionary
        const token = this.redisConnection.generateUniqueToken(this.identity);
        try {
            await this.redisConnection.acquire(token);
            const newNotFoundPrimaryKeys = new Array<primaryKeyType>();
            const fetchResults = await this.redisConnection.run(token, ['HMGET', this.redisHashKey, ...existingDictionaryFetchResponse.notFound]) as (string | null)[];
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
            await this.redisConnection.release(token);
        }

        return existingDictionaryFetchResponse;
    }

}