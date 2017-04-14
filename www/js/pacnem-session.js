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
 * class GameSessions defines a Storage capability
 * for the PacNEM game.
 *
 * Storage is done in window.localStorage (IE >= 10)
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var GameSession = function(API, userName, xemAddress, gameMode)
{
    this.details_ = {
        "username": userName,
        "type": (typeof gameMode == 'undefined' ? "sponsored" : gameMode),
        "xem": xemAddress,
        "score": 0
    };

    this.API_  = API;
    this.model = null;

    this.sync = function()
    {
        var self = this;
        var storage = window.localStorage;

        if (! storage)
            //XXX display error message
            return false;

        var json = storage.getItem("evias.pacnem:player");
        if (json && json.length)
            this.details_ = JSON.parse(json);

        if (this.getAddress().length && this.model == null) {
            // fetch the session data from db, and read blockchain
            // for remaining evias.pacnem:heart mosaics.
            this.API_.getSession(this.details_, function(response)
                {
                    self.model = response.item;
                });
        }

        return this;
    };

    this.store = function()
    {
        var self = this;
        var storage = window.localStorage;

        self.details_.sid = $("#pacNEM-sessionId").val();

        if (! storage)
            //XXX display error message
            return self;
        else
            // save to localStorage
            storage.setItem("evias.pacnem:player", JSON.stringify(self.details_));

        // save to database
        if (self.details_.sid.length) {
            // save now
            self.API_.storeSession(self.details_, function(response)
                {
                    self.model = response.item;
                });
        }
        else {
            // issue db save in 3 seconds because rooms_update event
            // was not emitted yet.
            setTimeout(function()
            {
                self.details_.sid = $("#pacNEM-sessionId").val();
                self.API_.storeSession(self.details_, function(response)
                    {
                        self.model = response.item;
                    });
            }, 3000);
        }

        return self;
    };

    this.clear = function()
    {
        var storage = window.localStorage;
        if (! storage)
            //XXX display error message
            return false;

        storage.clear();
        return this;
    };

    this.identified = function()
    {
        return this.getPlayer().length > 0 && this.getAddress().length > 0;
    };

    this.getPlayer = function()
    {
        if (typeof this.details_.username == 'undefined' || !this.details_.username)
            return "";

        return this.details_.username;
    };

    this.getAddress = function()
    {
        if (typeof this.details_.xem == 'undefined' || !this.details_.xem)
            return "";

        return this.details_.xem;
    };

    this.getSocketId = function()
    {
        return this.API_.getSocket().id;
    };

    this.getGameMode = function()
    {
        if (typeof this.details_.type == 'undefined' || !this.details_.type)
            return "sponsored";

        return this.details_.type;
    };

    var self = this;
    {
        // sessionId available
        if (typeof userName == 'undefined' || ! userName.length
            || typeof xemAddress == 'undefined' || ! xemAddress.length)
            // try to sync from localStorage
            self.sync();
        else
            // userName and Address available, store to localStorage
            // upon object instantiation.
            self.store();
    };
};
