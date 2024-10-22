/**
 * InjectableConstructor is a class that is used to create instances of classes.(this helps with dependency injection & mocking).
 */
export class InjectableConstructor {

    /**
     * Creates an instance of a class with a constructor.
     * @param typeConstructor The class constructor
     * @param constructorArguments The arguments to pass to the constructor(optional)
     * @returns The instance of the class
     */
    public createInstance<InstanceType>(typeConstructor: new (...constructorArguments: any[]) => InstanceType, constructorArguments?: any[]): InstanceType {
        return new typeConstructor(...(constructorArguments || []));
    }

    /**
     * Creates an instance of a class without a constructor asynchronously.
     * @param typeConstructorFunction The class constructor ASYNC function.
     * @param constructorFunctionArguments the arguments to pass to the constructor(optional)
     * @returns The instance of the class
     */
    public async createAsyncInstanceWithoutConstructor<InstanceType>(typeConstructorFunction: (...constructorFunctionArguments: any[]) => Promise<InstanceType>, constructorFunctionArguments?: any[]): Promise<InstanceType> {
        return await typeConstructorFunction(...(constructorFunctionArguments || []));
    }

    /**
     * Creates an instance of a class without a constructor.
     * @param typeConstructorFunction The class constructor function.
     * @param constructorFunctionArguments the arguments to pass to the constructor(optional)
     * @returns The instance of the class
     */
    public createInstanceWithoutConstructor<InstanceType>(typeConstructorFunction: (...constructorFunctionArguments: any[]) => InstanceType, constructorFunctionArguments?: any[]): InstanceType {
        return typeConstructorFunction(...(constructorFunctionArguments || []));
    }
}