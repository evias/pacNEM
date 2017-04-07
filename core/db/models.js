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
 * @link       https://github.com/dubzzz/js-pacman
 */

(function() {

var mongoose = require('mongoose');

/**
 * class pacnem connects to a mongoDB database
 * either locally or using MONGOLAB_URI env.
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
    var host = process.env['MONGOLAB_URI'] || "mongodb://localhost/pacNEM";
    mongoose.connect(host, function(err, res)
        {
            if (err)
                console.log("ERROR with PacNEM DB (" + host + "): " + err);
            else
                console.log("PacNEM Database connection is now up with " + host);
        });

    // Schema for NEMGamer model
    this.NEMGamer_ = new mongoose.Schema({
        username: String,
        xem: String,
        socketIds: [String],
        lastScore: {type: Number, min: 0},
        highScore: {type: Number, min: 0},
        countGames: {type: Number, min: 0}
    });

    // Model representing NEMGamer
    this.NEMGamer = mongoose.model("NEMGamer", this.NEMGamer_);
};

module.exports.pacnem = pacnem;
module.exports.NEMGamer = pacnem.NEMGamer;
}());

