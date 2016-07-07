# ReadMe

## Desc
A series of tools used for redis-server analyse. There is already some good tools to do it:
[redis-sampler](https://github.com/antirez/redis-sampler)
[redis-audit](https://github.com/snmaynard/redis-audit)

This script have some uniq abilities, such as summ memory usages of different type of keys.
* set: xxM, 5%
* zset: xxM, 80%
* hash: xxM, 2%
* list: xxM, 3%
* string: xxM, 10%

![image](https://github.com/aaronbai/redistool/blob/master/images/snapshot.png)
