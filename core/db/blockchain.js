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
var service = function(io, dataLayer, nemSDK)
{
    var socket_ = io;
    var db_     = dataLayer;

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

/**
 * PacNEM model overrides and Hooks configuration to parallelly
 * with localStorage + DB + Blockchain.
 */
    db_.NEMGamer_.post("save", function(err, gamer, next)
    {
        // check whether the blockchain must be read or if we
        // have data for the given gamer. POST-save mechanism
        // only checks every 30 minutes using the blockchain.
        // More frequent checks are done in case of Payment
        // events but those will not be handled in this Model.

        if (err)
            // bubble-up the error..
            return next(err);

        // blockchain timing check
        var currentTime   = new Date().valueOf();
        var thirtyMinutes = 30 * 60 * 1000;
        if (! this.lastRead || currentTime >= this.lastRead + thirtyMinutes) {
            //XXX blockchainLayer_.fetchHeartsByAddress(gamer.xem);
            console.log("NOW READ BLOCKCHAIN FOR " + gamer.xem);
        }

        // next middleware
        return next();
    });
};

module.exports.service = service;
}());
