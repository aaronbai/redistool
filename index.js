var Promise = require('bluebird');
var Redis = require('ioredis');
var argv = require('yargs')
    .usage('Usage: $0 -h [host] -p [port] -a [password] -t [type]')
    .example('$0 -h 127.0.0.1 -p 6379 -t zset')
    .alias('t', 'type')
    .describe('t', 'type in redis, like set|zset|string and etc')
    .alias('s', 'summery')
    .describe('s', 'summery of keys number')
    .alias('h', 'host')
    .describe('h', 'redis-server ip')
    .alias('p', 'port')
    .describe('p', 'redis-server port')
    .alias('a', 'auth')
    .describe('a', 'redis-server password')
    .alias('d', 'dbnum')
    .describe('d', 'redis-server dbnumber')
    .demand(['h', 'p'])
    .argv;

var options = {
    'port': 6379,
    'host': '127.0.0.1',
    'password': 'Admin@123',
    'db': 0
};
if (argv.h) options.host = argv.h;
if (argv.p) options.port = argv.p;
if (argv.a) options.password = argv.a;
if (argv.d) options.db = argv.d;

var redis = new Redis(options);

/*
 * @desc: get a list of keys with specific type
 */
function findKeyListWithType(type) {
    redis.defineCommand('getkeyslistwithtype', {
        numberOfKeys: 0,
        lua: 'local keys = redis.call("keys", "*");' +
             'local results = {}; ' +
             'for index,key in pairs(keys) do ' +
             '    local keytype = redis.call("type", key); ' +
             '        if (keytype["ok"] == ARGV[1]) then ' +
             '            table.insert(results, key); ' +
             '        end ' +
             'end ' +
             'return results;'
    });

    var retData = {};

    var promise = new Promise(function(resolve, reject) {
        redis.getkeyslistwithtype(type).then(function(result){
            retData["type"] = type;
            retData["keyList"] = result;
            resolve(retData);
        });
    });

    return promise; 
}

/*
 * @desc:
 * @attention: lua脚本不能返回字典table,只能返回array,下标为0,1,2,3.....
 *             debug object 不能在lua脚本中执行
 */
function typeNumberDist() {
    redis.defineCommand('keyTypeDistri', {
        numberOfKeys: 0,
        lua: 'local keys = redis.call("keys", "*"); ' +
             'local numbers = {0, 0, 0, 0, 0}; ' +
             'for index,key in pairs(keys) do ' +
             '    local keytype = redis.call("type", key); ' +
             '    if (keytype["ok"] == "set") then numbers[1]=numbers[1]+1; end ' + 
             '    if (keytype["ok"] == "zset") then numbers[2]=numbers[2]+1; end ' + 
             '    if (keytype["ok"] == "list") then numbers[3]=numbers[3]+1; end ' + 
             '    if (keytype["ok"] == "hash") then numbers[4]=numbers[4]+1; end ' + 
             '    if (keytype["ok"] == "string") then numbers[5]=numbers[5]+1; end ' + 
             'end ' + 
             'return numbers;'
    });

    redis.keyTypeDistri().then(function(result){
        console.log(result);
        return result;
    }, function(err){
        console.log("[err]: " + err);
    });
}

function typeMemoDist(type, keys) {
    var memoSize = 0;
    var promises = [];

    return new Promise(function(resolve, reject){
        keys.forEach(function(key){
            promises.push(redis.debug('object', key).then(function(result){
                var size = parseInt(/serializedlength:\d+/.exec(result).toString().replace("serializedlength:", "")); 
                memoSize += size / 1024; // kb
            }));
        });

        Promise.all(promises).then(function (){
            var retData = {};
            retData["type"] = type;
            retData["size"] = memoSize;
            resolve(retData);
        });
    });
}

if (argv.t) {
    findKeyListWithType(argv.t).then(function(result){
        console.log(result);
    });
}

if (argv.s) {
    var resumm = {};
    var promises = [];
    var types = ["set", "zset", "list", "hash", "string"];
    var keyTables = {};
    //var keyNumbers = typeNumberDist();
    var memoTotal = 0;
    for (var index in types) {
        var type = types[index];
        promises.push(findKeyListWithType(type).then(function(result){
            var keytype = result["type"];
            keyTables[keytype] = result["keyList"];
        }));
    }


    /*
     * var a ='db';
     * var dic = {};
     * dic.a => dic["a"]
     * dic[a] => dic["db"]
     */
    Promise.all(promises).then(function () {
        for (var index in types) {
            var type = types[index];
            promises.push(typeMemoDist(type, keyTables[type]).then(function (result){
                var keytype = result["type"];
                var size = result["size"];
                var temp = {};
                temp["memo"] = size;
                temp["type"] = keytype;
                resumm[keytype] = temp;
                memoTotal += size;
            }));
        }

        Promise.all(promises).then(function () {
            resumm["memoTotal"] = memoTotal;
            for (var index in types) {
                var type = types[index];
                console.log(type + ":" + resumm[type]);
                var percentage = resumm[type]["memo"] / memoTotal;
                resumm[type]["mmPercent"] = percentage; 
            }
            redis.quit();
            console.log(resumm);
        });
    },function (err) {
        console.log('a u fucking kidding me? ' + err);
    });
}
