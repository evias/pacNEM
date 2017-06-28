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
    CryptoJS = require("crypto-js");

/**
 * Configuration of PacNEM Mosaics, the following object will
 * describe all mosaics used in the game - being Game Credits 
 * Mosaics, Scores Mosaics and Achievements Mosaics.
 */
var pacNEM_mosaics = {
    "credits": {"heart": true},
    "scores": {"cheese": true},
    "rewards": {
        "purchases": {
            "beta-player": {"icon": "glyphicon glyphicon-empty-star"},
            "player": {"icon": "glyphicon glyphicon-user"}
        },
        "return_x2": {"n00b": true},
        "return_x5": {"nember": true},
        "return_x10": {"afficionado": true},
        "return_x100": {"great-supporter": true},
        "high_score": {
            "hall-of-famer": {"icon": "glyphicon glyphicon-king"}, 
            "all-time-best-player": {"icon": "glyphicon glyphicon-queen"}
        }
    },
    "achievements": {
        "combo_x3": {"multikill": {"minCombo": 3}},
        "combo_x5": {"rampage": {"minCombo": 5}},
        "combo_x7": {"ghostbuster": {"minCombo": 7}},
        "combo_x10": {"godlike-101010": {"minCombo": 10}}
    }
};

/**
 * PacNEM defines SINK Accounts where tokens are sent that must be considered
 * as *redeemed* or *burned*. For example if someone buys 1 Game Credit, burning
 * this 1 Game Credit means the person cannot use it anymore.
 * 
 * Currently there is only one type of sink accounts used being the Game Credits
 * Sink Address.
 */
var pacNEM_SINKS_ = {
    "credits": {
        "address": (process.env["CREDITS_SINK"] || config.get("pacnem.creditsSinkAddress")).replace(/-/g, ""),
        "mosaic": {"id": "hearts--"}
    }
};

// score compare function for fast sorting
var scrcmp = function(a, b) {
    if (a.score < b.score) return -1;
    if (a.score > b.score) return 1;

    return 0;
};

