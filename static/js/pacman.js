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
 * Constants for the Client Side implementation of
 * the Pacman JS game.
 *
 * @author 	Nicolas Dubien (https://github.com/dubzzz)
 */
var LEFT = 0,
	UP = 1,
	RIGHT = 2,
	DOWN = 3;

var SIZE = 16;
var GHOSTS_COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ff7700"];

// Updated based on server's values
var FPS = 20;
var CHEESE_EFFECT_FRAMES = 200;
var FRAMES_PER_CELL = 5;

/**
 * class TransitionHelper is used for Screen Transitions
 * using a Canvas.
 *
 * @author 	Nicolas Dubien (https://github.com/dubzzz)
 */
var TransitionHelper = function(callback)
{
	var callback_ = callback;
	var frame_ = 0;

	var run_ = function() {
		var canvas = document.getElementById('myCanvas');
		if (! canvas.getContext) {
			return;
		}
		var ctx = canvas.getContext('2d');

		ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
		ctx.fillRect(0, 0, canvas.width, canvas.height * (frame_+1)/(frame_+3));

		frame_++;
		if (frame_ >= FPS) {
			callback_();
			return;
		}
		setTimeout(run_, 1000/FPS);
	};

	{
		run_();
	}
};

/**
 * class DisplayPoints is a type structure containing
 * a Canvas Point configuration.
 *
 * @author 	Nicolas Dubien (https://github.com/dubzzz)
 */
var DisplayPoints = function(x, y, color, value)
{
	this.x = x;
	this.y = y;
	this.value = value;
	this.iter = 0;
	this.color = color;
};

/**
 * class GameController is defines several actions
 * in MVC style using Socket.IO for data transmission
 * on streams.
 *
 * This implementation allows using the Pacman Game in
 * Rooms of up to 4 Persons.
 *
 * @author 	Nicolas Dubien (https://github.com/dubzzz)
 * @author 	Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var GameController = function(socket)
{
	var socket_ = socket;
	var frame_ = 0;
	var ongoing_game_ = false;
	var ongoing_refresh_ = false;
	var grid_ = undefined;
	var last_elapsed_ = 0;
	var points_ = new Array();
	var players_ = new Array();

	this.start = function()
	{
		if (! ongoing_game_) {
			// Ask the server to start a new game session
			socket_.emit('new');
			last_elapsed_ = 0;
		}

		return this;
	};

	this.serverReady = function(rawdata)
	{
		var data = JSON.parse(rawdata);
		grid_ = data['map'];
		FPS = data['constants']['FPS'];
		CHEESE_FRAMES = data['constants']['CHEESE_FRAMES'];
		FRAMES_PER_CELL = data['constants']['FRAMES_PER_CELL'];

		if (! ongoing_game_) {
			ongoing_game_ = true;
		}

		// Setup the canvas
		var canvas = document.getElementById('myCanvas');
		if (! canvas.getContext) {
			return;
		}
		var ctx = canvas.getContext('2d');
		var height = grid_.length;
		var width = grid_[0].length;
		canvas.width = width * SIZE +10;
		canvas.height = height * SIZE +10;

		// Draw board
		drawEmptyGameBoard(canvas, ctx, grid_);

		// Screen transition for a new game
		TransitionHelper(function() {
				console.log('Sent: start');
				socket_.emit('start');
		});

		return this;
	};

	this.serverUpdate = function(rawdata)
	{
		var data = JSON.parse(rawdata);

		for (var i = 0 ; i != data['eat'].length ; i++) {
			var x = data['eat'][i]['x'];
			var y = data['eat'][i]['y'];
			grid_[y][x] = ' ';
		}
		for (var i = 0 ; i != data['points'].length ; i++) {
			points_.push(new DisplayPoints(
					data['points'][i]['x'],
					data['points'][i]['y'],
					data['points'][i]['type'] == 'ghost' ? GHOSTS_COLORS[data['points'][i]['index'] % GHOSTS_COLORS.length] : '#000000',
					data['points'][i]['amount']));
		}

		if (!ongoing_refresh_ && data['elapsed'] < last_elapsed_) {
			return;
		}
		ongoing_refresh_ = true;
		last_elapsed_ = data['elapsed'];

		var canvas = document.getElementById('myCanvas');
		if (! canvas.getContext) {
			return;
		}
		var ctx = canvas.getContext('2d');

		// Draw game
		drawEmptyGameBoard(canvas, ctx, grid_);
		var $items = $("#game_details .list-group-item-text");
		for (var i = 0 ; i != data['pacmans'].length ; i++) {
			var pacman = data['pacmans'][i];
			drawPacMan(canvas, ctx, frame_, pacman, data['pacmans'].length == 1 ? "#777700" : GHOSTS_COLORS[i %GHOSTS_COLORS.length]);
			$($items[i]).find(".pc-score").text(pacman["score"]);
			$($items[i]).find(".pc-lifes").text(pacman["lifes"] + "❤");
			$($items[i]).find(".pc-combo").text("x" + (pacman["combo"] +1));
		}
		for (var i = 0 ; i != data['ghosts'].length ; i++) {
			drawGhost(canvas, ctx, frame_, data['ghosts'][i], GHOSTS_COLORS[i %GHOSTS_COLORS.length]);
		}
		for (var i=0 ; i != points_.length ; i++) {
			drawPoints(canvas, ctx, points_[i]);
		}
		for (var i=0 ; i != points_.length ; i++) {
			if (points_[i].iter >= FPS/2) {
				points_.splice(i, 1);
				i--;
			}
		}

		frame_++;
		ongoing_refresh_ = false;
		return this;
	};

	this.serverEndOfGame = function()
	{
		ongoing_game_ = false;
		return this;
	};

	this.setPlayers = function(players)
	{
		players_ = players;
		return this;
	};

	this.getPlayers = function()
	{
		return players_;
	};

	this.hasSession = function()
	{
		var u = $("#username").val();
		return u.length > 0;
	}
};

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
 * @author 	Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var GameUI = function(socket, controller, $)
{
	var socket_ = socket;
	var ctrl_ = controller;
	var jquery_ = $;
	var rooms_ctr_ = undefined;

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

		socket_.on('ready', function(rawdata) {
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

            // clear UI
            $rooms.empty();

            if (isAuth)
                $("#save_auth").attr("disabled", "disabled");
            else
                $("#save_auth").removeAttr("disabled");

            self.displayRooms($rooms, sid, data);

            if (! rooms.length)
                // create a new room, no one else online
                socket_.emit("create_room");
        });

        rooms_ctr_ = $("#rooms");

        return this;
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
	    var $details = $("#game_details").first();
	    var $userRow = $details.find(".players-list li.hidden").first();

	    // interpret data, prepare display
	    var data = JSON.parse(rawdata);

	    if (players.length)
	        // clear players list first
	        $details.empty();

	    for (var i = 0 ; i < players.length ; i++) {
	        var $row  = $userRow.clone().removeClass("hidden");
	        var color = GHOSTS_COLORS[i % GHOSTS_COLORS.length];

	        // set player name and add to DOM
	        $row.find(".player").first().text(players[i]);
	        $row.find(".glyphicon").first().css("color", color);
	        $row.appendTo($details);
	    }

	    $details.show();
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

		$button.removeClass("hidden");
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
		var $button = rooms_ctr_.find(".roomCreateNew").first();

		if (!$button)
			return this;

		$button.addClass("hidden");
		return this;
	};

	/**
	 * Display all available Game Rooms
	 *
	 * @param  {[type]} $rooms
	 * @param  {[type]} sid
	 * @param  {[type]} data
	 * @return integer 	Count of available rooms
	 */
	this.displayRooms = function($rooms, sid, data)
	{
		var self = this;

		if (! data["rooms"].length) {
			self.enableCreateRoom();
			return 0;
		}

		if (!ctrl_.hasSession()) {
			$rooms.parent().hide();
			return 0;
		}

		$rooms.parent().show();

	    var playerInRoom = false;
	    for (var i = 0; i < data["rooms"].length; i++)
	        playerInRoom |= self.displayRoom(i+1, $rooms, sid, data["rooms"][i], data["users"]);

		if (! playerInRoom)
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
	 * @return boolean 	Whether current Player is Member of the
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
			});

			// Members of Room must first Leave a Room before they can
			// Join another Room.
			$(".roomActionJoin").attr("disabled", "disabled")
								.removeClass("btn-primary")
								.addClass("btn-default");
	    }
	    else if (room["status"] == "join") {
	        var $button = $domRoom.find(".roomActionJoin").first();

	        if (room["is_full"])
	            $button.prop("disabled", true);
	        else {
				self.displayRoomAction(room, $button, function($btn, room) {
					socket_.emit("join_room", room["id"]);
				});
			}
	    }

	    return this;
	}

	/**
	 * Send the entered username to the Socket IO room manager.
	 *
	 * @return GameUI
	 */
	this.emitUsername = function()
	{
		// view effects & modifications
	    $("#currentUser-username").html("&nbsp;" + $("#username").val());
	    $("#currentUser").fadeIn("slow");
	    $("#purge_auth").parent().show();
	    $(".hide-on-auth").hide();
	    $(".show-on-auth").show();
	    $("#my-details .panel").first().removeClass("panel-info");
	    $("#username").parents(".input-group").first().parent().addClass("col-md-offset-1");

	    socket_.emit('change_username', $("#username").val());
	    socket_.emit("notify");

	    //XXX save to localStorage

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
	 * Form Validation implementation to make fields required.
	 *
	 * @param  {[type]} fields [description]
	 * @return {[type]}        [description]
	 */
	this.formValidate = function(fields)
	{
		var valid = true;
		for (i in fields) {
			var selector = fields[i].selector;
			var required = fields[i].required;
			var reg_exp  = fields[i].reg_exp;

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
		}

		return valid;
	};

    /**
     * Utility method called on DOM Ready from the view template.
     *
     * @return Game UI
     */
	this.initDOMListeners = function()
	{
		var self = this;
		var validators = [
			{
				"selector": "#username",
				"required": true,
				"reg_exp": /[A-Za-z0-9\-\_\.]+/
			},
			{
				"selector": "#address",
				"required": true,
				"reg_exp": /[A-Z0-9]{37,43}/
			}
		];

		$("#save_auth").click(function() {
			$(".error-input").removeClass("error-input");

			if (self.formValidate(validators))
				self.emitUsername();

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

/**
 * Draw an empty game board
 * @author Nicolas Dubien (https://github.com/dubzzz)
 */
function drawEmptyGameBoard(canvas, ctx, grid)
{
	/**
	 * Draw the Game Board
	 */

	// Retrieve grid dimensions
	var height = grid.length;
	var width = grid[0].length;

	// Draw Game Board
	ctx.beginPath();
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width * SIZE +10, height * SIZE +10);
	ctx.fill();

	ctx.beginPath();
	ctx.lineWidth = 3;
	ctx.strokeStyle = "black";
	ctx.moveTo(2, 2);
	ctx.lineTo(2, height * SIZE +8);
	ctx.lineTo(width * SIZE +8, height * SIZE +8);
	ctx.lineTo(width * SIZE +8, 2);
	ctx.closePath();
	ctx.stroke();

	for (var i = 0 ; i != width ; i++) {
		for (var j = 0 ; j != height ; j++) {
			if (grid[j][i] == '#') {
				ctx.fillStyle = "#777777";
				ctx.fillRect(i * SIZE +5, j * SIZE +5, SIZE, SIZE);
			} else if (grid[j][i] == '.') {
				ctx.beginPath();
				ctx.fillStyle = "#aaaa00";
				ctx.arc((i+.5) * SIZE +5, (j+.5) * SIZE +5, .2 * SIZE, 0, 2 * Math.PI, false);
				ctx.fill();
			} else if (grid[j][i] == 'o') {
				ctx.beginPath();
				ctx.fillStyle = "#aaaa00";
				ctx.arc((i+.5) * SIZE +5, (j+.5) * SIZE +5, .4 * SIZE, 0, 2 * Math.PI, false);
				ctx.fill();
			}
		}
	}
}

/**
 * Draw the PacMan
 * @author Nicolas Dubien (https://github.com/dubzzz)
 */
function drawPacMan(canvas, ctx, frame, pacman, color)
{
	if (pacman["lifes"] < 0)
	{
		return;
	}
	if (pacman["killed_recently"] != 0 && pacman["killed_recently"]%4 < 2) {
		return;
	}

	var pacman_px_x = (1. * pacman['x'] / FRAMES_PER_CELL +.5) * SIZE +5;
	var pacman_px_y = (1. * pacman['y'] / FRAMES_PER_CELL +.5) * SIZE +5;
	var pacman_mouth = frame % FRAMES_PER_CELL +3;
	var pacman_direction = pacman['direction'];

	ctx.beginPath();
	ctx.fillStyle = color;
	ctx.lineWidth = 2;
	ctx.strokeStyle = pacman['cheese_effect'] == 0 ? "#000000" : color;
	if (pacman_direction == LEFT) {
		ctx.arc(pacman_px_x, pacman_px_y, .45*SIZE, Math.PI+Math.PI/pacman_mouth, Math.PI-Math.PI/pacman_mouth,false);
	} else if (pacman_direction == UP) {
		ctx.arc(pacman_px_x, pacman_px_y, .45*SIZE, -Math.PI/2+Math.PI/pacman_mouth, -Math.PI/2-Math.PI/pacman_mouth,false);
	} else if (pacman_direction == RIGHT) {
		ctx.arc(pacman_px_x, pacman_px_y, .45*SIZE, Math.PI/pacman_mouth, -Math.PI/pacman_mouth,false);
	} else {
		ctx.arc(pacman_px_x, pacman_px_y, .45*SIZE, Math.PI/2+Math.PI/pacman_mouth, Math.PI/2-Math.PI/pacman_mouth,false);
	}
	ctx.lineTo(pacman_px_x, pacman_px_y);
	if (pacman['cheese_effect'] != 0) {
		if (! (pacman['cheese_effect'] <= CHEESE_EFFECT_FRAMES/5 && (pacman['cheese_effect']%4 == 1 || pacman['cheese_effect']%4 == 2))) {
			ctx.stroke();
		}
	} else {
		ctx.fill();
		if (pacman['cheese_power'] != 0 && ! (pacman['cheese_power'] <= CHEESE_EFFECT_FRAMES/5 && (pacman['cheese_power']%4 == 1 || pacman['cheese_power']%4 == 2))) {
			ctx.stroke();
		}
	}
}

/**
 * Draw a ghost
 * @author Nicolas Dubien (https://github.com/dubzzz)
 */
function drawGhost(canvas, ctx, frame, ghost, color)
{
	if (ghost['cheese_effect'] != 0 && ghost['cheese_effect'] <= CHEESE_EFFECT_FRAMES/5 && (ghost['cheese_effect']%4 == 1 || ghost['cheese_effect']%4 == 2)) {
		return;
	}

	var ghost_px_x = (1. * ghost['x'] / FRAMES_PER_CELL +.5) * SIZE +5;
	var ghost_px_y = (1. * ghost['y'] / FRAMES_PER_CELL +.5) * SIZE +5;

	ctx.beginPath();
	//if (ghost.under_big_cheese_effect == 0)
		ctx.fillStyle = color;
	//else
	//	ctx.fillStyle = "#777777";
	ctx.arc(ghost_px_x, ghost_px_y - .05 * SIZE, .4 * SIZE, Math.PI, 2*Math.PI, false);
	var begin_x = ghost_px_x +.4 * SIZE;
	var end_x = ghost_px_x -.4 * SIZE;
	var min_y = ghost_px_y +.25 * SIZE;
	var max_y = ghost_px_y +.45 * SIZE;
	var num_min = 3;
	var animate_padding = (end_x-begin_x)/(2*num_min) * ((frame % FRAMES_PER_CELL)/(FRAMES_PER_CELL-1) -.5);

	ctx.lineTo(begin_x, max_y);
	for (var i=0 ; i!=2*num_min-1 ; i++) {
		var current_x = begin_x + (end_x-begin_x)*(i+1)/(2*num_min) + animate_padding;
		if (i%2 == 0)
			ctx.lineTo(current_x, min_y);
		else
			ctx.lineTo(current_x, max_y);
	}
	ctx.lineTo(end_x, max_y);
	ctx.fill();

	min_y = ghost_px_y +.05 * SIZE;
	max_y = ghost_px_y +.2 * SIZE;
	ctx.beginPath();
	ctx.lineWidth = (Math.floor(frame/3)%3) +1;
	if (ghost['cheese_effect'] == 0) {
		ctx.strokeStyle = "rgba(0,0,0,.5)";
		ctx.fillStyle = "rgba(0,0,0,.5)";
	} else {
		ctx.strokeStyle = "white";
		ctx.fillStyle = "white";
	}
	for (var i=0 ; i!=2*num_min-1 ; i++) {
		var current_x = begin_x + (end_x-begin_x)*(i+1)/(2*num_min);
		if (i%2 == 0)
			ctx.lineTo(current_x, min_y);
		else
			ctx.lineTo(current_x, max_y);
	}
	ctx.stroke();

	ctx.beginPath();
	ctx.arc(ghost_px_x -.12*SIZE, ghost_px_y -.17*SIZE, .1*SIZE, 0, Math.PI, false);
	ctx.arc(ghost_px_x -.12*SIZE, ghost_px_y -.21*SIZE, .1*SIZE, Math.PI, 2*Math.PI, false);
	ctx.fill();

	ctx.beginPath();
	ctx.arc(ghost_px_x +.12*SIZE, ghost_px_y -.17*SIZE, .1*SIZE, 0, Math.PI, false);
	ctx.arc(ghost_px_x +.12*SIZE, ghost_px_y -.21*SIZE, .1*SIZE, Math.PI, 2*Math.PI, false);
	ctx.fill();
}

/**
 * Draw points
 * @author Nicolas Dubien (https://github.com/dubzzz) */
function drawPoints(canvas, ctx, pts)
{
	ctx.fillStyle = pts.color;
	ctx.font = "bold " + Math.ceil(5 + 4*pts.iter*SIZE/3/FPS) + "px Arial";
	ctx.fillText("+" + pts.value, pts.x*SIZE +5, pts.y*SIZE +5);
	pts.iter++;
}

