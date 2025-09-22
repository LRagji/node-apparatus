# Remote Hash Dictionary


### Specs

1. Remote Dictionary supports signed 64 18446744073709551615 entries, limited by redis INCR integer handling.
2. Named Dictionary.
3. Low latency strive for constant time, ie: constant time access O(1)
4. Bulk operations
5. Multithreaded(atomic)
6. 