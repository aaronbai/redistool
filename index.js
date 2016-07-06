/*
 * var a ='db';
 * var dic = {};
 * dic.a => dic["a"]
 * dic[a] => dic["db"]
 */
var Promise = require('bluebird');
var Redis = require('ioredis');
var colors = require('colors');
var yargs = require('yargs');

var argv = yargs.usage('Usage: $0 -h [host] -p [port] -a [password] -t [type]')
    .example('$0 -h 127.0.0.1 -p 6379 -t zset')
    .example('$0 -h 127.0.0.1 -p 6379 -s')
    .alias('t', 'type')
    .describe('t', 'type in redis, like set|zset|string and etc')
    .alias('s', 'summary')
    .describe('s', 'summ of different type distribution')
    .alias('h', 'host')
    .describe('h', 'redis-server ip')
    .default('h','127.0.0.1')
    .alias('p', 'port')
    .describe('p', 'redis-server port')
    .default('p', 6379)
    .alias('a', 'auth')
    .describe('a', 'redis-server password')
    .alias('d', 'dbnum')
    .describe('d', 'redis-server dbnumber')
    .default('d', 0)
    .argv;

var options = {};
if (argv.h) options.host = argv.h;
if (argv.p) options.port = argv.p;
if (argv.a) options.password = argv.a;
if (argv.d) options.db = argv.d;

var types = ["set", "zset", "list", "hash", "string"];
var redis = new Redis(options);
redis.on("error", function (err) {
    printError(err);
    redis.quit();
    yargs.showHelp();
    process.exit();
});

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

    return redis.getkeyslistwithtype(type).then(function(result) {
        var retData = {};
        retData["type"] = type;
        retData["keyList"] = result;
        return retData;
    });
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

    return redis.keyTypeDistri().then(function(result) {
        return result;
    });
}

function typeMemoDist(type, keys) {
    var memoSize = 0;
    var promises = [];

    function cbKeySize(keyInfo) {
        var size = parseInt(/serializedlength:\d+/.exec(keyInfo).toString().replace("serializedlength:", "")); 
        memoSize += size / 1024; // kb
        return;
    }

    function cbAllSize () {
        var retData = {};
        retData["type"] = type;
        retData["size"] = memoSize;
        return retData;
    }

    return Promise.all(keys.map(function(key) {
        return redis.debug('object', key).then(cbKeySize);
    }))
    .then(cbAllSize)
    .catch(printError);
}

function summary() {
    var resumm = {};
    var promises = [];
    var keyTables = {};
    var memoTotal = 0;
    var numberTotal = 0;

    // After Get keyslist with Given Type(eg: set)
    function cbGetKeylistWithGivenType(result) {
        var keytype = result["type"];
        keyTables[keytype] = result["keyList"];
        return;
    }

    // After Get Memo Info with Given Type
    function cbMmWithGivenType(result) {
        var keytype = result["type"];
        var size = result["size"];
        var temp = {};
        temp["memo"] = size;
        resumm[keytype] = temp;
        memoTotal += size;
        return ;
    }

    // Factory of Promise
    function factoryOfPromise(promise) {
        return promise;
    }

    function cbTypeNumberDist(result) {
        for (var index in result) {
            resumm[types[index]]["keysnumber"] = result[index];
            numberTotal += result[index];
        }
        return;
    }

    // After All keys are grouped by types
    function cbKeyGroupFinished() {
        return Promise.all(types.map(function(type) {
            return typeMemoDist(type, keyTables[type])
                .then(cbMmWithGivenType);
        }));
    }

    // After all async operations, this func will summarize global data.
    function cbSummary() {
        resumm["memoTotal"] = memoTotal;
        resumm["keyNumberTotal"] = numberTotal;
        for (var index in types) {
            var type = types[index];
            var percentage = resumm[type]["memo"] / memoTotal;
            resumm[type]["mmPercent"] = percentage; 
            percentage = resumm[type]["keysnumber"] / numberTotal;
            resumm[type]["nmPercent"] = percentage;
        }
        return resumm;
    }

    return Promise.all(types.map(function(type){
        resumm[type] = {};
        return findKeyListWithType(type).then(cbGetKeylistWithGivenType);
    }))
    .then(cbKeyGroupFinished)
    .then(factoryOfPromise(typeNumberDist))
    .then(cbTypeNumberDist)
    .then(cbSummary)
    .catch(printError);
}

//control output stream
function printAttention() {
    console.log("[Attention]".yellow);
    console.log("The memo in result is NOT the memory used. It's based on 'DEBUG OBJECT' result's serializedlength which means length in rdb file");
}

function printResult(resumm) {
    printAttention();

    console.log("==========================================================================================");
    console.log("[Result]".green);
    console.log("Keys: " + resumm["keyNumberTotal"]);
    console.log("Memories in rdb file(Kb): " + resumm.memoTotal);
    console.log("type\tmemo in rdb(Kb)\tkeysNumber\tmemoryPercent(%)\tnumberPercent(%)");

    for (var index in types) {
        var data = resumm[types[index]];
        console.log(types[index] + "\t" + data.memo + "\t" + data.keysnumber + "\t" + data.mmPercent*100 + "\t" + data.nmPercent*100);
    }
}

function printError(err) {
    console.log(("[ERROR] " + err.toString()).magenta);
}

function fini() {
    return redis.quit();
}

// Main Script
if (argv.t) {
    findKeyListWithType(argv.t)
        .then(console.log)
        .then(fini)
        .catch(printError);
}

if (argv.s) {
    summary()
        .then(printResult)
        .then(fini)
        .catch(printError);
}
