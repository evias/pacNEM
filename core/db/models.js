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

var mongoose = require('mongoose');

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

    // Schema definition
    this.NEMGameCredit_ = new mongoose.Schema({
        xem: String,
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

                socket_.emit("pacnem_heart_sync", credits.countHearts);
            });
        }
    };

    this.pacNEMSponsor_ = new mongoose.Schema({
        slug: String,
        name: String,
        xem: String,
        description: String,
        imageUrl: String,
        websiteUrl: String
    });

    // bind our Models classes
    this.NEMGameCredit = mongoose.model("NEMGameCredit", this.NEMGameCredit_);
    this.NEMGamer      = mongoose.model("NEMGamer", this.NEMGamer_);
    this.NEMSponsor    = mongoose.model("NEMSponsor", this.pacNEMSponsor_);
};

module.exports.pacnem = pacnem;
module.exports.NEMGameCredit = pacnem.NEMGameCredit;
module.exports.NEMGamer      = pacnem.NEMGamer;
module.exports.NEMSponsor    = pacnem.NEMSponsor;
}());

