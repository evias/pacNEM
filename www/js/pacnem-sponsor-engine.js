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

    /**
     * This method reads Sponsor Engine data from the
     * localStorage.
     * 
     * @return  {Object}
     */
    this.read = function() {
        var storage = window.localStorage;
        if (!storage)
        //XXX display frontend error message
            return self;

        try {
            var data = storage.getItem("evias.pacnem:sponsor-engine") || "{}";
            return JSON.parse(data);
        } catch (e) {
            return {};
        }
    };

    /**
     * This method writes Sponsor Engine data to the
     * localStorage.
     * 
     * @return  {SponsorEngine}
     */
    this.write = function(data) {
        var storage = window.localStorage;
        if (!storage)
        //XXX display frontend error message
            return self;

        storage.setItem("evias.pacnem:sponsor-engine", JSON.stringify(data));
        return this;
    };

    /**
     * This method will save an ad view for the given
     * sponsor and player and communicate with
     * the Backend through the `API_` object.
     * 
     * @param   {NEMSponsor}    sponsor Should contain key `slug`
     * @param   {Object}        player  Should contain key `address`
     * @return  {SponsorEngine}
     */
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

        // Backend determines whether the ad view is relevant
        self.store(sponsor, player, function(response) {
            // only write to localStorage if adView was relevant
            if (!response.status == 'ok' || !response.item || !response.item.total)
                return self;

            return self.write(data);
        });
        return self;
    };

    /**
     * This method will communicate with the API to store
     * the given Sponsor Ad View for the given Player.
     * 
     * @param   {NEMSponsor}    sponsor Should contain key `slug`
     * @param   {Object}        player  Should contain key `address`
     * @return  {SponsorEngine}
     */
    this.store = function(sponsor, player, callback) {
        this.API_.storeSponsorAdView(sponsor, player, function(response) {
            if (callback) return callback(response);
        });
        return this;
    };

    var self = this; {
        // nothing to do upon instanciation
    };
};