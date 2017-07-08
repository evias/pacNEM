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
 * @author  Nicolas Dubien (https://github.com/dubzzz)
 */
var LEFT = 0,
    UP = 1,
    RIGHT = 2,
    DOWN = 3;

var SIZE = 16;
var GHOSTS_COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ff7700"];
var PACMAN_COLORS = ["#ff8000", "#d7df01", "#cc2efa", "#b40431"]

// Updated based on server's values
var FPS = 20;
var CHEESE_EFFECT_FRAMES = 200;
var FRAMES_PER_CELL = 5;

/**
 * class TransitionHelper is used for Screen Transitions
 * using a Canvas.
 *
 * @author  Nicolas Dubien (https://github.com/dubzzz)
 */
var TransitionHelper = function(callback) {
    var callback_ = callback;
    var frame_ = 0;

    var run_ = function() {
        var canvas = document.getElementById('myCanvas');
        if (!canvas.getContext) {
            return;
        }
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.fillRect(0, 0, canvas.width, canvas.height * (frame_ + 1) / (frame_ + 3));

        frame_++;
        if (frame_ >= FPS) {
            callback_();
            return;
        }
        setTimeout(run_, 1000 / FPS);
    };

    {
        run_();
    }
};

/**
 * class DisplayPoints is a type structure containing
 * a Canvas Point configuration.
 *
 * @author  Nicolas Dubien (https://github.com/dubzzz)
 */
var DisplayPoints = function(x, y, color, value) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.iter = 0;
    this.color = color;
};

