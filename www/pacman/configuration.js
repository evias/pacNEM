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

var FRAMES_PER_CELL = 5;

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

var distancePx = function(map, x1, y1, x2, y2) {
	var width = (map[0].length -1) * FRAMES_PER_CELL;
	var height = (map.length -1) * FRAMES_PER_CELL;
	
	// Deltas take into account possible paths from side to side
	var delta_x = Math.min(Math.abs(x1-x2), Math.abs(x1-x2+width), Math.abs(x2-x1+width));
	var delta_y = Math.min(Math.abs(y1-y2), Math.abs(y1-y2+height), Math.abs(y2-y1+height));

	return Math.sqrt(delta_x*delta_x+delta_y*delta_y);
};

var distanceCells = function(map, x1, y1, x2, y2) {
	var width = map[0].length;
	var height = map.length;
	
	// Deltas take into account possible paths from side to side
	var delta_x = Math.min(Math.abs(x1-x2), Math.abs(x1-x2+width), Math.abs(x2-x1+width));
	var delta_y = Math.min(Math.abs(y1-y2), Math.abs(y1-y2+height), Math.abs(y2-y1+height));

	return Math.sqrt(delta_x*delta_x+delta_y*delta_y);
};

/*
 * Module definition
 */

module.exports.LEFT = LEFT;
module.exports.UP = UP;
module.exports.RIGHT = RIGHT;
module.exports.DOWN = DOWN;
module.exports.FRAMES_PER_CELL = FRAMES_PER_CELL;

module.exports.directionToString = directionToString;
module.exports.moveCharacter = moveCharacter;
module.exports.isForbiddenForGhost = isForbiddenForGhost;
module.exports.isForbiddenForPacMan = isForbiddenForPacMan;
module.exports.distancePx = distancePx;
module.exports.distanceCells = distanceCells;

}());

