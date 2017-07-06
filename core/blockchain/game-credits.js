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
        path = require('path');

    var __Errors = function() {
        this.E_SERVER_ERROR = 2;
    };

    /**
     * class GameCredits provides a business layer for
     * Game Credits management. (High Scores reading / writing)
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var GameCredits = function(io, logger, chainDataLayer, dataLayer) {
        this.socketIO_ = io;
        this.logger_ = logger;
        this.blockchain_ = chainDataLayer;
        this.db_ = dataLayer;
        this.errors = new __Errors();

        var network_ = this.blockchain_.getNetwork();

        var gameCreditsHistory_ = {};

        /**
         * This method fetches mosaics for the given XEM address.
         *
         * If the mosaic evias.pacnem:heart can be found in the account, a call
         * to `fetchGameCreditsRealHistoryByGamer` will be issued in order
         * to fetch `allTransactions` of the account.
         *
         * We will fetch all transactions only for accounts which we know they
         * own evias.pacnem:heart Mosaics.
         * 
         * This method is also responsible for saving other available mosaics
         * which will be displayed in the PacNEM Lounge as in "Daily Mosaics on PacNEM".
         *
         * @param  NEMGamer gamer
         */
        this.fetchHeartsByGamer = function(gamer) {
            var self = this;
            var gameMosaics = self.blockchain_.getGameMosaicsConfiguration();
            var heartsMosaicSlug = self.blockchain_.getNamespace() + ":" + Object.getOwnPropertyNames(gameMosaics.credits)[0];

            // read Mosaics owned by the given address's XEM wallet
            self.blockchain_.getSDK()
                .com.requests.account.mosaics
                .owned(self.blockchain_.getEndpoint(), gamer.getAddress())
                .then(function(res) {
                    if (!res.data || !res.data.length) {
                        gamer.updateCredits({ countHearts: 0 });
                        return null;
                    }

                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.mosaics: " + JSON.stringify(res));

                    // this accounts owns mosaics, check if he has evias.pacnem:heart
                    // mosaic so that he can play.
                    var hasHearts = false;
                    for (var i in res.data) {
                        var mosaic = res.data[i];
                        var slug = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;
                        if (heartsMosaicSlug == slug) {
                            // this account has some lives available as SAYS THE BLOCKCHAIN.
                            // we can store this information in our NEMGameCredit model.

                            // be aware that the Mosaics BALANCE does not represent the number
                            // of Available Lives! The user may have *Played* Hearts or *Sent Back*
                            // Hearts to the pacnem-business wallet.

                            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Found mosaic '" + heartsMosaicSlug + "' - Now validating with Transaction history.");

                            // computing the exact balance of the user (we now know that the user owns hearts.)
                            self.fetchGameCreditsRealHistoryByGamer(gamer, mosaic, null, function(creditsData) {
                                //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Total of " + creditsData.countHearts + " " + heartsMosaicSlug + " found for " + gamer.getAddress());
                                gamer.updateCredits(creditsData);
                            });
                            hasHearts = true;
                        }
                    }

                    if (!hasHearts)
                        gamer.updateCredits({ countHearts: 0 });
                }, function(err) {
                    // NO Mosaics available / wrong Network for address / Unresolved Promise Errors

                    gamer.updateCredits({ countHearts: 0 });
                });
        };

        /**
         * This method fetches allTransactions of a given XEM account
         * and updates the `gamer` object's credits (`updateCredits`)
         * with what can be computed from the Transaction History of the
         * account.
         *
         * Only Transfer Transactions and Multi Signature Transaction are
         * taken into account as those are ones which can change the
         * evias.pacnem:heart balance of given XEM accounts.
         *
         * @param  {NEMGamer} gamer
         * @param  {nem.objects.mosaicAttachment} mosaic
         */
        this.fetchGameCreditsRealHistoryByGamer = function(gamer, mosaic, lastTrxRead, callback) {
            var self = this;
            var heartsMosaicSlug = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

            if (!gameCreditsHistory_.hasOwnProperty(gamer.getAddress())) {
                // trxIdList is an OBJECT because we want to leverage the useful hasOwnProperty
                // and getOwnProperty function from JS object core.
                gameCreditsHistory_[gamer.getAddress()] = {
                    countHearts: 0,
                    countExchangedHearts: 0,
                    trxIdList: {}
                };
            }

            // read all transactions of the account and check for the given mosaic to build a
            // blockchain-trust mosaic history.

            self.blockchain_.getSDK()
                .com.requests.account.transactions
                .all(self.blockchain_.getEndpoint(), gamer.getAddress(), null, lastTrxRead)
                .then(function(res) {
                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.transactions.all: " + JSON.stringify(res));

                    var transactions = res.data;

                    lastTrxRead = self.saveGameCreditsRealHistoryForGamer(gamer, mosaic, transactions);

                    if (lastTrxRead !== false && 25 == transactions.length) {
                        // recursion..
                        // there may be more transactions in the past (25 transactions
                        // is the limit that the API returns). If we specify a hash or ID it
                        // will look for transactions BEFORE this hash or ID (25 before ID..).
                        // We pass transactions IDs because all NEM nodes support those, hashes are
                        // only supported by a subset of the NEM nodes.
                        self.fetchGameCreditsRealHistoryByGamer(gamer, mosaic, lastTrxRead, callback);
                    }

                    if (callback && (lastTrxRead === false || transactions.length < 25)) {
                        // done.
                        callback(gameCreditsHistory_[gamer.getAddress()]);
                    }

                }, function(err) {
                    // NO Transactions available / wrong Network for address / Unresolved Promise Errors
                    self.logger_.info("[DEBUG]", "[ERROR]", "Error in NIS API account.transactions.all: " + JSON.stringify(err));
                });

            // paralelly we can also read all transaction of the Game Credits Sink Account. 
            // This account is used to *burn game credits* (or *redeem* the tokens). This helps
            // in diminishing the amount of money that the Players have to Pay for playing 
            // a NEM linked game.

            //XXX implement Game Credits Sink Account *reading*
        };

        /**
         * This method reads a transactions list to extract the Mosaic described by
         * the `mosaic` parameter. It also validates the transaction types, this must
         * be either a Mosaic Transfer Transaction or a Multi Signature Mosaic Transfer
         * Transaction.
         *
         * This method is called with each chunk of 25 transactions read from the blockchain.
         *
         * @param  {NEMGamer} gamer        [description]
         * @param  {Array} transactions [description]
         * @return integer | boolean    Integer if read Trx (last Trx ID) - Boolean false if already read.
         */
        this.saveGameCreditsRealHistoryForGamer = function(gamer, mosaic, transactions) {
            var self = this;
            var gamerHistory = gameCreditsHistory_[gamer.getAddress()];
            var heartsMosaicSlug = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

            var lastTrxRead = null;
            var lastTrxHash = null;
            var totalHeartsIncome = 0;
            var totalHeartsOutgo = 0;
            for (var i = 0; i < transactions.length; i++) {
                var content = transactions[i].transaction;
                var meta = transactions[i].meta;
                var recipient = null;

                // save transaction id
                lastTrxRead = self.blockchain_.getTransactionId(transactions[i]);
                lastTrxHash = self.blockchain_.getTransactionHash(transactions[i]);

                if (gamerHistory.trxIdList.hasOwnProperty(lastTrxHash))
                // stopping the loop, reading data we already know about.
                    return false;

                gamerHistory.trxIdList[lastTrxHash] = true;

                if (content.type != self.blockchain_.getSDK().model.transactionTypes.transfer &&
                    content.type != self.blockchain_.getSDK().model.transactionTypes.multisigTransaction)
                // we are interested only in transfer transactions
                // and multisig transactions because only those might
                // change the evias.pacnem:heart balance of XEM address
                    continue;

                // get the searched for mosaic stake
                var mosaicStake = self.blockchain_.extractMosaicFromTransactionData_(content, heartsMosaicSlug);

                if (mosaicStake === false)
                    continue;

                if (mosaicStake.recipient == gamer.getAddress()) {
                    // gamer's transaction (incoming for gamer)
                    totalHeartsIncome += mosaicStake.totalMosaic;
                } else if (mosaicStake.recipient !== false) {
                    // pacnem transaction (outgoing for gamer)
                    totalHeartsOutgo += mosaicStake.totalMosaic;
                }
            }

            var creditsInChunk = totalHeartsIncome - totalHeartsOutgo;
            //self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Found " + creditsInChunk + " " + heartsMosaicSlug + " in " + transactions.length + " transactions for " + gamer.getAddress());

            gamerHistory.countHearts = gamerHistory.countHearts + creditsInChunk;
            gamerHistory.exchangedHearts = gamerHistory.exchangedHearts + totalHeartsOutgo;

            //self.logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Credit Data for " + gamer.getAddress() + ": " + JSON.stringify(gamerHistory));

            gameCreditsHistory_[gamer.getAddress()] = gamerHistory;
            return lastTrxRead;
        };

        /**
         * This method is used to REDEEM the evias.pacnem:heart
         * Mosaic when *player have finished playing* the Game 
         * Session.
         * 
         * In order to avoid Player paying for the redeem of tokens 
         * in the pacNEM game, I thought about implementing a Game Credits
         * Sink Account to which the pacNEM game will send Messages 
         * containing commands about the action of burning Game Credits
         * and making them unavailable for players.
         * 
         * @param   {Object}    gameState   Object received through Socket.io
         * @return void
         */
        this.processGameCreditsBurning = function(gamers) {
            var self = this;

            var players = gamers;
            if (!players || !players.length)
                return false;

            // read addresses in ended game state data
            var addresses = [];
            var distinct = {};
            for (var i = 0; i < players.length; i++) {
                if (!players[i].getAddress() || !players[i].getAddress().length)
                    continue;

                // validate NEM address with NEM-sdk
                var address = players[i].getAddress();
                var chainId = self.blockchain_.getNetwork().config.id;
                var isValid = self.blockchain_.getSDK().model.address.isFromNetwork(address, chainId);
                if (!isValid)
                //XXX add error log, someone tried to send invalid data
                    continue;

                if (distinct.hasOwnProperty(address))
                    continue;

                distinct[address] = true;
                addresses.push(address);
            }

            //DEBUG self.logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Will now burn Player Game Credit for the Game Session: " + addresses.length + " Players.");

            self.sendGameCreditsToSink(addresses);

            // for each address we also need to update the 
            // NEMGameCredit entry for given NEMGamer.
            for (var j = 0; j < players.length; j++) {
                var gamer = players[j];

                gamer.updateCredits({ countPlayedHearts: 1 });
            }
        };

        /**
         * This method will send Game Credits to the Game Credits
         * Sink Address. `Game Credits Redeem Equivalent` mosaic is
         * used, which is evias.pacnem:hearts--. This mosaic can and
         * will always only be sent to the Game Credits Sink Account.
         * 
         * Sending the hearts-- mosaic is done with the PUBLIC Wallet
         * because we want to avoid expensive cosignatory fees for 
         * this action as this will happen quite often (every time 
         * a multiplayer game is ended).
         * 
         * @param   {Array}     addresses   List of XEM addresses (players)
         * @return  self
         */
        this.sendGameCreditsToSink = function(addresses) {
            var self = this;

            // addresses will be added to a message which will be encrypted
            // using CryptoJS.AES and pacNEM's secret encryption key. The 
            // message contains all players of the ended game and this 
            // transaction will act as a "Game Credit Burn" event in the Game.
            var sinkMessage = addresses.join(",");
            var sinkAddress = self.blockchain_.getCreditsSinkWallet();

            var sinkXEM = self.blockchain_.getCreditsSinkWallet();
            var countRedeem = addresses.length; // sending X times hearts--
            var privStore = self.blockchain_.getSDK().model.objects.create("common")("", self.blockchain_.getPublicWalletSecretKey());
            var mosaicDefPair = self.blockchain_.getSDK().model.objects.get("mosaicDefinitionMetaDataPair");
            var redeemingMosaicName = self.blockchain_.getCreditsSinkData().mosaic.id;

            //DEBUG self.logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Now sending " + countRedeem + " hearts-- " + " sent to " + sinkXEM + " paid by " + pacNEM_);

            // Create an un-prepared mosaic transfer transaction object (use same object as transfer tansaction)
            var transferTransaction = self.blockchain_.getSDK().model.objects.create("transferTransaction")(sinkXEM, 1, sinkMessage); // Amount 1 is "one time x Mosaic Attachments"

            // must be multisig because non-transferable hearts-- mosaic owned by multisig
            transferTransaction.isMultisig = true;
            transferTransaction.multisigAccount = { publicKey: config.get("pacnem.businessPublic") };

            var mosaicAttachRedeem = self.blockchain_.getSDK().model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), redeemingMosaicName, countRedeem);
            var redeemSlug = self.blockchain_.getNamespace() + ":" + redeemingMosaicName;

            //DEBUG self.logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Using Mosaics: " + redeemSlug);

            // attach mosaic to transaction
            transferTransaction.mosaics.push(mosaicAttachRedeem);

            //DEBUG self.logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Reading Mosaic Definitions for namespace: " + self.blockchain_.getNamespace());

            // Need mosaic definition of evias.pacnem:heart to calculate adequate fees, so we get it from network.
            self.blockchain_.getSDK().com.requests.namespace
                .mosaicDefinitions(self.blockchain_.getEndpoint(), self.blockchain_.getNamespace()).then(
                    function(res) {
                        res = res.data;

                        var redeemDef = self.blockchain_.getSDK().utils.helpers.searchMosaicDefinitionArray(res, [redeemingMosaicName]);

                        if (undefined === redeemDef[redeemSlug])
                            return self.logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition for " + redeemSlug + " - Obligatory for the game, Please fix!");

                        mosaicDefPair[redeemSlug] = {};
                        mosaicDefPair[redeemSlug].mosaicDefinition = redeemDef[redeemSlug];

                        // Prepare the mosaic transfer transaction object and broadcast
                        var transactionEntity = self.blockchain_.getSDK().model.transactions.prepare("mosaicTransferTransaction")(privStore, transferTransaction, mosaicDefPair, network_.config.id);

                        //DEBUG self.logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Now sending Mosaic Transfer Transaction to " + sinkXEM + " with following data: " + JSON.stringify(transactionEntity) + " on network: " + JSON.stringify(network_.config) + " with common: " + JSON.stringify(privStore));

                        self.blockchain_.getSDK().model.transactions.send(privStore, transactionEntity, self.blockchain_.getEndpoint()).then(
                            function(res) {
                                delete privStore;

                                // If code >= 2, it's an error
                                if (res.code >= 2) {
                                    self.logger_.error("[NEM] [ERROR]", __line, "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + sinkXEM + ": " + JSON.stringify(res));
                                    return false;
                                }

                                var trxHash = res.transactionHash.data;
                                //DEBUG self.logger_.info("[NEM] [CREDITS SINK]", "[CREATED]", "Created a Mosaic transfer transaction for " + countRedeem + " " + redeemSlug + " sent to " + sinkXEM);
                            },
                            function(err) {
                                self.logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + sinkXEM + " with error: " + err);
                            });

                        delete privStore;
                    },
                    function(err) {
                        self.logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + self.blockchain_.getNamespace() + ": " + err);
                    });

            return self;
        };
    };

    module.exports.GameCredits = GameCredits;
    module.exports.GameCreditErrors = __Errors;
}());