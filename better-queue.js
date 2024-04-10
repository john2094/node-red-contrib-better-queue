const Queue = require('better-queue')
const fs = require("fs");
function syncData(name) {
    let syncDataJsonFileName = `${name}.json`

    if (!fs.existsSync(syncDataJsonFileName)) {
        fs.writeFileSync(syncDataJsonFileName, '{}')
    }
    let rawBadAreaJson = fs.readFileSync(syncDataJsonFileName).toString();
    rawBadAreaJson = rawBadAreaJson.length == 0 ? '{}' : rawBadAreaJson;
    let syncDataJson = {};
    try {
        syncDataJson = JSON.parse(rawBadAreaJson)
    } catch (e) {
        console.error(`error parsing ${name}`)
    }

    this.writeAllZip = function (data) {
        fs.writeFileSync(syncDataJsonFileName, JSON.stringify(data));

    }

    this.readAll = function () {
        return syncDataJson;
    }

    return this
}
function stableSort(arr, compare) {
    var wrapper = arr.map(function (item, idx) {
        return { item: item, idx: idx };
    });

    wrapper.sort(function (a, b) {
        return compare(a.item, b.item) || (a.idx - b.idx);
    });

    return wrapper.map(function (w) { return w.item });
}

function FileStore(name) {
    this.VP = new syncData(name);
    const values = this.VP.readAll()
    this._queue = values._queue ?? [];      // Array of taskIds
    this._tasks = values._tasks ?? {};      // Map of taskId => task
    this._priorities = values._priorities ?? {}; // Map of taskId => priority
    this._running = values._running ?? {};    // Map of lockId => taskIds

}


const Node = function (RED) {
    function BetterQueueNode(config) {
        RED.nodes.createNode(this, config);

        //this.prefix = config.prefix;
        var node = this;

        this.retry = RED.nodes.getNode(config.retry);
        const opts = { concurrent: config.concurrent, filo: config.filo, maxRetries: this.retry.max, retryDelay: this.retry.delay };
        const store = new FileStore(this.id);
        opts.store = store;
        let queue = undefined;
        RED.events.on('flows:started', () => {
            queue = new Queue((payload, cb) => {
                node.send({ payload, resolve: (v) => cb(null, v), reject: (e) => cb(e) });
            }, opts);
            queue.on('task_queued', a => {
                node.status({ fill: 'green', text: `Pending ${queue._store._queue.length}` })
            })
            queue.on('task_finish', function (taskId, result, stats) {
                node.status({ fill: 'green', text: `Pending ${queue._store._queue.length}` })
            })
        })

        // Retrieve the config node

        node.on("close", function (done) {
            if (opts.store) {

                store.persist()
            }
            done();
        });

        // [`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `uncaughtException`, `SIGTERM`].forEach((eventType) => {
        //     process.on(eventType, (...a) => onClose(a));

        // })
        node.on('input', (msg) => {
            queue.push(msg.payload)
            //msg.payload = msg.payload.toLowerCase();
            //node.send(msg);
        });
    }
    RED.nodes.registerType("queue", BetterQueueNode);
}
FileStore.prototype.persist = function () {
    const self = this;
    this.VP.writeAllZip({
        _queue: self._queue,
        _tasks: self._tasks,
        _priorities: self._priorities,
        _running: self._running
    })


    // this.VP.write('_running',prev=>{

    // })
}
FileStore.prototype.connect = function (cb) {
    cb(null, this._queue.length);
}

FileStore.prototype.getTask = function (taskId, cb) {
    return cb(null, this._tasks[taskId]);
}

FileStore.prototype.deleteTask = function (taskId, cb) {
    var self = this;
    var hadTask = self._tasks[taskId];
    delete self._tasks[taskId];
    delete self._priorities[taskId];
    if (hadTask) {
        self._queue.splice(self._queue.indexOf(taskId), 1);
    }
    //this.persist();
    cb();
}

FileStore.prototype.putTask = function (taskId, task, priority, cb) {
    var self = this;
    var hadTask = self._tasks[taskId];
    self._tasks[taskId] = task;
    if (!hadTask) {
        self._queue.push(taskId);
    }
    if (priority !== undefined) {
        self._priorities[taskId] = priority;
        self._queue = stableSort(self._queue, function (a, b) {
            if (self._priorities[a] < self._priorities[b]) return 1;
            if (self._priorities[a] > self._priorities[b]) return -1;
            return 0;
        })
    }
    //this.persist();
    cb();
}
let uuid = 0;

FileStore.prototype.takeFirstN = function (n, cb) {
    var self = this;
    var lockId = uuid++;;
    var taskIds = self._queue.splice(0, n);
    var tasks = {};
    taskIds.forEach(function (taskId) {
        tasks[taskId] = self._tasks[taskId];
        delete self._tasks[taskId];
    })
    if (taskIds.length > 0) {
        self._running[lockId] = tasks;
    }
    //this.persist();
    cb(null, lockId);
}

FileStore.prototype.takeLastN = function (n, cb) {
    var self = this;
    var lockId = uuid++;
    var taskIds = self._queue.splice(-n).reverse();
    var tasks = {};
    taskIds.forEach(function (taskId) {
        tasks[taskId] = self._tasks[taskId];
        delete self._tasks[taskId];
    })
    if (taskIds.length > 0) {
        self._running[lockId] = tasks;
    }
    //this.persist();
    cb(null, lockId);
}

FileStore.prototype.getLock = function (lockId, cb) {
    var self = this;
    cb(null, self._running[lockId]);
}

FileStore.prototype.getRunningTasks = function (cb) {
    var self = this;
    cb(null, self._running);
}

FileStore.prototype.releaseLock = function (lockId, cb) {
    var self = this;
    delete self._running[lockId];
    //this.persist()
    cb();
}
module.exports = Node;