/**
 * class service provides a business layer for
 * blockchain data queries used in the pacNEM game.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var service = function(io, nemSDK, logger)
{
    var socket_ = io;

    // initialize the current running game's blockchain service with
    // the NEM blockchain. This will create the endpoint for the given
    // network and port (testnet, mainnet, mijin) and will then initialize
    // a common object using the configured private key.
    var nem_    = nemSDK;
    var logger_ = logger;

    var isTestMode   = config.get("nem.isTestMode");

    var envSuffix  = isTestMode ? "_TEST" : "";
    var confSuffix = isTestMode ? "_test" : "";

    // connect to the blockchain with the NEM SDK
    var nemHost = process.env["NEM_HOST" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].host;
    var nemPort = process.env["NEM_PORT" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].port;
    var node_   = nem_.model.objects.create("endpoint")(nemHost, nemPort);

    // following XEM Accounts are used for all blockchain requests.
    // - vendor_ : The Vendor Wallet is the Multi Signature account containing all Mosaics!
    // - pacNEM_ : The Cosignatory Wallet is one of the 2 cosignatories of vendor_ (the public one, not the sign-bot..).
    var vendor_  = (process.env["APP_VENDOR"] || config.get("pacnem.business")).replace(/-/g, "");
    var pacNEM_  = (process.env["APP_PUBLIC"] || config.get("pacnem.application") || config.get("pacnem.business")).replace(/-/g, "");

    // Configure the mosaics namespace to be used
    var pacNEM_NS_ = (process.env["APP_NAMESPACE"] || config.get("pacnem.namespace"));

    var gameCreditsHistory_ = {};

    /**
     * Get the NEM Namespace used for this application.
     *
     * @return string   The namespace + subnamespace(s) joined with a dot (.).
     */
    this.getNamespace = function()
    {
        return pacNEM_NS_;
    };

    /**
     * Get the Multi Signature Vendor wallet for this application.
     *
     * Must not be multisig, could be simple wallet.
     *
     * @return string
     */
    this.getVendorWallet = function()
    {
        return vendor_;
    };

    /**
     * Get the Cosignatory Wallet for this application.
     * This wallet's address is published in the source code.
     *
     * In case the vendor wallet is not a multi signature account,
     * the vendor and cosignatory wallet will be the same.
     *
     * @return {string}
     */
    this.getPublicWallet = function()
    {
        return pacNEM_;
    };

    /**
     * Utility to get complete configuration of the PacNEM
     * Game Credits Sink Account.
     */
    this.getCreditsSinkData = function()
    {
        return pacNEM_SINKS_.credits;
    };

    /**
     * Get the Game Credits Sink Wallet address. This wallet will 
     * receive transactions whenever someone's game on pacNEM is 
     * finished (or has ended).
     * 
     * Sending evias.pacnem:heart to this address ALONG WITH a message
     * containing at least one XEM address (multi separated by comma)
     * and encrypted with AES and pacNEM's encryption secret key.
     * 
     * @return {string}
     */
    this.getCreditsSinkWallet = function()
    {
        return this.getCreditsSinkData().address;
    };

    /**
     * Get the NEM-sdk object initialized before.
     * 
     * @link https://github.com/QuantumMechanics/NEM-sdk
     */
    this.getSDK = function()
    {
        return nem_;
    };

    /**
     * Get the NEM-sdk `endpoint` with which we are connecting
     * to the blockchain.
     */
    this.getEndpoint = function()
    {
        return node_;
    };

    /**
     * Utility method to retrieve this game's mosaics 
     * configuration. This includes the configuration for 
     * special payouts of rewards and achievements.
     */
    this.getGameMosaicsConfiguration = function()
    {
        return pacNEM_mosaics;
    };

    /**
     * This returns the `pacnem.application` account's private key and is
     * used for creating mosaic transfer multisig transactions for the
     * account `pacnem.business`.
     *
     * Only this private key is public, the other accounts are NEMBots and
     * no informations about those will be saved in this application.
     *
     * Only Co-Signatory NEMBots are private, the Payment Processor Bot
     * can publish read operations to track current invoices, etc.
     *
     * @return {string}
     */
    this.getPublicWalletSecretKey = function()
    {
        return process.env["APP_SECRET"] || config.get("pacnem.applicationSecret");
    };

    /**
     * This returns the `pacnem.secretKey` option value.
     * 
     * This key can be changed to make the application act
     * privately on the blockchain
     * 
     * XXX PaymentProcessor should use this if enabled, too.
     * 
     * @return {string}
     */
    this.getEncryptionSecretKey = function()
    {
        return config.get("pacnem.secretKey");
    };

    /**
     * Get the Network details. This will return the currently
     * used config for the NEM node (endpoint).
     *
     * @return Object
     */
    this.getNetwork = function()
    {
        var isTest  = config.get("nem.isTestMode");
        var isMijin = config.get("nem.isMijin");

        return {
            "host": node_.host,
            "port": node_.port,
            "label": isTest ? "Testnet" : isMijin ? "Mijin" : "Mainnet",
            "config": isTest ? nem_.model.network.data.testnet : isMijin ? nem_.model.network.data.mijin : nem_.model.network.data.mainnet,
            "isTest": isTest,
            "isMijin": isMijin
        };
    };

    var network_ = this.getNetwork();

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
     * This method fetches mosaics for the given XEM address.
     *
     * If the mosaic evias.pacnem:heart can be found in the account, a call
     * to `fetchGameCreditsRealHistoryByGamer` will be issued in order
     * to fetch `allTransactions` of the account.
     *
     * We will fetch all transactions only for accounts which we know they
     * own evias.pacnem:heart Mosaics.
     *
     * @param  NEMGamer gamer
     */
    this.fetchHeartsByGamer = function(gamer)
    {
        var self = this;
        var heartsMosaicSlug = self.getNamespace() + ":" + Object.getOwnPropertyNames(pacNEM_mosaics.credits)[0];

        // read Mosaics owned by the given address's XEM wallet
        nem_.com.requests.account.mosaics.owned(node_, gamer.getAddress()).then(function(res)
        {
            if (! res.data || ! res.data.length) {
                gamer.updateCredits({countHearts: 0});
                return null;
            }

            //DEBUG logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.mosaics: " + JSON.stringify(res));

            // this accounts owns mosaics, check if he has evias.pacnem:heart
            // mosaic so that he can play.
            var hasHearts = false;
            for (var i in res.data) {
                var mosaic = res.data[i];
                var slug   = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;
                if (heartsMosaicSlug == slug) {
                    // this account has some lives available as SAYS THE BLOCKCHAIN.
                    // we can store this information in our NEMGameCredit model.

                    // be aware that the Mosaics BALANCE does not represent the number
                    // of Available Lives! The user may have *Played* Hearts or *Sent Back*
                    // Hearts to the pacnem-business wallet.

                    //DEBUG logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Found mosaic '" + heartsMosaicSlug + "' - Now validating with Transaction history.");

                    // computing the exact balance of the user (we now know that the user owns hearts.)
                    self.fetchGameCreditsRealHistoryByGamer(gamer, mosaic, null, function(creditsData)
                        {
                            //DEBUG logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Total of " + creditsData.countHearts + " " + heartsMosaicSlug + " found for " + gamer.getAddress());
                            gamer.updateCredits(creditsData);
                        });
                    hasHearts = true;
                }
            }

            if (! hasHearts)
                gamer.updateCredits({countHearts: 0});
        }, function(err) {
            // NO Mosaics available / wrong Network for address / Unresolved Promise Errors

            gamer.updateCredits({countHearts: 0});
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
    this.fetchGameCreditsRealHistoryByGamer = function(gamer, mosaic, lastTrxRead, callback)
    {
        var self = this;
        var heartsMosaicSlug = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

        if (! gameCreditsHistory_.hasOwnProperty(gamer.getAddress())) {
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

        nem_.com.requests.account.transactions.all(node_, gamer.getAddress(), null, lastTrxRead)
            .then(function(res)
            {
                //DEBUG logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.transactions.all: " + JSON.stringify(res));

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
                logger_.info("[DEBUG]", "[ERROR]", "Error in NIS API account.allTransactions: " + JSON.stringify(err));
            });

        // paralelly we can also read all transaction of the Game Credits Sink Account. 
        // This account is used to *burn game credits* (or *redeem* the tokens). This helps
        // in diminishing the amount of money that the Players have to Pay for playing 
        // a NEM linked game.

        //XXX implement Game Credits Sink Account
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
    this.saveGameCreditsRealHistoryForGamer = function(gamer, mosaic, transactions)
    {
        var self = this;
        var gamerHistory = gameCreditsHistory_[gamer.getAddress()];
        var heartsMosaicSlug = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

        var lastTrxRead = null;
        var lastTrxHash = null;
        var totalHeartsIncome = 0;
        var totalHeartsOutgo  = 0;
        for (var i = 0; i < transactions.length; i++) {
            var content    = transactions[i].transaction;
            var meta       = transactions[i].meta;
            var recipient  = null;

            // save transaction id
            lastTrxRead = self.getTransactionId(transactions[i]);
            lastTrxHash = self.getTransactionHash(transactions[i]);

            if (gamerHistory.trxIdList.hasOwnProperty(lastTrxHash))
                // stopping the loop, reading data we already know about.
                return false;

            gamerHistory.trxIdList[lastTrxHash] = true;

            if (content.type != nem_.model.transactionTypes.transfer
                && content.type != nem_.model.transactionTypes.multisigTransaction)
                // we are interested only in transfer transactions
                // and multisig transactions because only those might
                // change the evias.pacnem:heart balance of XEM address
                continue;

            // get the searched for mosaic stake
            var mosaicStake = self.extractMosaicFromTransactionData_(content, heartsMosaicSlug);

            if (mosaicStake === false)
                continue;

            if (mosaicStake.recipient == gamer.getAddress()) {
                // gamer's transaction (incoming for gamer)
                totalHeartsIncome += mosaicStake.totalMosaic;
            }
            else if (mosaicStake.recipient !== false) {
                // pacnem transaction (outgoing for gamer)
                totalHeartsOutgo  += mosaicStake.totalMosaic;
            }
        }

        var creditsInChunk = totalHeartsIncome - totalHeartsOutgo;
        //DEBUG logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Found " + creditsInChunk + " " + heartsMosaicSlug + " in " + transactions.length + " transactions for " + gamer.getAddress());

        gamerHistory.countHearts = gamerHistory.countHearts + creditsInChunk;
        gamerHistory.exchangedHearts = gamerHistory.exchangedHearts + totalHeartsOutgo;

        gameCreditsHistory_[gamer.getAddress()] = gamerHistory;
        return lastTrxRead;
    };

    //XXX
    this.sendAuthCode = function()
    {

    };

    /**
     * This method is used when an invoice is PAID (confirmed). It will
     * send evias.pacnem:heart Mosaics as described in `paymentChannel.countHearts`
     * and save the blockchain transaction hash to `paymentChannel.heartsTransactionHash`.
     *
     * @param  {NEMPaymentChannel} paymentChannel
     * @param  {Function} callbackSuccess
     * @return {void}
     */
    this.sendHeartsForPayment = function(paymentChannel, callbackSuccess)
    {
        var self = this;

        var gamerXEM  = paymentChannel.getPayer();
        var countHearts = paymentChannel.countHearts;
        var privStore = nem_.model.objects.create("common")("", this.getPublicWalletSecretKey());
        var mosaicDefPair = nem_.model.objects.get("mosaicDefinitionMetaDataPair");
        var hasBetaMosaic = config.get("pacnem.isBeta");

        var heartsMosaicName  = Object.getOwnPropertyNames(pacNEM_mosaics.credits)[0];
        var bPlayerMosaicName = Object.getOwnPropertyNames(pacNEM_mosaics.rewards.purchases)[0];
        var playerMosaicName  = Object.getOwnPropertyNames(pacNEM_mosaics.rewards.purchases)[1];

        //DEBUG logger_.info("[NEM] [PAYMENT]", "[DEBUG]",
        //DEBUG            "Now sending " + paymentChannel.countHearts + " hearts for invoice " + paymentChannel.number
        //DEBUG            + " sent to " + paymentChannel.getPayer() + " paid by " + vendor_ + " signed with " + pacNEM_);

        // Create an un-prepared mosaic transfer transaction object (use same object as transfer tansaction)
        var message = paymentChannel.number + " - Thank you! Greg.";
        var transferTransaction = nem_.model.objects.create("transferTransaction")(gamerXEM, 1, message); // Amount 1 is "one time x Mosaic Attachments"
        transferTransaction.isMultisig = true;
        transferTransaction.multisigAccount = {publicKey: config.get("pacnem.businessPublic")};

        var mosaicAttachHearts = nem_.model.objects.create("mosaicAttachment")(self.getNamespace(), heartsMosaicName, countHearts);
        var mosaicAttachPlayer  = nem_.model.objects.create("mosaicAttachment")(self.getNamespace(), playerMosaicName, 1);
        var mosaicAttachBPlayer = nem_.model.objects.create("mosaicAttachment")(self.getNamespace(), bPlayerMosaicName, 1);

        var heartsSlug = self.getNamespace() + ":" + heartsMosaicName;
        var playerSlug = self.getNamespace() + ":" + playerMosaicName;
        var bPlayerSlug = self.getNamespace() + ":" + bPlayerMosaicName;

        //DEBUG logger_.info("[NEM] [PAYMENT]", "[DEBUG]", "Using Mosaics: " + heartsSlug + ", " + playerSlug + ", " + bPlayerSlug);

        // always receive evias.pacnem:heart and evias.pacnem:player
        transferTransaction.mosaics.push(mosaicAttachHearts);
        transferTransaction.mosaics.push(mosaicAttachPlayer);

        if (hasBetaMosaic)
            // in beta mode, give evias.pacnem:beta-player too
            transferTransaction.mosaics.push(mosaicAttachBPlayer);

        //DEBUG logger_.info("[NEM] [PAYMENT]", "[DEBUG]", "Reading Mosaic Definitions for namespace: " + pacNEM_NS_);

        // Need mosaic definition of evias.pacnem:heart to calculate adequate fees, so we get it from network.
        nem_.com.requests.namespace
            .mosaicDefinitions(node_, self.getNamespace()).then(
        function(res) {
            res = res.data;

            var heartsDef  = nem_.utils.helpers.searchMosaicDefinitionArray(res, [heartsMosaicName]);
            var playerDef  = nem_.utils.helpers.searchMosaicDefinitionArray(res, [playerMosaicName]);
            var bPlayerDef = nem_.utils.helpers.searchMosaicDefinitionArray(res, [bPlayerMosaicName]);

            if (undefined === heartsDef[heartsSlug] || undefined === playerDef[playerSlug] || undefined === bPlayerDef[bPlayerSlug])
                return logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition for " + heartsSlug + " - Obligatory for the game, Please fix!");

            mosaicDefPair[heartsSlug] = {};
            mosaicDefPair[playerSlug] = {};

            mosaicDefPair[heartsSlug].mosaicDefinition = heartsDef[heartsSlug];
            mosaicDefPair[playerSlug].mosaicDefinition = playerDef[playerSlug];

            if (hasBetaMosaic) {
                mosaicDefPair[bPlayerSlug]= {};
                mosaicDefPair[bPlayerSlug].mosaicDefinition = bPlayerDef[bPlayerSlug];
            }

            // Prepare the multisig mosaic transfer transaction object and broadcast
            var transactionEntity = nem_.model.transactions.prepare("mosaicTransferTransaction")(privStore, transferTransaction, mosaicDefPair, network_.config.id);

            logger_.info("[NEM] [PAYMENT]", "[DEBUG]", "Now sending Multisig Transaction to " + gamerXEM + " for invoice " + paymentChannel.number + " with following data: " + JSON.stringify(transactionEntity) + " on network: " + JSON.stringify(network_.config) + " with common: " + JSON.stringify(privStore));

            nem_.model.transactions.send(privStore, transactionEntity, node_).then(
            function(res) {
                delete privStore;

                // If code >= 2, it's an error
                if (res.code >= 2) {
                    logger_.error("[NEM] [ERROR]", __line, "Could not send Transaction for " + vendor_ + " to " + gamerXEM + ": " + JSON.stringify(res));
                    return false;
                }

                var trxHash = res.transactionHash.data;
                logger_.info(
                    "[NEM] [PAYMENT]", "[CREATED]",
                    "Created a multi-signature Mosaic transfer transaction for " + countHearts + " " + heartsSlug
                    + " sent to " + gamerXEM + " for invoice " + paymentChannel.number);

                // update `paymentChannel` to contain the transaction hash too and make sure history is kept.
                paymentChannel.heartsTransactionHash = trxHash;
                paymentChannel.save(function(err)
                    {
                        if (! err) {
                            callbackSuccess(paymentChannel);
                        }
                    });
            },
            function(err) {
                logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + vendor_ + " to " + gamerXEM + " in channel " + paymentChannel + " with error: " + err);
            });

            delete privStore;
        },
        function(err) {
            logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + pacNEM_NS_ + ": " + err);
        });
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
    this.processGameCreditsBurning = function(gamers)
    {
        var self = this;

        var players = gamers;
        if (! players || ! players.length)
            return false;

        // read addresses in ended game state data
        var addresses = [];
        for (var i = 0; i < players.length; i++) {
            if (! players[i].getAddress() || ! players[i].getAddress().length)
                continue;

            // validate NEM address with NEM-sdk
            var address = players[i].getAddress();
            var chainId = self.getNetwork().config.id;
            var isValid = self.getSDK().model.address.isFromNetwork(address, chainId);
            if (! isValid)
                //XXX add error log, someone tried to send invalid data
                continue;

            addresses.push(address);
        }

        logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Will now burn Player Game Credit for the Game Session: " + addresses.length + " Players.");

        self.sendGameCreditsToSink(addresses);

        // for each address we also need to update the 
        // NEMGameCredit entry for given NEMGamer.
        for (var j = 0; j < players.length; j++) {
            var gamer = players[j];

            gamer.updateCredits({countPlayedHearts: 1});
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
    this.sendGameCreditsToSink = function(addresses)
    {
        var self = this;

        // addresses will be added to a message which will be encrypted
        // using CryptoJS.AES and pacNEM's secret encryption key. The 
        // message contains all players of the ended game and this 
        // transaction will act as a "Game Credit Burn" event in the Game.
        var sinkMessage = addresses.join(",");
        var sinkAddress = self.getCreditsSinkWallet();

        var sinkXEM  = self.getCreditsSinkWallet();
        var countRedeem = addresses.length; // sending X times hearts--
        var privStore   = self.getSDK().model.objects.create("common")("", this.getPublicWalletSecretKey());
        var mosaicDefPair = self.getSDK().model.objects.get("mosaicDefinitionMetaDataPair");
        var redeemingMosaicName  = self.getCreditsSinkData().mosaic.id;

        //DEBUG logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Now sending " + countRedeem + " hearts-- " + " sent to " + sinkXEM + " paid by " + pacNEM_);

        // Create an un-prepared mosaic transfer transaction object (use same object as transfer tansaction)
        var transferTransaction = self.getSDK().model.objects.create("transferTransaction")(sinkXEM, 1, sinkMessage); // Amount 1 is "one time x Mosaic Attachments"

        // must be multisig because non-transferable hearts-- mosaic owned by multisig
        transferTransaction.isMultisig = true;
        transferTransaction.multisigAccount = {publicKey: config.get("pacnem.businessPublic")};

        var mosaicAttachRedeem  = self.getSDK().model.objects.create("mosaicAttachment")(self.getNamespace(), redeemingMosaicName, countRedeem);
        var redeemSlug = self.getNamespace() + ":" + redeemingMosaicName;

        //DEBUG logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Using Mosaics: " + redeemSlug);

        // attach mosaic to transaction
        transferTransaction.mosaics.push(mosaicAttachRedeem);

        //DEBUG logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Reading Mosaic Definitions for namespace: " + pacNEM_NS_);

        // Need mosaic definition of evias.pacnem:heart to calculate adequate fees, so we get it from network.
        self.getSDK().com.requests.namespace
            .mosaicDefinitions(node_, self.getNamespace()).then(
        function(res) {
            res = res.data;

            var redeemDef  = self.getSDK().utils.helpers.searchMosaicDefinitionArray(res, [redeemingMosaicName]);

            if (undefined === redeemDef[redeemSlug])
                return logger_.error("[NEM] [ERROR]", __line, "Missing Mosaic Definition for " + redeemSlug + " - Obligatory for the game, Please fix!");

            mosaicDefPair[redeemSlug] = {};
            mosaicDefPair[redeemSlug].mosaicDefinition = redeemDef[redeemSlug];

            // Prepare the mosaic transfer transaction object and broadcast
            var transactionEntity = self.getSDK().model.transactions.prepare("mosaicTransferTransaction")(privStore, transferTransaction, mosaicDefPair, network_.config.id);

            //DEBUG logger_.info("[NEM] [CREDITS SINK]", "[DEBUG]", "Now sending Mosaic Transfer Transaction to " + sinkXEM + " with following data: " + JSON.stringify(transactionEntity) + " on network: " + JSON.stringify(network_.config) + " with common: " + JSON.stringify(privStore));

            self.getSDK().model.transactions.send(privStore, transactionEntity, node_).then(
            function(res) {
                delete privStore;

                // If code >= 2, it's an error
                if (res.code >= 2) {
                    logger_.error("[NEM] [ERROR]", __line, "Could not send Transaction for " + pacNEM_ + " to " + sinkXEM + ": " + JSON.stringify(res));
                    return false;
                }

                var trxHash = res.transactionHash.data;
                logger_.info("[NEM] [CREDITS SINK]", "[CREATED]", "Created a Mosaic transfer transaction for " + countRedeem + " " + redeemSlug + " sent to " + sinkXEM);
            },
            function(err) {
                logger_.error("[NEM] [ERROR]", "[TRX-SEND]", "Could not send Transaction for " + vendor_ + " to " + sinkXEM + " with error: " + err);
            });

            delete privStore;
        },
        function(err) {
            logger_.error("[NEM] [ERROR]", "[MOSAIC-GET]", "Could not read mosaics definition for namespace: " + pacNEM_NS_ + ": " + err);
        });

        return self;
    };

    /**
     * Read the Transaction Hash from a given TransactionMetaDataPair
     * object (gotten from NEM websockets or API).
     *
     * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
     * @return {string}
     */
    this.getTransactionHash = function(transactionMetaDataPair)
    {
        var meta    = transactionMetaDataPair.meta;
        var content = transactionMetaDataPair.transaction;

        var trxHash = meta.hash.data;
        if (meta.innerHash.data && meta.innerHash.data.length)
            trxHash = meta.innerHash.data;

        return trxHash;
    };

    /**
     * Read blockchain transaction ID from TransactionMetaDataPair
     *
     * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
     * @return {integer}
     */
    this.getTransactionId = function(transactionMetaDataPair)
    {
        return transactionMetaDataPair.meta.id;
    };

    /**
     * Read blockchain transaction Message from TransactionMetaDataPair
     *
     * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
     * @return {string}
     */
    this.getTransactionMessage = function(transactionMetaDataPair, doDecrypt = false)
    {
        var meta    = transactionMetaDataPair.meta;
        var content = transactionMetaDataPair.transaction;

        var trxRealData = content;
        if (content.type == this.getSDK().model.transactionTypes.multisigTransaction) {
            // multisig, message will be in otherTrans
            trxRealData = content.otherTrans;
        }

        if (! trxRealData.message || ! trxRealData.message.payload)
            // no message found in transaction
            return "";

        //DEBUG logger_.info("[DEBUG]", "[BLOCKCHAIN]", "Reading following message: " + JSON.stringify(trxRealData.message));

        // decode transaction message and job done
        var payload = trxRealData.message.payload;
        var plain   = this.getSDK().utils.convert.hex2a(payload);

        //DEBUG logger_.info("[DEBUG]", "[BLOCKCHAIN]", "Message Read: " + JSON.stringify(plain));

        if (doDecrypt === true) {
            var decrypted = CryptoJS.AES.decrypt(plain, this.getEncryptionSecretKey());

            //DEBUG logger_.info("[DEBUG]", "[BLOCKCHAIN]", "Decrypted using AES from '" + plain + "' to '" + decrypted + "'");

            return decrypted;
        }

        return plain;
    };

    /**
     * Read the Transaction Date from a given TransactionMetaDataPair
     * object (gotten from NEM websockets or API).
     *
     * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
     * @param  {boolean}    asNemTime   Whether to return a NEM Timestamp or normal timestamp
     * @return {string}
     */
    this.getTransactionDate = function(transactionMetaDataPair, asNemTime = false)
    {
        var meta    = transactionMetaDataPair.meta;
        var content = transactionMetaDataPair.transaction;

        var nemTime  = content.timeStamp;
        var nemEpoch = Date.UTC(2015, 2, 29, 0, 6, 25, 0);

        if (asNemTime === true)
            return nemTime;

        return new Date(nemEpoch + (nemTime*1000));
    };

    /**
     * Read the Transaction Amount.
     *
     * if `mosaicSlug` is provided and is different than
     * `nem:xem`, the transaction *must* be a mosaic transfer
     * transaction.
     *
     * @param   [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
     * @param   {string}    mosaicSlug
     * @param   {integer}   divisibility
     * @return {[type]}                         [description]
     */
    this.getTransactionAmount = function(transactionMetaDataPair, mosaicSlug = 'nem:xem', divisibility = 6)
    {
        var meta    = transactionMetaDataPair.meta;
        var content = transactionMetaDataPair.transaction;

        var isMultiSig  = content.type === this.getSDK().model.transactionTypes.multisigTransaction;
        var realContent = isMultiSig ? content.otherTrans : content;
        var isMosaic    = realContent.mosaics && realContent.mosaics.length > 0;

        var lookupNS  = mosaicSlug.replace(/:[^:]+$/, "");
        var lookupMos = mosaicSlug.replace(/^[^:]+:/, "");

        if (isMosaic) {
            // read mosaics to find XEM, `content.amount` is now a multiplier!

            var multiplier = realContent.amount / Math.pow(10, divisibility); // from microXEM to XEM
            for (var i in realContent.mosaics) {
                var mosaic = realContent.mosaics[i];
                var isLookupMosaic  = mosaic.mosaicId.namespaceId == lookupNS 
                                    && mosaic.mosaicId.name == lookupMos;

                if (!isLookupMosaic)
                    continue;

                return (multiplier * mosaic.quantity).toFixed(divisibility);
            }

            // no XEM in transaction.
            return 0;
        }

        if (mosaicSlug !== 'nem:xem')
            return 0;

        // not a mosaic transer, `content.amount` is our XEM amount.
        return realContent.amount;
    };

    /**
     * This will read `slugToExtract` Mosaic amounts from the given Transaction
     * data `trxContent`.
     *
     * This method can be used to retrieve **one** Mosaic's total Amount in the
     * given Transaction Data using either the array in `trxContent.mosaics` or
     * the array in `trxContent.otherTrans.mosaics` in case of a multi signature
     * transaction.
     *
     * @param  {object} trxContent    - should be `TransactionMetaDataPair.transaction`
     * @param  {string} slugToExtract - Which mosaic ID to extract (i.e.: evias.pacnem:heart)
     * @return {object}
     */
    this.extractMosaicFromTransactionData_ = function(trxContent, slugToExtract, divisibility = 6)
    {
        if (! trxContent || ! slugToExtract || ! slugToExtract.length)
            return {totalMosaic: 0, recipient: false};

        if (trxContent.type == nem_.model.transactionTypes.multisigTransaction) {
            // multisig transaction mode
            // here we must check whether `trxContent.otherTrans.mosaics`
            // is set, this will to `res.data[i].transaction.otherTrans.mosaics`
            // from the raw Promise result.

            if (typeof trxContent.otherTrans == 'undefined')
                // MultiSig transactions WITHOUT `otherTrans` CANNOT contain Mosaics.
                return false;

            if (typeof trxContent.otherTrans.mosaics == 'undefined')
                // No Mosaics in this one :()
                return false;

            var trxMosaics = trxContent.otherTrans.mosaics;
            var recipient  = trxContent.otherTrans.recipient;
            var trxAmount  = trxContent.otherTrans.amount;
        }
        else {
            // transfer transaction mode
            // here we can simply read the `trxContent.mosaics`, this translates to
            // `res.data[i].transaction.mosaics` from the raw Promise result.

            if (typeof trxContent.mosaics == 'undefined' || ! trxContent.mosaics.length)
                // we are interested only in Mosaic Transfer transactions
                return false;

            var trxMosaics = trxContent.mosaics;
            var recipient  = trxContent.recipient;
            var trxAmount  = trxContent.amount;
        }

        // now iterate through the found mosaics and check whether
        // this transaction contains evias.pacnem:heart mosaics.
        for (j in trxMosaics) {
            var mosaic = trxMosaics[j];
            var slug   = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

            if (slugToExtract != slug)
                // mosaic filter
                continue;

            // get the quantity, compute with transaction amount field in mosaic transfer
            // transaction, the amount field is in fact a QUANTITY. Whereas the `mosaic.quantity`
            // field represents the AMOUNT of Mosaics in the described Attachment.
            var mosAmount   = parseInt(mosaic.quantity);

             // multiplier field stored in micro XEM in transactions!
            var mosMultiply = trxAmount > 0 ? parseInt(trxAmount / Math.pow(10, divisibility)) : 1;
            var totalMosaic = mosMultiply * mosAmount;

            // found our mosaic in `trxContent`
            return {totalMosaic: totalMosaic, recipient: recipient};
        }

        // didn't find our mosaic in `trxContent`
        return {totalMosaic: 0, recipient: false};
    };
};


module.exports.service = service;
}());
