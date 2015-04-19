/*
 * Requires socket.io to work correctly
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

var TransitionHelper = function(callback) {
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

var DisplayPoints = function(x, y, color, value) {
	this.x = x;
	this.y = y;
	this.value = value;
	this.iter = 0;
	this.color = color;
};

var ClientGame = function(socket) {
	var socket_ = socket;
	var frame_ = 0;
	var ongoing_game_ = false;
	var ongoing_refresh_ = false;
	var grid_ = undefined;
	var last_elapsed_ = 0;
	var points_ = new Array();

	this.start = function() {
		if (! ongoing_game_) {
			// Ask the server to start a new game session
			console.log('Sent: new');
			socket_.emit('new');
			last_elapsed_ = 0;
		}
	};
	
	this.serverReady = function(rawdata) {
		console.log('Received: ready with rawdata');
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
	};

	this.serverEndOfGame = function() {
		console.log('Received: end_of_game');
		ongoing_game_ = false;
	};
	
	this.serverUpdate = function(rawdata) {
		console.log('Received: update with ' + rawdata);
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

		console.debug("Last frame received: " + last_elapsed_);

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
	};
};

/**
 * Draw an empty game board
 */

function drawEmptyGameBoard(canvas, ctx, grid) {
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
 */

function drawPacMan(canvas, ctx, frame, pacman, color) {
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
 */

function drawGhost(canvas, ctx, frame, ghost, color) {
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
 *  * Draw points
 *   */

function drawPoints(canvas, ctx, pts) {
		ctx.fillStyle = pts.color;
		ctx.font = "bold " + Math.ceil(5 + 4*pts.iter*SIZE/3/FPS) + "px Arial";
		ctx.fillText("+" + pts.value, pts.x*SIZE +5, pts.y*SIZE +5);
		pts.iter++;
}

