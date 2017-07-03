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
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 */

/**
 * class SponsorEngines defines a Sponsor Data Storage
 * capability for the PacNEM Game.
 *
 * Storage is done in window.localStorage (IE >= 10)
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var SponsorEngine = function(API) {
    this.API_ = API;

    this.read = function() {
        var storage = window.localStorage;
        if (!storage)
        //XXX display frontend error message
            return self;

        var data = storage.getItem("evias.pacnem:sponsor-engine") || {};
        return data;
    };

    this.write = function(data) {
        var storage = window.localStorage;
        if (!storage)
        //XXX display frontend error message
            return self;

        storage.setItem("evias.pacnem:sponsor", JSON.stringify(data));
        return this;
    }

    this.watched = function(sponsor, player) {
        var self = this;
        var data = self.read();

        if (!sponsor.slug || !sponsor.slug.length)
            return self;

        if (data.hasOwnProperty(sponsor.slug)) {
            data[sponsor.slug].counter++;
        } else {
            data[sponsor.slug] = { counter: 1 };
        }

        self.store(sponsor, player);
        self.write(data);
        return self;
    };

    this.store = function(sponsor, player) {
        this.API_.storeSponsorAdView(sponsor, player);
        return this;
    };

    var self = this; {
        // nothing to do upon instanciation
    };
};