/**
 * class GameController defines several actions
 * in MVC style using Socket.IO for data transmission
 * on streams.
 *
 * This implementation allows using the Pacman Game in
 * Rooms of up to 4 Persons.
 *
 * @author  Nicolas Dubien (https://github.com/dubzzz)
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var GameController = function(config, socket, nem, chainId) {
    var config_ = config;
    var socket_ = socket;
    var nem_ = nem;
    var chainId_ = chainId;
    var networks_ = { "104": "Mainnet", "-104": "Testnet", "96": "Mijin" };
    var frame_ = 0;
    var ongoing_game_ = false;
    var ongoing_refresh_ = false;
    var grid_ = undefined;
    var last_elapsed_ = 0;
    var points_ = new Array();
    var players_ = new Array();
    var last_room_ack_ = null;
    var play_modes_ = ["sponsored", "pay-per-play", "share-per-play"];
    var play_mode_ = "pay-per-play";
    var sponsor_ = undefined;
    var advertised_ = false;
    var needsPayment_ = false;
    var player_session_ = null;

    this.getSDK = function() {
        return nem_;
    };

    this.start = function() {
        if (!ongoing_game_) {
            // Ask the server to start a new game session
            socket_.emit('new');
            last_elapsed_ = 0;
        }

        return this;
    };

    this.serverReady = function(rawdata) {
        var data = JSON.parse(rawdata);
        grid_ = data['map'];
        FPS = data['constants']['FPS'];
        CHEESE_FRAMES = data['constants']['CHEESE_FRAMES'];
        FRAMES_PER_CELL = data['constants']['FRAMES_PER_CELL'];

        if (!ongoing_game_) {
            ongoing_game_ = true;
        }

        // Setup the canvas
        var canvas = document.getElementById('myCanvas');
        if (!canvas.getContext) {
            return;
        }
        var ctx = canvas.getContext('2d');
        var height = grid_.length;
        var width = grid_[0].length;
        canvas.width = width * SIZE + 10;
        canvas.height = height * SIZE + 10;

        // Draw board
        drawEmptyGameBoard(canvas, ctx, grid_);

        // Screen transition for a new game
        TransitionHelper(function() {
            socket_.emit('start');
        });
        return this;
    };

    this.serverUpdate = function(rawdata) {
        var data = JSON.parse(rawdata);

        // update grid with eaten cheeses
        for (var i = 0; i != data['eat'].length; i++) {
            var x = data['eat'][i]['x'];
            var y = data['eat'][i]['y'];
            grid_[y][x] = ' ';
        }

        // store current iteration's Positions
        for (var i = 0; i != data['points'].length; i++) {
            points_.push(new DisplayPoints(
                data['points'][i]['x'],
                data['points'][i]['y'],
                data['points'][i]['type'] == 'ghost' ? GHOSTS_COLORS[data['points'][i]['index'] % GHOSTS_COLORS.length] : '#000000',
                data['points'][i]['amount']));
        }

        if (!ongoing_refresh_ && data['elapsed'] < last_elapsed_) {
            // we don't need this update anymore
            return;
        }
        ongoing_refresh_ = true;
        last_elapsed_ = data['elapsed'];

        var canvas = document.getElementById('myCanvas');
        if (!canvas.getContext) {
            return;
        }
        var ctx = canvas.getContext('2d');

        //DEBUG console.log("[DEBUG] " + "Now re-drawing Board with Data: " + rawdata);

        // Refresh room Game Board
        refreshRoomBoard(grid_, data, frame_);
        refreshCharacters(data, canvas, ctx, frame_);

        // display Positions on the Board
        for (var i = 0; i != points_.length; i++) {
            drawPoints(canvas, ctx, points_[i]);
        }
        for (var i = 0; i != points_.length; i++) {
            if (points_[i].iter >= FPS / 2) {
                points_.splice(i, 1);
                i--;
            }
        }

        frame_++;
        ongoing_refresh_ = false;
        return this;
    };

    this.serverEndOfGame = function(rawdata) {
        var data = JSON.parse(rawdata);
        ongoing_game_ = false;

        // forward end_of_game to backend for scores processing
        socket_.emit("end_of_game", JSON.stringify({ pacmans: data.pacmans }));

        refreshRoomBoard(null, data, 0); // map (grid) inside data
        return this;
    };

    this.setPlayers = function(players) {
        players_ = players;
        return this;
    };

    this.getPlayers = function() {
        return players_;
    };

    this.hasSession = function() {
        var u = $("#username").val();
        var a = $("#address").val();
        return u.length > 0 && a.length > 0;
    };

    this.setSession = function(session) {
        player_session_ = session;

        // auto sync on setSession (for subsequent hasSession calls)
        $("#username").val(session.getPlayer());
        $("#address").val(session.getAddress());

        return this;
    };

    this.getSession = function() {
        return player_session_;
    };

    this.setPlayMode = function(mode) {
        var isValidMode = $.inArray(mode, play_modes_) != -1;
        if (!isValidMode)
            mode = "pay-per-play";

        play_mode_ = mode;
        return this;
    };

    this.getPlayMode = function() {
        var current_mode = player_session_ != null ? player_session_.getGameMode() : play_mode_;
        return current_mode;
    };

    this.isPlayMode = function(mode) {
        var current_mode = player_session_ != null ? player_session_.getGameMode() : play_mode_;

        return current_mode == mode;
    };

    this.sponsorizeName = function(sponsor) {
        // little nem in here.. just for the fun of it.
        var rBytes = nem_.crypto.nacl.randomBytes(2);
        var rHex = nem_.utils.convert.ua2hex(rBytes);
        var uname = $("#username").val();
        var sName = sponsor.slug + rHex + "-" + uname;

        $("#username").val(sName);
    };

    this.setSponsor = function(sponsor) {
        if (!sponsor.slug.length || !sponsor.xem.length)
            return this;

        sponsor_ = sponsor;
        return this;
    };

    this.getSponsor = function() {
        return sponsor_;
    };

    this.setAdvertised = function(flag) {
        advertised_ = flag === true;
        return this;
    };

    this.isAdvertised = function() {
        return advertised_ === true;
    };

    this.setNeedsPayment = function(flag) {
        needsPayment_ = flag === true;
        return this;
    };

    this.needsPayment = function() {
        return needsPayment_ === true;
    };

    /**
     * Acknowledge current room. This is used
     * to cache room data when the user reloads
     * the page (he won't have left the room
     * and will be back in the room directly)
     *
     * This fake join must be acknowledged by the UI
     * such that the room manager instance is up to
     * date.
     *
     * @return {[type]} [description]
     */
    this.ackRoomMember = function(room_id) {
        //socket_.emit("ack_room", room_id);
    };

    /**
     * Get the latest acknowledged room membership
     * room id. this limits the count of
     * ack_room signal emission.
     *
     * @param  {[type]}  room_id [description]
     * @return {Boolean}         [description]
     */
    this.isRoomMembershipAcknowledged = function(room_id) {
        if (room_id && last_room_ack_ != room_id) {
            last_room_ack_ = room_id;
            return false;
        }

        return true;
    };

    /**
     * Return the nem SDK instance used for
     * working with NEM blockchain features.
     *
     * @return NEM-Library/nem
     */
    this.nem = function() {
        return nem_;
    };

    /**
     * Validate a blockchain Wallet Address on the
     * NEM blockchain using the NEM SDK.
     *
     * This method validate the FORMAT and the AUTHENTICITY
     * of the address using address.isValid and
     * address.isFromNetwork.
     *
     * @param  string   address
     * @return boolean
     */
    this.validateBlockchainWalletAddress = function(address) {
        var format = this.nem().model.address.isValid(address.replace(/-/g, ""));
        if (!format) {
            var err = $("#pacnem-error-address-format").text();
            throw err;
        }

        // also validate that it is an address on the right network
        var authentic = this.nem().model.address.isFromNetwork(address, chainId_);
        if (!authentic) {
            var err = $("#pacnem-error-address-network").text();
            throw err;
        }

        return true;
    };
};

