# Distributed Auto Incrementing Primary Key (DAIPK)

This is a dictionary data structure which is enabled on redis to keep track of unique keys that exists in a distributed system. Each value in the dictionary is assigned a unique key which is {identity}-{unique_number} format.


### Specs

1. Each DAIPK supports max signed i64 bit 9,223,372,036,854,775,807 entries(only positive), limited by redis INCR integer handling.
2. Named Dictionary, which means you can create multiple such instance on a single redis instance.
3. Low latency strive for constant time, ie: constant time access O(1)
4. Supports Bulk operations.
5. Multi-threaded & Multi-process safe operation (atomic).
6. Chain composable, when you have really big dictionary which allows you to compose multiple dictionary into one large one or want to shard dictionaries for efficiency.

