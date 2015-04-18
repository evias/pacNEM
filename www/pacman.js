(function() {

/*
 * Global variables
 */

var LEFT = 0,
	UP = 1,
	RIGHT = 2,
	DOWN = 3;

var directionToString = function(direction) {
	return ["LEFT", "UP", "RIGHT", "DOWN"][direction];
};

var CHEESE_EFFECT_FRAMES = 200;
var NUM_GHOSTS = 4;
var FPS = 20;
var FRAMES_PER_CELL = 5;

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
	"#...##.......s........##...#",
	"###.##.##.########.##.##.###",
	"###.##.##.########.##.##.###",
	"#......##....##....##......#",
	"#.##########.##.##########.#",
	"#.##########.##.##########.#",
	"#..........................#",
	"############################",
];

// Possible starting points for ghosts and pacman
// Computed from GRID
var PACMAN_START_X = -1;
var PACMAN_START_Y = -1;
var GHOST_STARTS_X = new Array();
var GHOST_STARTS_Y = new Array();
{
	var height = GRID.length;
	var width = GRID[0].length;
	
	for (var i=0 ; i!=width ; i++) {
		for (var j=0 ; j!=height ; j++) {
			if (GRID[j][i] == 's') {
				PACMAN_START_X = i * FRAMES_PER_CELL;
				PACMAN_START_Y = j * FRAMES_PER_CELL;
			} else if (GRID[j][i] == 'g') {
				GHOST_STARTS_X.push(i * FRAMES_PER_CELL);
				GHOST_STARTS_Y.push(j * FRAMES_PER_CELL);
			}
		}
	}
}

/**
 * Requirements for A* implementation
 * used to find the "shortest path" to reach the PacMan
 */

var HeapElement = function(x, y, initial_direction, dist_from_start, dist_to_end) {
	this.x = x;
	this.y = y;
	this.initial_direction = initial_direction;
	this.dist_from_start = dist_from_start; // real distance
	this.dist_to_end = dist_to_end; // distance measured for a line
	this.dist = dist_from_start + dist_to_end;
};

var Heap = function() {
	this.elements = new Array();
	this.num_elements = 0;
	
	this.push = function(heap_element) {
		// room available?
		if (this.elements.length > this.num_elements)
			this.elements[this.num_elements] = heap_element;
		else
			this.elements.push(heap_element);
		
		this.num_elements++;
		this.moveUp(this.num_elements -1);
	};
	
	this.pop = function() {
		var head_heap_elt = this.elements[0];
		this.num_elements--;

		if (this.num_elements == 0)
			return head_heap_elt;
		
		this.elements[0] = this.elements[this.num_elements];
		this.moveDown(0);
		return head_heap_elt;
	};
	
	this.free = function() {
		this.elements = new Array();
	};
	
	this.size = function() {
		return this.num_elements;
	};
	
	this.moveUp = function(id) {
		if (id == 0)
			return;

		var parent_id = Math.floor((id -1)/2);
		if (this.elements[id].dist < this.elements[parent_id].dist) {
			var tmp_heap_elt = this.elements[id];
			this.elements[id] = this.elements[parent_id];
			this.elements[parent_id] = tmp_heap_elt;
			this.moveUp(parent_id);
		}
	};
	
	this.moveDown = function(id) {
		var child1_id = id*2 +1;
		if (child1_id >= this.num_elements) // it does not have any child
			return;
		
		var child_id = child1_id;
		var child2_id = id*2 +2;
		if (child2_id < this.num_elements) { // only one child
			if (this.elements[child2_id].dist < this.elements[child1_id].dist) {
				child_id = child2_id;
			}
		}
		if (this.elements[child_id].dist < this.elements[id].dist) {
			var tmp_heap_elt = this.elements[id];
			this.elements[id] = this.elements[child_id];
			this.elements[child_id] = tmp_heap_elt;
			this.moveDown(child_id);
		}
	};
};

/**
 * Compute the new position of the character
 * based on the current one and a given direction
 */

function moveCharacter(map, x, y, direction, pacman) {
	var x_old = x;
	var y_old = y;
	var height = map.length;
	var width = map[0].length;
	
	if (direction == LEFT) {
		x--;
		// out of the grid
		if (x < 0) {
			x = (width -1) * FRAMES_PER_CELL;
			if (isForbiddenFor(map, map[y/FRAMES_PER_CELL][x/FRAMES_PER_CELL], x_old, y_old, direction, pacman)) {
				x = 0;
			}
		// into a wall
		} else if (isForbiddenFor(map, map[y/FRAMES_PER_CELL][Math.floor(1.*x/FRAMES_PER_CELL)], x_old, y_old, direction, pacman)) {
			x++;
		}
	} else if (direction == UP) {
		y--;
		// out of the grid
		if (y < 0) {
			y = (height -1) * FRAMES_PER_CELL;
			if (isForbiddenFor(map, map[y/FRAMES_PER_CELL][x/FRAMES_PER_CELL], x_old, y_old, direction, pacman)) {
				y = 0;
			}
		// into a wall
		} else if (isForbiddenFor(map, map[Math.floor(1.*y/FRAMES_PER_CELL)][x/FRAMES_PER_CELL], x_old, y_old, direction, pacman)) {
			y++;
		}
	} else if (direction == RIGHT) {
		x++;
		// out of the grid
		if (x > (width -1) * FRAMES_PER_CELL) {
			x = 0;
			if (isForbiddenFor(map, map[y/FRAMES_PER_CELL][x/FRAMES_PER_CELL], x_old, y_old, direction, pacman)) {
				x = (width -1) * FRAMES_PER_CELL;
			}
		// into a wall
		} else if (isForbiddenFor(map, map[y/FRAMES_PER_CELL][Math.ceil(1.*x/FRAMES_PER_CELL)], x_old, y_old, direction, pacman)) {
			x--;
		}
	} else {
		y++;
		// out of the grid
		if (y > (height -1) * FRAMES_PER_CELL) {
			y = 0;
			if (isForbiddenFor(map, map[y/FRAMES_PER_CELL][x/FRAMES_PER_CELL], x_old, y_old, direction, pacman)) {
				y = (height -1) * FRAMES_PER_CELL;
			}
		// into a wall
		} else if (isForbiddenFor(map, map[Math.ceil(1.*y/FRAMES_PER_CELL)][x/FRAMES_PER_CELL], x_old, y_old, direction, pacman)) {
			y--;
		}
	}
	return [x, y];
}

/**
 * Is forbidden for PacMan/Ghost
 */

function isForbiddenForGhost(target_cell_type, current_cell_type) {
	if (current_cell_type == "g") {
		return target_cell_type == "#";
	}
	if (current_cell_type == "_") {
		return target_cell_type == "#" || target_cell_type == "g";
	}
	return target_cell_type == "#" || target_cell_type == "g" || target_cell_type == "_";
}

function isForbiddenForPacMan(target_cell_type) {
	return target_cell_type == "#" || target_cell_type == "g" || target_cell_type == "_";
}

function isForbiddenFor(map, target_cell_type, x_old, y_old, direction, pacman) {
	if (! pacman) {
		if (direction == LEFT) {
			current_cell_type = map[y_old/FRAMES_PER_CELL][Math.ceil(1.*x_old/FRAMES_PER_CELL)];
		} else if (direction == UP) {
			current_cell_type = map[Math.ceil(1.*y_old/FRAMES_PER_CELL)][x_old/FRAMES_PER_CELL];
		} else if (direction == RIGHT) {
			current_cell_type = map[y_old/FRAMES_PER_CELL][Math.floor(1.*x_old/FRAMES_PER_CELL)];
		} else {
			current_cell_type = map[Math.floor(1.*y_old/FRAMES_PER_CELL)][x_old/FRAMES_PER_CELL];
		}
		
		return isForbiddenForGhost(target_cell_type, current_cell_type);
	}
	return isForbiddenForPacMan(target_cell_type);
}

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

	this.restart = function() {
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
	
	this.distanceCells = function(map, x1, y1, x2, y2) {
		var width = map[0].length
		var height = map.length
		
		// Deltas take into account possible paths from side to side
		var delta_x = Math.min(Math.abs(x1-x2), Math.abs(x1-x2+width), Math.abs(x2-x1+width));
		var delta_y = Math.min(Math.abs(y1-y2), Math.abs(y1-y2+height), Math.abs(y2-y1+height));

		return Math.sqrt(delta_x*delta_x+delta_y*delta_y);
	};
	
	this.createHeapElement = function(x, y, map, truefalse_grid, previous, current_direction, target_x, target_y) {
		if (truefalse_grid[y][x]) {
			truefalse_grid[y][x] = false;
			var dist_to_target = this.distanceCells(map, x, y, target_x, target_y);
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
		heap.push(new HeapElement(cell_x, cell_y, -1, 0, this.distanceCells(map, cell_x, cell_y, target_x, target_y)));
		
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
				console.log('(a*)     Ghost #' + id_ + ' change his mind and goes to the ' + directionToString(direction_));
			// Purely random move if big cheese effect
			} else {
				this.changeDirectionStupid(map);
				console.log('(stupid) Ghost #' + id_ + ' change his mind and goes to the ' + directionToString(direction_));
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
};

/*
 * PacMan
 */

var PacMan = function() {
	var x_ = -1, y_ = -1;
	var direction_ = LEFT;
	var next_direction_ = LEFT;
	var lifes_ = 3;
	
	this.restart = function() {
		x_ = PACMAN_START_X;
		y_ = PACMAN_START_Y;
		direction_ = LEFT;
		next_direction_ = LEFT;
	};

	this.kill = function() {
		lifes_--;
	};
	
	this.setNextDirection = function(direction) {
		next_direction_ = direction;
	};

	this.move = function(map) {
		var height = map.length;
		var width = map[0].length;
		
		// Test if the next position asked by the player is acceptable
		// Can always go in the opposite direction
		if (direction_ == (next_direction_ + 2) % 4) {
			direction_ = next_direction_;
		
		// Need to wait to be at the middle of a cell to change direction (if not opposite)
		} else if (x_ % FRAMES_PER_CELL == 0 && y_ % FRAMES_PER_CELL == 0) {
			var cell_x = x_ / FRAMES_PER_CELL;
			var cell_y = y_ / FRAMES_PER_CELL;

			if (next_direction_ == LEFT) {
				if ((cell_x > 0 && !isForbiddenForPacMan(map[cell_y][cell_x-1]) || (cell_x == 0 && !isForbiddenForPacMan(map[cell_y][width-1])))) {
					direction_ = next_direction_;
				}
			} else if (next_direction_ == UP) {
				if ((cell_y > 0 && !isForbiddenForPacMan(map[cell_y-1][cell_x]) || (cell_y == 0 && !isForbiddenForPacMan(map[height-1][cell_x])))) {
					direction_ = next_direction_;
				}
			} else if (next_direction_ == RIGHT) {
				if ((cell_x < width-1 && !isForbiddenForPacMan(map[cell_y][cell_x+1]) || (cell_x == width-1 && !isForbiddenForPacMan(map[cell_y][0])))) {
					direction_ = next_direction_;
				}
			} else {
				if ((cell_y < height-1 && !isForbiddenForPacMan(map[cell_y+1][cell_x]) || (cell_y == height-1 && !isForbiddenForPacMan(map[0][cell_x])))) {
					direction_ = next_direction_;
				}
			}
		}
		
		var new_position = moveCharacter(map, x_, y_, direction_, true);
		x_ = new_position[0];
		y_ = new_position[1];
	};

	this.getDirection = function() {
		return direction_;
	};

	this.isAlive = function() {
		return lifes_ >= 0;
	};

	this.getLifes = function() {
		return lifes_;
	};

	this.getX = function() {
		return x_;
	};

	this.getY = function() {
		return y_;
	};
};

/*
 * Game
 * Manage the progress of the current game (several rounds)
 */

var Game = function(io, sid) {
	var me_ = this;
	var start_time_ = Date.now();

	var pacman_ = new PacMan();
	var ghosts_ = new Array();
	var num_rounds_ = 0;
	var score_ = 0;
	
	var io = io;
	var sid_ = sid;
	
	var map_ = undefined;
	var bool_map_ = undefined;
	var under_cheese_effect_ = 0;
	var combo_ghosts_ = 0;
	var num_cheeses_ = -1;

	this.start = function() {
		if (! pacman_.isAlive()) {
			return;
		}
		setTimeout(this.iterate, 1000/FPS);
	};

	this.refresh = function() {
		if (pacman_.isAlive()) {
			// Prepare the game configuration
			// Map
			under_cheese_effect_ = 0;
			if (num_cheeses_ != 0) {
				combo_ghosts_ = 0;
			}

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
						bool_map_line.push(GRID[j][i] == "." || GRID[j][i] == "o" || GRID[j][i] == "s" || GRID[j][i] == " ");
						if (GRID[j][i] == "." || GRID[j][i] == "o") {
							num_cheeses_++;
						}
					}
					map_.push(map_line);
					bool_map_.push(bool_map_line);
				}
			}
			
			// Characters
			pacman_.restart();
			for (var i=0 ; i!=ghosts_.length ; i++) {
				ghosts_[i].restart();
				ghosts_[i].setDifficulty(1. * (num_rounds_ * num_rounds_) / (num_rounds_ * num_rounds_ +7));
			}
			
			io.sockets.emit('ready', JSON.stringify({
					'constants':
					{
						'FRAMES_PER_CELL': FRAMES_PER_CELL,
						'FPS': FPS,
						'CHEESE_EFFECT_FRAMES': CHEESE_EFFECT_FRAMES,
					},
					'map': map_,
			}));
			//io.sockets.to('Socket#' + sid).emit('ready');
		} else {
			io.sockets.emit('end_of_game');
		}
	};

	this.setPacmanDirection = function(direction) {
		pacman_.setNextDirection(direction);
	};

	this.iterate = function() {
		var state = {};
		state['points'] = new Array();
		state['eat'] = new Array();

		// Manage cheese effect depletion
		if (under_cheese_effect_ > 0) {
			under_cheese_effect_--;
			if (under_cheese_effect_ == 0) {
				combo_ghosts_ = 0;
			}
		}

		// Check for contact between PacMan and a ghost
		for (var i=0 ; i!=ghosts_.length ; i++) {
			// Contact detected
			if (Math.abs(ghosts_[i].getX() - pacman_.getX()) + Math.abs(ghosts_[i].getY() - pacman_.getY()) <= 1) {
				// Under cheese effect
				if (ghosts_[i].isUnderCheeseEffect()) {
					score_ += 100 * (1 + combo_ghosts_);
					state['points'].push({
							"type": "ghost",
							"x": pacman_.getX()/FRAMES_PER_CELL,
							"y": pacman_.getY()/FRAMES_PER_CELL,
							"amount": 100 * (1 + combo_ghosts_),
					});
					ghosts_[i].restart();
					combo_ghosts_++;
				// No cheese effect
				} else {
					pacman_.kill();
					me_.refresh();
					return;
				}
			}
		}

		// Eat the cheese if there is one
		if (pacman_.getX() % FRAMES_PER_CELL == 0 && pacman_.getY() % FRAMES_PER_CELL == 0) {
			var cell_x = pacman_.getX() / FRAMES_PER_CELL;
			var cell_y = pacman_.getY() / FRAMES_PER_CELL;
			if (map_[cell_y][cell_x] == "." || map_[cell_y][cell_x] == "o") {
				if (map_[cell_y][cell_x] == ".") {
					score_ += 10 * (1 + combo_ghosts_);
				} else {
					score_ += 50 * (1 + combo_ghosts_);
					state['points'].push({
							"type": "cheese_effect",
							"x": cell_x,
							"y": cell_y,
							"amount": 50 * (1 + combo_ghosts_),
					});
					under_cheese_effect_ = CHEESE_EFFECT_FRAMES;
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
				me_.refresh();
				return;
			}
		}
		
		pacman_.move(map_);
		state['elapsed'] = Date.now() - start_time_;
		state["pacman"] = {
				"x": pacman_.getX(),
				"y": pacman_.getY(),
				"direction": pacman_.getDirection(),
		};
		state["ghosts"] = new Array();
		for (var i=0 ; i != ghosts_.length ; i++) {
			ghosts_[i].move(map_, bool_map_, pacman_, ghosts_);
			state["ghosts"].push({
					"x": ghosts_[i].getX(),
					"y": ghosts_[i].getY(),
					"cheese_effect": ghosts_[i].getUnderCheeseEffect(),
			});
		}
		io.sockets.emit("update", JSON.stringify(state));
		console.log(JSON.stringify(state));
		setTimeout(me_.iterate, 1000/FPS);
	};
	
	{
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