var refreshRoomBoard = function(grid, data, frame) {
    // refresh game board canvas for room's next game
    if (!grid && data.hasOwnProperty("map"))
        grid = data['map'];
    else if (!grid) {
        console.log("[DEBUG] " + "Error refreshing Board, grid object not available!");
        return false;
    }

    var canvas = document.getElementById('myCanvas');
    if (!canvas.getContext) {
        return;
    }
    var ctx = canvas.getContext('2d');
    var height = grid.length;
    var width = grid[0].length;
    canvas.width = width * SIZE + 10;
    canvas.height = height * SIZE + 10;

    drawEmptyGameBoard(canvas, ctx, grid);
    return false;
};

var refreshCharacters = function(data, canvas, ctx, frame) {
    var $rows = $("#pacnem-current-room-wrapper .player-row");
    var $items = [];
    for (var i = 0; i < $rows.length; i++)
        $items.push($($rows[i]));

    for (var i = 0; i != data['pacmans'].length; i++) {
        var pacman = data['pacmans'][i];
        drawPacMan(canvas, ctx, frame, pacman, data['pacmans'].length == 1 ? "#777700" : PACMAN_COLORS[i % PACMAN_COLORS.length]);

        if (typeof pacman["score"] == "undefined" || typeof pacman["lifes"] == "undefined")
            continue; // do not update with empty values

        var score = pacman["score"] ? pacman["score"] : 0;
        var lifes = pacman["lifes"] < 0 ? 0 : pacman["lifes"];
        var combo = pacman["combo"] ? pacman["combo"] + 1 : 1;

        $items[i].find(".pc-score").text(score);
        $items[i].find(".pc-lifes").text(lifes);
        $items[i].find(".pc-combo").text("x" + combo);
    }

    for (var i = 0; i != data['ghosts'].length; i++) {
        drawGhost(canvas, ctx, frame, data['ghosts'][i], GHOSTS_COLORS[i % GHOSTS_COLORS.length]);
    }
};

