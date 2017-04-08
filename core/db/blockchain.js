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
    var nemHost = process.env["NEM_HOST" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].host;
    var nemPort = process.env["NEM_PORT" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].port;
    var node_   = nem_.model.objects.create("endpoint")(nemHost, nemPort);

    // this is the address of the Hoster of the pacNEM game. This address must have enough
    // evias.pacnem:cheese and enough evias.pacnem:heart mosaics in order to transfer them
    // to the paying player or sponsor wallets.
    var pacNEM_  = (process.env["NEM_ADDRESS"] || config.get("hoster.xem") || "TDWZ55R5VIHSH5WWK6CEGAIP7D35XVFZ3RU2S5UQ").replace(/-/g, "");

    /**
     * Get the status of the currently select NEM blockchain node.
     *
     * @return Promise
     */
    this.heartbeat = function()
    {
        return nem_.com.requests.endpoint.heartbeat(node_);
    };

    /**
     * This method fetches mosaics for the given NEMGamer.xem address.
     *
     * If the mosaic evias.pacnem:heart can be found in the account, the
     * NEMGamer.countHearts property will be updated accordingly.
     *
     * @param  NEMGamer gamer
     */
    this.fetchHeartsByGamer = function(gamer)
    {
        nem_.com.requests.account.mosaics(node_, gamer.getAddress()).then(function(res)
        {
            if (! res.data || ! res.data.length)
                return null;

            // this accounts owns mosaics, check if he has evias.pacnem:heart
            // mosaic so that he can play.
            for (var i in res.data) {
                var mosaic = res.data[i];
                var slug   = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;
                if ("evias.pacnem:heart" === slug) {
                    // this account has some lives available.
                    gamer.countHearts = parseInt(mosaic.quantity); // /!\ Divisibility of evias.pacnem:heart is 0
                    gamer.lastRead = new Date().valueOf();
                    gamer.save();
                }
            }
        }, function(err) {
            // NO Mosaics available / wrong Network for address / General Request Error
        });

        // create common object in local scope only!!
        // and only when needed.
        //XXX var common_  = nem.model.objects.create("common")("", process.env["NEM_PRIV"] || config.get("hoster.private_key") || "Your Private Key Here");
    };
};

module.exports.service = service;
}());
