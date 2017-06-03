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

var pacNEM_mosaics = {
    "heart": true,
    "beta-player": true,
    "player": true,
    "nember": true,
    "n00b": true,
    "afficionado": true,
    "great-supporter": true,
    "multikill": true,
    "rampage": true,
    "ghostbuster": true,
    "godlike-101010": true
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
     * @return string   The namespace + subnamespace(s) joined with a dot (.).
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
     * @return {[type]} [description]
     */
    this.getPublicWallet = function()
    {
        return pacNEM_;
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
     * @return {[type]} [description]
     */
    this.getSecretKey = function()
    {
        return process.env["APP_SECRET"] || config.get("pacnem.applicationSecret");
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
        var heartsMosaicSlug = pacNEM_NS_ + ":heart";

        // read Mosaics owned by the given address's XEM wallet
        nem_.com.requests.account.mosaics(node_, gamer.getAddress()).then(function(res)
        {
            if (! res.data || ! res.data.length) {
                gamer.updateCredits({countHearts: 0});
                return null;
            }

            logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.mosaics: " + JSON.stringify(res));

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

                    // computing the exact balance of the user (we now know that the user owns hearts.)
                    self.fetchGameCreditsRealHistoryByGamer(gamer, mosaic, null, function(creditsData)
                        {
                            logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Total of " + creditsData.countHearts + " " + heartsMosaicSlug + " found for " + gamer.getAddress());
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
        var heartsMosaicSlug = pacNEM_NS_ + ":heart";

        if (! gameCreditsHistory_.hasOwnProperty(gamer.getAddress())) {
            gameCreditsHistory_[gamer.getAddress()] = {
                countHearts: 0,
                countExchangedHearts: 0,
                trxIdList: []
            };
        }

        // read all transactions of the account and check for the given mosaic to build a
        // blockchain-trust mosaic history.

        nem_.com.requests.account.allTransactions(node_, gamer.getAddress(), null, lastTrxRead)
            .then(function(res)
            {
                //logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Result from NIS API account.allTransactions: " + JSON.stringify(res));

                var transactions = res;

                lastTrxRead = self.saveGameCreditsRealHistoryForGamer(gamer, transactions);

                if (25 == transactions.length) {
                    // recursion..
                    // there may be more transactions in the past (25 transactions
                    // is the limit that the API returns). If we specify a hash it
                    // will start looking for transactions beginning at this hash.
                    self.fetchGameCreditsRealHistoryByGamer(gamer, mosaic, lastTrxRead, callback);
                }
                else if (callback) {
                    // done.
                    callback(gameCreditsHistory_[gamer.getAddress()]);
                }

            }, function(err) {
                // NO Transactions available / wrong Network for address / Unresolved Promise Errors
            });
    };

    this.saveGameCreditsRealHistoryForGamer = function(gamer, transactions)
    {
        var self = this;
        var gamerHistory = gameCreditsHistory_[gamer.getAddress()];
        var heartsMosaicSlug = pacNEM_NS_ + ":heart";

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
            gamerHistory.trxIdList.push(lastTrxHash);

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
        logger_.info("[DEBUG]", "[PACNEM CREDITS]", "Found " + creditsInChunk + " " + heartsMosaicSlug + " in " + transactions.length + " transactions for " + gamer.getAddress());

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
        var gamerXEM  = paymentChannel.getPayer();
        var countHearts = paymentChannel.countHearts;
        var privStore = nem_.model.objects.create("common")("", this.getSecretKey());
        var mosaicDefPair = nem_.model.objects.get("mosaicDefinitionMetaDataPair");
        var hasBetaMosaic = config.get("pacnem.isBeta");

        //DEBUG logger_.info("[NEM] [PAYMENT]", "[DEBUG]",
        //DEBUG            "Now sending " + paymentChannel.countHearts + " hearts for invoice " + paymentChannel.number
        //DEBUG            + " sent to " + paymentChannel.getPayer() + " paid by " + vendor_ + " signed with " + pacNEM_);

        // Create an un-prepared mosaic transfer transaction object (use same object as transfer tansaction)
        var message = paymentChannel.number + " - Thank you! Greg.";
        var transferTransaction = nem_.model.objects.create("transferTransaction")(gamerXEM, 1, message); // Amount 1 is "one time x Mosaic Attachments"
        transferTransaction.isMultisig = true;
        transferTransaction.multisigAccount = {publicKey: config.get("pacnem.businessPublic")};

        var mosaicAttachHearts = nem_.model.objects.create("mosaicAttachment")(pacNEM_NS_, "heart", countHearts);
        var mosaicAttachPlayer  = nem_.model.objects.create("mosaicAttachment")(pacNEM_NS_, "player", 1);
        var mosaicAttachBPlayer = nem_.model.objects.create("mosaicAttachment")(pacNEM_NS_, "beta-player", 1);

        var heartsSlug = nem_.utils.helpers.mosaicIdToName(mosaicAttachHearts.mosaicId);
        var playerSlug = nem_.utils.helpers.mosaicIdToName(mosaicAttachPlayer.mosaicId);
        var bPlayerSlug = nem_.utils.helpers.mosaicIdToName(mosaicAttachBPlayer.mosaicId);

        logger_.info("[NEM] [PAYMENT]", "[DEBUG]", "Using Mosaics: " + heartsSlug + ", " + playerSlug + ", " + bPlayerSlug);

        // always receive evias.pacnem:heart and evias.pacnem:player
        transferTransaction.mosaics.push(mosaicAttachHearts);
        transferTransaction.mosaics.push(mosaicAttachPlayer);

        if (hasBetaMosaic)
            // in beta mode, give evias.pacnem:beta-player too
            transferTransaction.mosaics.push(mosaicAttachBPlayer);

        //DEBUG logger_.info("[NEM] [PAYMENT]", "[DEBUG]", "Reading Mosaic Definitions for namespace: " + pacNEM_NS_);

        // Need mosaic definition of evias.pacnem:heart to calculate adequate fees, so we get it from network.
        nem_.com.requests.namespace
            .mosaicDefinitions(node_, pacNEM_NS_).then(
        function(res) {
            var heartsDef  = nem_.utils.helpers.searchMosaicDefinitionArray(res, ["heart"]);
            var playerDef  = nem_.utils.helpers.searchMosaicDefinitionArray(res, ["player"]);
            var bPlayerDef = nem_.utils.helpers.searchMosaicDefinitionArray(res, ["beta-player"]);

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
                paymentChannel.hasSentHearts = true;
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

    this.getTransactionId = function(transactionMetaDataPair)
    {
        return transactionMetaDataPair.meta.id;
    }

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
    this.extractMosaicFromTransactionData_ = function(trxContent, slugToExtract)
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
                return false;

            // get the quantity, compute with transaction amount field in mosaic transfer
            // transaction, the amount field is in fact a QUANTITY. Whereas the `mosaic.quantity`
            // field represents the AMOUNT of Mosaics in the described Attachment.
            var mosAmount   = parseInt(mosaic.quantity);
            var mosMultiply = trxAmount > 0 ? parseInt(trxAmount / 1000000) : 1; // multiplier field stored in micro XEM in transactions!
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