/**
 * Draw an empty game board
 * @author Nicolas Dubien (https://github.com/dubzzz)
 */
var drawEmptyGameBoard = function(canvas, ctx, grid) {
    /**
     * Draw the Game Board
     */

    // Retrieve grid dimensions
    var height = grid.length;
    var width = grid[0].length;

    // Draw Game Board
    ctx.beginPath();
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width * SIZE + 10, height * SIZE + 10);
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "black";
    ctx.moveTo(2, 2);
    ctx.lineTo(2, height * SIZE + 8);
    ctx.lineTo(width * SIZE + 8, height * SIZE + 8);
    ctx.lineTo(width * SIZE + 8, 2);
    ctx.closePath();
    ctx.stroke();

    for (var i = 0; i != width; i++) {
        for (var j = 0; j != height; j++) {
            if (grid[j][i] == '#') { // display wall
                ctx.fillStyle = "#777777";
                ctx.fillRect(i * SIZE + 5, j * SIZE + 5, SIZE, SIZE);
                continue;
            } else if (grid[j][i] == '.' || grid[j][i] == 'o') { // display cheese
                var sizeFactor = grid[j][i] == 'o' ? .4 : .2;

                ctx.beginPath();
                ctx.fillStyle = "#aaaa00";
                ctx.arc((i + .5) * SIZE + 5, (j + .5) * SIZE + 5, sizeFactor * SIZE, 0, 2 * Math.PI, false);
                ctx.fill();
            }
        }
    }
};

/**
 * Draw the PacMan
 * @author Nicolas Dubien (https://github.com/dubzzz)
 */
var drawPacMan = function(canvas, ctx, frame, pacman, color) {
    if (pacman["lifes"] <= 0) {
        return;
    }
    if (pacman["killed_recently"] != 0 && pacman["killed_recently"] % 4 < 2) {
        return;
    }

    var pacman_px_x = (1. * pacman['x'] / FRAMES_PER_CELL + .5) * SIZE + 5;
    var pacman_px_y = (1. * pacman['y'] / FRAMES_PER_CELL + .5) * SIZE + 5;
    var pacman_mouth = frame % FRAMES_PER_CELL + 3;
    var pacman_direction = pacman['direction'];

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeStyle = pacman['cheese_effect'] == 0 ? "#000000" : color;
    if (pacman_direction == LEFT) {
        ctx.arc(pacman_px_x, pacman_px_y, .45 * SIZE, Math.PI + Math.PI / pacman_mouth, Math.PI - Math.PI / pacman_mouth, false);
    } else if (pacman_direction == UP) {
        ctx.arc(pacman_px_x, pacman_px_y, .45 * SIZE, -Math.PI / 2 + Math.PI / pacman_mouth, -Math.PI / 2 - Math.PI / pacman_mouth, false);
    } else if (pacman_direction == RIGHT) {
        ctx.arc(pacman_px_x, pacman_px_y, .45 * SIZE, Math.PI / pacman_mouth, -Math.PI / pacman_mouth, false);
    } else {
        ctx.arc(pacman_px_x, pacman_px_y, .45 * SIZE, Math.PI / 2 + Math.PI / pacman_mouth, Math.PI / 2 - Math.PI / pacman_mouth, false);
    }
    ctx.lineTo(pacman_px_x, pacman_px_y);
    if (pacman['cheese_effect'] != 0) {
        if (!(pacman['cheese_effect'] <= CHEESE_EFFECT_FRAMES / 5 && (pacman['cheese_effect'] % 4 == 1 || pacman['cheese_effect'] % 4 == 2))) {
            ctx.stroke();
        }
    } else {
        ctx.fill();
        if (pacman['cheese_power'] != 0 && !(pacman['cheese_power'] <= CHEESE_EFFECT_FRAMES / 5 && (pacman['cheese_power'] % 4 == 1 || pacman['cheese_power'] % 4 == 2))) {
            ctx.stroke();
        }
    }
};

