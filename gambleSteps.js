var options = {
    "port": 6379,
    "host": '127.0.0.1',
    "password": "Admin@123"
};
var Redis = require('ioredis');
var redis = new Redis(options);

// team: 1->left 2->right
function steps2Value(steps, team){
    return steps * 10 + team;
}

function construct_env() {
    // Left-Right Steps
    var feedsid = 'feedsid';
    redis.zadd(feedsid, 9897812312, '1');  // left
    redis.zadd(feedsid, 897812312, '2'); // right

    // TotalSteps Rank(limit: 1000)
    // zadd feedsid_totalrank 3677991 779484874
    redis.zadd(feedsid+"_totalrank", 3677991, 779484874);  // support left
    redis.zadd(feedsid+"_totalrank", 789892, 419156339);  // support right

    // TodaySteps Rank(limit: 1000)
    // zadd feedsid_20160630 35671 779484874
    redis.zadd(feedsid+"_20160630_rank", 677991, 779484874); // support left
    redis.zadd(feedsid+"_20160630_rank", 89892, 419156339); // support right
    
    // TodaySteps | TotalSteps
    redis.hset(feedsid+"_totalsteps", 3677991, 779484874);
    redis.hset(feedsid+"_20160630_steps", 67799, 779484874);

    // gambleCollections
    redis.sadd('gamblesteps', feedsid);
}

/*
 * team: 1->left, 2->right
 */
function gambleSteps(uin, feedsid, steps, team){
    // checksteps And team
    var ckv_todaySteps = 99999;
    var pipeline = redis.pipeline();
    pipeline.zscore(feedsid+"_20160630_steps", uin);
    pipeline.zscore(feedsid+"_totalsteps", uin);
    pipeline.exec(function(err, data){
        /*
         * check validation
         */
        if (err)
            console.log("zscore error: " + err);
        var donateTodaySteps = data[0] / 10;
        var donateTotalSteps = data[1] / 10;
        var support = data[1] % 10;
        //if (steps != ckv_todaySteps - donateTodaySteps || team != support)  // steps incorrect or team error
        //    return -1; 

        var stepsValue = steps * 10;
        var todaySteps = data[0] + stepsValue;
        var totalSteps = data[1] + stepsValue;

        /*
         * 下面可以并行操作
         */
        /*
         * 1. 并行1: gambleSteps
         */
        var pipeline = redis.pipeline();
        pipeline.zincrby(feedsid+"_20160630_steps", stepsValue, uin);
        pipeline.zincrby(feedsid+"_totalsteps", stepsValue, uin);
        pipeline.zincrby(feedsid, stepsValue, team);
        pipeline.exec(function(err, data){
            if (err) {
                console.log(err);
            }
        });

        // 并行2: adjust rank
        // lua script
        redis.defineCommand('ajustRank', {
            numberOfKeys: 0,
            lua: "local n = redis.call('zcard', ARGV[1]);" + 
            "if (n >= 1000) then " + 
            "   local score = redis.call('zrange', ARGV[1], 0, 0, 'withscores')[2];" + // 最低的热度
            "   if ARGV[2] < score then return 0 end;" + // 新动态热度比最低的热度还小，不加入
            "   redis.call('zadd', ARGV[1], ARGV[2], ARGV[3]);" + 
            "   n = n - 1000;" + 
            "   redis.call('zremrangebyrank', ARGV[1], 0, n);" + 
            "   return -(n + 1);" + 
            "else " + 
            "   redis.call('zadd', ARGV[1], ARGV[2], ARGV[3]);" + 
            "end;" + 
            "return n;"
            // limit 1000
        });

        // 调整totalrank和20160630_rank
        redis.ajustRank(uin, totalSteps, feedsid+"_totalrank", function (err, data){
            
        });
        redis.ajustRank(uin, todaySteps, feedsid+"_20160630_rank", function (err, data){
            
        });
    });
}

function getUserInfo() {
    /*
     * 1. Ckv Steps 当天的步数
     * 2. CkvSteps-RedisDaySteps 可捐赠的步数
     * 3. Team 支持哪个队
     * 4. RedisTotalSteps 捐赠的总步数
     * 5. TeamSteps 两队总步数
     * pipeline
     */
}

function getRankInfo() {
    /*
     * 吐出排行榜信息
     * uin:steps:team
     */
}

function getAllGambles() {
    /*
     * 获取全部比赛 -- 管理端操作
     */
    // sadd gamblesteps feedsid
}
