/**
 * Part of the evias/pacNEM package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/pacNEM
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @contributor Nicolas Dubien (https://github.com/dubzzz)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 */

(function() {

var config = require("config");

/**
 * class service provide a business layer for
 * blockchain data queries used in the pacNEM game.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var service = function(io, nemSDK)
{
    var socket_ = io;

    // initialize the current running game's blockchain service with
    // the NEM blockchain. This will create the endpoint for the given
    // network and port (testnet, mainnet, mijin) and will then initialize
    // a common object using the configured private key.
    var nem_    = nemSDK;

    var isTestMode = config.get("nem.isTestMode");
    var envSuffix  = isTestMode ? "_TEST" : "";
    var confSuffix = isTestMode ? "_test" : "";

    // connect to the blockchain with the NEM SDK
    var nemHost = process.env["NEM_HOST" + envSuffix] || config.get("nem.nodes" + confSuffix) || nem_.model.nodes.defaultTestnet;
    var nemPort = process.env["NEM_PORT" + envSuffix] || config.get("nem.nodes" + confSuffix) || nem_.model.nodes.defaultPort;

    var node_   = nem_.model.objects.create("endpoint")(nemHost, nemPort);

    // "authenticate" the pacnem hoster wallet for sending hearts and cheeses
    var pacNEM_  = process.env["NEM_ADDRESS"] || config.get("hoster.xem") || "TDWZ55R5VIHSH5WWK6CEGAIP7D35XVFZ3RU2S5UQ";

    this.status = function()
    {
        return nem_.com.requests.endpoint.heartbeat(endpoint);
    };

    this.fetchHeartsByAddress = function(address)
    {
        nem_.com.requests.account.data(node_, address).then(function(res) {
            console.log("\nAccount data:");
            console.log(res);
        }, function(err) {
            console.error("NEM SDK RESPONSE ERROR: ", err);
        });

        // create common object in local scope only!!
        // and only when needed.
        //XXX var common_  = nem.model.objects.create("common")("", process.env["NEM_PRIV"] || config.get("hoster.private_key") || "Your Private Key Here");
    };
};

module.exports.service = service;
}());
