(function() {

var __conf = require('./configuration.js'),
	LEFT = __conf.LEFT,
	UP = __conf.UP,
	RIGHT = __conf.RIGHT,
	DOWN = __conf.DOWN,
	FRAMES_PER_CELL = __conf.FRAMES_PER_CELL,
	isForbiddenForGhost = __conf.isForbiddenForGhost,
	moveCharacter = __conf.moveCharacter,
	distanceCells = __conf.distanceCells;

var __heap = require('../tools/heap.js'),
	Heap = __heap.Heap;

var HeapElement = function(x, y, initial_direction, dist_from_start, dist_to_end) {
	this.x = x;
	this.y = y;
	this.initial_direction = initial_direction;
	this.dist_from_start = dist_from_start; // real distance
	this.dist_to_end = dist_to_end; // distance measured for a line
	this.dist = dist_from_start + dist_to_end;
};


/**
 * Ghosts
 */

var Ghost = function() {
	if (! Ghost.last_id) {
		Ghost.last_id = 1;
	}
	var id_ = Ghost.last_id++;
	var x_ = -1, y_ = -1;
	var direction_ = -1;
	var under_cheese_effect_ = 0;
	var difficulty_ = 0.;

	this.restart = function(GHOST_STARTS_X, GHOST_STARTS_Y) {
		under_cheese_effect_ = 0;

		var rand_starting_pt = Math.floor(Math.random() * GHOST_STARTS_X.length);
		x_ = GHOST_STARTS_X[rand_starting_pt];
		y_ = GHOST_STARTS_Y[rand_starting_pt];
		direction_ = Math.floor(Math.random() * 4);
	};

	this.setDifficulty = function(difficulty) {
		difficulty_ = difficulty;
	};
	
	this.changeDirectionStupid = function(map) {
		var height = map.length;
		var width = map[0].length;
		
		// Check if possible direction
		var cell_x = x_ / FRAMES_PER_CELL;
		var cell_y = y_ / FRAMES_PER_CELL;
		var available_directions = new Array();
		
		var cell_x_move, cell_y_move;

		//  Check LEFT
		if (cell_x > 0) {
			cell_x_move = cell_x -1;
		} else {
			cell_x_move = width -1;
		}
		cell_y_move = cell_y;
		if (! isForbiddenForGhost(map[cell_y_move][cell_x_move], map[cell_y][cell_x])) {
			available_directions.push(LEFT);
		}
		
		//  Check UP
		cell_x_move = cell_x;
		if (cell_y > 0) {
			cell_y_move = cell_y -1;
		} else {
			cell_y_move = height -1;
		}
		if (! isForbiddenForGhost(map[cell_y_move][cell_x_move], map[cell_y][cell_x])) {
			available_directions.push(UP);
		}
		
		//  Check RIGHT
		if (cell_x < width -1) {
			cell_x_move = cell_x +1;
		} else {
			cell_x_move = 0;
		}
		cell_y_move = cell_y;
		if (! isForbiddenForGhost(map[cell_y_move][cell_x_move], map[cell_y][cell_x])) {
			available_directions.push(RIGHT);
		}
		
		//  Check DOWN
		cell_x_move = cell_x;
		if (cell_y < height -1) {
			cell_y_move = cell_y +1;
		} else {
			cell_y_move = 0;
		}
		if (! isForbiddenForGhost(map[cell_y_move][cell_x_move], map[cell_y][cell_x])) {
			available_directions.push(DOWN);
		}

		// Remove the direction which is at the opposite of the current one
		// if there is at least another choice
		if (available_directions.length > 1) {
			var index = available_directions.indexOf((direction_ +2) % 4);
			if (index > -1) {
				available_directions.splice(index, 1);
			}
		}
		
		// Update direction
		direction_ = available_directions[Math.floor(Math.random() * available_directions.length)];
	};
	
	
	this.createHeapElement = function(x, y, map, truefalse_grid, previous, current_direction, target_x, target_y) {
		if (truefalse_grid[y][x]) {
			truefalse_grid[y][x] = false;
			var dist_to_target = distanceCells(map, x, y, target_x, target_y);
			var elt = new HeapElement(x, y, previous.initial_direction, previous.dist_from_start +1, dist_to_target);
			if (elt.initial_direction == -1)
				elt.initial_direction = current_direction;
			return elt;
		}
		return null;
	};
	
	this.changeDirectionAStar = function(map, bool_map, pacman, ghosts) {
		var height = map.length;
		var width = map[0].length;
		
		var cell_x = x_ / FRAMES_PER_CELL;
		var cell_y = y_ / FRAMES_PER_CELL;
		if (map[cell_y][cell_x] == "g" || map[cell_y][cell_x] == "_") {
			return this.changeDirectionStupid(map);
		}
		
		var target_x = Math.floor(pacman.getX() / FRAMES_PER_CELL);
		var target_y = Math.floor(pacman.getY() / FRAMES_PER_CELL);
		
		var heap = new Heap();
		heap.push(new HeapElement(cell_x, cell_y, -1, 0, distanceCells(map, cell_x, cell_y, target_x, target_y)));
		
		var bmap = new Array();
		for (var j=0 ; j!=bool_map.length ; j++) {
			bmap.push(bool_map[j].slice());
		}
		
		// Cannot walk on other ghosts path
		// the idea is to reach the target by taking several paths
		for (var i=0 ; i!=ghosts.length ; i++) {
			bmap[Math.floor(ghosts[i].getY() / FRAMES_PER_CELL)][Math.floor(ghosts[i].getX() / FRAMES_PER_CELL)] = false;
		}
		
		var num_elts = 0;
		var current_elt = undefined;
		while (heap.size() > 0) {
			// Limit the number of loops
			num_elts++;
			if (num_elts >= 1000) {
				direction_ = current_elt.initial_direction;
			}

			current_elt = heap.pop();
			var elt = null;

			elt = this.createHeapElement((current_elt.x -1 +width)%width, current_elt.y, map, bmap, current_elt, LEFT, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					direction_ = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}

			elt = this.createHeapElement((current_elt.x +1) % width, current_elt.y, map, bmap, current_elt, RIGHT, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					direction_ = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}

			elt = this.createHeapElement(current_elt.x, (current_elt.y -1 +height) % height, map, bmap, current_elt, UP, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					direction_ = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}
			
			elt = this.createHeapElement(current_elt.x, (current_elt.y +1) % height, map, bmap, current_elt, DOWN, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					direction_ = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}
			
			// if only one direction is possible from this point
			if (current_elt.initial_direction == -1 && heap.size() == 1) {
				direction_ = heap.pop().initial_direction;
				return;
			}
		}
	};
	
	this.changeDirection = function(map, bool_map, pacman, ghosts) {
		// if on the center of a cell: change direction?
		if (x_ % FRAMES_PER_CELL == 0 && y_ % FRAMES_PER_CELL == 0) {
			if (! this.isUnderCheeseEffect() && Math.random() < difficulty_) {
				this.changeDirectionAStar(map, bool_map, pacman, ghosts);
			// Purely random move if big cheese effect
			} else {
				this.changeDirectionStupid(map);
			}
		}
	};
	
	this.move = function(map, bool_map, pacman, ghosts) {
		// Change direction if necessary/possible
		this.changeDirection(map, bool_map, pacman, ghosts);

		// Move following this.direction
		// No move half of the time if under big cheese effect
		if (! this.isUnderCheeseEffect() || under_cheese_effect_ % 2 == 0) {
			var new_position = moveCharacter(map, x_, y_, direction_, false);
			x_ = new_position[0];
			y_ = new_position[1];
		}

		// Decrease cheese effect
		if (under_cheese_effect_ > 0) {
			under_cheese_effect_--;
		}
	};

	this.isUnderCheeseEffect = function() {
		return under_cheese_effect_ != 0;
	};

	this.getUnderCheeseEffect = function() {
		return under_cheese_effect_;
	};

	this.getX = function() {
		return x_;
	};

	this.getY = function() {
		return y_;
	};

	this.setUnderCheeseEffect = function(value) {
		under_cheese_effect_ = value;
	};
	
	this.toDictionary = function() {
		return {
				'x': x_,
				'y': y_,
				'cheese_effect': under_cheese_effect_,
		};
	};
};

/*
 * Module definition
 */

module.exports.Ghost = Ghost;

}());

