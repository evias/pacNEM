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
    var pacNEM_NS_ = (process.env["APP_NAMESPACE"] || config.get("pacnem.namespace"));
    var pacNEM_mosaics = {
        "credits": {
            "heart": { "icon": "glyphicon glyphicon-heart", "label": "label label-success", "slug": [pacNEM_NS_, "heart"].join(":"), "title": "mosaics.label_mosaic_heart", "ns": pacNEM_NS_, "name": "heart" },
            "hearts--": { "icon": "glyphicon glyphicon-heart-empty", "label": "label label-danger", "slug": [pacNEM_NS_, "hearts--"].join(":"), "title": "mosaics.label_mosaic_heart_redeem", "ns": pacNEM_NS_, "name": "hearts--" },
            "personal-token": { "icon": "glyphicon glyphicon-lock", "label": "label label-success", "slug": [pacNEM_NS_, "personal-token"].join(":"), "title": "mosaics.label_mosaic_personal_token", "ns": pacNEM_NS_, "name": "personal-token" }
        },
        "scores": { "cheese": { "icon": "glyphicon glyphicon-globe", "label": "label label-primary", "slug": [pacNEM_NS_, "cheese"].join(":"), "title": "mosaics.label_mosaic_cheese", "ns": pacNEM_NS_, "name": "cheese" } },
        "rewards": {
            "purchases": {
                "beta-player": { "icon": "glyphicon glyphicon-star-empty", "label": "label label-warning", "slug": [pacNEM_NS_, "beta-player"].join(":"), "title": "mosaics.label_mosaic_beta_player", "ns": pacNEM_NS_, "name": "beta-player" },
                "player": { "icon": "glyphicon glyphicon-user", "label": "label label-warning", "slug": [pacNEM_NS_, "player"].join(":"), "title": "mosaics.label_mosaic_player", "ns": pacNEM_NS_, "name": "player" }
            },
            "return_x2": { "n00b": { "icon": "glyphicon glyphicon-refresh", "label": "label label-default", "slug": [pacNEM_NS_, "n00b"].join(":"), "title": "mosaics.label_mosaic_n00b", "ns": pacNEM_NS_, "name": "n00b" } },
            "return_x5": { "nember": { "icon": "glyphicon glyphicon-refresh", "label": "label label-default", "slug": [pacNEM_NS_, "nember"].join(":"), "title": "mosaics.label_mosaic_nember", "ns": pacNEM_NS_, "name": "nember" } },
            "return_x10": { "afficionado": { "icon": "glyphicon glyphicon-refresh", "label": "label label-info", "slug": [pacNEM_NS_, "afficionado"].join(":"), "title": "mosaics.label_mosaic_afficionado", "ns": pacNEM_NS_, "name": "afficionado" } },
            "return_x100": { "great-supporter": { "icon": "glyphicon glyphicon-refresh", "label": "label label-primary", "slug": [pacNEM_NS_, "great-supporter"].join(":"), "title": "mosaics.label_mosaic_great_supporter", "ns": pacNEM_NS_, "name": "great-supporter" } },
            "high_score": {
                "hall-of-famer": { "icon": "glyphicon glyphicon-education", "label": "label label-info", "slug": [pacNEM_NS_, "hall-of-famer"].join(":"), "title": "mosaics.label_mosaic_hall_of_famer", "ns": pacNEM_NS_, "name": "hall-of-famer" },
                "all-time-best-player": { "icon": "glyphicon glyphicon-sunglasses", "label": "label label-success", "slug": [pacNEM_NS_, "all-time-best-player"].join(":"), "title": "mosaics.label_mosaic_all_time_best_player", "ns": pacNEM_NS_, "name": "all-time-best-player" }
            }
        },
        "achievements": {
            "combo_x3": { "multikill": { "minCombo": 3, "icon": "glyphicon glyphicon-fire", "label": "label label-warning", "slug": [pacNEM_NS_, "multikill"].join(":"), "title": "mosaics.label_mosaic_multikill", "ns": pacNEM_NS_, "name": "multikill" } },
            "combo_x5": { "rampage": { "minCombo": 5, "icon": "glyphicon glyphicon-fire", "label": "label label-info", "slug": [pacNEM_NS_, "rampage"].join(":"), "title": "mosaics.label_mosaic_rampage", "ns": pacNEM_NS_, "name": "rampage" } },
            "combo_x7": { "ghostbuster": { "minCombo": 7, "icon": "glyphicon glyphicon-fire", "label": "label label-primary", "slug": [pacNEM_NS_, "ghostbuster"].join(":"), "title": "mosaics.label_mosaic_ghostbuster", "ns": pacNEM_NS_, "name": "ghostbuster" } },
            "combo_x10": { "godlike-101010": { "minCombo": 10, "icon": "glyphicon glyphicon-plane", "label": "label label-success", "slug": [pacNEM_NS_, "godlike-101010"].join(":"), "title": "mosaics.label_mosaic_godlike_101010", "ns": pacNEM_NS_, "name": "godlike-101010" } }
        },
        "sponsors": {
            "daily-ad-view": { "icon": "glyphicon glyphicon-eye-open", "label": "label label-info", "slug": [pacNEM_NS_, "daily-ad-view"].join(":"), "title": "mosaics.label_mosaic_daily_ad_view", "ns": pacNEM_NS_, "name": "daily-ad-view" }
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
            "mosaic": { "id": "hearts--" }
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
    var service = function(io, nemSDK, logger) {
        var socket_ = io;

        // initialize the current running game's blockchain service with
        // the NEM blockchain. This will create the endpoint for the given
        // network and port (testnet, mainnet, mijin) and will then initialize
        // a common object using the configured private key.
        var nem_ = nemSDK;
        var logger_ = logger;

        var isTestMode = config.get("nem.isTestMode");

        var envSuffix = isTestMode ? "_TEST" : "";
        var confSuffix = isTestMode ? "_test" : "";

        // connect to the blockchain with the NEM SDK
        var nemHost = process.env["NEM_HOST" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].host;
        var nemPort = process.env["NEM_PORT" + envSuffix] || config.get("nem.nodes" + confSuffix)[0].port;
        var node_ = nem_.model.objects.create("endpoint")(nemHost, nemPort);

        // following XEM Accounts are used for all blockchain requests.
        // - vendor_ : The Vendor Wallet is the Multi Signature account containing all Mosaics!
        // - pacNEM_ : The Cosignatory Wallet is one of the 2 cosignatories of vendor_ (the public one, not the sign-bot..).
        var vendor_ = (process.env["APP_VENDOR"] || config.get("pacnem.business")).replace(/-/g, "");
        var pacNEM_ = (process.env["APP_PUBLIC"] || config.get("pacnem.application") || config.get("pacnem.business")).replace(/-/g, "");
        var useMultisig_ = config.get("pacnem.useMultisig");

        /**
         * Get the NEM Namespace used for this application.
         *
         * @return string   The namespace + subnamespace(s) joined with a dot (.).
         */
        this.getNamespace = function() {
            return pacNEM_NS_;
        };

        /**
         * Get the Multi Signature Vendor wallet for this application.
         *
         * Must not be multisig, could be simple wallet.
         *
         * @return string
         */
        this.getVendorWallet = function() {
            return vendor_.replace(/-/g, '');
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
        this.getPublicWallet = function() {
            return pacNEM_.replace(/-/g, '');
        };

        /**
         * Utility to get complete configuration of the PacNEM
         * Game Credits Sink Account.
         */
        this.getCreditsSinkData = function() {
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
        this.getCreditsSinkWallet = function() {
            return this.getCreditsSinkData().address.replace(/-/g, '');
        };

        /**
         * This method uses the configuration key `pacnem.useMultisig` and
         * should be used whenever the PacNEM Game initiates transactions
         * to determine whether the transaction must be a Multisignature
         * transaction or not.
         * 
         * @return  {Boolean}
         */
        this.useMultisig = function() {
            return useMultisig_;
        }

        /**
         * Get the NEM-sdk object initialized before.
         * 
         * @link https://github.com/QuantumMechanics/NEM-sdk
         */
        this.getSDK = function() {
            return nem_;
        };

        /**
         * Get the NEM-sdk `endpoint` with which we are connecting
         * to the blockchain.
         */
        this.getEndpoint = function() {
            return node_;
        };

        /**
         * Utility method to retrieve this game's mosaics 
         * configuration. This includes the configuration for 
         * special payouts of rewards and achievements.
         */
        this.getGameMosaicsConfiguration = function() {
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
        this.getPublicWalletSecretKey = function() {
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
        this.getEncryptionSecretKey = function() {
            return config.get("pacnem.secretKey");
        };

        /**
         * Get the Network details. This will return the currently
         * used config for the NEM node (endpoint).
         *
         * @return Object
         */
        this.getNetwork = function() {
            var isTest = config.get("nem.isTestMode");
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

        /**
         * This method checks whether the passed `xem` XEM address
         * is one of the PacNEM game's application wallet.
         * 
         * Application wallets include:
         * - `pacnem.business` config
         * - `pacnem.application` config
         * 
         * @param   {String}    xem
         * @return  {Boolean}
         */
        this.isApplicationWallet = function(xem) {
            var applicationWallets = [
                this.getVendorWallet(),
                this.getPublicWallet()
            ];

            var find = xem.replace(/-/g, '');
            for (var i = 0; i < applicationWallets.length; i++)
                if (find == applicationWallets[i])
                    return true;

            return false;
        };

        /**
         * Get the status of the currently select NEM blockchain node.
         *
         * @return Promise
         */
        this.heartbeat = function() {
            return nem_.com.requests.endpoint.heartbeat(node_);
        };

        /**
         * Read the Transaction Hash from a given TransactionMetaDataPair
         * object (gotten from NEM websockets or API).
         *
         * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
         * @return {string}
         */
        this.getTransactionHash = function(transactionMetaDataPair, inner = false) {
            var meta = transactionMetaDataPair.meta;
            var content = transactionMetaDataPair.transaction;

            var trxHash = meta.hash.data;
            if (inner === true && meta.innerHash.data && meta.innerHash.data.length)
                trxHash = meta.innerHash.data;

            return trxHash;
        };

        /**
         * Read blockchain transaction ID from TransactionMetaDataPair
         *
         * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
         * @return {integer}
         */
        this.getTransactionId = function(transactionMetaDataPair) {
            return transactionMetaDataPair.meta.id;
        };

        /**
         * Read blockchain transaction Message from TransactionMetaDataPair
         *
         * @param  [TransactionMetaDataPair]{@link http://bob.nem.ninja/docs/#transactionMetaDataPair} transactionMetaDataPair
         * @return {string}
         */
        this.getTransactionMessage = function(transactionMetaDataPair, doDecrypt = false) {
            var meta = transactionMetaDataPair.meta;
            var content = transactionMetaDataPair.transaction;

            var trxRealData = content;
            if (content.type == this.getSDK().model.transactionTypes.multisigTransaction) {
                // multisig, message will be in otherTrans
                trxRealData = content.otherTrans;
            }

            if (!trxRealData.message || !trxRealData.message.payload)
            // no message found in transaction
                return "";

            //DEBUG logger_.info("[DEBUG]", "[BLOCKCHAIN]", "Reading following message: " + JSON.stringify(trxRealData.message));

            // decode transaction message and job done
            var payload = trxRealData.message.payload;
            var plain = this.getSDK().utils.convert.hex2a(payload);

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
        this.getTransactionDate = function(transactionMetaDataPair, asNemTime = false) {
            var meta = transactionMetaDataPair.meta;
            var content = transactionMetaDataPair.transaction;

            var nemTime = content.timeStamp;
            var nemEpoch = Date.UTC(2015, 2, 29, 0, 6, 25, 0);

            if (asNemTime === true)
                return nemTime;

            return new Date(nemEpoch + (nemTime * 1000));
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
        this.getTransactionAmount = function(transactionMetaDataPair, mosaicSlug = 'nem:xem', divisibility = 6) {
            var meta = transactionMetaDataPair.meta;
            var content = transactionMetaDataPair.transaction;

            var isMultiSig = content.type === this.getSDK().model.transactionTypes.multisigTransaction;
            var realContent = isMultiSig ? content.otherTrans : content;
            var isMosaic = realContent.mosaics && realContent.mosaics.length > 0;

            var lookupNS = mosaicSlug.replace(/:[^:]+$/, "");
            var lookupMos = mosaicSlug.replace(/^[^:]+:/, "");

            if (isMosaic) {
                // read mosaics to find XEM, `content.amount` is now a multiplier!

                var multiplier = realContent.amount / Math.pow(10, divisibility); // from microXEM to XEM
                for (var i in realContent.mosaics) {
                    var mosaic = realContent.mosaics[i];
                    var isLookupMosaic = mosaic.mosaicId.namespaceId == lookupNS &&
                        mosaic.mosaicId.name == lookupMos;

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
         * Build a mosaic details object to be displayed in the lounge.
         * 
         * The returned object will contain following fields:
         * - label : the bootstrap label classes
         * - icon  : glyphicon classes
         * - title : translation key
         * - slug  : the mosaic fully qualified name (including namespace)
         * - ns    : the mosaic namespace
         * - name  : the mosaic name (without namespace)
         * 
         * @param   {String}    slug    Example: "nem:xem"
         * @return  {Object}
         */
        this.getMosaicDetails = function(slug) {
            var self = this;
            var gameMosaics = self.getGameMosaicsConfiguration();

            var namespace = slug.replace(/:[^:]+$/, "");
            var mosaicName = slug.replace(/^[^:]+:/, "");

            if (namespace != self.getNamespace()) {
                // ALL external mosaics should be displayed similarly
                var config = gameMosaics.hasOwnProperty("external") ? gameMosaics.external : null;

                if (config && config.hasOwnProperty(slug)) {
                    // known external Third Party Token
                    config = config[mosaicName];
                } else {
                    // unknown extern Third Party Token
                    config = {
                        label: "label label-default",
                        icon: "glyphicon glyphicon-question-sign",
                        title: "mosaics.label_mosaic_external",
                        slug: slug,
                        ns: namespace,
                        name: mosaicName
                    };
                }

                return config;
            }

            // maybe found through simple mosaic iteration (scores, credits, sponsors)
            for (var mod in gameMosaics) {
                var currentModule = gameMosaics[mod];

                if (currentModule.hasOwnProperty(mosaicName))
                    return currentModule[mosaicName];
            }

            // maybe found in rewards
            for (var reward in gameMosaics["rewards"]) {
                var currentReward = gameMosaics["rewards"][reward];

                if (currentReward.hasOwnProperty(mosaicName))
                    return currentReward[mosaicName];
            }

            // maybe found in 
            for (var achievement in gameMosaics["achievements"]) {
                var currentAch = gameMosaics["achievements"][achievement];

                if (currentAch.hasOwnProperty(mosaicName))
                    return currentAch[mosaicName];
            }

            // unidentified PacNEM mosaic
            return {
                label: "label label-warning",
                icon: "glyphicon glyphicon-question-sign",
                title: "mosaics.label_mosaic_external",
                slug: slug,
                ns: namespace,
                name: mosaicName
            };
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
        this.extractMosaicFromTransactionData_ = function(trxContent, slugToExtract, divisibility = 6) {
            if (!trxContent || !slugToExtract || !slugToExtract.length)
                return { totalMosaic: 0, recipient: false };

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
                var recipient = trxContent.otherTrans.recipient;
                var trxAmount = trxContent.otherTrans.amount;
            } else {
                // transfer transaction mode
                // here we can simply read the `trxContent.mosaics`, this translates to
                // `res.data[i].transaction.mosaics` from the raw Promise result.

                if (typeof trxContent.mosaics == 'undefined' || !trxContent.mosaics.length)
                // we are interested only in Mosaic Transfer transactions
                    return false;

                var trxMosaics = trxContent.mosaics;
                var recipient = trxContent.recipient;
                var trxAmount = trxContent.amount;
            }

            // now iterate through the found mosaics and check whether
            // this transaction contains evias.pacnem:heart mosaics.
            for (j in trxMosaics) {
                var mosaic = trxMosaics[j];
                var slug = mosaic.mosaicId.namespaceId + ":" + mosaic.mosaicId.name;

                if (slugToExtract != slug)
                // mosaic filter
                    continue;

                // get the quantity, compute with transaction amount field in mosaic transfer
                // transaction, the amount field is in fact a QUANTITY. Whereas the `mosaic.quantity`
                // field represents the AMOUNT of Mosaics in the described Attachment.
                var mosAmount = parseInt(mosaic.quantity);

                // multiplier field stored in micro XEM in transactions!
                var mosMultiply = trxAmount > 0 ? parseInt(trxAmount / Math.pow(10, divisibility)) : 1;
                var totalMosaic = mosMultiply * mosAmount;

                // found our mosaic in `trxContent`
                return { totalMosaic: totalMosaic, recipient: recipient };
            }

            // didn't find our mosaic in `trxContent`
            return { totalMosaic: 0, recipient: false };
        };
    };


    module.exports.service = service;
}());