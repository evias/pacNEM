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

    var config = require("config"),
        path = require('path'),
        CryptoJS = require("crypto-js");

    /**
     * class SponsorEngine provides a business layer for
     * sponsor Pay per View management. (Sending Mosaics for 
     * daily Ad Views)
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var SponsorEngine = function(io, logger, chainDataLayer, dataLayer) {
        this.socketIO_ = io;
        this.logger_ = logger;
        this.blockchain_ = chainDataLayer;
        this.db_ = dataLayer;

        /**
         * This function will initiate a PAYOUT of pacnem:daily-ad-view Mosaics
         * to the given Sponsor `xem` XEM address.
         * 
         * @param {Pacman}  pacman
         * @param {integer} currentTop10MinScore
         * @param {integer} currentHighScore
         * @return void | false
         */
        this.sendRewardForViews = function(sponsor) {
            if (!sponsor || !sponsor.xem)
                return false;

            if (!sponsor.countAdViews || sponsor.countAdViews % 3 !== 0)
                return false;

            var self = this;

            // build message with total count ad views and avoid sending message
            // more than once on the nem blockchain.
            var message = "PacNEM Pay per View: " + sponsor.countAdViews + " ad views";

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM SPONSOR]", "Sending Daily Ad View with Message Plain JSON: '" + message + "' to Sponsor '" + sponsor.reference + "' with address: " + sponsor.xem);

            // find already paid out Rewards
            self.db_.NEMReward.findOne({ "address": sponsor.xem, "encryptedMessage": message },
                function(err, reward) {
                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM SPONSOR]", "READ NEMReward JSON: '" + JSON.stringify(reward));

                    if (err) {
                        self.logger_.error("[ERROR]", "[PACNEM SPONSOR]", "Error reading NEMReward: " + JSON.stringify(err));
                        return false;
                    }

                    if (!reward) {
                        // we only want to payout in case we didn't send mosaics before
                        // for this Game and Player.
                        var createReward = new self.db_.NEMReward({
                            "address": sponsor.xem,
                            "encryptedMessage": message
                        });
                        createReward.save();

                        self.announceRewardsPayout(createReward, sponsor);
                    }
                });
        };

        /**
         * Used as a callback to `sendRewardForViews`. This method creates a NEM blockchain
         * Mosaic Transfer Transaction with 3 pacnem:daily-ad-view and announces it on the network.
         * 
         * The Wallet used in this payout is the MULTISIG WALLET.
         * 
         * @param   {NEMReward}     nemReward
         * @param   {NEMSponsor}    sponsor
         * @return void
         */
        this.announceRewardsPayout = function(nemReward, sponsor) {
            var self = this;
            var nemSDK = self.blockchain_.getSDK();
            var appsMosaic = self.blockchain_.getGameMosaicsConfiguration();

            var countAdViews = 3; // send 3 x pacnem:daily-ad-view Mosaic
            var privStore = nemSDK.model.objects.create("common")("", self.blockchain_.getPublicWalletSecretKey());
            var mosaicDefPair = nemSDK.model.objects.get("mosaicDefinitionMetaDataPair");
            var adViewsMosaicName = Object.getOwnPropertyNames(appsMosaic.sponsors)[0];
            var adViewsMosaicSlug = self.blockchain_.getNamespace() + ":" + adViewsMosaicName;

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM SPONSOR]", "Now sending " + countAdViews + " daily-ad-view to Sponsor " + sponsor.xem + " with message '" + nemReward.encryptedMessage + "' paid by " + self.blockchain_.getVendorWallet());

            // Create an un-prepared multisig mosaic transfer transaction object
            // Amount 1 is "one time x Mosaic Attachments"
            // (use same object as transfer tansaction)
            var transferTransaction = nemSDK.model.objects.create("transferTransaction")(sponsor.xem, 1, nemReward.encryptedMessage);

            if (self.blockchain_.useMultisig()) {
                transferTransaction.isMultisig = true;
                transferTransaction.multisigAccount = { publicKey: config.get("pacnem.businessPublic") };
            }

            var mosaicAttachAdViews = nemSDK.model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), adViewsMosaicName, countAdViews);
            var adViewSlug = self.blockchain_.getNamespace() + ":" + adViewsMosaicName;

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM SPONSOR]", "Using Mosaics: " + adViewSlug);

            // Need mosaic definition of evias.pacnem:* mosaics to calculate 
            // adequate fees, so we get it from network.
            nemSDK.com.requests.namespace
                .mosaicDefinitions(self.blockchain_.getEndpoint(), self.blockchain_.getNamespace()).then(
                    function(res) {
                        res = res.data;

                        var adViewDef = nemSDK.utils.helpers.searchMosaicDefinitionArray(res, [adViewsMosaicName]);

                        if (undefined === adViewDef[adViewSlug])
                            return self.logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition with [adViewSlug]: " + JSON.stringify([adViewSlug]) + " - Obligatory for the game, Please fix!");

                        // Now preparing our Mosaic Transfer Transaction 
                        // (1) configure mosaic definition pair
                        // (2) attach mosaics attachments to transfer transaction
                        // (3) configure transfer transaction
                        // (4) announce transaction on the network

                        // (1)
                        mosaicDefPair[adViewSlug] = {};
                        mosaicDefPair[adViewSlug].mosaicDefinition = adViewDef[adViewSlug];

                        // (2)
                        transferTransaction.mosaics.push(mosaicAttachAdViews);

                        // (3)
                        // Prepare the mosaic transfer transaction object
                        var entity = nemSDK.model.transactions.prepare("mosaicTransferTransaction")(
                            privStore,
                            transferTransaction,
                            mosaicDefPair,
                            self.blockchain_.getNetwork().config.id
                        );

                        //DEBUG self.logger_.info("[DEBUG]", "[PACNEM SPONSOR]", "Now sending Mosaic Transfer Transaction to " + sponsor.xem + " with following data: " + JSON.stringify(entity) + " on network: " + JSON.stringify(self.blockchain_.getNetwork().config) + " with common: " + JSON.stringify(privStore));

                        // (4) announce the mosaic transfer transaction on the NEM network
                        nemSDK.model.transactions.send(privStore, entity, self.blockchain_.getEndpoint()).then(
                            function(res) {
                                delete privStore;

                                // If code >= 2, it's an error
                                if (res.code >= 2) {
                                    self.logger_.error("[NEM] [ERROR] [PACNEM SPONSOR]", __line, "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + sponsor.xem + ": " + JSON.stringify(res));
                                    return false;
                                }

                                var trxHash = res.transactionHash.data;
                                var paidOutRewards = {};
                                paidOutRewards[adViewsMosaicName] = {
                                    "mosaic": adViewSlug,
                                    "quantity": countAdViews
                                };

                                self.logger_.info("[DEBUG]", "[PACNEM SPONSOR]", "Created a Mosaic transfer transaction for " + sponsor.xem + " with hash '" + trxHash + " and paidOutRewards: " + JSON.stringify(paidOutRewards));

                                nemReward.transactionHash = trxHash;
                                nemReward.rewards = paidOutRewards;
                                nemReward.save();
                            },
                            function(err) {
                                self.logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + sponsor.xem + " with error: " + err);
                            });
                    },
                    function(err) {
                        self.logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + self.blockchain_.getNamespace() + ": " + err);
                    });
        };
    };

    module.exports.SponsorEngine = SponsorEngine;
}());