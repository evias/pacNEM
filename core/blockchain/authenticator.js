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

    var base64_encode = function(plain) {
        var words = CryptoJS.enc.Utf8.parse(plain);
        var encoded = CryptoJS.enc.Base64.stringify(words);

        return encoded;
    };

    var base64_decode = function(text) {
        var words = CryptoJS.enc.Base64.parse(text);
        return words.toString(CryptoJS.enc.Utf8);
    };

    /**
     * Randomize array element order in-place.
     * Using Durstenfeld shuffle algorithm.
     */
    var array_shuffle = function(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
        return array;
    };

    var __Errors = function() {
        this.E_ADDRESS_UNKNOWN = 2;
        this.E_INVALID_CREDENTIALS = 3;
        this.E_CLIENT_BLOCKED = 4;
        this.E_SERVER_ERROR = 5;
        this.E_SESSION_EXPIRED = 6;
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
        this.errors = new __Errors();

        this.personalTokensTrxes_ = { "trxIdList": {}, "tokens": {} };

        /**
         * The getActiveSession method checks whether the user has an active
         * Client Session for the given Browser and IP. (Sessions are kept active
         * for one Hour).
         * 
         * This method will be used whenever the `player-authenticate` Template 
         * is displayed on the frontend and will trigger displayed the `player-back`
         * Template instead in case the user has an active session.
         * 
         * @param   {Object}    bundle  Should contain key `ip` and key `client`
         * @param   {Function}  onSuccess
         * @param   {Function}  onFailure
         * @return  void
         */
        this.getActiveSession = function(bundle, onSuccess, onFailure) {

            var self = this;

            if (!bundle || !bundle.ip || !bundle.client || !bundle.address)
                return onFailure({ code: self.errors.E_SERVER_ERROR, error: "E_SERVER_ERROR" });

            // build MD5 checksum of client data
            var payload = JSON.stringify(bundle);
            var uaSession = CryptoJS.lib.WordArray.create(payload);
            var checksum = CryptoJS.MD5(uaSession).toString();

            //DEBUG self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Authenticating Player with checksum: " + checksum);

            // load session by checksum - if none is available OR if the session
            // is too old, the user will need to authenticate. If the session is
            // still valid, the user will only see a loading screen for a few 
            // seconds before the modal box gets closed. 
            var query = {
                ipAddress: bundle.ip,
                checksum: checksum
            };
            var sorting = { sort: { createdAt: -1 } };
            self.db_.PacNEMClientSession.findOne(query, null, sorting, function(err, session) {

                var errors = new __Errors();

                if (err || !session) {
                    return onFailure({ code: errors.E_SESSION_EXPIRED, error: "E_SESSION_EXPIRED" });
                }

                // check user session validity by date
                var oneHourAgo = (new Date().valueOf()) - (60 * 60 * 1000);
                if (session.createdAt > oneHourAgo) {
                    // session valid
                    return onSuccess(session);
                }

                return onFailure({ code: errors.E_SESSION_EXPIRED, error: "E_SESSION_EXPIRED" });
            });
        };

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
         * @param   {Object}    bundle  Should contain key `address`, key `creds` and key `headers`
         */
        this.authenticateAddress = function(bundle, onSuccess, onFailure) {

            var self = this;

            if (!bundle || !bundle.creds || !bundle.address || !bundle.headers)
                return onFailure({ code: self.errors.E_SERVER_ERROR, error: "E_SERVER_ERROR" });

            var secretKey = config.get("pacnem.secretKey");

            // first check if client is blocked.
            var query = { address: bundle.address, ipAddress: bundle.from };
            var sorting = { sort: { createdAt: -1 } };
            self.db_.NEMFailedLogins.find(query, null, sorting, function(err, entries) {
                var errors = new __Errors();

                if (err) {
                    self.logger_.error("[DEBUG]", "[PACNEM AUTH]", "Error reading NEMFailedLogins: " + err);
                    return onFailure({ code: errors.E_SERVER_ERROR, error: "E_SERVER_ERROR" });
                }

                //DEBUG self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Entries: " + entries.length + ": " + JSON.stringify(entries));

                if (entries && entries.length && entries.length >= 5) {
                    // user should be blocked for 1 hour
                    var startTime = (new Date().valueOf()) - (60 * 60 * 1000);
                    var cntCounting = 0;
                    for (var i = 0; i < entries.length; i++) {
                        if (entries[i].createdAt >= startTime)
                            cntCounting++;
                    }

                    if (cntCounting >= 5) {
                        // User should not be able to login or TRY login for 1 hour!
                        return onFailure({ code: errors.E_CLIENT_BLOCKED, error: "E_CLIENT_BLOCKED" });
                    }
                }

                // we can safely process this authentication trial

                var token = bundle.creds.length ? base64_decode(bundle.creds) : "";

                // database stores a hash of the token, not the plain text
                var uaToken = CryptoJS.lib.WordArray.create(secretKey + token + secretKey);
                var checksum = CryptoJS.MD5(uaToken).toString();

                //self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Verifying Token: '" + token + "' for: " + bundle.address + " from: " + bundle.from);

                self.db_.NEMPersonalToken.findOne({ "address": bundle.address, "tokenChecksum": checksum }, function(err, tokenValid) {
                    var errors = new __Errors();

                    if (err || !tokenValid) {
                        // error code will be different according to *Wrong Provided Token*
                        // and *Never Created Token*.
                        self.db_.NEMPersonalToken.findOne({ address: bundle.address }, function(err, tokenForAddress) {
                            if (err) {
                                self.logger_.error("[DEBUG]", "[PACNEM AUTH]", "Error reading NEMPersonalToken: " + err);
                                return onFailure({ code: errors.E_SERVER_ERROR, error: "E_SERVER_ERROR" });
                            }

                            if (!tokenForAddress) {
                                // No Personal Token ever sent for this Address
                                return onFailure({ code: errors.E_ADDRESS_UNKNOWN, error: "E_ADDRESS_UNKNOWN" });
                            }

                            return onFailure({ code: errors.E_INVALID_CREDENTIALS, error: "E_INVALID_CREDENTIALS" });
                        });
                    } else {
                        // authentication success

                        return onSuccess(tokenValid);
                    }
                });
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
            var tokensPayer = self.blockchain_.getVendorWallet();

            if (lastTrxRead === null) {
                // reset Authenticator - rebuilding from blockchain
                self.personalTokensTrxes_ = { "trxIdList": {}, "tokens": {} };
            }

            // read outgoing transactions of the account and check for the given mosaic to build a
            // blockchain-trust mosaic history.

            self.blockchain_.getSDK().com.requests.account.transactions
                .outgoing(self.blockchain_.getEndpoint(), tokensPayer, null, lastTrxRead)
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

                        self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Total of " + Object.getOwnPropertyNames(self.personalTokensTrxes_.tokens).length + " Tokens Found.");

                        self.savePersonalTokensInDatabase(self.personalTokensTrxes_);
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

            //self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Processing chunk of " + transactions.length + " Transactions for Authenticator.");

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
                    //self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Now interpreting: '" + lastMsgRead + "' as JSON for mosaicStake: " + JSON.stringify(mosaicStake));

                    var token = lastMsgRead; // token stored in plain text on blockchain
                    var normalized = recipient.replace(/-/g, "");

                    //self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Token Found: " + token + " for Address: " + recipient);
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
         * 
         * @param   {Object}    tokensData
         * @return  void|false
         */
        this.savePersonalTokensInDatabase = function(tokensData) {
            var self = this;

            if (!tokensData || !Object.getOwnPropertyNames(tokensData.tokens).length) {
                // No Personal Tokens available
                self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "No Personal Tokens have been Sent yet!");
                return false;
            }

            for (var address in tokensData.tokens) {

                var normalized = address.replace(/-/g, '');
                var currentToken = tokensData.tokens[normalized];

                self.asyncDatabaseUpdate(normalized, currentToken);
            }
        };

        /**
         * This method will save the NEMPersonalToken entry given
         * the XEM address `address` and the token object `token`.
         * 
         * The `token` object is created in `processPersonalTokenTransactions`
         * from reading the NEM blockchain transactions containing Personal Token Mosaics.
         * 
         * @param   {String}    address
         * @param   {Object}    token   Should contain key `trxHash` and `token`
         * @return  void
         */
        this.asyncDatabaseUpdate = function(address, token) {
            var self = this;
            var secretKey = config.get("pacnem.secretKey");
            self.db_.NEMPersonalToken.findOne({ "address": address }, function(err, entry) {
                if (err)
                    return;

                // database stores a hash of the token, not the plain text
                var uaToken = CryptoJS.lib.WordArray.create(secretKey + token.token + secretKey);
                var checksum = CryptoJS.MD5(uaToken).toString();

                if (entry) {
                    entry.tokenChecksum = checksum;
                    entry.transactionHash = token.trxHash;
                } else {
                    // Token read from blockchain but not present in database.
                    entry = new self.db_.NEMPersonalToken({
                        "address": address,
                        "tokenChecksum": checksum,
                        "transactionHash": token.trxHash,
                        "createdAt": new Date().valueOf()
                    });
                }
                entry.save();
            });
        };

        /**
         * Quite complicated way to generate a random digits only Auth Token
         * but well, we are here to have fun anyways :)
         * 
         * This method will first generate random bytes using nacl, convert them
         * to hexadecimal and *keep only the digits* - until it finds a group of
         * at least 24 digits in the generated 32 bytes (64 characters).
         * 
         * Second step is to do 2908 rounds of shuffling the extracted digits array
         * and then we randomly pick indexes out of this shuffled array to build the
         * 6 character token.
         * 
         * @return  {String}
         */
        this.generateAuthToken = function() {
            var self = this;
            var sdk = self.blockchain_.getSDK();

            // first generate random bytes and keep only digits
            var rToken = "";
            do {
                var rBytes = sdk.crypto.nacl.randomBytes(32);
                var rHex = sdk.utils.convert.ua2hex(rBytes);

                rToken = rHex.replace(/[^0-9]/g, '');
            }
            while (rToken.length < 24); // at least 24 numbers to shuffle

            var aToken = rToken.split("");

            // 2908 rounds of shuffle
            for (var i = 0; i < 2908; ++i) {
                aToken = array_shuffle(aToken);
            }

            // now pick random indexes in the array to build a 6 character
            // short auth token.
            var maxIndex = aToken.length;
            var rIndexes = [];
            for (var j = 0; j < 6; j++) {
                var index = Math.floor(Math.random() * maxIndex);
                rIndexes.push(index);
            }

            // build token
            var token = "";
            for (var c = 0; c < rIndexes.length; c++) {
                token += aToken[rIndexes[c]];
            }

            return token;
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
        this.sendPersonalToken = function(address) {
            if (!address.length)
                return false;

            var self = this;
            var tokenPlain = self.generateAuthToken();

            // build message with token - the message + address are 
            // used to avoid sending tokens more than 1 time.
            var message = tokenPlain;
            var secretKey = config.get("pacnem.secretKey");

            // database stores a hash of the token, not the plain text
            var uaToken = CryptoJS.lib.WordArray.create(secretKey + message + secretKey);
            var checksum = CryptoJS.MD5(uaToken).toString();

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Sending Personal Token with Token value: '" + message + "'");

            // find already paid out Rewards
            self.db_.NEMPersonalToken.findOne({ "address": address, "tokenChecksum": checksum },
                function(err, existsToken) {
                    self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "READ NEMPersonalToken JSON: '" + JSON.stringify(existsToken));

                    if (err) {
                        self.logger_.error("[ERROR]", "[PACNEM AUTH]", "Error reading NEMPersonalToken: " + JSON.stringify(err));
                        return false;
                    }

                    if (!existsToken) {
                        // we only want to payout in case we didn't send mosaics before
                        // for this Game and Player.
                        var createToken = new self.db_.NEMPersonalToken({
                            "address": address,
                            "tokenChecksum": checksum,
                            "createdAt": new Date().valueOf()
                        });
                        createToken.save();

                        self.announceTokenTransfer(createToken, message);
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
        this.announceTokenTransfer = function(dbTokenEntry, plainToken) {
            var self = this;
            var nemSDK = self.blockchain_.getSDK();
            var appsMosaic = self.blockchain_.getGameMosaicsConfiguration();

            var countPersonalTokens = 1;
            var privStore = nemSDK.model.objects.create("common")("", self.blockchain_.getPublicWalletSecretKey());
            var mosaicDefPair = nemSDK.model.objects.get("mosaicDefinitionMetaDataPair");
            var personalTokenName = Object.getOwnPropertyNames(appsMosaic.credits)[2];
            var personalTokenSlug = self.blockchain_.getNamespace() + ":" + personalTokenName;

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Now sending 1 personal-token to player " + dbTokenEntry.address + " with token '" + dbTokenEntry.tokenChecksum + "' paid by " + self.blockchain_.getVendorWallet());

            // Create an un-prepared multisig mosaic transfer transaction object 
            // Amount 1 is "one time x Mosaic Attachments"
            // (use same object as transfer tansaction)
            var transferTransaction = nemSDK.model.objects.create("transferTransaction")(dbTokenEntry.address, 1, plainToken);

            if (self.blockchain_.useMultisig()) {
                transferTransaction.isMultisig = true;
                transferTransaction.multisigAccount = { publicKey: config.get("pacnem.businessPublic") };
            }

            var mosaicAttachPersonalToken = nemSDK.model.objects.create("mosaicAttachment")(self.blockchain_.getNamespace(), personalTokenName, countPersonalTokens);
            var paidOutMosaics = { "Authenticator": { "mosaic": personalTokenSlug, "quantity": countPersonalTokens } };

            self.logger_.info("[DEBUG]", "[PACNEM AUTH]", "Using Mosaics: " + personalTokenSlug);

            // Need mosaic definition of evias.pacnem:* mosaics to calculate 
            // adequate fees, so we get it from network.
            nemSDK.com.requests.namespace
                .mosaicDefinitions(self.blockchain_.getEndpoint(), self.blockchain_.getNamespace())
                .then(function(res) {
                    res = res.data;

                    var personalTokenDef = nemSDK.utils.helpers.searchMosaicDefinitionArray(res, [personalTokenName]);

                    if (undefined === personalTokenDef[personalTokenSlug])
                        return self.logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition with [personalTokenSlug]: " + JSON.stringify([personalTokenSlug]) + " - Obligatory for the game, Please fix!");

                    // Now preparing our Mosaic Transfer Transaction 
                    // (1) configure mosaic definition pair
                    // (2) attach mosaics attachments to transfer transaction
                    // (3) configure transfer transaction
                    // (4) announce transaction on the network

                    // (1)
                    mosaicDefPair[personalTokenSlug] = {};
                    mosaicDefPair[personalTokenSlug].mosaicDefinition = personalTokenDef[personalTokenSlug];

                    // (2)
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
                    nemSDK.model.transactions
                        .send(privStore, entity, self.blockchain_.getEndpoint())
                        .then(function(res) {
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
                        }, function(err) {
                            self.logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + self.blockchain_.getVendorWallet() + " to " + dbTokenEntry.address + " with error: " + err);
                        });

                }, function(err) {
                    self.logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + self.blockchain_.getNamespace() + ": " + err);
                });

            return self;
        };
    };

    module.exports.Authenticator = Authenticator;
    module.exports.AuthenticatorErrors = __Errors;
}());