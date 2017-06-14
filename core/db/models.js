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

var config    = require("config");
var mongoose  = require('mongoose');
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
var pacnem = function(io, chainDataLayer)
{
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
    mongoose.connect(host, function(err, res)
        {
            if (err)
                console.log("ERROR with PacNEM DB (" + host + "): " + err);
            else
                console.log("PacNEM Database connection is now up with " + host);
        });

    this.isApplicationWallet = function(xem)
    {
        //XXX should fetch NEMSponsor entries too.

        var applicationWallets = [
            config.get("pacnem.business"),
            config.get("pacnem.application"),
        ];

        for (var i = 0; i < applicationWallets.length; i++)
            if (xem == applicationWallets[i])
                return true;

        return false;
    };

    // Schema definition
    this.NEMGameCredit_ = new mongoose.Schema({
        xem: String,
        readTransactionIds: [String],
        countHearts: {type: Number, min: 0},
        countPlayedHearts: {type: Number, min: 0},
        countExchangedHearts: {type: Number, min: 0},
        lastRead: {type: Number, min: 0}
    });

    this.NEMGameCredit_.methods = {
        getAddress: function()
        {
            return this.xem.replace(/-/g, "");
        },

        getCountRemaining: function()
        {
            return this.countHearts - this.countPlayedHearts;
        }
    };

    this.NEMGamer_ = new mongoose.Schema({
        xem: String,
        username: String,
        socketIds: [String],
        lastScore: {type: Number, min: 0},
        highScore: {type: Number, min: 0},
        countGames: {type: Number, min: 0},
        createdAt: {type: Number, min: 0},
        updatedAt: {type: Number, min: 0}
    });

    this.NEMGamer_.methods = {
        getAddress: function()
        {
            return this.xem.replace(/-/g, "");
        },

        credits: function(callback)
        {
            return this.model("NEMGameCredit").findOne({xem: this.xem}, callback);
        },

        updateCredits: function(creditObject)
        {
            var address = this.getAddress();
            mongoose.model("NEMGameCredit").findOne({xem: address}, function(err, credits)
            {
                if (! err && credits) {
                    // update NEMGameCredit mode
                    credits.xem = address;
                    credits.countHearts = parseInt(creditObject.countHearts); // /!\ Divisibility of evias.pacnem:heart is 0

                    if (typeof creditObject.countExchangedHearts && creditObject.countExchangedHearts > 0)
                        credits.countExchangedHearts = creditObject.countExchangedHearts;

                    credits.lastRead = new Date().valueOf();
                    credits.save();
                }
                else if (! credits) {
                    // create NEMGameCredit mode
                    var NEMGameCredit = mongoose.model("NEMGameCredit");
                    var credits = new NEMGameCredit({
                        xem: address,
                        countHearts: parseInt(creditObject.countHearts),
                        countPlayedHearts: 0,
                        countExchangedHearts: 0,
                        lastRead: new Date().valueOf()
                    });

                    credits.save();
                }

                socket_.emit("pacnem_heart_sync", JSON.stringify({address: credits.xem, credits: credits.countHearts}));
            });
        }
    };

    this.NEMBot_ = new mongoose.Schema({
        slug: String,
        apiUrl: String,
        createdAt: {type: Number, min: 0},
        updatedAt: {type: Number, min: 0}
    });

    this.NEMPaymentChannel_ = new mongoose.Schema({
        payerXEM: String,
        recipientXEM: String,
        socketIds: [String],
        amount: {type: Number, min: 0},
        amountPaid: {type: Number, min: 0},
        amountUnconfirmed: {type: Number, min: 0},
        countHearts: {type: Number, min: 1},
        hasSentHearts: {type: Boolean, default: false},
        heartsTransactionHash: String,
        message: String,
        status: String,
        isPaid: {type: Boolean, default: false},
        paidAt: {type: Number, min: 0},
        createdAt: {type: Number, min: 0},
        updatedAt: {type: Number, min: 0}
    });

    this.NEMPaymentChannel_.methods = {
        getPayer: function()
        {
            return this.payerXEM.toUpperCase().replace(/-/g, "");
        },
        getRecipient: function()
        {
            return this.recipientXEM.toUpperCase().replace(/-/g, "");
        },
        getQRData: function()
        {
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
        getTruncatedRecipient: function()
        {
            if (! this.recipientXEM || ! this.recipientXEM.length)
                return "";

            return this.recipientXEM.substr(0, 6) + "..." + this.recipientXEM.substr(-4);
        },
        getTotalIncoming: function()
        {
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
        realName: String,
        sponsorName: String,
        description: String,
        websiteUrl: String,
        advertType: String,
        contentUrl: String,
        isApproved: {type: Boolean, default: false},
        createdAt: {type: Number, min: 0},
        updatedAt: {type: Number, min: 0}
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
        createdAt: {type: Number, min: 0},
        updatedAt: {type: Number, min: 0}
    });

    this.NEMReward_ = new mongoose.Schema({
        address: String,
        encryptedMessage: String,
        transactionHash: String,
        rewards: Object,
        createdAt: {type: Number, min: 0},
        updatedAt: {type: Number, min: 0}
    });

    // bind our Models classes
    this.NEMGameCredit = mongoose.model("NEMGameCredit", this.NEMGameCredit_);
    this.NEMGamer      = mongoose.model("NEMGamer", this.NEMGamer_);
    this.NEMSponsor    = mongoose.model("NEMSponsor", this.pacNEMSponsor_);
    this.NEMPaymentChannel = mongoose.model("NEMPaymentChannel", this.NEMPaymentChannel_);
    this.NEMBot = mongoose.model("NEMBot", this.NEMBot_);
    this.NEMAppsPayout = mongoose.model("NEMAppsPayout", this.pacNEMPayout_);
    this.NEMReward = mongoose.model("NEMReward", this.NEMReward_);
};

module.exports.pacnem = pacnem;
module.exports.NEMGameCredit = pacnem.NEMGameCredit;
module.exports.NEMGamer      = pacnem.NEMGamer;
module.exports.NEMSponsor    = pacnem.NEMSponsor;
module.exports.NEMPaymentChannel = pacnem.NEMPaymentChannel;
module.exports.NEMAppsPayout = pacnem.NEMAppsPayout;
module.exports.NEMBot = pacnem.NEMBot;
module.exports.NEMReward = pacnem.NEMReward;
}());

