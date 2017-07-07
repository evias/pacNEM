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

    var __smartfilename = path.basename(__filename);

    // score compare function for fast sorting
    var scrcmp = function(a, b) {
        if (a.score < b.score) return -1;
        if (a.score > b.score) return 1;

        return 0;
    };

    /**
     * class HallOfFame provides a business layer for
     * hall of fame management. (High Scores reading / writing)
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var HallOfFame = function(io, logger, chainDataLayer, dataLayer) {
        this.socketIO_ = io;
        this.logger_ = logger;
        this.blockchain_ = chainDataLayer;
        this.db_ = dataLayer;

        this.gameHallOfFame_ = { "ranking": [], "history": {}, "trxHashList": {} };

        /**
         * This method uses the pre-fetched `self.gameHallOfFame_.ranking` object
         * which is already sorted.
         * 
         * @see     fetchBlockchainHallOfFame()
         * @return  {Array}
         */
        this.getRanking = function() {
            if (!self.gameHallOfFame_.ranking)
                return [];

            return self.gameHallOfFame_.ranking;
        };

        /**
         * This method will recursively read transactions from the blockchain.
         * 
         * NIS endpoints only allow up to 25 transactions in one request. This method
         * was made to handle this limit recursively.
         * 
         * The `callback` callable will only be called when there is no more transactions
         * to read from the account on the blockchain. 
         * 
         * @param {integer} lastTrxRead     Transaction ID
         * @param {callable} callback 
         * @return void
         */
        this.fetchBlockchainHallOfFame = function(lastTrxRead = null, callback = null) {
            var self = this;
            var cheesePayer = self.blockchain_.getVendorWallet();

            if (lastTrxRead === null) {
                // reset hall of fame - rebuilding from blockchain
                gameHallOfFame_ = { "ranking": [], "history": {}, "trxHashList": {} };
            }

            // read outgoing transactions of the account and check for the given mosaic to build a
            // blockchain-trust mosaic history.

            self.blockchain_.getSDK().com.requests.account.transactions
                .outgoing(self.blockchain_.getEndpoint(), cheesePayer, null, lastTrxRead)
                .then(function(res) {
                    //self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Result from NIS API account.transactions.outgoing: " + JSON.stringify(res));

                    var transactions = res.data;

                    // forward transactions chunk (maximum 25 trx) to processHallOfFameTransactions
                    // to interpret the data. `lastTrxRead` will be `false` when we should stop.
                    lastTrxRead = self.processHallOfFameTransactions(transactions);

                    if (lastTrxRead !== false && 25 == transactions.length) {
                        // recursion..
                        // there may be more transactions in the past (25 transactions
                        // is the limit that the API returns). If we specify a hash or ID it
                        // will look for transactions BEFORE this hash or ID (25 before ID..).
                        // We pass transactions IDs because all NEM nodes support those, hashes are
                        // only supported by a subset of the NEM nodes.
                        self.fetchBlockchainHallOfFame(lastTrxRead, callback);
                    }

                    if (lastTrxRead === false || transactions.length < 25) {
                        // done.
                        // sort the history into the ranking now to build the hall of fame.
                        self.buildHallOfFameRanking();

                        if (callback)
                            callback(self.gameHallOfFame_);
                    }

                }, function(err) {
                    // NO Transactions available / wrong Network for address / Unresolved Promise Errors
                    self.logger_.info("[DEBUG]", "[ERROR]", "HallOfFame: Error in NIS API account.outgoingTransactions: " + JSON.stringify(err));
                });
        };

        /**
         * Read some transactions from the blockchain and interpret the content.
         * 
         * Only multisignature and transfer transactions are read because only those
         * can contain evias.pacnem:cheese mosaics.
         * 
         * @param {array} transactions
         * @return integer  - Last transaction ID
         */
        this.processHallOfFameTransactions = function(transactions) {
            var self = this;

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Processing chunk of " + transactions.length + " Transactions for Hall of Fame.");

            var cheeseMosaicSlug = self.blockchain_.getNamespace() + ":" + Object.getOwnPropertyNames(self.blockchain_.getGameMosaicsConfiguration().scores)[0];

            var lastTrxRead = null;
            var lastTrxHash = null;
            var lastTtxDate = null;
            var lastMsgRead = null;
            for (var i = 0; i < transactions.length; i++) {
                var content = transactions[i].transaction;
                var meta = transactions[i].meta;

                // save transaction id
                lastTrxRead = self.blockchain_.getTransactionId(transactions[i]);
                lastTrxHash = self.blockchain_.getTransactionHash(transactions[i]);
                lastTrxDate = self.blockchain_.getTransactionDate(transactions[i], false);
                lastMsgRead = self.blockchain_.getTransactionMessage(transactions[i]);

                if (!lastMsgRead.length)
                // PacNEM high scores are always stored with a message because the
                // message will contain the Player username. Here we don't have a 
                // message, so we should not care about this transaction.
                    continue;

                if (self.gameHallOfFame_.trxHashList.hasOwnProperty(lastTrxHash))
                // reading data we already know about.
                    continue;

                self.gameHallOfFame_.trxHashList[lastTrxHash] = true;

                if (content.type != self.blockchain_.getSDK().model.transactionTypes.transfer &&
                    content.type != self.blockchain_.getSDK().model.transactionTypes.multisigTransaction)
                // we are interested only in transfer transactions
                // and multisig transactions because only those might
                // contain the evias.pacnem:chese Mosaic
                    continue;

                // get the searched for mosaic stake
                var mosaicStake = self.blockchain_.extractMosaicFromTransactionData_(content, cheeseMosaicSlug);

                if (mosaicStake === false)
                    continue;

                // in the hall of fame, the amount of cheese will represent 
                // the exact score of the user such as :
                // `0.045678` represents a score of `45678`. The mosaic evias-tests.pacnem:cheese
                // should have a divisibility of 6.

                var recipient = mosaicStake.recipient;
                if (recipient === false)
                    continue;

                if (!self.gameHallOfFame_.history.hasOwnProperty(recipient))
                    self.gameHallOfFame_.history[recipient] = [];

                // The total cheese mosaics in this transaction 
                // represents the total score of the player.
                var score = mosaicStake.totalMosaic;

                // the message in the transaction should be a valid JSON Pacman object
                try {
                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Now interpreting: '" + lastMsgRead + "' as JSON for mosaicStake: " + JSON.stringify(mosaicStake));

                    var player = JSON.parse(lastMsgRead);

                    // the timestamp of the transaction is not stored in the encrypted JSON
                    // on the blockchain because it can be computed from the NEM Timestamp
                    // of the transaction.
                    player.timestamp = lastTrxDate;

                    // store transaction hash in the history too
                    player.transactionHash = lastTrxHash;

                    if (!player || !player.address || !player.score || !player.username) {
                        // invalid transaction, should contain JSON of Pacman object
                        continue;
                    }

                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Score Found: " + player.score);
                    self.gameHallOfFame_.history[recipient].push(player);
                } catch (e) {
                    // could not parse the object in the transaction message as a valid JSON object
                    // representing a Pacman player object.
                    // do nothing (high score NOT valid).
                    //DEBUG self.logger_.error("[DEBUG]", "[PACNEM HOF]", "Error Parsing JSON: " + e);
                }
            }

            return lastTrxRead;
        };

        /**
         * Create an up to date Hall Of Fame ranking from the read
         * scores history.
         * 
         * This method is called internally after reading all data with
         * `fetchBlockchainHallOfFame`. 
         * 
         * @return array
         */
        this.buildHallOfFameRanking = function() {
            var self = this;
            var allScores = [];
            var players = Object.getOwnPropertyNames(self.gameHallOfFame_.history);
            for (var i = 0; i < players.length; i++) {
                var pAddress = players[i];
                var pHistory = self.gameHallOfFame_.history[pAddress];

                for (var j = 0; j < pHistory.length; j++)
                    allScores.push(pHistory[j]);
            }

            if (allScores.length) {
                allScores.sort(scrcmp).reverse();

                self.gameHallOfFame_.ranking = allScores.length > 10 ? allScores.splice(0, 10) : allScores;

                //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Ranking built (" + self.gameHallOfFame_.ranking.length + "): " + JSON.stringify(self.gameHallOfFame_.ranking));
            }

            return allScores;
        };

        /**
         * Interpret the `pacmans` object, each pacman entry
         * should contain an `address` and `score` field. Usually
         * it will contain much more because the `end_of_game` 
         * socket.io event data is forwarded here.
         * 
         * @param {array} pacmans
         * @return void
         */
        this.processGameScores = function(pacmans) {
            var self = this;

            // whenever we are saving high scores we need to make sure
            // the data is up to date in our object.
            self.fetchBlockchainHallOfFame(null, function(hallOfFame) {
                if (!hallOfFame.ranking.length) {
                    self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Empty Hall Of Fame ranking in processGameScores");
                }

                var currentTop10MinScore = 0;
                var currentHighScore = 0;
                var scores = hallOfFame.ranking;
                var cntScores = scores.length;

                if (cntScores)
                    currentHighScore = scores[0].score;

                if (cntScores >= 10)
                    currentTop10MinScore = scores[9].score;
                // no-else: in case there is less than 10 scores, anyone 
                //          can take the last spot.

                pacmans.sort(scrcmp).reverse();

                // we will iterate from BIGGER score TO SMALLEST score in this game
                for (var i = 0; i < pacmans.length; i++) {
                    var pacman = pacmans[i];

                    if (!pacman || !pacman.address || !pacman.username || !pacman.score)
                        continue;

                    if (pacman.lifes < 0)
                        pacman["lifes"] = 0;

                    if (pacman.score <= currentTop10MinScore)
                        continue;

                    // currently iterating over a high scorer!
                    // we will now send evias.pacnem:cheese mosaics
                    // to the Player such that he will be included
                    // in the Blockchain Hall Of Fame

                    self.sendCheeseForHighScore(pacman, currentTop10MinScore, currentHighScore);
                }

                //XXX make sure next request to /scores API gets latest scores
                //XXX display received mosaics on game summary screen
            });
        };

        /**
         * This function will initiate a PAYOUT of evias.pacnem:cheese Mosaics 
         * for a given `pacman` high score beating either `currentTop10MinScore`
         * or also `currentHighScore`.
         * 
         * This function will first save data to the database (NEMReward) so that we 
         * avoid multiple sending.
         * 
         * @param {Pacman}  pacman
         * @param {integer} currentTop10MinScore
         * @param {integer} currentHighScore
         * @return void | false
         */
        this.sendCheeseForHighScore = function(pacman, currentTop10MinScore, currentHighScore) {
            if (!pacman.address || !pacman.score)
                return false;

            var self = this;

            // remove useless fields in Pacman object (directions, etc.)
            // we don't want to store useless information on the blockchain
            var unsetFields = ["x", "y", "lifes", "direction", "combo", "cheese_power", "cheese_effect", "killed_recently"];
            for (var u = 0; u < unsetFields.length; u++)
                delete pacman[unsetFields[u]];

            // build message with Pacman object JSON - the message + address are 
            // used to avoid sending rewards more than 1 time.
            var message = JSON.stringify(pacman);

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Sending Cheese with Pacman Object Plain JSON: '" + message);

            // find already paid out Rewards
            self.db_.NEMReward.findOne({ "address": pacman.address, "encryptedMessage": message },
                function(err, reward) {
                    //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "READ NEMReward JSON: '" + JSON.stringify(reward));

                    if (err) {
                        self.logger_.error("[ERROR]", "[PACNEM HOF]", "Error reading NEMReward: " + JSON.stringify(err));
                        return false;
                    }

                    if (!reward) {
                        // we only want to payout in case we didn't send mosaics before
                        // for this Game and Player.
                        var createReward = new self.db_.NEMReward({
                            "address": pacman.address,
                            "encryptedMessage": message
                        });
                        createReward.save();

                        self.announceRewardsPayout(createReward, pacman, currentTop10MinScore, currentHighScore);
                    }
                });
        };

        /**
         * Used as a callback to `sendCheeseForHighscore`. This method creates a NEM blockchain
         * Mosaic Transfer Transaction with evias.pacnem:cheese, possible evias.pacnem:hall-of-famer
         * and evias.pacnem:all-time-best-player and announces it on the network.
         * 
         * The Wallet used in this payout is the MULTISIG WALLET (vendor wallet).
         * 
         * @param   {NEMReward} nemReward
         * @param   {Pacman}    pacman
         * @param   {integer}   currentTop10MinScore
         * @param   {integer}   currentHighScore
         * @return void
         */
        this.announceRewardsPayout = function(nemReward, pacman, currentTop10MinScore, currentHighScore) {
            var self = this;
            var nemSDK = self.blockchain_.getSDK();
            var appsMosaic = self.blockchain_.getGameMosaicsConfiguration();

            var countCheeses = pacman.score;
            var privStore = nemSDK.model.objects.create("common")("", self.blockchain_.getPublicWalletSecretKey());
            var mosaicDefPair = nemSDK.model.objects.get("mosaicDefinitionMetaDataPair");
            var cheeseMosaicName = Object.getOwnPropertyNames(appsMosaic.scores)[0];
            var hofMosaicName = Object.getOwnPropertyNames(appsMosaic.rewards.high_score)[0];
            var atbMosaicName = Object.getOwnPropertyNames(appsMosaic.rewards.high_score)[1];
            var cheeseMosaicSlug = self.blockchain_.getNamespace() + ":" + cheeseMosaicName;

            // HOF mosaic paid out only when the hall of fame has at least 10 players
            var isHallOfFamer = currentTop10MinScore > 0 && pacman.score > currentTop10MinScore;
            var isAllTimeBest = currentTop10MinScore > 0 && pacman.score > currentHighScore;

            if (currentTop10MinScore > 0 && !isHallOfFamer)
            // only send mosaics to hall of famers
                return false;

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Now sending " + pacman.score + " cheeses to player " + pacman.address + " with username '" + pacman.username + "' paid by " + self.blockchain_.getVendorWallet());

            // Create an un-prepared multisig mosaic transfer transaction object 
            // Must be Multisig because mosaic evias.pacnem:cheese is non-transferable
            // Amount 1 is "one time x Mosaic Attachments"
            // (use same object as transfer tansaction)
            var transferTransaction = nemSDK.model.objects.create("transferTransaction")(pacman.address, 1, nemReward.encryptedMessage);

            if (self.blockchain_.useMultisig()) {
                transferTransaction.isMultisig = true;
                transferTransaction.multisigAccount = { publicKey: config.get("pacnem.businessPublic") };
            }

            var mosaicAttachCheeses = nemSDK.model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), cheeseMosaicName, countCheeses);
            var mosaicAttachHOF = nemSDK.model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), hofMosaicName, 1);
            var mosaicAttachATB = nemSDK.model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), atbMosaicName, 1);

            var cheeseSlug = self.blockchain_.getNamespace() + ":" + cheeseMosaicName;
            var hofSlug = self.blockchain_.getNamespace() + ":" + hofMosaicName;
            var atbSlug = self.blockchain_.getNamespace() + ":" + atbMosaicName;

            var paidOutRewards = { "HallOfFameReward": { "mosaic": cheeseSlug, "quantity": countCheeses } };

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Using Mosaics: " + cheeseSlug + ", " + hofSlug + ", " + atbSlug);

            // Need mosaic definition of evias.pacnem:* mosaics to calculate 
            // adequate fees, so we get it from network.
            nemSDK.com.requests.namespace
                .mosaicDefinitions(self.blockchain_.getEndpoint(), self.blockchain_.getNamespace()).then(
                    function(res) {
                        res = res.data;

                        var cheeseDef = nemSDK.utils.helpers.searchMosaicDefinitionArray(res, [cheeseMosaicName]);
                        var hofDef = nemSDK.utils.helpers.searchMosaicDefinitionArray(res, [hofMosaicName]);
                        var atbDef = nemSDK.utils.helpers.searchMosaicDefinitionArray(res, [atbMosaicName]);

                        if (undefined === cheeseDef[cheeseSlug] || undefined === hofDef[hofSlug] || undefined === atbDef[atbSlug])
                            return self.logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition with [cheeseSlug, hofSlug, atbSlug]: " + JSON.stringify([cheeseSlug, hofSlug, atbSlug]) + " - Obligatory for the game, Please fix!");

                        // Now preparing our Mosaic Transfer Transaction 
                        // (1) configure mosaic definition pair
                        // (2) attach mosaics attachments to transfer transaction
                        // (3) configure transfer transaction
                        // (4) announce transaction on the network

                        // (1)
                        mosaicDefPair[cheeseSlug] = {};
                        mosaicDefPair[cheeseSlug].mosaicDefinition = cheeseDef[cheeseSlug];

                        // hall of famer only included if at least 1 person in hall of fame
                        if (isHallOfFamer) {
                            mosaicDefPair[hofSlug] = {};
                            mosaicDefPair[hofSlug].mosaicDefinition = hofDef[hofSlug];
                        }

                        // include optional mosaics defs (they are not always sent)
                        if (isAllTimeBest) {
                            mosaicDefPair[atbSlug] = {};
                            mosaicDefPair[atbSlug].mosaicDefinition = atbDef[atbSlug];
                        }

                        // (2)
                        // always receive evias.pacnem:cheese - this is the mosaic that the pacNEM game
                        // uses to determine whether someone is/was in the Hall Of Fame.
                        transferTransaction.mosaics.push(mosaicAttachCheeses);

                        if (isHallOfFamer)
                        // send hall-of-famer Mosaic
                            transferTransaction.mosaics.push(mosaicAttachHOF);

                        if (isAllTimeBest)
                        // send all-time-best-player Mosaic (new High Score)
                            transferTransaction.mosaics.push(mosaicAttachATB);

                        // (3)
                        // Prepare the mosaic transfer transaction object
                        var entity = nemSDK.model.transactions.prepare("mosaicTransferTransaction")(
                            privStore,
                            transferTransaction,
                            mosaicDefPair,
                            self.blockchain_.getNetwork().config.id
                        );

                        //DEBUG self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Now sending Mosaic Transfer Transaction to " + pacman.address + " with following data: " + JSON.stringify(entity) + " on network: " + JSON.stringify(self.blockchain_.getNetwork().config) + " with common: " + JSON.stringify(privStore));

                        // (4) announce the mosaic transfer transaction on the NEM network
                        nemSDK.model.transactions.send(privStore, entity, self.blockchain_.getEndpoint()).then(
                            function(res) {
                                delete privStore;

                                // If code >= 2, it's an error
                                if (res.code >= 2) {
                                    self.logger_.error("[NEM] [ERROR]", __line, "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + pacman.address + ": " + JSON.stringify(res));
                                    return false;
                                }

                                var trxHash = res.transactionHash.data;
                                var paidOutRewards = { "cheeses": { "mosaic": cheeseSlug, "quantity": countCheeses } };

                                if (isHallOfFamer)
                                    paidOutRewards["hallOfFame"] = { "mosaic": hofSlug, "quantity": 1 };

                                if (isAllTimeBest)
                                    paidOutRewards["allTimeBest"] = { "mosaic": atbSlug, "quantity": 1 };

                                self.logger_.info("[DEBUG]", "[PACNEM HOF]", "Created a Mosaic transfer transaction for " + pacman.address + " with hash '" + trxHash + " and paidOutRewards: " + JSON.stringify(paidOutRewards));

                                nemReward.transactionHash = trxHash;
                                nemReward.rewards = paidOutRewards;
                                nemReward.save();
                            },
                            function(err) {
                                self.logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + pacman.address + " with error: " + err);
                            });
                    },
                    function(err) {
                        self.logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + self.blockchain_.getNamespace() + ": " + err);
                    });
        };
    };

    module.exports.HallOfFame = HallOfFame;
}());