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
 * Class GameUI
 *
 * Handling frontend User Interface for open
 * HTTP sessions.
 *
 * This class registers a few Socket Event Listeners
 * which need to trigger updates to the general Game
 * User Interface.
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var GameUI = function(config, socket, controller, $, jQFileTemplate) {
    var config_ = config;
    var socket_ = socket;
    var ctrl_ = controller;
    var jquery_ = $;
    var rooms_ctr_ = undefined;
    var session = undefined;
    var API_ = new GameAPI(config, socket, controller, $, jQFileTemplate);
    var template_ = jQFileTemplate;
    var interval_ = null; // fallback AJAX invoice payment status update listener

    /**
     * Getter for the frontend configuration object.
     *
     * @return  {Object}
     */
    this.getConfig = function() {
        return config_;
    };

    /**
     * Getter for the Socket.IO backend socket.
     *
     * @return  {Object}
     */
    this.getBackendSocket = function() {
        return socket_;
    };

    /**
     * Getter for the frontend Game Controller instance.
     *
     * @return  {GameController}
     */
    this.getController = function() {
        return ctrl_;
    };

    /**
     * Getter for the frontend jQuery wrapper object.
     *
     * @return  {window.jQuery}
     */
    this.getDOMWrapper = function() {
        return jquery_;
    };

    /**
     * Load a jQuery DOM Element by selector
     *
     * @return  {window.jQuery}
     */
    this.getDOM = function(selector) {
        return jquery_(selector);
    };

    /**
     * Getter for the API wrapper (backend PacNEM API).
     *
     * @return  {GameAPI}
     */
    this.getAPI = function() {
        return API_;
    };

    /**
     * Getter for the frontend jQuery File Template 
     * template manager. This object is used to render
     * templates asynchronously.
     *
     * @return  {jQueryFileTemplate}
     */
    this.getTemplateManager = function() {
        return template_;
    };

    /**
     * /!\
     * /!\ This function is called automatically upon instance creation. /!\
     * /!\
     *
     * This method registers Socket Event Listeners on the provided Socket IO
     * connection. Mainly this function will register UI event listeners.
     *
     * Server logic Socket Event Listeners are implement in the NodeJS Server.
     * @see  app.js
     *
     * @return GameUI
     */
    this.init = function() {
        var self = this;

        socket_.on('ready', function(rawdata) {
            self.hideLounge();
            self.displayUserDetails(rawdata);
            ctrl_.serverReady(rawdata);
            self.registerKeyListeners();
            self.displayBoard(rawdata);
        });

        socket_.on('end_of_game', function(rawdata) {
            ctrl_.serverEndOfGame(rawdata);
            self.displayGameSummary(rawdata);
        });

        socket_.on('update', ctrl_.serverUpdate);

        socket_.on('rooms_update', function(rawdata) {
            var data = JSON.parse(rawdata);
            var sid = data['sid'];
            var $rooms = $("#rooms");
            var rooms = data["rooms"];
            var isAuth = $("#username").val().length > 0 && $("#address").val().length > 0;

            $("#pacNEM-sessionId").val(sid);

            // clear UI
            $rooms.empty();

            if (isAuth)
                $("#pacnem-save-trigger").attr("disabled", "disabled");
            else
                $("#pacnem-save-trigger").removeAttr("disabled");

            self.displayRooms($rooms, sid, data);

            //if (! rooms.length)
            // create a new room, no one else online
            //socket_.emit("create_room");
        });

        socket_.on("pacnem_gamer_sync", function(rawdata) {
            var data = JSON.parse(rawdata);
            var player = self.getPlayerDetails();

            if (!player.address || !player.address.length)
                return false;

            if (player.address !== data.address)
            // this update is not for this session
                return false;

            console.log("[DEBUG] " + "Gamer Mosaics: " + rawdata);
        });

        socket_.on("pacnem_heart_sync", function(rawdata) {
            var data = JSON.parse(rawdata);
            var player = self.getPlayerDetails();

            if (!player.address || !player.address.length)
                return false;

            if (player.address !== data.address)
            // this update is not for this session
                return false;

            //DEBUG console.log("[DEBUG] " + "Synchronize Mosaics: " + rawdata);

            var credits = data.credits;

            // we will display the `data` (count of hearts available read from
            // blockchain) in the top bar.
            var $wrap = $("#currentHearts").first();
            var $data = $("#currentHearts-hearts").first();

            $wrap.show();
            self.animateHeartsCounter($data, 0, credits, " Credits");

            if (credits > 0) {
                $("#pacNEM-needs-payment").val("0");
                $(".pacnem-invoice-close-trigger").show();
            } else {
                $("#pacNEM-needs-payment").val("1");
            }

            if (typeof session_ != 'undefined' && session_.details_.hearts != data) {
                session_.details_.hearts = credits;
                session_.storeLocal();
            }
        });

        socket_.on("pacnem_payment_success", function(rawdata) {
            var data = JSON.parse(rawdata);
            var sess = self.getPlayerDetails();

            // close modal
            //var $invoiceBox = $(".pacnem-invoice-modal").first();
            //$invoiceBox.modal("hide");
            $(".pacnem-invoice-close-trigger").show();
        });

        return this;
    };

    /**
     * This method displays the game board and scrolls the window
     * to center the board.
     * 
     * @param   {Object}    rawdata
     * @return GameUI
     */
    this.displayBoard = function(rawdata) {
        $("#game").show();
        $('html, body').animate({
            scrollTop: $("#game").offset().top
        }, 10);

        return this;
    };

    /**
     * Animate a DOM element with an integer counter in it.
     *
     * This method will smoothly count up from `start` to
     * `end`, suffixing the string `string` to the element
     * `$element`.
     *
     * @param  jQuery DOM Object $element [description]
     * @param  integer start    [description]
     * @param  integer end      [description]
     * @param  string suffix   [description]
     * @return GameUI
     */
    this.animateHeartsCounter = function($element, start, end, suffix) {
        start = parseInt(start);
        if (isNaN(start))
            start = 0;

        end = parseInt(end);
        if (isNaN(end))
            end = 0;

        jQuery({ Counter: start }).animate({ Counter: parseInt(end) }, {
            duration: 1000,
            easing: 'swing',
            step: function() {
                $element.text(Math.ceil(this.Counter) + suffix);
            }
        });
    };

    /**
     * Display current Game's Player List (up to 4)
     *
     * @param  {[type]} rawdata
     * @return GameUI
     */
    this.displayUserDetails = function(rawdata) {
        var self = this;
        var $details = $("#pacnem-current-room-wrapper ul.list-group").first();
        var $userRow = $details.find("li.hidden").first();
        var players = ctrl_.getPlayers();

        // interpret data, prepare display
        var data = JSON.parse(rawdata);

        if (players.length)
        // clear players list first
            $details.find(".player-row").remove();

        for (var i = 0; i < players.length; i++) {
            var $row = $userRow.clone().removeClass("hidden").addClass("player-row");
            var color = PACMAN_COLORS[i % PACMAN_COLORS.length];

            // hex to rgb
            var hex = color.replace(/#/, '');
            var rgb = [
                parseInt(hex.substring(0, hex.length / 3), 16),
                parseInt(hex.substring(hex.length / 3, 2 * hex.length / 3), 16),
                parseInt(hex.substring(2 * hex.length / 3, 3 * hex.length / 3), 16)
            ];

            // set player name and add to DOM
            $row.find(".player").first().text(players[i]);
            $row.find(".list-group-item-heading").first().css("background-color", "rgba(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ", 0.4)");
            $row.find(".glyphicon").first().css("color", color);

            $row.appendTo($details);
        }

        $("#pacnem-game-wrapper").show();
        return this;
    };

    /**
     * Display a modal box containing data about the
     * finished game. `rawdata` must contain a 
     * `pacmans` with `score` fields.
     * 
     * @param  {string} rawdata
     * @return void
     */
    this.displayGameSummary = function(rawdata) {
        var self = this;
        var data = JSON.parse(rawdata);

        if ($(".pacnem-summary-modal").length) {
            // need refresh of summary modal.
            $(".pacnem-summary-modal").remove();
        }

        // score compare function for fast sorting
        var scrcmp = function(a, b) {
            if (a.score < b.score) return -1;
            if (a.score > b.score) return 1;

            return 0;
        };

        // sort by descending score to have high score ranking
        data.pacmans.sort(scrcmp).reverse();
        data.winnerName = data.pacmans[0].username;
        data.isWinner = self.getPlayerDetails().username == data.winnerName;
        data.isLoser = !data.isWinner;

        var rand = Math.floor(Math.random() * 5 + 1);
        var key = data.isWinner ? "winner" : "loser";
        data.yodaQuote = "summary." + key + "_yoda_quote_" + rand;

        template_.render("summary-box", function(compileWith) {
            // add server side generated summary HTML to a modal
            // boxes wrapper.
            var html = $("#pacnem-modal-wrapper").html();
            $("#pacnem-modal-wrapper").html(html + compileWith(data));

            $(".pacnem-summary-modal").first().modal({
                backdrop: "static",
                keyboard: false,
                show: true
            });

            $(".pacnem-summary-close-trigger").off("click");
            $(".pacnem-summary-close-trigger").on("click", function() {
                $("#pacnem-game-wrapper").hide();
                self.displayLounge();
                $(".pacnem-summary-modal").modal("hide");
                return false;
            });
        });
    };

    /**
     * helper for displaying Create Room button
     * @return GameUI
     */
    this.displayCreateRoom = function() {
        var $button = $(".roomCreateNew").first();
        $button.removeClass("hidden");

        return this;
    };

    /**
     * helper for hiding Create Room button
     * @return GameUI
     */
    this.hideCreateRoom = function() {
        var $button = $(".roomCreateNew").first();
        $button.addClass("hidden");

        return this;
    };

    /**
     * helper for displaying Create Room button
     *
     * @return {[type]} [description]
     */
    this.enableCreateRoom = function() {
        var self = this;
        var $button = $(".roomCreateNew").first();

        $button.removeAttr("disabled").removeClass("disabled");
        $button.off("click");
        $button.on("click", function() {
            var player = self.getPlayerDetails();
            socket_.emit("create_room", JSON.stringify(player));
            return false;
        });

        return this;
    };

    /**
     * helper for hiding Create Room button
     *
     * @return {[type]} [description]
     */
    this.disableCreateRoom = function() {
        var $button = $(".roomCreateNew").first();

        if (!$button)
            return this;

        $button.attr("disabled", "disabled").addClass("disabled");
        $button.off("click");
        return this;
    };

    /**
     * Display all available Game Rooms
     *
     * @param  {[type]} $rooms
     * @param  {[type]} sid
     * @param  {[type]} data
     * @return integer  Count of available rooms
     */
    this.displayRooms = function($rooms, sid, data) {
        var self = this;

        if (!data["rooms"].length) {
            self.displayCreateRoom();
            self.enableCreateRoom();
            return 0;
        }

        var playerInRoom = false;
        for (var i = 0; i < data["rooms"].length; i++) {
            var inThisRoom = self.displayRoom(i + 1, $rooms, sid, data["rooms"][i], data["users"], data["addresses"]);

            if (inThisRoom && !ctrl_.isRoomMembershipAcknowledged(data["rooms"][i]["id"]))
                ctrl_.ackRoomMember(data["rooms"][i]["id"]);

            playerInRoom |= inThisRoom;
        }

        self.displayCreateRoom();

        if (!playerInRoom)
            self.enableCreateRoom();

        return data["rooms"].length;
    };

    /**
     * Utility method to enable a Room Action Button.
     *
     * @param  object  rooms
     * @param  jQuery   $button
     * @param  function callback
     * @param  integer   delay
     * @return GameUI
     */
    this.displayRoomAction = function(rooms, $button, callback, delay) {
        if (typeof delay != 'undefined' && !isNaN(parseInt(delay)))
            $button.find(".seconds-counter").text(delay);

        $button.click(function() {
            callback($(this), rooms);
            return false;
        });

        $button.removeClass("hidden");
        return this;
    };

    /**
     * Display a single room and its Players.
     *
     * According to the Room's data Status field, the action
     * buttons will be enabled.
     *
     * @param  integer roomIndex
     * @param  jQuery $rooms
     * @param  string sid
     * @param  object roomdata
     * @param  object usersdata
     * @return boolean  Whether current Player is Member of the
     *                  displayed room or not
     */
    this.displayRoom = function(roomIndex, $rooms, sid, roomdata, usersdata, xemdata) {
        var self = this;

        var is_member = $.inArray(sid, roomdata['users']) != -1;
        var template = $("#room-template").html();
        var $rooms = $("#rooms");
        var $thisRoom = $("<div/>").html(template);

        $thisRoom.addClass("hidden").appendTo($rooms);

        // now `thisRoom` will contain the actual "lounge"
        $thisRoom = $rooms.find(".pacnem-lounge").last();

        // set the title index (Pacnem #1, Pacnem #2..)
        // and randomly select a color from the NEM colors
        var $title = $thisRoom.find(".lounge-title");
        $title.find(".room-enum").first().text(roomIndex);

        var randIdx = Math.floor(Math.random() * (99 - 1 + 1) + 1);
        var titleCol = "colNEMGreen";
        if (randIdx % 3 == 0)
            titleCol = "colNEMOrange";
        else if (randIdx % 5 == 0)
            titleCol = "colNEMBlue";

        if (titleCol != "colNEMGreen")
            $title.removeClass("colNEMGreen")
            .addClass(titleCol);

        var $members = $thisRoom.find(".room-members-wrapper ul");
        var $memberRow = $thisRoom.find(".room-members-wrapper ul li.hidden").first();

        // players array will now be filled with current room's users
        players = [];

        // now create the members entries for this room
        for (var i = 0; i < roomdata['users'].length; i++) {
            var socketId = roomdata['users'][i];
            var user = usersdata[socketId] ? usersdata[socketId] : socketId;
            var xem = xemdata[socketId];

            $currentRow = $memberRow.clone()
                .removeClass("hidden")
                .appendTo($members);

            $currentRow.find(".socket-id").first().text(socketId);
            $currentRow.find(".member-name").first().text(user);
            $currentRow.find(".member-address").first().text(xem);

            players.push(user);
        }

        if (players.length)
            ctrl_.setPlayers(players);

        self.configureRoomActions($thisRoom, roomdata);

        $thisRoom.parent().removeClass("hidden");
        return is_member;
    };

    /**
     * Configure Action Buttons for the given `room` object.
     *
     * Mandatory fields for the room object are "status"
     * and "is_full".
     *
     * @param  jQuery $domRoom
     * @param  object room
     * @return GameUI
     */
    this.configureRoomActions = function($domRoom, room) {
        var self = this;
        var is_member = $.inArray(socket_.id, room['users']) != -1;

        // define which buttons must be active
        if (is_member) {
            if (room["status"] == "join") {
                var $button = $domRoom.find(".roomActionPlay").first();
                self.displayRoomAction(room, $button, function($btn, room) {
                    socket_.emit("run_game");
                });
            } else if (room["status"] == "wait") {
                var $button = $domRoom.find(".roomActionCancel").first();

                self.displayRoomAction(room, $button, function($btn, room) {
                    socket_.emit("cancel_game");
                }, Math.round(room["wait"]));
            }

            // leave button always if member of room
            var $button = $domRoom.find(".roomActionLeave").first();
            self.displayRoomAction(room, $button, function($btn, room) {
                socket_.emit("leave_room");
                socket_.emit("notify");
                $(".roomActionJoin").removeAttr("disabled")
                    .removeClass("btn-default")
                    .addClass("btn-primary");

                self.enableCreateRoom();
            });

            // Members of Room must first Leave a Room before they can
            // Join another Room.
            $(".roomActionJoin").attr("disabled", "disabled")
                .removeClass("btn-primary")
                .addClass("btn-default");

            // also disable room creation (needs leave first)
            self.disableCreateRoom();
        } else if (room["status"] == "join") {
            var $button = $domRoom.find(".roomActionJoin").first();

            if (room["is_full"])
                $button.prop("disabled", true);
            else {
                self.displayRoomAction(room, $button, function($btn, room) {
                    var player = self.getPlayerDetails();
                    socket_.emit("join_room", JSON.stringify({
                        "room_id": room["id"],
                        "details": player
                    }));
                    self.disableCreateRoom();
                });
            }

            self.enableCreateRoom();
        }

        return this;
    }

    /**
     * Get a User Details dictionary built from the
     * user details form.
     *
     * @param  GameSession session
     * @return Object
     */
    this.getPlayerDetails = function(session) {
        var username = $("#username").val();
        var address = $("#address").val();

        if (!username.length && session && session.getPlayer().length)
            username = session.getPlayer();

        if (!address.length && session && session.getAddress().length)
            address = session.getAddress();

        if (!username.length || !address.length) {
            // createSession not possible, either user name or XEM
            // address could not be retrieved.
            return { "username": "", "address": "" };
        }

        return { "username": username, "address": address.replace(/-/g, '') };
    };

    /**
     * Synchronize form input with Session content.
     *
     * @param  GameSession session
     * @return GameUI
     */
    this.updateUserFormWithSession = function(session) {
        var username = $("#username").val();
        var address = $("#address").val();

        if (!username.length) {
            $("#username").val(session.getPlayer());
            username = session.getPlayer();
        }

        if (!address.length) {
            $("#address").val(session.getAddress());
            address = session.getAddress();
        }

        return this;
    };

    /**
     * Send the entered username to the Socket IO room manager.
     *
     * @return GameUI
     */
    this.createSession = function(session) {
        var self = this;
        var details = this.getPlayerDetails();

        if (typeof session != 'undefined')
        // use saved session
            session_ = session;
        else
        // save the game session details
            session_ = new GameSession(API_, details.username, details.address, ctrl_.getPlayMode());

        ctrl_.setSession(session_);

        if (ctrl_.isPlayMode("sponsored") && !ctrl_.isAdvertised()) {
            // this is a page reload! show the Sponsor modal box because
            // advertising has not been done for this socket id!

            ctrl_.setAdvertised(true);

            // set sponsored UI with "autoSwitch" enabled
            self.setSponsoredUI(true, function(ui, sponsor) {
                // now display the advertisement
                ui.displaySponsorAdvertisement(sponsor, function(ui) {
                    // and finally, emit the session creation
                    socket_.emit('change_username', JSON.stringify(details));
                    socket_.emit("notify");
                });
            });

            return false;
        } else if (ctrl_.isPlayMode("pay-per-play")) {
            // User needs Auth Code to authenticate
            self.authenticatePlayer(session_, function(response) {
                //DEBUG console.log("[DEBUG] " + "Player authenticated with checksum: " + response.item);

                // we can safely emit the session creation, this user is
                // either a pay-per-play or share-per-play (not yet implemented)
                socket_.emit('change_username', JSON.stringify(details));
                socket_.emit("notify");

                if ($(".pacnem-player-authenticate-modal").length) {
                    $(".pacnem-player-authenticate-modal").first().modal("hide");
                }
            }, function(response) {

                //DEBUG console.log("[DEBUG] " + "Authentication Failed - Response Code: " + response.code);

                if (response.code === 4) {
                    // E_CLIENT_BLOCKED
                    self.resetSession(false, true);
                    return false;
                }

                var $token = $("#player-authenticate-token");
                var $addon = $token.siblings(".input-group-addon").first();

                $token.addClass("form-error");
                $addon.addClass("form-error");

                $token.off("focus");
                $token.on("focus", function() {
                    $token.removeClass("form-error");
                    $addon.removeClass("form-error");
                });
            });
        }

        // return whether an invoice is needed or not
        return !session_.details_.hearts;
    };

    /**
     * This function will open a modal box for the Player to authenticate.
     * 
     * The authentication code has been sent on the blockchain *the first time
     * the user has paid for credits*. He should have received a Transaction
     * with *pacnem:personal-token* Mosaic containing a Message which is the 
     * said *Personal Token*.
     * 
     * @param   {GameSession}   session
     * @param   {Function}      onSuccess   Executed on authentication success
     * @param   {Function}      onFailure   Executed on authentication failure
     * @return  {GameUI}
     */
    this.authenticatePlayer = function(session, onSuccess, onFailure) {

        /**
         * Function used to initialize DOM button event listeners when
         * the modal box is displayed.
         * 
         * @param   {GameUI}    ui
         * @param   {Function}  success
         * @param   {Function}  fail
         * @return  void
         */
        var registerAuthFormListeners = function(ui, success, fail) {
            $("#pacnem-player-authenticate-trigger").off("click");
            $("#pacnem-player-authenticate-trigger").on("click", function() {

                var $token = $("#player-authenticate-token");
                var $addon = $token.siblings(".input-group-addon").first();

                $token.removeClass("form-error");
                $addon.removeClass("form-error");

                var credentials = $("#player-authenticate-token").val();
                API_.verifyPlayerIdentity(ui.getPlayerDetails(), credentials, function(response) {
                    if (!response.code || response.code >= 2) {
                        return fail(response);
                    }

                    return success(response);
                });

                return false;
            });

            $("#pacnem-player-authenticate-cancel-trigger").off("click");
            $("#pacnem-player-authenticate-cancel-trigger").on("click", function() {
                ui.resetSession(true);
                return false;
            });
        };

        var self = this;

        // display modal box informing about Session Expire
        // the modal box contains a seconds counter on the close 
        // trigger button.
        var fmtAddress = session.getAddress();
        template_.render(fmtAddress + "/player-authenticate", function(compileWith) {

            var authFormData = {
                playerAddr: session.details_.xem,
                currentNetwork: { label: $("#currentBlockchain-network").text() }
            };

            // add modal box HTML
            var html = $("#pacnem-modal-wrapper").html();
            $("#pacnem-modal-wrapper").html(html + compileWith(authFormData));

            //console.log("[DEBUG] [UI] " + "Now displaying player-authenticate modal");

            var isAuth = !$(".pacnem-player-authenticate-modal").length;
            if (isAuth) {
                var checksum = $("#pacnem-session-checksum").text();
                return onSuccess({ item: checksum });
            }

            // display authenticate form modal box
            if ($(".pacnem-invoice-modal").length) {
                $(".pacnem-invoice-modal").first().modal("hide");
                $(".modal-backdrop").first().remove();
                $(".pacnem-invoice-modal").first().remove();
            }

            $(".pacnem-player-authenticate-modal").first().modal({
                backdrop: "static",
                keyboard: false,
                show: true
            });

            registerAuthFormListeners(self, onSuccess, onFailure);
        });

        return self;
    };

    /**
     * Display the UI as it should be for logged in users.
     *
     * This method will fail if the pre-requirements do not
     * match when it is called.
     *
     * @return GameUI
     */
    this.displayPlayerUI = function() {
        // top navigation bar update
        $("#currentUser-username").html("&nbsp;" + $("#username").val());
        $("#currentUser").fadeIn("slow");
        $("#pacnem-purge-trigger").parent().show();

        // auth process effect (form disappears, rooms displayed)
        $(".hide-on-auth").hide();
        $(".show-on-auth").show();
        $("#pacnem-current-player-details .panel").first().removeClass("panel-info");
        $("#spread-the-word").addClass("mt10");

        // form must now be disabled
        $("#username").parents(".input-group").first().parent().addClass("col-md-offset-1");
        $("#username").prop("disabled", true);
        $("#address").prop("disabled", true);

        // blockchain query uses Promises and is sent with
        // socket io "pacnem_heart_sync" event
        $("#currentHearts").fadeIn("slow");

        return this;
    };

    /**
     * This method will reset the current session in the browser
     * and bring back the user to the welcome screen.
     * 
     * @return {GameUI}
     */
    this.resetSession = function(forceNow, isBlocked) {
        //console.log("[DEBUG] [UI] " + "Now loading session-expire modal");

        forceNow = typeof forceNow == 'undefined' ? false : forceNow;
        isBlocked = typeof isBlocked == 'undefined' ? false : isBlocked;

        if (forceNow === true) {
            session_.clear();
            window.location.href = "/";
            return self;
        }

        var tpl = isBlocked === true ? "session-blocked" : "session-expire";

        // display modal box informing about Session Expire
        // the modal box contains a seconds counter on the close 
        // trigger button.
        template_.render(tpl, function(compileWith) {

            // add modal box HTML
            var html = $("#pacnem-modal-wrapper").html();
            $("#pacnem-modal-wrapper").html(html + compileWith({}));

            //console.log("[DEBUG] [UI] " + "Now displaying session-expire modal");

            // we don't want the sponsor modal now and will expire the session.
            $(".pacnem-sponsor-modal").first().remove();
            $(".pacnem-player-authenticate-modal").first().remove();
            $(".pacnem-session-expire-modal").first().modal({
                backdrop: "static",
                keyboard: false,
                show: true
            });

            // Counter is displayed for 10 seconds. 
            // This function is run at an interval of 1 seconds.
            var updateCounter = function() {
                var secs = parseInt($("#pacnem-session-expire-close-trigger .seconds").first().text());
                var n = secs - 1;
                if (n < 0) n = 0;

                $("#pacnem-session-expire-close-trigger .seconds").first().text("" + n);
                $("#pacnem-session-expire-close-trigger").attr("data-remaining", n);
            };

            var closeModalAndRedirect = function(i) {
                session_.clear();
                window.location.href = "/";
            };

            // start counting 
            updateCounter();
            var i = setInterval(updateCounter, 1000);

            // close modal box
            setTimeout(function() { closeModalAndRedirect(i); }, 10000);
        });

        return self;
    };

    /**
     * Use the API to get a [not-so-] random Sponsor Wallet
     * and lock the XEM Address input field to that Sponsor's
     * Sub-Wallet.
     *
     * @return {GameUI}
     */
    this.setSponsoredUI = function(autoSwitch, callback) {
        var self = this;

        // details may contain Sponsor Address
        var details = self.getPlayerDetails();

        // when the current session has a total of 6 ad views
        // for a given sponsor - it will be reset to the home screen
        API_.getRandomSponsor(details, function(data) {
            var sponsor = data.sponsor;
            var content = data.content;

            //console.log("[DEBUG] " + "getRandomSponsor: " + JSON.stringify(data));

            if (autoSwitch === true) {
                var engine = new SponsorEngine(API_);
                var spData = engine.read();

                if (!spData[sponsor.slug] || !spData[sponsor.slug].counter) {
                    // invalid localStorage data
                    return self.resetSession();
                } else if (spData[sponsor.slug].counter % 6 === 0) {
                    // reset the session every 6 ad views
                    return self.resetSession();
                }
            }

            // got a sponsor, now we'll have a valid address input for sure.
            $(".error-input").removeClass("error-input");
            $(".error-block").hide();
            $(".error-block .error").text("");

            $("#address").val(sponsor.xem);
            $("#address").prop("disabled", true);
            $("#address").attr("data-sponsor", "1");

            //XXX sponsored mode should hide or obfuscate sponsored wallet address

            $("#username").attr("data-sponsor", sponsor.slug);

            ctrl_.setSponsor(sponsor);
            self.prepareSponsoredJoin(data, function(ui) { callback(ui, data.sponsor); });
        });

        return self;
    };

    /**
     * Unset the settings for the sponsored UI.
     *
     * This allows the user to enter an address and
     * username again (username content not touched).
     *
     * @return GameUI
     */
    this.unsetSponsoredUI = function() {
        $("#address").val("");
        $("#address").prop("disabled", false);
        $("#address").attr("data-sponsor", "0");
        $("#username").attr("data-sponsor", "");

        return this;
    };

    /**
     * Fetch the asynchronous template content for
     * the randomly selected `sponsor`.
     *
     * This will load the HTML for the advertisement
     * modal box of the given `sponsor`.
     *
     * The modal box is not opened here.
     *
     * @param  NEMSponsor sponsor
     * @return GameUI
     */
    this.prepareSponsoredJoin = function(data, callback) {
        var self = this;
        var sponsor = data.sponsor;

        if ($(".pacnem-sponsor-modal[data-sponsor='" + sponsor.slug + "']").length)
        // sponsor window already available
            return this;

        template_.render("sponsor-box", function(compileWith) {
            // add server side generated sponsor HTML to a modal
            // boxes wrapper.
            var html = $("#pacnem-modal-wrapper").html();
            $("#pacnem-modal-wrapper").html(html + compileWith(data));

            if (callback)
                callback(self);
        });

        return this;
    };

    /**
     * Open the Advertisement modal box and execute
     * `callback` when the delay is over.
     *
     * @param  Function callback
     * @return GameUI
     */
    this.displaySponsorAdvertisement = function(sponsor, callback) {
        $(".pacnem-sponsor-modal").first().modal({
            backdrop: "static",
            keyboard: false,
            show: true
        });

        var self = this;
        var start = new Date().getTime();
        var engine = new SponsorEngine(API_);
        var player = self.getPlayerDetails();

        var updateCounter = function() {
            var secs = parseInt($("#pacnem-sponsor-close-trigger .seconds").first().text());
            var n = secs - 1;

            if (n < 0)
                n = 0;

            $("#pacnem-sponsor-close-trigger .seconds").first().text("" + n);
            $("#pacnem-sponsor-close-trigger").attr("data-remaining", n);
        };

        var closeSponsor = function(i) {
            clearInterval(i);
            $(".pacnem-sponsor-modal").first().modal("hide");
            $("#pacnem-sponsor-close-trigger").removeAttr("data-remaining");
            engine.watched(sponsor, player);
            callback(self);
        };

        updateCounter();
        var i = setInterval(updateCounter, 1000);
        setTimeout(function() { closeSponsor(i); }, 10000);

        return this;
    };

    /**
     * Fetch the asynchronous template content for
     * the invoice. This payment is to receive
     * evias.pacnem:heart mosaic.
     *
     * The modal box is not opened here.
     *
     * @param  NEMSponsor sponsor
     * @return GameUI
     */
    this.prepareInvoiceBox = function(callback) {
        var self = this;

        if ($(".pacnem-invoice-modal").length)
        // always create a new invoice
            $(".pacnem-invoice-modal").remove();

        template_.render("invoice-box", function(compileWith) {
            // i know.. come on, just using nem :D
            var rBytes = ctrl_.nem().crypto.nacl.randomBytes(8);
            var seed = ctrl_.nem().crypto.nacl.randomBytes(4);

            var unsafe = ctrl_.nem().utils.convert.ua2hex(rBytes);
            var seed = ctrl_.nem().utils.convert.ua2hex(seed);

            var token = unsafe + seed;
            var prefix = "pacnem-invoice-" + token.substr(0, 6);

            // add server side generated invoice HTML to a modal
            // boxes wrapper.
            var html = $("#pacnem-modal-wrapper").html();
            $("#pacnem-modal-wrapper").html(html + compileWith({
                invoicePrefix: prefix,
                token_: token
            }));

            if (callback)
                callback(self);
        });

        return this;
    };

    /**
     * Open the Invoice modal box for the user to Pay
     * per Play. This invoice will ask the user to pay
     * to a given address with a displayed Message and
     * an amount computed using the current Network Fees.
     * 
     * This method defines a Websocket Subscription for 
     * the NEMBot as well as an AJAX fallback checking for
     * updates on the Payment without websockets (HTTP only).
     *
     * @param  Function callback
     * @return GameUI
     */
    this.watchInvoice = function(callback) {
        var self = this;

        /**
         * This method will process the JSON or Object passed as a 
         * Payment Update data object. This object should contain 
         * at least the `status` field with a set value.
         * 
         * This method is responsible for updating the DOM elements
         * of the invoice for visual feedback.
         * 
         * @param {string|object} rawData 
         */
        var processPaymentData_ = function(ui, rawData) {
            var data = null;
            if (typeof rawData == 'object') {
                data = rawData;
            } else if (typeof rawData == 'string') {
                data = JSON.parse(rawData);
            }
            //DEBUG else {
            //DEBUG    console.log("[DEBUG] " + "processPaymentData_ with: ", rawData, " with typeof: " + typeof rawData);
            //DEBUG }

            //DEBUG console.log("[DEBUG] " + "processing payment status data: ", data);

            if (!data)
                return false;

            var amountPaid = typeof data.paymentData != 'undefined' ? data.paymentData.amountPaid : data.amountPaid;
            var amountUnconfirmed = typeof data.paymentData != 'undefined' ? data.paymentData.amountUnconfirmed : data.amountUnconfirmed;
            var newStatus = typeof data.paymentData != 'undefined' ? data.paymentData.status : data.status;

            var statusClass = typeof data.paymentData != 'undefined' ? data.paymentData.statusLabelClass : data.statusLabelClass;
            var statusIcon = typeof data.paymentData != 'undefined' ? data.paymentData.statusLabelIcon : data.statusLabelIcon;

            var prefix = $("#pacnem-invoice-prefix").val();
            var $status = $("#" + prefix + "-status");
            var $paid = $("#" + prefix + "-amountPaid .amount");
            var $unconfirmed = $("#" + prefix + "-amountUnconfirmed .amount");

            $status.html("<span class='" + statusIcon + "'></span> <span>" + newStatus + "</span>")
                .removeClass("label-default")
                .removeClass("label-success")
                .removeClass("label-info")
                .removeClass("label-bigger")
                .removeClass("label")
                .addClass("label")
                .addClass(statusClass)
                .addClass("label-bigger");

            if (amountPaid) {
                $paid.text(amountPaid / 1000000);
                $paid.parents(".wrap-amount").first().show();
            } else
                $paid.parents(".wrap-amount").first().hide();

            if (amountUnconfirmed) {
                $unconfirmed.text(amountUnconfirmed / 1000000);
                $unconfirmed.parents(".wrap-amount").first().show();
            } else
                $unconfirmed.parents(".wrap-amount").first().hide();

            if (newStatus == "paid") {
                $(".pacnem-invoice-close-trigger").show();

                var $invoiceBox = $(".pacnem-invoice-modal").first();

                if (callback)
                    return callback(ui, true);
            }
        };

        /**
         * This function will be used when the modal box for the Invoice
         * can be closed. (Payment has been identified and confirmed)
         */
        var closeableInvoiceModalBox = function(ui, callback) {
            $(".pacnem-invoice-close-trigger").show();
            $(".pacnem-invoice-close-trigger").off("click");
            $(".pacnem-invoice-close-trigger").on("click", function() {
                $(".pacnem-invoice-modal").modal("hide");
                callback(ui);
                return false;
            });
        };

        /**
         * This method defines an AJAX fallback for when the websocket
         * does not catch a payment update.
         * 
         * When the NEMBot is deployed on a VPS, this will not be used
         * very often but using Heroku, the NEMBot goes to sleep and
         * needs to be waken up with this AJAX fallback that will also
         * check for payment updates that the sleeping bot will have 
         * missed.
         * 
         * @param {GameUI} ui 
         */
        var registerStatusHttpFallback = function(ui, seconds) {

            seconds = typeof seconds == 'undefined' ? 120 : seconds;

            // the `fn_getState` function will issue an API request 
            // to retrieve the current invoice status and will process 
            // the data using the previously implemented `processPaymentData_` 
            // helper. This function is also used in intervals.
            var fn_getState = function(subCallback) {
                var player = self.getPlayerDetails();
                var prefix = $("#pacnem-invoice-prefix").val();
                var number = $("#" + prefix + "-message").text().trim();
                var status = $("#" + prefix + "-status").text().trim();

                if (status == 'paid') {
                    // make invoice closeable in case the invoice is stated Paid
                    // and stop http fallback requests
                    clearInterval(interval_);
                    closeableInvoiceModalBox(self, callback);

                    if (subCallback)
                        return subCallback();
                    return false;
                }

                API_.checkInvoiceStatus(player, socket_.id, number, function(paymentUpdateData) {
                    //DEBUG console.log("[DEBUG] " + "Invoice State API JSON: '" + JSON.stringify(paymentUpdateData) + "' untouched: ", paymentUpdateData);

                    if (paymentUpdateData) {
                        var done = { "paid": true, "overpaid": true };
                        if (paymentUpdateData.status && done.hasOwnProperty(paymentUpdateData.status)) {
                            // make invoice closeable in case the invoice is stated Paid
                            // and stop http fallback requests
                            clearInterval(interval_);
                            closeableInvoiceModalBox(self, callback);
                        }

                        processPaymentData_(self, paymentUpdateData);
                    }

                    if (subCallback)
                        return subCallback();
                });
            };

            // configure INTERVAL to run every X seconds..
            interval_ = setInterval(fn_getState, seconds * 1000);

            // also run the interval *now* in case websocket subscription does not work
            fn_getState();

            // when the invoice is closed, the ajax fallback should
            // be turned off.
            $invoiceBox.on("shown.bs.hidden", function() {
                clearInterval(interval_);
            });

            // after 5 minutes without updates, check only all 3 minutes minute
            setInterval(function() {
                var prefix = $("#pacnem-invoice-prefix").val();
                var status = $("#" + prefix + "-status").text().trim();
                var done = { "paid": true, "overpaid": true };

                clearInterval(interval_);
                if (!done.hasOwnProperty(status)) {
                    // now every 3 minutes we will check for an update of the invoice
                    registerStatusHttpFallback(ui, 180);
                }
            }, 5 * 60 * 1000);

            // register "I have Paid!" button listener
            $(".pacnem-invoice-refresh-trigger").off("click");
            $(".pacnem-invoice-refresh-trigger").on("click", function() {
                var $btn = $(this);
                ui.setLoadingObject($btn);
                fn_getState(function() {
                    ui.unsetLoadingObject($btn);
                });
                return false;
            });
        };

        /**
         * This method registers the AJAX Fallback for Invoice Updates
         * *and* establishes the Websocket Subscription for the NEMBot
         * Payment Updates for the currently displayed invoice.
         * 
         * @param {GameUI} ui 
         */
        var registerInvoiceStatusUpdateListener = function(ui) {
            var player = self.getPlayerDetails();

            // Frontend to Backend WebSocket Handler
            // -------------------------------------
            // This method will receive updates from the PacNEM backend
            // whenever a Payment Update is received on the NEM Blockchain.
            // The updates are sent in the form of Socket.io events named
            // `pacnem_payment_status_update`. The data sent through this
            // websocket will contain a `status` field and a `paymentData`
            // field containing the details of the said payment.
            socket_.on("pacnem_payment_status_update", function(rawdata) {
                return processPaymentData_(ui, rawdata);
            });

            // AJAX fallback will trigger every 20 seconds to check for invoice
            // updates using the NEMBot API.
            registerStatusHttpFallback(ui, 90);
        };

        // pre-show event should trigger an ajax request to load the
        // dynamic invoice fields.
        var $invoiceBox = $(".pacnem-invoice-modal").first();
        $invoiceBox.on("shown.bs.modal", function() {
            var player = self.getPlayerDetails();

            // update info of the invoice now that we will display it because
            // we now have an address and username.
            API_.getInvoice(player, socket_.id, null, function(data) {
                self.fillInvoiceModal(data, false);

                if (data.status != 'paid' && data.status != 'overpaid') {
                    registerInvoiceStatusUpdateListener(self);
                }
            });

            $(".pacnem-invoice-close-trigger").off("click");
            $(".pacnem-invoice-close-trigger").on("click", function() {
                $(".pacnem-invoice-modal").modal("hide");
                callback(self);
                return false;
            });
            //XXX $("#pacnem-invoice-show-trigger").off("click");
        });

        // all configured, show.
        $invoiceBox.modal({
            backdrop: "static",
            keyboard: false,
            show: true
        });

        return this;
    };

    /**
     * The fillInvoiceModal process data after Invoice Creation
     * 
     * @param   {Object}    data    Should contain `invoice` key
     * @param   {Boolean}   closeable   Whether the Invoice window can be closed
     * @return  {GameUI}
     */
    this.fillInvoiceModal = function(data, closeable) {
        var self = this;
        closeable = typeof closeable == 'undefined' ? false : closeable;

        // read DOM for invoice
        var prefix = $("#pacnem-invoice-prefix").val();
        var $number = $("#" + prefix + "-id");
        var $recipient = $("#" + prefix + "-recipient");
        var $amount = $("#" + prefix + "-amount");
        var $message = $("#" + prefix + "-message");
        var $receiving = $("#" + prefix + "-receiving");
        var $status = $("#" + prefix + "-status ");
        var $paid = $("#" + prefix + "-amountPaid .amount");
        var $unconfirmed = $("#" + prefix + "-amountUnconfirmed .amount");
        var fmtAmount = (data.invoice.amount / 1000000) + " XEM";

        var rcvHeartsHtml = '<div><div class="label label-success label-mosaic"><b>' + data.invoice.countHearts + '&nbsp;<i class="glyphicon glyphicon-heart"></i></div>&nbsp;<a href="http://nem.io" target="_blank">evias.pacnem:heart</a></div>';
        var rcvPlayerHtml = '<div><div class="label label-default label-mosaic"><b>1&nbsp;<i class="glyphicon glyphicon-user"></i></div>&nbsp;<a href="http://nem.io" target="_blank">evias.pacnem:player</a></div>';
        var rcvBetaHtml = '<div><div class="label label-primary label-mosaic"><b>1&nbsp;<i class="glyphicon glyphicon-star-empty"></i></div>&nbsp;<a href="http://nem.io" target="_blank">evias.pacnem:beta-player</a></div>';

        // update and interepret invoice data
        $number.html(data.invoice.number);
        $recipient.html(data.invoice.recipientXEM);
        $amount.html(fmtAmount);
        $message.html(data.invoice.number);
        $receiving.html(rcvHeartsHtml + rcvPlayerHtml + rcvBetaHtml);
        $status.text(data.invoice.status).addClass("text-danger");

        var newStatus = data.invoice.status;
        var statusClass = data.statusLabelClass;
        var statusIcon = data.statusLabelIcon;

        if (data.invoice.status == "paid") {
            statusClass = "success";
            statusIcon = "glyphicon-check";

            $paid.text(data.invoice.amountPaid / 1000000);
            $paid.parents(".wrap-amount").first().show();
        } else if (data.invoice.status == "paid_partly") {
            statusClass = "success";
            statusIcon = "glyphicon-time";

            $paid.text(data.invoice.amountPaid / 1000000);
            $paid.parents(".wrap-amount").first().show();
        } else if (data.invoice.status == "unconfirmed") {
            statusClass = "warning";
            statusIcon = "glyphicon-time";

            $unconfirmed.text(data.invoice.amountUnconfirmed / 1000000);
            $unconfirmed.parents(".wrap-amount").first().show();
        }

        $status.html("<span class='glyphicon " + statusIcon + "'></span> <span>" + data.invoice.status + "</span>")
            .removeClass("text-danger").addClass("text-" + statusClass);

        $status.html("<span class='" + statusIcon + "'></span> <span>" + newStatus + "</span>")
            .removeClass("label-default")
            .removeClass("label-success")
            .removeClass("label-info")
            .removeClass("label-bigger")
            .removeClass("label")
            .addClass("label")
            .addClass(statusClass)
            .addClass("label-bigger");

        var qrHtml = kjua({
            size: 256,
            text: JSON.stringify(data.qrData),
            fill: '#000',
            quiet: 0,
            ratio: 2
        });
        $("#" + prefix + "-qrcode-wrapper").html(qrHtml);

        var $invoiceBox = $(".pacnem-invoice-modal").first();
        $invoiceBox.modal({
            backdrop: "static",
            keyboard: false,
            show: true
        });

        if (closeable === true)
            $(".pacnem-invoice-close-trigger").show();

        $(".pacnem-invoice-close-trigger").off("click");
        $(".pacnem-invoice-close-trigger").on("click", function() {
            $(".pacnem-invoice-modal").modal("hide");
            return false;
        });

        return self;
    };

    /**
     * Helper function to display a given Invoice by its 
     * number `invoiceNumber`.
     * 
     * @param   {String}    invoiceNumber
     * @return GameUI
     */
    this.displayInvoice = function(invoiceNumber) {
        var self = this;
        var player = self.getPlayerDetails();

        self.setLoadingUI();
        self.prepareInvoiceBox(function(ui) {
            API_.getInvoice(player, socket_.id, invoiceNumber, function(data) {
                self.fillInvoiceModal(data, true);
                self.unsetLoadingUI();
            });
        });

        return self;
    };

    /**
     * Open the Share Engine modal box for the user to Share
     * per Play. This box should contain Sponsor's content
     * to be shared on Facebook, Twitter, LinkedIn, etc.
     *
     * @param  Function callback
     * @return GameUI
     */
    this.displayShareEngine = function(callback) {
        alert("Invoice not implemented yet!");

        callback(this);
        return this;
    };

    /**
     * Form Validation implementation to make fields required.
     *
     * Fields definition *must* contain `selector` and
     * *can* contain `required`, `reg_exp`, `callback`.
     *
     * @return {[type]}        [description]
     */
    this.formValidate = function() {
        $(".pacnem-game-mode-wrapper").first().removeClass("panel").removeClass("panel-danger");

        // now validate input fields
        var validators = [{
                "selector": "#username",
                "required": true,
                "reg_exp": /[A-Za-z0-9\-\_\.]+/
            },
            {
                "selector": "#address",
                "required": true,
                "reg_exp": /[A-Z0-9\-]{37,43}/,
                "callback": function(val) {
                    // Verify the XEM address with the NEM SDK
                    return ctrl_.validateBlockchainWalletAddress(val);
                }
            }
        ];

        var self = this;
        var valid = true;
        for (i in validators) {
            var selector = validators[i].selector;
            var required = validators[i].required;
            var reg_exp = validators[i].reg_exp;
            var callback = validators[i].callback;

            if (typeof selector == 'undefined')
                continue;

            var $dom_element = $(selector);
            if (!$dom_element.length)
            // DOM Element does not exist
                continue;

            var value = undefined;
            switch ($dom_element[0].tagName) {
                default:
                    case 'input':
                    case 'select':
                    case 'textarea':
                    value = $dom_element.val();
                break;
            }

            if ((required && !value.length) ||
                (reg_exp && !value.match(reg_exp))) {
                $dom_element.addClass("error-input");
                valid = false;
            }

            try {
                if (valid && callback && !callback(value)) {
                    $dom_element.addClass("error-input");
                    valid = false;
                }
            } catch (e) {
                // print error beneath input-group (in span.error-block)
                var $input_group = $dom_element.parents(".input-group").first();
                var $error_block = $input_group.siblings(".error-block").first();
                $error_block.find(".error").text(e);
                $error_block.fadeIn("slow");

                $dom_element.addClass("error-input");
                valid = false;
            }
        }

        return valid;
    };

    /**
     * Add event listener for authentication button
     *
     * @return GameUI
     */
    this.initAuthButton = function() {
        var self = this;

        $("#pacnem-save-trigger").off("click");
        $("#pacnem-save-trigger").click(function() {
            $(".error-input").removeClass("error-input");
            $(".error-block").hide();
            $(".error-block .error").text("");

            if (self.formValidate()) {

                var postPaymentCallback = function(ui, withPurchases) {
                    ui.createSession();
                    ui.displayPlayerUI();
                    ui.displayLounge();
                    $("#rooms").parent().show();
                    $(".pacnem-credits-submenu").removeClass("hidden");

                    if (withPurchases == true)
                        $("#playerPurchases").fadeIn("slow");
                    else
                        $("#playerPurchases").remove();
                };

                if (ctrl_.isPlayMode("sponsored")) {
                    ctrl_.sponsorizeName(ctrl_.getSponsor());
                    ctrl_.setAdvertised(true);

                    self.displaySponsorAdvertisement(ctrl_.getSponsor(), function() {
                        postPaymentCallback(self, false);
                    });
                } else if (ctrl_.isPlayMode("pay-per-play")) {

                    var player = self.getPlayerDetails();
                    API_.fetchRemainingHearts(player, function(data) {
                        if (data > 0) {
                            postPaymentCallback(self, true)
                        } else {
                            self.watchInvoice(postPaymentCallback);
                        }
                    });
                }
                //else {
                //    self.displayShareEngine(postPaymentCallback);
                //}
            }

            return false;
        });

        return this;
    };

    /**
     * Add event listener for purge button
     *
     * @return GameUI
     */
    this.initPurgeButton = function() {
        var self = this;

        $("#pacnem-purge-trigger").click(function() {

            API_.forgetPlayerIdentity(self.getPlayerDetails(), function(response) {

                if (session_)
                    session_.clear();

                window.location.href = "/";
            });

            return false;
        });

        return this;
    };

    this.setLoadingObject = function($element) {
        if (!$element.length)
            return false;

        var $icon = $element.find("i.glyphicon");
        var iid = "evs_obj_" + new Date().valueOf();
        if ($icon.length) {
            $icon.addClass(iid);
            $element.attr("data-iconbk", iid);
            $icon.appendTo($("#pacnem-element-sink"));

            var $load = $("<img src='/img/loading_32.gif' />");
            $load.prependTo($element);
        }
    };

    this.unsetLoadingObject = function($element) {
        var iid = $element.attr("data-iconbk");

        if (iid.length) {
            var $icon = $("." + iid);

            $element.find("img").remove();
            $icon.prependTo($element);
        }
    };

    this.setLoadingUI = function() {
        if ($(".pacnem-loading-overlay").length) {
            return $(".pacnem-loading-overlay").fadeIn("slow");
        }

        var $wrapper = $("#pacNEMWrapper");
        var $overlay = $("<div class='pacnem-loading-overlay'></div>");
        $overlay.css({
            "position": "absolute",
            "zIndex": 10,
            "backgroundColor": "rgba(255,255,255, 0.8)",
            "backgroundImage": "url(/img/loading_nem.gif)",
            "backgroundRepeat": "no-repeat",
            "backgroundPosition": "center",
            "height": "100%",
            "width": "100%",
            "display": "none"
        });

        $wrapper.css({ "position": "relative" });
        $overlay.prependTo($wrapper);
        $overlay.attr("data-display", 1);
        $overlay.fadeIn("slow");
    };

    this.unsetLoadingUI = function() {
        var $wrapper = $("#pacNEMWrapper");
        var $overlay = $wrapper.find(".pacnem-loading-overlay").first();

        if ($overlay.is(":visible"))
            $overlay.fadeOut("slow");
    };

    this.initTooltips = function() {
        $("[data-toggle='tooltip']").tooltip({
            html: true,
            template: '<div class="tooltip tooltip-mosaic"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>'
        });
    };

    /**
     * Display the PacNEM Lounge. 
     * 
     * Ultimately the PacNEM lounge will be a place to
     * chat, but this will come in later releases.
     *
     * @return GameUI
     */
    this.displayLounge = function() {
        var self = this;
        var player = self.getPlayerDetails();

        self.setLoadingUI();
        API_.fetchLoungeInformations(player, function(loungeData) {
            $("#pacnem-lounge-wrapper").fadeIn("slow", function() {
                self.unsetLoadingUI();
                self.initTooltips();
            });
        });

        return this;
    };

    /**
     * Hide the PacNEM Lounge container.
     * 
     * @return GameUI
     */
    this.hideLounge = function(callback) {
        callback = typeof callback == 'undefined' ? null : callback;
        $("#pacnem-lounge-wrapper").fadeOut("slow", function() {
            if (callback)
                return callback();
        });

        return this;
    };

    /**
     * Add event listener for High Scores button
     *
     * @return GameUI
     */
    this.initScoresButton = function() {
        var self = this;

        $("#pacnem-scores-trigger").on("click", function() {
            var flag = $(this).attr("data-display");

            if (flag == "0") {
                $(this).attr("data-display", "1");
                self.setLoadingUI();
                API_.fetchScores(function(scores) {
                    self.preparePageChange();
                    self.initBackToPlayButtons();
                    $("#pacnem-current-player-details").hide();
                    $("#pacnem-scores-wrapper").show();
                    self.unsetLoadingUI();
                });
            } else {
                $(this).attr("data-display", "0");
                $("#pacnem-scores-wrapper").hide();
                $("#pacnem-current-player-details").show();
                self.displayLounge();
            }

            return false;
        });
    };

    this.preparePageChange = function() {
        $("#pacnem-scores-wrapper").hide();
        $("#pacnem-invoice-history-wrapper").hide();
        this.hideLounge();
    };

    /**
     * Add event listener for Purchase History button
     *
     * @return GameUI
     */
    this.initPurchasesButtons = function() {
        var self = this;

        $("#pacnem-invoice-history-trigger").off("click");
        $("#pacnem-invoice-history-trigger").on("click", function() {
            var flag = $(this).attr("data-display");
            var player = self.getPlayerDetails();

            $(".pacnem-credits-submenu").first().dropdown("toggle");

            if (!flag || !flag.length || flag == "0") {
                $(this).attr("data-display", "1");
                self.setLoadingUI();
                API_.fetchPurchaseHistory(player, function(history) {
                    self.preparePageChange();
                    self.initInvoicesButtons();
                    self.initBackToPlayButtons();
                    //$("#pacnem-current-player-details").hide();
                    $("#pacnem-invoice-history-wrapper").show();
                    self.unsetLoadingUI();
                });
            } else {
                $(this).attr("data-display", "0");
                $("#pacnem-invoice-history-wrapper").hide();
                //$("#pacnem-current-player-details").show();
                self.displayLounge();
            }

            return false;
        });

        $("#pacnem-invoice-show-trigger").off("click");
        $("#pacnem-invoice-show-trigger").on("click", function() {
            $(".pacnem-credits-submenu").first().dropdown("toggle");
            self.setLoadingUI();
            self.prepareInvoiceBox(function(ui) {
                self.watchInvoice(function() {});

                $(".pacnem-invoice-close-trigger").show();
                self.unsetLoadingUI();
            });

            return false;
        });
    };

    this.initInvoicesButtons = function() {
        var self = this;

        $(".pacnem-invoice-display-trigger").off("click");
        $(".pacnem-invoice-display-trigger").on("click", function() {
            var number = $(this).attr("data-invoice-number");
            if (number && number.length) {
                self.displayInvoice(number);
            }

            return false;
        });
    };

    /**
     * Add event listener for game modes trigger.
     *
     * @return GameUI
     */
    this.initGameModes = function() {
        var self = this;

        $(".pacnem-gamemode-trigger").on("click", function() {
            var thisMode = $(this).attr("data-value");

            ctrl_.setPlayMode(thisMode);

            if ("sponsored" == thisMode)
                self.setSponsoredUI(false, function(ui) {});
            else {
                $("#playerPurchases a").first().attr("data-toggle", "dropdown");
                self.unsetSponsoredUI();
            }

            if ("pay-per-play" == thisMode) {
                $(".pacnem-credits-submenu").removeClass("hidden");
                self.prepareInvoiceBox(function(ui) {});
            } else {
                $("#playerPurchases").remove();
            }

            // game mode choice has been done now, next is username and address.
            $("#pacnem-save-trigger").prop("disabled", false).removeClass("btn-disabled");
            $(".pacnem-game-mode-wrapper").first().removeClass("panel").removeClass("panel-danger");
            $("#username").focus();
            return false;
        });

        // by default "Pay per Play" should be initialized
        self.prepareInvoiceBox(function(ui) {});
    };

    /**
     * Utility method called on DOM Ready from the view template.
     *
     * @return Game UI
     */
    this.initDOMListeners = function() {
        var self = this;
        rooms_ctr_ = $("#rooms");

        this.initAuthButton();
        this.initPurgeButton();
        this.initScoresButton();
        this.initPurchasesButtons();
        this.initGameModes();
        this.initBackToPlayButtons();

        var session_ = new GameSession(API_);

        //DEBUG console.log("[DEBUG] " + "Found session: ", session_);

        if (session_.identified()) {
            // post page-load reload from localStorage
            self.updateUserFormWithSession(session_);
            self.createSession(session_);
            self.displayPlayerUI();
            self.displayLounge();

            $("#rooms").parent().show();

            if (session_.details_.type == "pay-per-play") {
                $(".pacnem-credits-submenu").removeClass("hidden");
            }

            // XXX + check game mode and enable/disable buttons with error messages
        } else
            $("#rooms").parent().hide();

        return this;
    };

    /**
     * Register Gameplay Keyboard Listeners
     *
     * This method should be called when the Canvas is activated
     * and the game started only.
     *
     * @return GameUI
     */
    this.registerKeyListeners = function() {
        document.onkeydown = function(e) {
            if ([37, 38, 39, 40].indexOf(e.keyCode) > -1)
                socket_.emit('keydown', e.keyCode);
        };

        window.addEventListener("keydown", function(e) {
            // space and arrow keys
            if ([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1)
                e.preventDefault();
        }, false);

        return this;
    };

    /**
     * Register click event listener for pacnem
     * back to play features.
     *
     * @return GameUI
     */
    this.initBackToPlayButtons = function() {
        var self = this;

        $(".pacnem-back-to-play").off("click");
        $(".pacnem-back-to-play").on("click", function() {
            $("#pacnem-scores-trigger").attr("data-display", "0");
            $("#pacnem-scores-wrapper").hide();
            $("#pacnem-invoice-history-trigger").attr("data-display", "0");
            $("#pacnem-invoice-history-wrapper").hide();
            $("#pacnem-current-player-details").show();

            var sess = new GameSession(API_);
            if (sess.identified())
                self.displayLounge();

            return false;
        });

        return this;
    };

    // new GameUI instances should initialize Socket IO connection
    // triggers for general Game User Interface updates
    {
        this.init();
    }
};