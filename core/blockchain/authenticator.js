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

    var encryptData_ = function(plain) {
        var salt = config.get("pacnem.dataSalt");
        var encSalt = CryptoJS.enc.Hex.parse(salt);
        var encrypted = CryptoJS.AES.encrypt(secretMessage, encSalt, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.NoPadding
        });
        return encrypted.ciphertext;
    };

    var decryptData_ = function(cipher) {
        var salt = config.get("pacnem.dataSalt");
        var hexSalt = CryptoJS.enc.Hex.parse(salt);

        var hexCipher = CryptoJS.enc.Hex.parse(cipher);
        var params = CryptoJS.lib.CipherParams.create({
            ciphertext: hexCipher
        });

        var bytes = CryptoJS.AES.decrypt(params, hexSalt, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.NoPadding
        });

        return bytes.toString(CryptoJS.enc.Utf8);
    };

    /**
     * class Authenticator provides a business layer for
     * Authentication management. (High Scores reading / writing)
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var Authenticator = function(io, logger, chainDataLayer, dataLayer) {
        this.socketIO_ = io;
        this.logger_ = logger;
        this.blockchain_ = chainDataLayer;
        this.db_ = dataLayer;

        this.personalTokensTrxes_ = { "trxIdList": {}, "tokens": {} };

        /**
         * The authenticateAddress method uses *only the database* to determine
         * whether authentication is valid or not. This is to avoid reading long
         * transaction lists just for *performing login*. 
         * 
         * Instead of reading transaction when *login happens*, we *read and update*
         * the database with *blockchain data*. This ensures that only valid data
         * is added to the Personal Token database - where *valid data* is data present
         * on the NEM Blockchain.
         * 
         * @param   {Object}    bundle  Should contain key `address` and key `c
         */
        this.authenticateAddress = function(bundle, onSuccess, onFailure) {

            if (!bundle || !bundle.creds || !bundle.address)
                return onFailure();

            var token = decryptData_(bundle.creds);
            this.db_.NEMPersonalToken.find({ "address": bundle.address, "plainToken": token }, function(err, entry) {
                if (err || !entry) {
                    return onFailure();
                }

                return onSuccess(entry);
            });
        }

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
        this.fetchPersonalTokens = function(lastTrxRead = null, callback = null) {
            var self = this;
            var cheesePayer = self.blockchain_.getVendorWallet();

            if (lastTrxRead === null) {
                // reset Authenticator - rebuilding from blockchain
                self.personalTokensTrxes_ = { "trxIdList": {}, "tokens": {} };
            }

            // read outgoing transactions of the account and check for the given mosaic to build a
            // blockchain-trust mosaic history.

            self.blockchain_.getSDK().com.requests.account.transactions
                .outgoing(self.blockchain_.getEndpoint(), cheesePayer, null, lastTrxRead)
                .then(function(res) {
                    //self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Result from NIS API account.transactions.outgoing: " + JSON.stringify(res));

                    var transactions = res.data;

                    // forward transactions chunk (maximum 25 trx) to processPersonalTokenTransactions
                    // to interpret the data. `lastTrxRead` will be `false` when we should stop.
                    lastTrxRead = self.processPersonalTokenTransactions(transactions);

                    if (lastTrxRead !== false && 25 == transactions.length) {
                        // recursion..
                        // there may be more transactions in the past (25 transactions
                        // is the limit that the API returns). If we specify a hash or ID it
                        // will look for transactions BEFORE this hash or ID (25 before ID..).
                        // We pass transactions IDs because all NEM nodes support those, hashes are
                        // only supported by a subset of the NEM nodes.
                        self.fetchPersonalTokens(lastTrxRead, callback);
                    }

                    if (lastTrxRead === false || transactions.length < 25) {
                        // done.
                        self.savePersonalTokensInDatabase(self.personalTokenTrxes_);
                        if (callback)
                            callback(self.personalTokensTrxes_);
                    }

                }, function(err) {
                    // NO Transactions available / wrong Network for address / Unresolved Promise Errors
                    self.logger_.info("[DEBUG]", "[ERROR]", "Authenticator: Error in NIS API account.outgoingTransactions: " + JSON.stringify(err));
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
        this.processPersonalTokenTransactions = function(transactions) {
            var self = this;

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Processing chunk of " + transactions.length + " Transactions for Authenticator.");

            var personalTokenSlug = self.blockchain_.getNamespace() + ":" + Object.getOwnPropertyNames(self.blockchain_.getGameMosaicsConfiguration().credits)[2];

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
                // PacNEM personal tokens are always stored in transaction messages
                    continue;

                if (self.personalTokensTrxes_.trxIdList.hasOwnProperty(lastTrxHash))
                // reading data we already know about.
                    continue;

                self.personalTokensTrxes_.trxIdList[lastTrxHash] = true;

                if (content.type != self.blockchain_.getSDK().model.transactionTypes.transfer &&
                    content.type != self.blockchain_.getSDK().model.transactionTypes.multisigTransaction)
                // we are interested only in transfer transactions
                // and multisig transactions because only those might
                // contain the pacnem:personal-token Mosaic
                    continue;

                // get the searched for mosaic stake
                var mosaicStake = self.blockchain_.extractMosaicFromTransactionData_(content, personalTokenSlug);

                if (mosaicStake === false)
                    continue;

                var recipient = mosaicStake.recipient;
                if (recipient === false)
                    continue;

                // the message in the transaction represents the address's Personal Token
                try {
                    self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Now interpreting: '" + lastMsgRead + "' as JSON for mosaicStake: " + JSON.stringify(mosaicStake));

                    var token = lastMsgRead;
                    var normalized = recipient.replace(/-/g, "");

                    self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Token Found: " + token + " for Address: " + recipient);
                    self.personalTokensTrxes_.tokens[normalized] = {
                        "trxHash": lastTrxHash,
                        "token": token
                    };
                } catch (e) {
                    // could not parse the object in the transaction message as a valid JSON object
                    // representing a Pacman player object.
                    // do nothing (high score NOT valid).
                    self.logger_.error("[DEBUG]", "[PACNEM AUTH]", "Error Parsing JSON: " + e);
                }
            }

            return lastTrxRead;
        };

        /**
         * This method will interpret the tokens read from the blockchain
         * and decide which need to be saved to the database.
         */
        this.savePersonalTokensInDatabase = function(tokensData) {
            var self = this;

            for (var address in tokensData.tokens) {
                var currentToken = tokensData.tokens[address];
                self.db_.NEMPersonalToken.findOne({ "address": address }, function(err, entry) {
                    if (err || entry)
                        return;

                    // Token read from blockchain but not present in database.
                    entry = new self.db_.NEMPersonalToken({
                        "address": normalized,
                        "plainToken": currentToken.token,
                        "transactionHash": currentToken.trxHash,
                        "createdAt": new Date().valueOf()
                    });
                    entry.save();
                });
            }
        };

        /**
         * This function will initiate a PAYOUT of pacnem:personal-token Mosaics 
         * for a given player XEM `address`. The transaction created will also contain
         * a copy of the Personal Token that the Player needs to use when he comes
         * back to PacNEM next time.
         * 
         * @param {String}  address
         * @return void | false
         */
        this.sendPersonalToken = function(address, tokenPlain) {
            if (!address.length)
                return false;

            var self = this;

            // build message with token - the message + address are 
            // used to avoid sending tokens more than 1 time.
            var message = tokenPlain;

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Sending Personal Token with with Token value: '" + message + "'");

            // find already paid out Rewards
            self.db_.NEMPersonalToken.findOne({ "address": address, "encryptedMessage": message },
                function(err, reward) {
                    self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "READ NEMPersonalToken JSON: '" + JSON.stringify(reward));

                    if (err) {
                        self.logger_.error("[ERROR]", "[PACNEM AUTH]", "Error reading NEMPersonalToken: " + JSON.stringify(err));
                        return false;
                    }

                    if (!reward) {
                        // we only want to payout in case we didn't send mosaics before
                        // for this Game and Player.
                        var createToken = new self.db_.NEMPersonalToken({
                            "address": address,
                            "encryptedMessage": message
                        });
                        createToken.save();

                        self.announceTokenTransfer(createToken, address);
                    }
                });
        };

        /**
         * Used as a callback to `sendPersonalToken`. This method creates a NEM blockchain
         * Mosaic Transfer Transaction with pacnem:personal-token and a message and 
         * announces it on the network.
         * 
         * The Wallet used in this payout is the MULTISIG WALLET (vendor wallet).
         * 
         * @param   {NEMPersonalToken} NEMPersonalToken
         * @param   {Pacman}    pacman
         * @param   {integer}   currentTop10MinScore
         * @param   {integer}   currentHighScore
         * @return void
         */
        this.announceTokenTransfer = function(dbTokenEntry) {
            var self = this;
            var nemSDK = self.blockchain_.getSDK();
            var appsMosaic = self.blockchain_.getGameMosaicsConfiguration();

            var countPersonalTokens = 1;
            var privStore = nemSDK.model.objects.create("common")("", self.blockchain_.getPublicWalletSecretKey());
            var mosaicDefPair = nemSDK.model.objects.get("mosaicDefinitionMetaDataPair");
            var personalTokenName = Object.getOwnPropertyNames(appsMosaic.scores)[0];
            var personalTokenSlug = self.blockchain_.getNamespace() + ":" + personalTokenName;

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Now sending 1 personal-token to player " + dbTokenEntry.address + " with token '" + dbTokenEntry.encryptedMessage + "' paid by " + self.blockchain_.getVendorWallet());

            // Create an un-prepared multisig mosaic transfer transaction object 
            // Amount 1 is "one time x Mosaic Attachments"
            // (use same object as transfer tansaction)
            var transferTransaction = nemSDK.model.objects.create("transferTransaction")(dbTokenEntry.address, 1, dbTokenEntry.encryptedMessage);
            transferTransaction.isMultisig = true;
            transferTransaction.multisigAccount = { publicKey: config.get("pacnem.businessPublic") };

            var mosaicAttachPersonalToken = nemSDK.model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), personalTokenName, countPersonalTokens);
            var paidOutMosaics = { "Authenticator": { "mosaic": personalTokenSlug, "quantity": countPersonalTokens } };

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Using Mosaics: " + personalTokenSlug);

            // Need mosaic definition of evias.pacnem:* mosaics to calculate 
            // adequate fees, so we get it from network.
            nemSDK.com.requests.namespace
                .mosaicDefinitions(self.blockchain_.getEndpoint(), self.blockchain_.getNamespace()).then(
                    function(res) {
                        res = res.data;

                        var personalTokenDef = nemSDK.utils.helpers.searchMosaicDefinitionArray(res, [personalTokenName]);

                        if (undefined === personalTokenDef[personalTokenSlug])
                            return self.logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition with [personalTokenSlug, hofSlug, atbSlug]: " + JSON.stringify([personalTokenSlug]) + " - Obligatory for the game, Please fix!");

                        // Now preparing our Mosaic Transfer Transaction 
                        // (1) configure mosaic definition pair
                        // (2) attach mosaics attachments to transfer transaction
                        // (3) configure transfer transaction
                        // (4) announce transaction on the network

                        // (1)
                        mosaicDefPair[personalTokenSlug] = {};
                        mosaicDefPair[personalTokenSlug].mosaicDefinition = personalTokenDef[personalTokenSlug];

                        // (2)
                        // always receive evias.pacnem:cheese - this is the mosaic that the pacNEM game
                        // uses to determine whether someone is/was in the Authenticator.
                        transferTransaction.mosaics.push(mosaicAttachPersonalToken);

                        // (3)
                        // Prepare the mosaic transfer transaction object
                        var entity = nemSDK.model.transactions.prepare("mosaicTransferTransaction")(
                            privStore,
                            transferTransaction,
                            mosaicDefPair,
                            self.blockchain_.getNetwork().config.id
                        );

                        self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Now sending Mosaic Transfer Transaction to " + dbTokenEntry.address + " with following data: " + JSON.stringify(entity) + " on network: " + JSON.stringify(self.blockchain_.getNetwork().config) + " with common: " + JSON.stringify(privStore));

                        // (4) announce the mosaic transfer transaction on the NEM network
                        nemSDK.model.transactions.send(privStore, entity, self.blockchain_.getEndpoint()).then(
                            function(res) {
                                delete privStore;

                                // If code >= 2, it's an error
                                if (res.code >= 2) {
                                    self.logger_.error("[NEM] [ERROR]", __line, "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + dbTokenEntry.address + ": " + JSON.stringify(res));
                                    return false;
                                }

                                var trxHash = res.transactionHash.data;

                                self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Created a Mosaic transfer transaction for " + dbTokenEntry.address + " with hash '" + trxHash + " and paidOutMosaics: " + JSON.stringify(paidOutMosaics));

                                dbTokenEntry.transactionHash = trxHash;
                                dbTokenEntry.mosaics = paidOutMosaics;
                                dbTokenEntry.save();
                            },
                            function(err) {
                                self.logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + dbTokenEntry.address + " with error: " + err);
                            });
                    },
                    function(err) {
                        self.logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + self.blockchain_.getNamespace() + ": " + err);
                    });
        };
    };

    module.exports.Authenticator = Authenticator;
}());