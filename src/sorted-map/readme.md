# Sorted Map

The `SortedMap` class maintains the order associated with elements and provides various methods to manipulate the map.

## Parameters

- **key**: `string` - The key of the element.
- **value**: `ValueType` - The value of the element.
- **order**: `number | undefined` - The order of the element or undefined if you want to maintain insertion order.

## Returns

- `SortedMap<ValueType>` - A new map instance with the elements sorted based on the order.

## Example

```javascript
// Create a new SortedMap instance
const sortedMap = new SortedMap<number>();

// Set key-value pairs with order
sortedMap.set('a', 1, 2);
sortedMap.set('b', 2, 1);
sortedMap.set('c', 3);

// Get the value of a key
console.log(sortedMap.get('a')); // 1

// Sort the map based on the order
const sorted = sortedMap.sort();
console.log(Array.from(sorted.entries())); // [['b', 2], ['a', 1], ['c', 3]]

// Clear the map
sortedMap.clear();
console.log(sortedMap.get('a')); // undefined
```