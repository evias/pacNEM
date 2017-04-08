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
var pacnem = function(io)
{
    var socket_ = io;

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
    this.NEMGamer_ = new mongoose.Schema({
        username: String,
        xem: String,
        socketIds: [String],
        lastScore: {type: Number, min: 0},
        highScore: {type: Number, min: 0},
        countGames: {type: Number, min: 0},
        lastRead: {type: Number, min: 0}
    });

    this.pacNEMHeartsCache_ = new mongoose.Schema({
        xem: String,
        countHearts: {type: Number, min: 0},
        heartsTxs: [String]
    });

    this.pacNEMSponsor_ = new mongoose.Schema({
        slug: String,
        name: String,
        xem: String,
        imageUrl: String,
        countGames: {type: Number, min: 0},
        countHearts: {type: Number, min: 0},
        cacheHeartsTxs: [String]
    });

    // Models classes
    this.NEMGamer = mongoose.model("NEMGamer", this.NEMGamer_);
    this.NEMHeart = mongoose.model("NEMHeart", this.pacNEMHeartsCache_);
    this.NEMSponsor = mongoose.model("NEMSponsor", this.pacNEMSponsor_);
};

module.exports.pacnem = pacnem;
module.exports.NEMGamer = pacnem.NEMGamer;
module.exports.NEMHeart = pacnem.NEMGamer;
module.exports.NEMSponsor = pacnem.NEMGamer;
}());

