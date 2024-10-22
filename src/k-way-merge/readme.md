
# k-Way Merge

This function merges k sorted arrays into a single sorted array.

## Parameters

- **arrays**: `number[][]` - An array of k sorted arrays.

## Returns

- `number[]` - A single sorted array containing all elements from the k input arrays.

## Example

```javascript
// Given three sorted arrays:
const arrays = [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9]
];

// Merging them using kWayMerge:
const result = kWayMerge(arrays);

// The result will be:
console.log(result); // [1, 2, 3, 4, 5, 6, 7, 8, 9]
```

## Usage

To use the `kWayMerge` function, ensure you have it imported or defined in your project, then call it with the arrays you want to merge.

```javascript
const result = kWayMerge(arrays);
console.log(result);
```