import assert from 'node:assert';
import { DistributedAutoIncrementingPrimaryKey } from '../../src';
import { IRedisClientPool } from "redis-abstraction";
import { afterEach, beforeEach, describe, it } from 'node:test';
import { stub, createSandbox, match } from 'sinon';

class MockRedisClientPool implements IRedisClientPool {

    acquire(token: string): Promise<void> {
        throw new Error(`acquire Method not mocked for args: ${token}`);
    }
    release(token: string): Promise<void> {
        throw new Error(`release Method not mocked for args: ${token}`);
    }
    shutdown(): Promise<void> {
        throw new Error(`shutdown Method not mocked`);
    }
    run(token: string, commandArgs: string[]): Promise<any> {
        throw new Error(`run Method not mocked for args: ${token}, ${commandArgs}`);
    }
    pipeline(token: string, commands: string[][], transaction: boolean): Promise<any> {
        throw new Error(`pipeline Method not mocked for args: ${token}, ${commands}, ${transaction}`);
    }
    script(token: string, filePath: string, keys: string[], args: string[]): Promise<any> {
        throw new Error(`script Method not mocked for args: ${token}, ${filePath}, ${keys}, ${args}`);
    }
    generateUniqueToken(prefix: string): string {
        throw new Error(`generateUniqueToken Method not mocked for args: ${prefix}`);
    }

}

describe('DistributedAutoIncrementingPrimaryKey', () => {

    const sandbox = createSandbox();

    afterEach(() => {
        sandbox.restore();
        sandbox.reset();
    });

    it('should insert keys correctly when no refurbished ids exists', async () => {
        const mockRedis = new MockRedisClientPool();
        const target = new DistributedAutoIncrementingPrimaryKey(mockRedis, 'test-dictionary');
        const insertToken = 'unique-insert-token';

        const redisAcquireMock = stub(mockRedis, "acquire");
        redisAcquireMock.withArgs(match(insertToken)).resolves();
        redisAcquireMock.callThrough();

        const redisReleaseMock = stub(mockRedis, "release")
        redisReleaseMock.withArgs(insertToken).resolves();
        redisReleaseMock.callThrough();

        const redisGenerateTokenMock = stub(mockRedis, "generateUniqueToken");
        redisGenerateTokenMock.withArgs(`${target.identity}insert`).returns(insertToken);
        redisGenerateTokenMock.callThrough();

        const redisRunMock = stub(mockRedis, "run");
        redisRunMock.withArgs(match(insertToken), match.array.contains(['LPOP'])).resolves([]);
        redisRunMock.withArgs(match(insertToken), match.array.contains(['BITFIELD'])).resolves([0, 2]);
        redisRunMock.callThrough();

        const redisPipelineMock = stub(mockRedis, "pipeline");
        redisPipelineMock.withArgs(match(insertToken), match.any, false).resolves([1, 1]);
        redisPipelineMock.callThrough();

        const result = await target.insert(['PK1', 'PK2']);
        assert.strictEqual(result.inserted.size, 2);
        assert.strictEqual(result.overflow.length, 0);
        assert.strictEqual(result.inserted.get('PK1'), 'test-dictionary-0');
        assert.strictEqual(result.inserted.get('PK2'), 'test-dictionary-1');

        //TODO: Validate mocks called as expected
        assert.ok(redisAcquireMock.calledOnce);
        assert.ok(redisReleaseMock.calledOnce);
        assert.ok(redisGenerateTokenMock.calledOnce);
        assert.ok(redisRunMock.calledTwice);
        assert.ok(redisPipelineMock.calledOnce);
        assert.deepStrictEqual(redisRunMock.firstCall.args[1], ['LPOP', 'test-dictionary-refurbished', '2']);
        assert.deepStrictEqual(redisRunMock.secondCall.args[1], ['BITFIELD', 'test-dictionary-ctr', 'GET', target.maxCapacity, '0', 'OVERFLOW', 'SAT', 'INCRBY', target.maxCapacity, '0', '2']);
        assert.deepStrictEqual(redisPipelineMock.firstCall.args[1], [
            ['HSET', 'test-dictionary-map', 'PK1', 'test-dictionary-0'],
            ['HSET', 'test-dictionary-map', 'PK2', 'test-dictionary-1']
        ]);
    });

    it('should fetchUniqueIds correctly when keys exists', async () => {
        const mockRedis = new MockRedisClientPool();
        const target = new DistributedAutoIncrementingPrimaryKey(mockRedis, 'test-dictionary');
        const fetchUniqueIdsToken = 'unique-fetchUniqueIds-token';

        const redisAcquireMock = stub(mockRedis, "acquire");
        redisAcquireMock.withArgs(match(fetchUniqueIdsToken)).resolves();
        redisAcquireMock.callThrough();

        const redisReleaseMock = stub(mockRedis, "release")
        redisReleaseMock.withArgs(fetchUniqueIdsToken).resolves();
        redisReleaseMock.callThrough();

        const redisGenerateTokenMock = stub(mockRedis, "generateUniqueToken");
        redisGenerateTokenMock.withArgs(`${target.identity}fetchUniqueIds`).returns(fetchUniqueIdsToken);
        redisGenerateTokenMock.callThrough();

        const redisRunMock = stub(mockRedis, "run");
        redisRunMock.withArgs(match(fetchUniqueIdsToken), match.array.contains(['HMGET'])).resolves(['test-dictionary-0', 'test-dictionary-1']);
        redisRunMock.callThrough();

        const result = await target.fetchUniqueIds(['PK1', 'PK2']);
        assert.strictEqual(result.found.size, 2);
        assert.strictEqual(result.notFound.length, 0);
        assert.strictEqual(result.found.get('PK1'), 'test-dictionary-0');
        assert.strictEqual(result.found.get('PK2'), 'test-dictionary-1');

        //TODO: Validate mocks called as expected
        assert.ok(redisAcquireMock.calledOnce);
        assert.ok(redisReleaseMock.calledOnce);
        assert.ok(redisGenerateTokenMock.calledOnce);
        assert.ok(redisRunMock.calledOnce);
        assert.deepStrictEqual(redisRunMock.firstCall.args[1], ['HMGET', 'test-dictionary-map', 'PK1', 'PK2']);
    });

});