/**
 * Draw a ghost
 * @author Nicolas Dubien (https://github.com/dubzzz)
 */
var drawGhost = function(canvas, ctx, frame, ghost, color) {
    if (ghost['cheese_effect'] != 0 && ghost['cheese_effect'] <= CHEESE_EFFECT_FRAMES / 5 && (ghost['cheese_effect'] % 4 == 1 || ghost['cheese_effect'] % 4 == 2)) {
        return;
    }

    var ghost_px_x = (1. * ghost['x'] / FRAMES_PER_CELL + .5) * SIZE + 5;
    var ghost_px_y = (1. * ghost['y'] / FRAMES_PER_CELL + .5) * SIZE + 5;

    ctx.beginPath();
    //if (ghost.under_big_cheese_effect == 0)
    ctx.fillStyle = color;
    //else
    //  ctx.fillStyle = "#777777";
    ctx.arc(ghost_px_x, ghost_px_y - .05 * SIZE, .4 * SIZE, Math.PI, 2 * Math.PI, false);
    var begin_x = ghost_px_x + .4 * SIZE;
    var end_x = ghost_px_x - .4 * SIZE;
    var min_y = ghost_px_y + .25 * SIZE;
    var max_y = ghost_px_y + .45 * SIZE;
    var num_min = 3;
    var animate_padding = (end_x - begin_x) / (2 * num_min) * ((frame % FRAMES_PER_CELL) / (FRAMES_PER_CELL - 1) - .5);

    ctx.lineTo(begin_x, max_y);
    for (var i = 0; i != 2 * num_min - 1; i++) {
        var current_x = begin_x + (end_x - begin_x) * (i + 1) / (2 * num_min) + animate_padding;
        if (i % 2 == 0)
            ctx.lineTo(current_x, min_y);
        else
            ctx.lineTo(current_x, max_y);
    }
    ctx.lineTo(end_x, max_y);
    ctx.fill();

    min_y = ghost_px_y + .05 * SIZE;
    max_y = ghost_px_y + .2 * SIZE;
    ctx.beginPath();
    ctx.lineWidth = (Math.floor(frame / 3) % 3) + 1;
    if (ghost['cheese_effect'] == 0) {
        ctx.strokeStyle = "rgba(0,0,0,.5)";
        ctx.fillStyle = "rgba(0,0,0,.5)";
    } else {
        ctx.strokeStyle = "white";
        ctx.fillStyle = "white";
    }
    for (var i = 0; i != 2 * num_min - 1; i++) {
        var current_x = begin_x + (end_x - begin_x) * (i + 1) / (2 * num_min);
        if (i % 2 == 0)
            ctx.lineTo(current_x, min_y);
        else
            ctx.lineTo(current_x, max_y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ghost_px_x - .12 * SIZE, ghost_px_y - .17 * SIZE, .1 * SIZE, 0, Math.PI, false);
    ctx.arc(ghost_px_x - .12 * SIZE, ghost_px_y - .21 * SIZE, .1 * SIZE, Math.PI, 2 * Math.PI, false);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ghost_px_x + .12 * SIZE, ghost_px_y - .17 * SIZE, .1 * SIZE, 0, Math.PI, false);
    ctx.arc(ghost_px_x + .12 * SIZE, ghost_px_y - .21 * SIZE, .1 * SIZE, Math.PI, 2 * Math.PI, false);
    ctx.fill();
};

/**
 * Draw points
 * @author Nicolas Dubien (https://github.com/dubzzz) */
var drawPoints = function(canvas, ctx, pts) {
    ctx.fillStyle = pts.color;
    ctx.font = "bold " + Math.ceil(5 + 4 * pts.iter * SIZE / 3 / FPS) + "px Arial";
    ctx.fillText("+" + pts.value, pts.x * SIZE + 5, pts.y * SIZE + 5);
    pts.iter++;
};