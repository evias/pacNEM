(function() {

var __conf = require('./configuration.js'),
	LEFT = __conf.LEFT,
	UP = __conf.UP,
	RIGHT = __conf.RIGHT,
	DOWN = __conf.DOWN,
	FRAMES_PER_CELL = __conf.FRAMES_PER_CELL,
	moveCharacter = __conf.moveCharacter,
	distancePx = __conf.distancePx;

var Ghost = require('./ghost.js').Ghost;
var PacMan = require('./pacman.js').PacMan;

/*
 * Global variables
 */

var CHEESE_EFFECT_FRAMES = 200;
var NUM_GHOSTS = 4;
var FPS = 20;

// Define the AI capacity to block the user
// float between 0 and 1
var DIFFICULTY = 0.5;

// Default Grid (initial state)
// Legend:
//  #: wall
//   : no cheese
//  .: cheese
//  o: big cheese
//  s: starting point
//  g: ghost starting point
//  _: forbidden for player
var GRID = [
	"############################",
	"#............##............#",
	"#.####.#####.##.#####.####.#",
	"#o####.#####.##.#####.####o#",
	"#.####.#####.##.#####.####.#",
	"#..........................#",
	"#.####.##.########.##.####.#",
	"#.####.##.########.##.####.#",
	"#......##....##....##......#",
	"######.#####.##.#####.######",
	"######.#####.##.#####.######",
	"######.##..........##.######",
	"######.##.###__###.##.######",
	"######.##.#gg__gg#.##.######",
	"      ....#gg__gg#....      ",
	"######.##.#gggggg#.##.######",
	"######.##.########.##.######",
	"######.##..........##.######",
	"######.##.########.##.######",
	"######.##.########.##.######",
	"#............##............#",
	"#.####.#####.##.#####.####.#",
	"#o####.#####.##.#####.####o#",
	"#...##................##...#",
	"###.##.##.########.##.##.###",
	"###.##.##.########.##.##.###",
	"#......##....##....##......#",
	"#.##########.##.##########.#",
	"#.##########.##.##########.#",
	"#..........................#",
	"############################",
];

var PACMAN_STARTS = [
	[
		{'x': 13, 'y': 23, 'direction': LEFT},
	],
	[
		{'x':  9, 'y': 14, 'direction': LEFT},
		{'x': 18, 'y': 14, 'direction': RIGHT},
	],
	[
		{'x':  6, 'y': 23, 'direction': RIGHT},
		{'x': 21, 'y': 23, 'direction': LEFT},
		{'x': 13, 'y':  5, 'direction': LEFT},
	],
	[
		{'x':  6, 'y': 23, 'direction': RIGHT},
		{'x': 21, 'y': 23, 'direction': LEFT},
		{'x':  1, 'y':  5, 'direction': RIGHT},
		{'x': 26, 'y':  5, 'direction': LEFT},
	],
];

/*
 * Possible starting points for ghosts
 * Computed from GRID
 */

var GHOST_STARTS_X = new Array();
var GHOST_STARTS_Y = new Array();
{
	var height = GRID.length;
	var width = GRID[0].length;
	
	for (var i=0 ; i!=width ; i++) {
		for (var j=0 ; j!=height ; j++) {
			if (GRID[j][i] == 'g') {
				GHOST_STARTS_X.push(i * FRAMES_PER_CELL);
				GHOST_STARTS_Y.push(j * FRAMES_PER_CELL);
			}
		}
	}
}

/*
 * Game
 * Manage the progress of the current game (several rounds)
 */

var Game = function(io, sids, room) {
	var self = this;
	var start_time_ = Date.now();

	var pacmans_ = new Array();
	var ghosts_ = new Array();
	var num_rounds_ = 0;
	
	var io = io;
	var sids_ = sids;
	var room_ = room;

	var map_ = undefined;
	var bool_map_ = undefined;
	var num_cheeses_ = -1;
	var last_timeout_ = undefined;
	var start_received_from_ = new Array();

	this.start = function(id) {
		start_received_from_[id] = true;
		var everyone_has_sent = true;
		for (var i=0 ; i!=start_received_from_.length ; i++) {
			everyone_has_sent &= start_received_from_[i];
		}
		if (! everyone_has_sent) {
			return;
		}

		var one_is_alive = false;
		for (var i =0 ; i!=pacmans_.length ; i++) {
			one_is_alive |= pacmans_[i].isAlive();
		}
		if (! one_is_alive) {
			return;
		}
		last_timeout_ = setTimeout(this.iterate, 1000/FPS);
	};

	this.refresh = function() {
		var one_is_alive = false;
		for (var i =0 ; i!=pacmans_.length ; i++) {
			one_is_alive |= pacmans_[i].isAlive();
		}
		if (one_is_alive) {
			// Prepare the game configuration
			// Map
			if (num_cheeses_ == 0 || num_cheeses_ == -1) {
				num_rounds_++;
				num_cheeses_ = 0;
				map_ = new Array();
				bool_map_ = new Array();
				var height = GRID.length;
				var width = GRID[0].length;
				for (var j=0 ; j!=height ; j++) {
					var map_line = new Array();
					var bool_map_line = new Array();
					for (var i=0 ; i!=width ; i++) {
						map_line.push(GRID[j][i]);
						bool_map_line.push(GRID[j][i] == "." || GRID[j][i] == "o" || GRID[j][i] == " ");
						if (GRID[j][i] == "." || GRID[j][i] == "o") {
							num_cheeses_++;
						}
					}
					map_.push(map_line);
					bool_map_.push(bool_map_line);
				}
			}
			
			// Characters
			start_received_from_ = new Array();
			for (var i = 0 ; i!=pacmans_.length ; i++) {
				var pacman_x =  PACMAN_STARTS[pacmans_.length -1][i]['x'];
				var pacman_y =  PACMAN_STARTS[pacmans_.length -1][i]['y'];
				var pacman_direction =  PACMAN_STARTS[pacmans_.length -1][i]['direction'];
				pacmans_[i].restart(pacman_x * FRAMES_PER_CELL, pacman_y * FRAMES_PER_CELL, pacman_direction);
				if (map_[pacman_y][pacman_x] == "." || map_[pacman_y][pacman_x] == "o") {
					num_cheeses_--;
				}
				pacmans_[i].setKilledRecently(0);
				map_[pacman_y][pacman_x] = " ";
				start_received_from_.push(false);
			}
			
			for (var i=0 ; i!=ghosts_.length ; i++) {
				ghosts_[i].restart(GHOST_STARTS_X, GHOST_STARTS_Y);
				ghosts_[i].setDifficulty(1. * (num_rounds_ * num_rounds_) / (num_rounds_ * num_rounds_ +7));
			}
			
			for (var i = 0 ; i != sids_.length ; i++) {
				io.sockets.to(sids_[i]).emit('ready', JSON.stringify({
						'constants':
						{
							'FRAMES_PER_CELL': FRAMES_PER_CELL,
							'FPS': FPS,
							'CHEESE_EFFECT_FRAMES': CHEESE_EFFECT_FRAMES,
						},
						'map': map_,
				}));
			}
		} else {
			for (var i = 0 ; i != sids_.length ; i++) {
				io.sockets.to(sids_[i]).emit('end_of_game');
			}
			room_.notifyEnd();
		}
	};

	this.setPacmanDirection = function(direction, id) {
		pacmans_[id].setNextDirection(direction);
	};

	this.iterate = function() {
		last_timeout_ = undefined;

		var state = {};
		state['points'] = new Array();
		state['eat'] = new Array();
		
		for (var j=0 ; j!=pacmans_.length ; j++) {
			var pacman = pacmans_[j];
			if (pacman.hasBeenKilledRecently() || ! pacman.isAlive()) {
				continue;
			}

			// Check for contact between PacMan and a ghost
			for (var i=0 ; i!=ghosts_.length ; i++) {
				// Contact detected
				if (distancePx(
						map_,
						ghosts_[i].getX(), ghosts_[i].getY(),
						pacman.getX(), pacman.getY()) <= FRAMES_PER_CELL/2) {
					// Under cheese effect
					if (pacman.hasCheesePower() && ghosts_[i].isUnderCheeseEffect()) {
						var increase = pacman.increaseScore(100);
						state['points'].push({
								"type": "ghost",
								"index": i,
								"x": pacman.getX()/FRAMES_PER_CELL,
								"y": pacman.getY()/FRAMES_PER_CELL,
								"amount": increase,
						});
						ghosts_[i].restart(GHOST_STARTS_X, GHOST_STARTS_Y);
						pacman.increaseCombo();
					// No cheese effect
					} else {
						pacman.kill();
						if (pacmans_.length == 1) {
							self.refresh();
							return;
						} else {
							var pacman_x =  PACMAN_STARTS[pacmans_.length -1][j]['x'];
							var pacman_y =  PACMAN_STARTS[pacmans_.length -1][j]['y'];
							var pacman_direction =  PACMAN_STARTS[pacmans_.length -1][j]['direction'];
							pacmans_[j].restart(pacman_x * FRAMES_PER_CELL, pacman_y * FRAMES_PER_CELL, pacman_direction);
							pacman.setKilledRecently(FPS);
						}
					}
				}
			}
			
			// Check for contact between PacMan and a PacMan
			for (var i=j+1 ; i<pacmans_.length ; i++) {
				// Contact detected
				if (! pacmans_[i].hasBeenKilledRecently()
						&& pacmans_[i].isAlive()
						&& distancePx(
							map_,
							pacmans_[i].getX(), pacmans_[i].getY(),
							pacman.getX(), pacman.getY()) <= FRAMES_PER_CELL/2) {
					if (pacman.hasCheesePower() && pacmans_[i].isUnderCheeseEffect()) {
						pacmans_[i].kill();
						var pacman_x =  PACMAN_STARTS[pacmans_.length -1][i]['x'];
						var pacman_y =  PACMAN_STARTS[pacmans_.length -1][i]['y'];
						var pacman_direction =  PACMAN_STARTS[pacmans_.length -1][i]['direction'];
						pacmans_[i].restart(pacman_x * FRAMES_PER_CELL, pacman_y * FRAMES_PER_CELL, pacman_direction);
						pacmans_[i].setKilledRecently(FPS);
						
						var increase = pacman.increaseScore(200);
						state['points'].push({
								"type": "pacman",
								"index": i,
								"x": pacman.getX()/FRAMES_PER_CELL,
								"y": pacman.getY()/FRAMES_PER_CELL,
								"amount": increase,
						});
						pacman.increaseCombo();
					} else if (pacmans_[i].hasCheesePower() && pacman.isUnderCheeseEffect()) {
						pacman.kill();
						var pacman_x =  PACMAN_STARTS[pacmans_.length -1][j]['x'];
						var pacman_y =  PACMAN_STARTS[pacmans_.length -1][j]['y'];
						var pacman_direction =  PACMAN_STARTS[pacmans_.length -1][j]['direction'];
						pacman.restart(pacman_x * FRAMES_PER_CELL, pacman_y * FRAMES_PER_CELL, pacman_direction);
						pacman.setKilledRecently(FPS);
						
						var increase = pacmans_[i].increaseScore(200);
						state['points'].push({
								"type": "pacman",
								"index": j,
								"x": pacmans_[i].getX()/FRAMES_PER_CELL,
								"y": pacmans_[i].getY()/FRAMES_PER_CELL,
								"amount": increase,
						});
						pacmans_[i].increaseCombo();
					} else if (pacman.getX() == pacmans_[i].getX()) {
						var diffY = pacmans_[i].getY() - pacman.getY();
						if (Math.abs(diffY) < FRAMES_PER_CELL) {
							if (diffY > 0) {
								pacman.setNextDirection(UP);
								pacmans_[i].setNextDirection(DOWN);
							} else {
								pacman.setNextDirection(DOWN);
								pacmans_[i].setNextDirection(UP);
							}
						} else {
							if (diffY > 0) {
								pacman.setNextDirection(DOWN);
								pacmans_[i].setNextDirection(UP);
							} else {
								pacman.setNextDirection(UP);
								pacmans_[i].setNextDirection(DOWN);
							}
						}
					} else if (pacman.getY() == pacmans_[i].getY()) {
						var diffX = pacmans_[i].getX() - pacman.getX();
						if (Math.abs(diffX) < FRAMES_PER_CELL) {
							if (diffX > 0) {
								pacman.setNextDirection(LEFT);
								pacmans_[i].setNextDirection(RIGHT);
							} else {
								pacman.setNextDirection(RIGHT);
								pacmans_[i].setNextDirection(LEFT);
							}
						} else {
							if (diffX > 0) {
								pacman.setNextDirection(RIGHT);
								pacmans_[i].setNextDirection(LEFT);
							} else {
								pacman.setNextDirection(LEFT);
								pacmans_[i].setNextDirection(RIGHT);
							}
						}
					} else {
						pacman.goOppositeDirection();
						pacmans_[i].goOppositeDirection();
					}
				}
			}

			// Eat the cheese if there is one
			if (pacman.getX() % FRAMES_PER_CELL == 0 && pacman.getY() % FRAMES_PER_CELL == 0) {
				var cell_x = pacman.getX() / FRAMES_PER_CELL;
				var cell_y = pacman.getY() / FRAMES_PER_CELL;
				if (map_[cell_y][cell_x] == "." || map_[cell_y][cell_x] == "o") {
					if (map_[cell_y][cell_x] == ".") {
						pacman.increaseScore(10);
					} else {
						var increase = pacman.increaseScore(50);
						state['points'].push({
								"type": "cheese_effect",
								"x": cell_x,
								"y": cell_y,
								"amount": increase,
						});
						pacman.setCheesePower(CHEESE_EFFECT_FRAMES);
						for (var i=0 ; i!=pacmans_.length ; i++) {
							pacmans_[i].setUnderCheeseEffect(CHEESE_EFFECT_FRAMES);
						}
						for (var i=0 ; i != ghosts_.length ; i++) {
							ghosts_[i].setUnderCheeseEffect(CHEESE_EFFECT_FRAMES);
						}
					}
					state['eat'].push({
							"x": cell_x,
							"y": cell_y,
					});
					map_[cell_y][cell_x] = " ";
					num_cheeses_--;
				}
				if (num_cheeses_ == 0) {
					self.refresh();
					return;
				}
			}
		}
		if (pacmans_.length >= 2) {
			var one_is_alive = false;
			for (var i =0 ; i!=pacmans_.length ; i++) {
				one_is_alive |= pacmans_[i].isAlive();
			}
			if (! one_is_alive) {
				self.refresh();
				return;
			}
		}
		
		state['elapsed'] = Date.now() - start_time_;
		state["pacmans"] = new Array();
		for (var i=0 ; i!=pacmans_.length ; i++) {
			pacmans_[i].move(map_);
			state["pacmans"].push(pacmans_[i].toDictionary());
		}
		state["ghosts"] = new Array();
		for (var i=0 ; i != ghosts_.length ; i++) {
			var nearest = -1;
			var nearest_distance = -1;
			for (var j=0 ; j!=pacmans_.length ; j++) {
				var pacman = pacmans_[j];
				if (pacman.isAlive()) {
					var distance = distancePx(
							map_,
							ghosts_[i].getX(), ghosts_[i].getY(),
							pacman.getX(), pacman.getY());
					if (nearest == -1 || nearest_distance > distance) {
						nearest = j;
						nearest_distance = distance;
					}
				}
			}
			ghosts_[i].move(map_, bool_map_, pacmans_[nearest], ghosts_);
			state["ghosts"].push(ghosts_[i].toDictionary());
		}
		for (var i = 0 ; i != sids_.length ; i++) {
			io.sockets.to(sids_[i]).emit("update", JSON.stringify(state));
		}
		last_timeout_ = setTimeout(self.iterate, 1000/FPS);
	};

	this.quit = function() {
		clearTimeout(last_timeout_);
		last_timeout_ = undefined;
		for (var i = 0 ; i != sids_.length ; i++) {
			io.sockets.to(sids_[i]).emit('end_of_game');
		}
	};
	
	{
		for (var i=0 ; i!=sids_.length ; i++) {
			pacmans_.push(new PacMan());
		}
		for (var i=0 ; i!=NUM_GHOSTS ; i++) {
			ghosts_.push(new Ghost());
		}
	}
};

/*
 * Module definition
 */

module.exports.LEFT = LEFT;
module.exports.UP = UP;
module.exports.RIGHT = RIGHT;
module.exports.DOWN = DOWN;

module.exports.Game = Game;

}());

