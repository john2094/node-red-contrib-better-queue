module.exports = function (RED) {
    function RetryConfigNode(n) {
        RED.nodes.createNode(this, n);
        this.max = parseInt(n.max);
        this.delay = parseInt(n.delay);
    }
    RED.nodes.registerType("retry-config", RetryConfigNode);
}