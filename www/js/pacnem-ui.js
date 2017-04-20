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
var GameUI = function(config, socket, controller, $, jQFileTemplate)
{
    var config_ = config;
    var socket_ = socket;
    var ctrl_ = controller;
    var jquery_ = $;
    var rooms_ctr_ = undefined;
    var session = undefined;
    var API_ = new GameAPI(config, socket, controller, $, jQFileTemplate);
    var template_ = jQFileTemplate;

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
    this.init = function()
    {
        var self = this;

        socket_.on('ready', function(rawdata)
        {
            $(".msgSelectRoom").hide();
            $("#game").show();
            self.displayUserDetails(rawdata);
            ctrl_.serverReady(rawdata);
            self.registerKeyListeners();
        });

        socket_.on('end_of_game', function() {
            ctrl_.serverEndOfGame();
        });

        socket_.on('update', ctrl_.serverUpdate);

        socket_.on('rooms_update', function(rawdata)
        {
            var data = JSON.parse(rawdata);
            var sid  = data['sid'];
            var $rooms = $("#rooms");
            var rooms  = data["rooms"];
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

        socket_.on("pacnem_heart_sync", function(rawdata)
        {
            var data = JSON.parse(rawdata);

            // we will display the `data` (count of hearts available read from
            // blockchain) in the top bar.
            var $wrap = $("#currentHearts").first();
            var $data = $("#currentHearts-hearts").first();

            $wrap.show();
            self.animateHeartsCounter($data, 0, data, " Credits");
        });

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
    this.animateHeartsCounter = function($element, start, end, suffix)
    {
        jQuery({ Counter: start }).animate({ Counter: parseInt(end) }, {
            duration: 1000,
            easing: 'swing',
            step: function () {
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
    this.displayUserDetails = function(rawdata)
    {
        var self = this;
        var $details = $("#pacnem-current-room-wrapper ul.list-group").first();
        var $userRow = $details.find("li.hidden").first();
        var players  = ctrl_.getPlayers();

        // interpret data, prepare display
        var data = JSON.parse(rawdata);

        if (players.length)
            // clear players list first
            $details.find(".player-row").remove();

        for (var i = 0 ; i < players.length ; i++) {
            var $row  = $userRow.clone().removeClass("hidden").addClass("player-row");
            var color = GHOSTS_COLORS[i % GHOSTS_COLORS.length];

            // set player name and add to DOM
            $row.find(".player").first().text(players[i]);
            $row.find(".glyphicon").first().css("color", color);
            $row.appendTo($details);
        }

        $("#pacnem-game-wrapper").show();
        return this;
    };

    /**
     * helper for displaying Create Room button
     * @return GameUI
     */
    this.displayCreateRoom = function()
    {
        var $button = $(".roomCreateNew").first();
        $button.removeClass("hidden");

        return this;
    };

    /**
     * helper for hiding Create Room button
     * @return GameUI
     */
    this.hideCreateRoom = function()
    {
        var $button = $(".roomCreateNew").first();
        $button.addClass("hidden");

        return this;
    };

    /**
     * helper for displaying Create Room button
     *
     * @return {[type]} [description]
     */
    this.enableCreateRoom = function()
    {
        var $button = $(".roomCreateNew").first();

        $button.removeAttr("disabled").removeClass("disabled");
        $button.off("click");
        $button.on("click", function() { socket_.emit("create_room"); });

        return this;
    };

    /**
     * helper for hiding Create Room button
     *
     * @return {[type]} [description]
     */
    this.disableCreateRoom = function()
    {
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
    this.displayRooms = function($rooms, sid, data)
    {
        var self = this;

        if (! data["rooms"].length) {
            self.displayCreateRoom();
            self.enableCreateRoom();
            return 0;
        }

        var playerInRoom = false;
        for (var i = 0; i < data["rooms"].length; i++) {
            var inThisRoom = self.displayRoom(i+1, $rooms, sid, data["rooms"][i], data["users"]);

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
    this.displayRoomAction = function(rooms, $button, callback, delay)
    {
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
    this.displayRoom = function(roomIndex, $rooms, sid, roomdata, usersdata)
    {
        var self = this;

        var is_member = $.inArray(sid, roomdata['users']) != -1;
        var template  = $("#room-template").html();
        var $rooms    = $("#rooms");
        var $thisRoom = $("<div/>").html(template);

        $thisRoom.addClass("hidden").appendTo($rooms);

        // now `thisRoom` will contain the actual "lounge"
        $thisRoom = $rooms.find(".pacnem-lounge").last();

        // set the title index (Pacnem #1, Pacnem #2..)
        // and randomly select a color from the NEM colors
        var $title = $thisRoom.find(".lounge-title");
        $title.find(".room-enum").first().text(roomIndex);

        var randIdx  = Math.floor(Math.random()*(99-1+1)+1);
        var titleCol = "colNEMGreen";
        if (randIdx % 3 == 0)
            titleCol = "colNEMOrange";
        else if (randIdx % 5 == 0)
            titleCol = "colNEMBlue";

        if (titleCol != "colNEMGreen")
            $title.removeClass("colNEMGreen")
                  .addClass(titleCol);

        var $members  = $thisRoom.find(".room-members-wrapper ul");
        var $memberRow= $thisRoom.find(".room-members-wrapper ul li.hidden").first();

        // players array will now be filled with current room's users
        players = [];

        // now create the members entries for this room
        for (var i = 0 ; i < roomdata['users'].length ; i++) {
            var user = usersdata[roomdata['users'][i]] ? usersdata[roomdata['users'][i]] : roomdata['users'][i];

            $currentRow = $memberRow.clone()
                                  .removeClass("hidden")
                                  .appendTo($members);

            $currentRow.find(".member-name").first().text(user);

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
    this.configureRoomActions = function($domRoom, room)
    {
        var self      = this;
        var is_member = $.inArray(socket_.id, room['users']) != -1;

        // define which buttons must be active
        if (is_member) {
            if (room["status"] == "join") {
                var $button = $domRoom.find(".roomActionPlay").first();
                self.displayRoomAction(room, $button, function($btn, room) {
                    socket_.emit("run_game");
                });
            }
            else if (room["status"] == "wait") {
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
        }
        else if (room["status"] == "join") {
            var $button = $domRoom.find(".roomActionJoin").first();

            if (room["is_full"])
                $button.prop("disabled", true);
            else {
                self.displayRoomAction(room, $button, function($btn, room) {
                    socket_.emit("join_room", room["id"]);
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
    this.getPlayerDetails = function(session)
    {
        var username = $("#username").val();
        var address  = $("#address").val();

        if (!username.length && session && session.getPlayer().length)
            username = session.getPlayer();

        if (!address.length && session && session.getAddress().length)
            address = session.getAddress();

        if (!username.length || !address.length) {
            // createSession not possible, either user name or XEM
            // address could not be retrieved.
            return {"username": "", "address": ""};
        }

        return {"username": username, "address": address};
    };

    /**
     * Synchronize form input with Session content.
     *
     * @param  GameSession session
     * @return GameUI
     */
    this.updateUserFormWithSession = function(session)
    {
        var username = $("#username").val();
        var address  = $("#address").val();

        if (! username.length) {
            $("#username").val(session.getPlayer());
            username = session.getPlayer();
        }

        if (! address.length) {
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
    this.createSession = function(session)
    {
        var self = this;
        var details = this.getPlayerDetails();

        if (typeof session != 'undefined')
            // use saved session
            session_ = session;
        else
            // save the game session details
            session_ = new GameSession(API_, details.username, details.address, ctrl_.getPlayMode());

        ctrl_.setSession(session_);

        if (ctrl_.isPlayMode("sponsored") && ! ctrl_.isAdvertised()) {
            // this is a page reload! show the Sponsor modal box because
            // advertising has not been done for this socket id!

            ctrl_.setAdvertised(true);
            self.setSponsoredUI(function(ui, sponsor)
                {
                    // now display the advertisement
                    ui.displaySponsorAdvertisement(function(ui)
                    {
                        // and finally, emit the session creation
                        socket_.emit('change_username', details.username);
                        socket_.emit("notify");
                    });
                });

            return this;
        }

        // we can safely emit the session creation, this user is
        // either a pay-per-play or share-per-play (not yet implemented)
        socket_.emit('change_username', details.username);
        socket_.emit("notify");
        return this;
    };

    /**
     * Display the UI as it should be for logged in users.
     *
     * This method will fail if the pre-requirements do not
     * match when it is called.
     *
     * @return GameUI
     */
    this.displayPlayerUI = function()
    {
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
     * Use the API to get a [not-so-] random Sponsor Wallet
     * and lock the XEM Address input field to that Sponsor's
     * Sub-Wallet.
     *
     * @return {[type]} [description]
     */
    this.setSponsoredUI = function(callback)
    {
        var self = this;

        API_.getRandomSponsor(function(sponsor)
            {
                // got a sponsor, now we'll have a valid address input for sure.
                $(".error-input").removeClass("error-input");
                $(".error-block").hide();
                $(".error-block .error").text("");

                $("#address").val(sponsor.xem);
                $("#address").prop("disabled", true);
                $("#address").attr("data-sponsor", "1");
                $("#username").attr("data-sponsor", sponsor.slug);

                ctrl_.setSponsor(sponsor);
                self.prepareSponsoredJoin(sponsor, function(ui)
                    { callback(ui); });
            });
    };

    /**
     * Unset the settings for the sponsored UI.
     *
     * This allows the user to enter an address and
     * username again (username content not touched).
     *
     * @return GameUI
     */
    this.unsetSponsoredUI = function()
    {
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
    this.prepareSponsoredJoin = function(sponsor, callback)
    {
        var self = this;

        if ($(".pacnem-sponsor-modal[data-sponsor='" + sponsor.slug  + "']").length)
            // sponsor window already available
            return this;

        template_.render("sponsor-box", function(compileWith)
            {
                // add server side generated sponsor HTML to a modal
                // boxes wrapper.
                var html = $("#pacnem-modal-wrapper").html();
                $("#pacnem-modal-wrapper").html(html + compileWith(sponsor));

                if (callback)
                    callback(self);
            });

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
    this.prepareInvoiceBox = function(callback)
    {
        var self = this;

        if ($(".pacnem-invoice-modal").length)
            // always create a new invoice
            $(".pacnem-invoice-modal").remove();

        template_.render("invoice-box", function(compileWith)
            {
                // i know.. come on, just using nem :D
                var rBytes = ctrl_.nem().crypto.nacl.randomBytes(8);
                var seed   = ctrl_.nem().crypto.nacl.randomBytes(4);

                var unsafe = ctrl_.nem().utils.convert.ua2hex(rBytes);
                var seed   = ctrl_.nem().utils.convert.ua2hex(seed);

                var token  = unsafe + seed;
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
     * Open the Advertisement modal box and execute
     * `callback` when the delay is over.
     *
     * @param  Function callback
     * @return GameUI
     */
    this.displaySponsorAdvertisement = function(callback)
    {
        $(".pacnem-sponsor-modal").first().modal({
            backdrop: "static",
            keyboard: false,
            show: true
        });

        var self = this;
        var start = new Date().getTime();

        var updateCounter = function()
        {
            var secs = parseInt($("#pacnem-sponsor-close-trigger .seconds").first().text());
            var n = secs - 1;

            if (n < 0)
                n = 0;

            $("#pacnem-sponsor-close-trigger .seconds").first().text(""+n);
            $("#pacnem-sponsor-close-trigger").attr("data-remaining", n);
        };

        var closeSponsor = function(i)
        {
            clearInterval(i);
            $(".pacnem-sponsor-modal").first().modal("hide");
            $("#pacnem-sponsor-close-trigger").removeAttr("data-remaining");

            callback(self);
        };

        updateCounter();
        var i = setInterval(updateCounter, 1000);
        setTimeout(function() { closeSponsor(i); }, 10000);

        return this;
    };

    /**
     * Open the Invoice modal box for the user to Pay
     * per Play. This invoice will contain a Mosaic
     * amount to defined.
     *
     * @param  Function callback
     * @return GameUI
     */
    this.displayInvoice = function(callback)
    {
        var self = this;

        // Callback function filling the dynamic invoice fields
        var fillInvoiceData = function(player)
            {
                $.ajax({
                    url: "/api/v1/credits/buy?payer=" + player.address + "&usid=" + socket_.id,
                    type: "GET",
                    success: function(res)
                    {
                        if (res.status == "error") {
                            console.log("Error occured on Invoice creation: " + res.message);
                            return false;
                        }

                        var prefix = $("#pacnem-invoice-prefix").val();
                        var $number = $("#" + prefix + "-id");
                        var $recipient = $("#" + prefix + "-recipient");
                        var $amount    = $("#" + prefix + "-amount");
                        var $message   = $("#" + prefix + "-message");
                        var $receiving = $("#" + prefix + "-receiving ");
                        var $status    = $("#" + prefix + "-status ");
                        var fmtAmount  = (res.item.invoice.amount / 1000000) + " XEM";

                        $number.html(res.item.invoice.number);
                        $recipient.html(res.item.invoice.recipientXEM);
                        $amount.html(fmtAmount);
                        $message.html(res.item.invoice.number);
                        $receiving.html(res.item.invoice.countHearts + "&nbsp;<b>&hearts;&nbsp;evias.pacnem:heart</b>");
                        $status.text(res.item.invoice.status).addClass("text-danger");

                        // subscribe to payment status updates from the NEMBot responsible for payment channels.
                        socket_.on("pacnem_payment_status_update", function(rawdata)
                        {
                            var data = JSON.parse(rawdata);
                            var statusClass = data.status == 'unconfirmed' ? "info" : "success";
                            var $status     = $("#" + prefix + "-status ");

                            $status.text(data.status).removeClass("text-danger").addClass(statusClass);
                        });

                        var qrHtml = kjua({
                            size: 256,
                            text: JSON.stringify(res.item.qrData),
                            fill: '#000',
                            quiet: 0,
                            ratio: 2
                        });
                        $("#" + prefix + "-qrcode-wrapper").html(qrHtml);
                    }
                });
            };

        // pre-show event should trigger an ajax request to load the
        // dynamic invoice fields.
        var $invoiceBox = $(".pacnem-invoice-modal").first();
        $invoiceBox.on("show.bs.modal", function()
            {
                var player  = self.getPlayerDetails();

                // update info of the invoice now that we will display it because
                // we now have an address and username.
                fillInvoiceData(player);
            });

        // all configured, show.
        $invoiceBox.modal({
            backdrop: "static",
            keyboard: false,
            show: true
        });

        callback(this);
        return this;
    };

    /**
     * Open the Share Engine modal box for the user to Share
     * per Play. This box should contain Sponsor's content
     * to be shared on Facebook, Twitter, LinkedIn, etc.
     *
     * @param  Function callback
     * @return GameUI
     */
    this.displayShareEngine = function(callback)
    {
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
    this.formValidate = function()
    {
        // first validate that a game mode is selected
        var $selectedMode = $("input[type=radio][name=play_type]:checked");
        if (! $selectedMode.length) {
            // set error mode
            $(".pacnem-game-mode-wrapper").first().addClass("panel").addClass("panel-danger");
            return false;
        }
        else
            // no error
            $(".pacnem-game-mode-wrapper").first().removeClass("panel").removeClass("panel-danger");

        // now validate input fields
        var validators = [
            {
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

        var self  = this;
        var valid = true;
        for (i in validators) {
            var selector = validators[i].selector;
            var required = validators[i].required;
            var reg_exp  = validators[i].reg_exp;
            var callback = validators[i].callback;

            if (typeof selector == 'undefined')
                continue;

            var $dom_element = $(selector);
            if (! $dom_element.length)
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

            if ((required && !value.length)
            || (reg_exp && !value.match(reg_exp))) {
                $dom_element.addClass("error-input");
                valid = false;
            }

            try {
                if (valid && callback && !callback(value)) {
                    $dom_element.addClass("error-input");
                    valid = false;
                }
            }
            catch (e) {
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
    this.initAuthButton = function()
    {
        var self = this;

        $("#pacnem-save-trigger").off("click");
        $("#pacnem-save-trigger").click(function()
        {
            $(".error-input").removeClass("error-input");
            $(".error-block").hide();
            $(".error-block .error").text("");

            if (self.formValidate()) {

                var postPaymentCallback = function(ui)
                    {
                        ui.createSession();
                        ui.displayPlayerUI();
                        $("#rooms").parent().show();
                    };

                if (ctrl_.isPlayMode("sponsored")) {
                    ctrl_.sponsorizeName(ctrl_.getSponsor());
                    ctrl_.setAdvertised(true);

                    self.displaySponsorAdvertisement(postPaymentCallback);
                }
                else if (ctrl_.isPlayMode("pay-per-play")) {
                    self.displayInvoice(postPaymentCallback);
                }
                else {
                    self.displayShareEngine(postPaymentCallback);
                }
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
    this.initPurgeButton = function()
    {
        var self = this;

        $("#pacnem-purge-trigger").click(function()
        {
            session_.clear();
            window.location.href = "/";
            return false;
        });

        return this;
    };

    /**
     * Add event listener for High Scores button
     *
     * @return GameUI
     */
    this.initScoresButton = function()
    {
        var self = this;

        $("#pacnem-scores-trigger").on("click", function()
        {
            var flag = $(this).attr("data-display");

            if (flag == "0") {
                $(this).attr("data-display", "1");
                API_.fetchScores(function(scores)
                    {
                        self.initBackToPlayButtons();
                        $(".msgSelectRoom").hide();
                        $("#pacnem-current-player-details").hide();
                        $("#pacnem-scores-wrapper").show();
                    });
            }
            else {
                $(this).attr("data-display", "0");
                $(".msgSelectRoom").show();
                $("#pacnem-scores-wrapper").hide();
                $("#pacnem-current-player-details").show();
            }
        });
    };

    /**
     * Add event listener for game modes trigger.
     *
     * @return GameUI
     */
    this.initGameModes = function()
    {
        var self = this;

        $(".pacnem-gamemode-trigger").on("click", function()
        {
            var thisMode = $(this).val();

            ctrl_.setPlayMode(thisMode);

            if ("sponsored" == thisMode)
                self.setSponsoredUI(function(ui) {});
            else
                self.unsetSponsoredUI();

            if ("pay-per-play" == thisMode)
                self.prepareInvoiceBox(function(ui) {});

            // game mode choice has been done now, next is username and address.
            $("#pacnem-save-trigger").prop("disabled", false).removeClass("btn-disabled");
            $(".pacnem-game-mode-wrapper").first().removeClass("panel").removeClass("panel-danger");
            $("#username").focus();
        });
    };

    /**
     * Utility method called on DOM Ready from the view template.
     *
     * @return Game UI
     */
    this.initDOMListeners = function()
    {
        var self   = this;
        rooms_ctr_ = $("#rooms");

        this.initAuthButton();
        this.initPurgeButton();
        this.initScoresButton();
        this.initGameModes();
        this.initBackToPlayButtons();

        var session_ = new GameSession(API_);
        if (session_.identified()) {
            // post page-load reload from localStorage
            self.updateUserFormWithSession(session_);
            self.createSession(session_);
            self.displayPlayerUI();

            $("#rooms").parent().show();
        }
        else
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
    this.registerKeyListeners = function()
    {
        document.onkeydown = function(e) {
            if([37, 38, 39, 40].indexOf(e.keyCode) > -1)
                socket_.emit('keydown', e.keyCode);
        };

        window.addEventListener("keydown", function(e) {
            // space and arrow keys
            if([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1)
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
    this.initBackToPlayButtons = function()
    {
        $(".pacnem-back-to-play").off("click");
        $(".pacnem-back-to-play").on("click", function()
        {
            $("#pacnem-scores-trigger").attr("data-display", "0");
            $("#pacnem-scores-wrapper").hide();
            $("#pacnem-current-player-details").show();

            var sess = new GameSession(API_);
            if (sess.identified())
                $(".msgSelectRoom").show();
        });

        return this;
    };

    // new GameUI instances should initialize Socket IO connection
    // triggers for general Game User Interface updates
    {
        this.init();
    }
};
