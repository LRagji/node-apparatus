import assert from 'node:assert';
import { DistributedWindow, IAccumulator } from '../../src';
import { describe, it } from 'node:test';

class UnitTestAccumulator implements IAccumulator<string> {
    private readonly elements: string[] = [];

    public async add(element: string): Promise<number> {
        this.elements.push(element);
        return this.elements.length;
    }

    public async drain(length: number): Promise<string[]> {
        return this.elements.splice(0, length);
    }

    public async flush(): Promise<string[]> {
        return this.elements.splice(0, this.elements.length);
    }
}


describe('DistributedWindow', () => {

    it('Should accumulate a specific window size', async () => {
        const accumulator = new UnitTestAccumulator();
        const testInstance = new DistributedWindow(3, accumulator);
        const finalResult = new Array<string[]>();
        let results = [];
        for (let index = 0; index < 10; index++) {
            results = await testInstance.window(index.toString());
            if (results !== undefined) {
                finalResult.push(...results);
            }
        }
        results = await testInstance.flush();
        if (results.length > 0) {
            finalResult.push(...results);
        }
        const expected = [["0", "1", "2"], ["3", "4", "5"], ["6", "7", "8"], ["9"]];
        assert.deepStrictEqual(finalResult, expected);
        results = await testInstance.flush();
        assert.deepStrictEqual(results, []);
        results = await accumulator.flush();
        assert.deepStrictEqual(results, []);
    });
});