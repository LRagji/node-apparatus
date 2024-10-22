## Injectable Constructor

The `InjectableConstructor` class is designed to facilitate dependency injection in your application. This class allows you to define and inject dependencies through its constructor, promoting a clean, testable and modular design.

### Usage

Use the `InjectableConstructor` class, wherever in you code you use the keyword `new`.

### Example
```javascript
// Define dependencies
class DependencyA {
    constructor() {
        this.name = 'DependencyA';
    }
}

class SomeClass {
    constructor() {
        this.name = 'SomeClass';
        this.dep = new DependencyA(); //This is not injectable and testable while writing unit test 
    }
}

// Rewrite SomeClass using InjectableConstructor
class SomeClass {
    constructor(ctor = new InjectableConstructor()) {
        this.name = 'SomeClass';
        this.dep = ctor.createInstance(DependencyA); //This is now testable cause its injected via ctor object which is passed in the constructor 
    }
}

```