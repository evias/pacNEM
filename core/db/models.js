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
    var mongoose = require('mongoose');
    var increment = require("mongoose-increment");

    /**
     * class pacnem connects to a mongoDB database
     * either locally or using MONGODB_URI|MONGOLAB_URI env.
     *
     * This class also defines all available data
     * models.
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var pacnem = function(io, chainDataLayer) {
        var socket_ = io;
        var chainDataLayer_ = chainDataLayer;

        /**
         * Prepare the MongoDB database connection used
         * for session data storage and in-game mosaics
         * attributes and storage.
         *
         * Currently using a Sandbox mLab.
         */
        host = process.env['MONGODB_URI'] || process.env['MONGOLAB_URI'] || "mongodb://localhost/pacNEM";
        mongoose.connect(host, function(err, res) {
            if (err)
                console.log("ERROR with PacNEM DB (" + host + "): " + err);
            else
                console.log("PacNEM Database connection is now up with " + host);
        });

        // Schema definition

        this.GameSession_ = new mongoose.Schema({
            addresses: [String],
            checksum: String,
            burnTransactionHash: String,
            countHearts: { type: Number, min: 0 },
            createdAt: { type: Number, min: 0 }
        });

        this.NEMGameCredit_ = new mongoose.Schema({
            xem: String,
            readTransactionIds: [String],
            countHearts: { type: Number, min: 0 },
            countExchangedHearts: { type: Number, min: 0 },
            lastRead: { type: Number, min: 0 }
        });

        this.NEMGameCredit_.methods = {
            getAddress: function() {
                return this.xem.replace(/-/g, "");
            },

            getCountRemaining: function() {
                return this.countHearts;
            }
        };

        this.NEMGamer_ = new mongoose.Schema({
            xem: String,
            usernames: Object,
            socketIds: [String],
            lastScore: { type: Number, min: 0 },
            highScore: { type: Number, min: 0 },
            countGames: { type: Number, min: 0 },
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMGamer_.methods = {
            getAddress: function() {
                return this.xem.replace(/-/g, "");
            },

            credits: function(callback) {
                return this.model("NEMGameCredit").findOne({ xem: this.xem }, callback);
            },

            updateCredits: function(creditObject) {
                var countHearts = null;
                var countExchanged = null;

                if (typeof creditObject.countHearts != 'undefined' && creditObject.countHearts !== false)
                    countHearts = parseInt(creditObject.countHearts); // /!\ Divisibility of evias.pacnem:heart is 0

                if (typeof creditObject.countExchangedHearts != 'undefined' && creditObject.countExchangedHearts > 0)
                    countExchanged = parseInt(creditObject.countExchangedHearts);

                if (typeof creditObject.countPlayedHearts != 'undefined' && creditObject.countPlayedHearts > 0)
                    countHearts = -parseInt(creditObject.countPlayedHearts);

                var address = this.getAddress();
                mongoose.model("NEMGameCredit").findOne({ xem: address }, function(err, credits) {
                    if (!err && credits) {
                        // update NEMGameCredit mode
                        credits.xem = address;

                        if (countHearts !== null) {
                            // set remaining count
                            if (countHearts >= 0) credits.countHearts = countHearts;
                            // or burn credits
                            else credits.countHearts = credits.countHearts - countHearts;
                        }

                        if (countExchanged > -1)
                            credits.countExchangedHearts = countExchanged;

                        credits.lastRead = new Date().valueOf();
                        credits.save();
                    } else if (!credits) {
                        // create NEMGameCredit mode
                        var NEMGameCredit = mongoose.model("NEMGameCredit");
                        var credits = new NEMGameCredit({
                            xem: address,
                            countHearts: (countHearts > -1 ? countHearts : 0),
                            countExchangedHearts: (countExchanged > -1 ? countExchanged : 0),
                            lastRead: new Date().valueOf()
                        });

                        credits.save();
                    }

                    socket_.emit("pacnem_heart_sync", JSON.stringify({ address: credits.xem, credits: credits.countHearts }));
                });
            }
        };

        this.NEMBot_ = new mongoose.Schema({
            slug: String,
            apiUrl: String,
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMGame_ = new mongoose.Schema({
            addresses: Object,
            usernames: Object,
            summaryJSON: String,
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMPaymentChannel_ = new mongoose.Schema({
            payerXEM: String,
            recipientXEM: String,
            socketIds: [String],
            amount: { type: Number, min: 0 },
            amountPaid: { type: Number, min: 0 },
            amountUnconfirmed: { type: Number, min: 0 },
            countHearts: { type: Number, min: 1 },
            hasSentHearts: { type: Boolean, default: false },
            heartsTransactionHash: String,
            message: String,
            status: String,
            isPaid: { type: Boolean, default: false },
            paidAt: { type: Number, min: 0 },
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMPaymentChannel_.methods = {
            getPayer: function() {
                return this.payerXEM.toUpperCase().replace(/-/g, "");
            },
            getRecipient: function() {
                return this.recipientXEM.toUpperCase().replace(/-/g, "");
            },
            getQRData: function() {
                // data for QR code generation
                var invoiceData = {
                    "v": chainDataLayer_.getNetwork().isTest ? 1 : 2,
                    "type": 2,
                    "data": {
                        "addr": this.recipientXEM,
                        "amount": this.amount,
                        "msg": this.number,
                        "name": "PacNEM Game Credits Invoice " + this.number
                    }
                };

                return invoiceData;
            },
            getTruncatedRecipient: function() {
                if (!this.recipientXEM || !this.recipientXEM.length)
                    return "";

                return this.recipientXEM.substr(0, 6) + "..." + this.recipientXEM.substr(-4);
            },
            getTotalIncoming: function() {
                return this.amountPaid + this.amountUnconfirmed;
            }
        };

        // configure invoice auto increment
        this.NEMPaymentChannel_.plugin(increment, {
            modelName: "NEMPaymentChannel",
            fieldName: "number",
            prefix: config.get("pacnem.invoicePrefix")
        });

        this.pacNEMSponsor_ = new mongoose.Schema({
            slug: String,
            email: String,
            xem: String,
            realName: String,
            sponsorName: String,
            description: String,
            content: Object,
            websiteUrl: String,
            advertType: String,
            contentUrl: String,
            isApproved: { type: Boolean, default: false },
            countAdViews: { type: Number, min: 0, default: 0 },
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.pacNEMSponsor_.plugin(increment, {
            modelName: "NEMSponsor",
            fieldName: "reference",
            prefix: config.get("pacnem.sponsorPrefix")
        });

        this.pacNEMPayout_ = new mongoose.Schema({
            reference: String,
            xem: String,
            metaDataPair: Object,
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMReward_ = new mongoose.Schema({
            address: String,
            encryptedMessage: String,
            transactionHash: String,
            rewards: Object,
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMSponsorAdView_ = new mongoose.Schema({
            player: String,
            sponsorRef: String,
            createdAt: { type: Number, min: 0 }
        });

        this.NEMPersonalToken_ = new mongoose.Schema({
            address: String,
            tokenChecksum: String,
            transactionHash: String,
            mosaics: Object,
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.NEMFailedLogins_ = new mongoose.Schema({
            ipAddress: String,
            address: String,
            browserData: String,
            checksum: String,
            createdAt: { type: Number, min: 0 }
        });

        this.PacNEMClientSession_ = new mongoose.Schema({
            ipAddress: String,
            address: String,
            browserData: String,
            checksum: String,
            isExpired: { type: Boolean, default: false },
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        this.PacNEMDailyMosaic_ = new mongoose.Schema({
            daySlug: String,
            mosaics: Object,
            createdAt: { type: Number, min: 0 },
            updatedAt: { type: Number, min: 0 }
        });

        // bind our Models classes
        this.GameSession = mongoose.model("GameSession", this.GameSession_);
        this.NEMGameCredit = mongoose.model("NEMGameCredit", this.NEMGameCredit_);
        this.NEMGamer = mongoose.model("NEMGamer", this.NEMGamer_);
        this.NEMSponsor = mongoose.model("NEMSponsor", this.pacNEMSponsor_);
        this.NEMSponsorAdView = mongoose.model("NEMSponsorAdView", this.NEMSponsorAdView_);
        this.NEMPaymentChannel = mongoose.model("NEMPaymentChannel", this.NEMPaymentChannel_);
        this.NEMBot = mongoose.model("NEMBot", this.NEMBot_);
        this.NEMGame = mongoose.model("NEMGame", this.NEMGame_);
        this.NEMAppsPayout = mongoose.model("NEMAppsPayout", this.pacNEMPayout_);
        this.NEMReward = mongoose.model("NEMReward", this.NEMReward_);
        this.NEMPersonalToken = mongoose.model("NEMPersonalToken", this.NEMPersonalToken_);
        this.NEMFailedLogins = mongoose.model("NEMFailedLogins", this.NEMFailedLogins_);
        this.PacNEMClientSession = mongoose.model("PacNEMClientSession", this.PacNEMClientSession_);
        this.PacNEMDailyMosaic = mongoose.model("PacNEMDailyMosaic", this.PacNEMDailyMosaic_);
    };

    module.exports.pacnem = pacnem;
    module.exports.GameSession = pacnem.GameSession;
    module.exports.NEMGameCredit = pacnem.NEMGameCredit;
    module.exports.NEMGamer = pacnem.NEMGamer;
    module.exports.NEMSponsor = pacnem.NEMSponsor;
    module.exports.NEMSponsorAdView = pacnem.NEMSponsorAdView;
    module.exports.NEMPaymentChannel = pacnem.NEMPaymentChannel;
    module.exports.NEMAppsPayout = pacnem.NEMAppsPayout;
    module.exports.NEMBot = pacnem.NEMBot;
    module.exports.NEMGame = pacnem.NEMGame;
    module.exports.NEMReward = pacnem.NEMReward;
    module.exports.NEMPersonalToken = pacnem.NEMPersonalToken;
    module.exports.NEMFailedLogins = pacnem.NEMFailedLogins;
    module.exports.PacNEMClientSession = pacnem.PacNEMClientSession;
    module.exports.PacNEMDailyMosaic = pacnem.PacNEMDailyMosaic;
}());