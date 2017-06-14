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

/**
 * class HallOfFame provides a business layer for
 * hall of fame management. (High Scores reading / writing)
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var HallOfFame = function(io, logger, chainDataLayer, dataLayer)
{
    this.socketIO_ = io;
    this.blockchain_ = chainDataLayer;
    this.db_ = dataLayer;

    var gameHallOfFame_ = {"ranking": [], "history": {}, "trxIdList": {}};

    /**
     * This method will recursively read transactions from the blockchain.
     * 
     * NIS endpoints only allow up to 25 transactions in one request, so we
     * need a recursive call to check for additional transactions.
     * 
     * @param {integer} lastTrxRead     Transaction ID
     * @param {callable} callback 
     * @return void
     */
    this.fetchBlockchainHallOfFame = function(lastTrxRead = null, callback = null)
    {
        var self = this;
        var cheesePayer = self.blockchain_.getPublicWallet();

        // read outgoing transactions of the account and check for the given mosaic to build a
        // blockchain-trust mosaic history.

        self.blockchain_.getSDK().com.requests.account.outgoingTransactions(self.blockchain_.getEndpoint(), cheesePayer, null, lastTrxRead)
            .then(function(res)
        {
            //logger_.info("[DEBUG]", "[PACNEM HOF]", "Result from NIS API account.outgoingTransactions: " + JSON.stringify(res));

            var transactions = res;

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
                // sort the history into the ranking now to have a hall of fame.
                self.buildHallOfFameRanking();

                if (callback) 
                    callback(gameHallOfFame_);
            }

        }, function(err) {
            // NO Transactions available / wrong Network for address / Unresolved Promise Errors
            logger_.info("[DEBUG]", "[ERROR]", "HallOfFame: Error in NIS API account.outgoingTransactions: " + JSON.stringify(err));
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
    this.processHallOfFameTransactions = function(transactions)
    {
        var self = this;
        var cheeseMosaicSlug = self.blockchain_.getNamespace() + ":" + Object.getOwnPropertyNames(self.blockchain_.getGameMosaicsConfiguration().scores)[0];

        var lastTrxRead = null;
        var lastTrxHash = null;
        var lastMsgRead = null;
        for (var i = 0; i < transactions.length; i++) {
            var content    = transactions[i].transaction;
            var meta       = transactions[i].meta;

            // save transaction id
            lastTrxRead = self.blockchain_.getTransactionId(transactions[i]);
            lastTrxHash = self.blockchain_.getTransactionHash(transactions[i]);
            lastMsgRead = self.blockchain_.getTransactionMessage(transactions[i]);

            if (! lastMsgRead.length)
                // PacNEM high scores are always stored with a message because the
                // message will contain the Player username. Here we don't have a 
                // message, so we should not care about this transaction.
                continue;

            if (gameHallOfFame_.trxIdList.hasOwnProperty(lastTrxHash))
                // stopping the loop, reading data we already know about.
                return false;

            gameHallOfFame_.trxIdList[lastTrxHash] = true;

            if (content.type != self.blockchain_.getSDK().model.transactionTypes.transfer
                && content.type != self.blockchain_.getSDK().model.transactionTypes.multisigTransaction)
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

            if (! gameHallOfFame_.history.hasOwnProperty(recipient))
                gameHallOfFame_.history[recipient] = [];

            // The total cheese mosaics in this transaction 
            // represents the total score of the player.
            var score  = mosaicStake.totalMosaic;
            var decrypt = CryptoJS.AES.decrypt(lastMsgRead, self.blockchain_.getEncryptionSecretKey());
            var player = JSON.parse(decrypt);

            if (! player || ! player.address || ! player.score || ! player.username) {
                // invalid transaction, should contain AES encrypted JSON of Pacman object
                continue;
            }

            logger_.info("[DEBUG]", "[PACNEM HOF]", "Score Found: " + score + " for " + recipient + " with player data: " + decrypt);
            gameHallOfFame_.history[recipient].push(player);
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
    this.buildHallOfFameRanking = function()
    {
        var self = this;
        var allScores = [];
        var players = Object.getOwnPropertyNames(gameHallOfFame_.history);
        for (var i = 0; i < players.length; i++) {
            var pAddress = players[i];
            var pHistory = gameHallOfFame_.history[pAddress];

            for (var j = 0; j < pHistory.length; j++)
                allScores.push(pHistory[j]);
        }

        if (allScores.length) {
            allScores.sort(scrcmp).reverse();
            gameHallOfFame_.ranking = allScores.length > 10 ? allScores.splice(10) : allScores;

            logger_.info("[DEBUG]", "[PACNEM HOF]", "Ranking built: " + JSON.stringify(gameHallOfFame_.ranking));
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
    this.processGameScores = function(pacmans)
    {
        var self = this;

        if (! gameHallOfFame_.ranking.length) {
            logger_.info("[DEBUG]", "[PACNEM HOF]", "Empty Hall Of Fame ranking in processGameScores");
        }

        var currentTop10MinScore = 0;
        var currentHighScore     = 0;
        var scores    = gameHallOfFame_.ranking;
        var cntScores = scores.length;

        if (cntScores)
            currentHighScore = scores[0].score;

        if (cntScore >= 10)
            currentTop10MinScore = scores[9].score;
        // no-else: in case there is less than 10 scores, anyone 
        //          can take the last spot.

        pacmans.sort(scrcmp).reverse();

        // we will iterate from SMALLER score TO BIGGEST score
        for (var i = 0; i < pacmans.length; i++) {
            var pacman = pacmans[i];
            if (pacman.score <= currentTop10MinScore)
                continue;

            // currently iterating over a high scorer!
            // we will now send evias.pacnem:cheese mosaics
            // to the Player such that he will be included
            // in the Blockchain Hall Of Fame

            self.sendCheeseForHighScore(pacman, currentTop10MinScore, currentHighScore);
        }
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
    this.sendCheeseForHighScore = function(pacman, currentTop10MinScore, currentHighScore)
    {
        if (! pacman.address || ! pacman.score)
            return false;

        var self = this;

        // build encrypted message - the message + address are used to avoid 
        // sending rewards more than 1 time.
        var message = JSON.stringify(pacman);
        var encrypt = CryptoJS.AES.encrypt(message, self.getEncryptionSecretKey());

        logger_.info("[DEBUG]", "[PACNEM HOF]",
                     "Plain JSON: '" + message + "' with Encrypted: '" + encrypt + "'");

        self.prepareRewardsPayout(pacman, encrypt, function(nemReward, pac)
        {
            self.announceRewardsPayout(nemReward, pac, currentTop10MinScore, currentHighScore);
        });
    };

    /**
     * Save an address + message pair as a reward payout. The PacMan object contains
     * game-specific data that will make the encrypted message unique.
     * 
     * After the save has occured, the callback will be executed.
     * 
     * @param {Pacman} pacman
     * @param {string} encryptedMessage
     * @param {callable} callback
     * @return void
     */
    this.prepareRewardsPayout = function(pacman, encryptedMessage, callback)
    {
        var self = this;

        // find already paid out Rewards
        self.db_.NEMReward({"address": pacman.address, "encryptedMessage": encryptedMessage}
                .findOne(function(err, reward)
        {
            if (err) {
                logger_.info("[DEBUG]", "[PACNEM HOF]", "Error reading NEMReward: " + JSON.stringify(err));
                return false;
            }

            if (! reward) {
                // we only want to payout in case we didn't send mosaics before
                // for this Game and Player.
                var reward = new self.db_.NEMReward({"address": pacman.address, "encryptedMessage": encryptedMessage});
                reward.save(function(err)
                {
                    if (err) {
                        logger_.info("[DEBUG]", "[PACNEM HOF]", "Error writing NEMReward: " + JSON.stringify(err));
                        return false;
                    }

                    if (callback)
                        return callback(reward, pacman);
                });
            }
        }));
    };

    /**
     * Used as a callback to `prepareRewardsPayout`. This method creates a NEM blockchain
     * Mosaic Transfer Transaction with evias.pacnem:cheese, possible evias.pacnem:hall-of-famer
     * and evias.pacnem:all-time-best-player and announces it on the network.
     * 
     * The Wallet used in this payout is the PUBLIC WALLET because those payouts may happen
     * more often and we need to lower the price for sustainability.
     * 
     * @param   {NEMReward} nemReward
     * @param   {Pacman}    pacman
     * @param   {integer}   currentTop10MinScore
     * @param   {integer}   currentHighScore
     * @return void
     */
    this.announceRewardsPayout = function(nemReward, pacman, currentTop10MinScore, currentHighScore)
    {
        var self = this;
        var countCheeses  = pacman.score;
        var privStore     = self.blockchain_.getSDK().model.objects.create("common")("", self.blockchain_.getPublicWalletSecretKey());
        var mosaicDefPair = self.blockchain_.getSDK().model.objects.get("mosaicDefinitionMetaDataPair");
        var cheeseMosaicName = Object.getOwnPropertyNames(self.blockchain_.getGameMosaicsConfiguration().scores)[0];
        var hofMosaicName = Object.getOwnPropertyNames(self.blockchain_.getGameMosaicsConfiguration().rewards.high_score)[0];
        var atbMosaicName = Object.getOwnPropertyNames(self.blockchain_.getGameMosaicsConfiguration().rewards.high_score)[1];
        var cheeseMosaicSlug = self.blockchain_.getNamespace() + ":" + cheeseMosaicName;

        // HOF mosaic paid out only when the hall of fame has at least 10 players
        var isHallOfFamer = currentTop10MinScore > 0;
        var isAllTimeBest = currentTop10MinScore > 0 && pacman.score > currentHighScore;

        logger_.info("[DEBUG]", "[PACNEM HOF]",
                     "Now sending " + pacman.score + " cheeses to player " 
                     + pacman.address + " with username '" + pacman.username + "' paid by " + self.blockchain_.getPublicWallet());

        // Create an un-prepared mosaic transfer transaction object 
        // Amount 1 is "one time x Mosaic Attachments"
        // (use same object as transfer tansaction)
        var transferTransaction = self.blockchain_.getSDK().model.objects.create("transferTransaction")(pacman.address, 1, nemReward.encryptedMessage);
        var mosaicAttachCheeses = self.blockchain_.getSDK().model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), cheeseMosaicName, countCheeses);
        var mosaicAttachHOF     = self.blockchain_.getSDK().model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), hofMosaicName, 1);
        var mosaicAttachATB     = self.blockchain_.getSDK().model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), atbMosaicName, 1);

        var cheeseSlug = self.blockchain_.getSDK().utils.helpers.mosaicIdToName(mosaicAttachCheeses.mosaicId);
        var hofSlug = self.blockchain_.getSDK().utils.helpers.mosaicIdToName(mosaicAttachHOF.mosaicId);
        var atbSlug = self.blockchain_.getSDK().utils.helpers.mosaicIdToName(mosaicAttachATB.mosaicId);

        logger_.info("[DEBUG]", "[PACNEM HOF]", "Using Mosaics: " + cheeseSlug + ", " + hofSlug + ", " + atbSlug);

        // always receive evias.pacnem:cheese - this is the mosaic that the pacNEM game
        // uses to determine whether someone is/was in the Hall Of Fame.
        transferTransaction.mosaics.push(mosaicAttachCheeses);

        if (isHallOfFamer)
            // send hall-of-famer Mosaic (at least 10 player in hall of fame before)
            transferTransaction.mosaics.push(mosaicAttachHOF);

        if (isAllTimeBest)
            // send all-time-best-player Mosaic (new High Score)
            transferTransaction.mosaics.push(mosaicAttachHOF);

        // Need mosaic definition of evias.pacnem:* mosaics to calculate 
        // adequate fees, so we get it from network.
        self.blockchain_.getSDK().com.requests.namespace
            .mosaicDefinitions(self.blockchain_.getEndpoint(), self.blockchain_.getNamespace()).then(
        function(res) {
            var cheeseDef  = self.blockchain_.getSDK().utils.helpers.searchMosaicDefinitionArray(res, [cheeseMosaicName]);
            var hofDef = self.blockchain_.getSDK().utils.helpers.searchMosaicDefinitionArray(res, [hofMosaicName]);
            var atbDef = self.blockchain_.getSDK().utils.helpers.searchMosaicDefinitionArray(res, [atbMosaicName]);

            if (undefined === cheeseDef[cheeseSlug] || undefined === hofDef[hofSlug] || undefined === atbDef[atbSlug])
                return logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition with [cheeseSlug, hofSlug, atbSlug]: " + JSON.stringify([cheeseSlug, hofSlug, atbSlug]) + " - Obligatory for the game, Please fix!");

            mosaicDefPair[cheeseSlug] = {};
            mosaicDefPair[cheeseSlug].mosaicDefinition = cheeseDef[cheeseSlug];

            // include optional mosaics defs (they are not always sent)
            if (isHallOfFamer) {
                mosaicDefPair[hofSlug] = {};
                mosaicDefPair[hofSlug].mosaicDefinition = hofDef[hofSlug];
            }

            if (isAllTimeBest) {
                mosaicDefPair[atbSlug] = {};
                mosaicDefPair[atbSlug].mosaicDefinition = atbDef[atbSlug];
            }

            // Prepare the mosaic transfer transaction object and broadcast
            var entity = self.blockchain_.getSDK().model.transactions.prepare("mosaicTransferTransaction")(
                privStore, 
                transferTransaction, 
                mosaicDefPair, 
                network_.config.id
            );

            logger_.info("[DEBUG]", "[PACNEM HOF]", "Now sending Mosaic Transfer Transaction to " + pacman.address + " with following data: " + JSON.stringify(transactionEntity) + " on network: " + JSON.stringify(network_.config) + " with common: " + JSON.stringify(privStore));

            self.blockchain_.getSDK().model.transactions.send(privStore, entity, self.blockchain_.getEndpoint()).then(
            function(res) {
                delete privStore;

                // If code >= 2, it's an error
                if (res.code >= 2) {
                    logger_.error("[NEM] [ERROR]", __line, "Could not send Transaction for " + self.blockchain_.getPublicWallet() + " to " + pacman.address + ": " + JSON.stringify(res));
                    return false;
                }

                var trxHash = res.transactionHash.data;
                logger_.info(
                    "[DEBUG]", "[PACNEM HOF]",
                    "Created a Mosaic transfer transaction for " + pacman.address);

                nemReward.transactionHash = trxHash;
                nemReward.save();
            },
            function(err) {
                logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + self.blockchain_.getPublicWallet() + " to " + pacman.address + " with error: " + err);
            });
        },
        function(err) {
            logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + self.blockchain_.getNamespace() + ": " + err);
        });
    };
};

module.exports.HallOfFame = HallOfFame;
}());
