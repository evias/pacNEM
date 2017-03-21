(function() {

var __conf = require('./configuration.js'),
	LEFT = __conf.LEFT,
	UP = __conf.UP,
	RIGHT = __conf.RIGHT,
	DOWN = __conf.DOWN,
	FRAMES_PER_CELL = __conf.FRAMES_PER_CELL,
	isForbiddenForPacMan = __conf.isForbiddenForPacMan,
	moveCharacter = __conf.moveCharacter;

/*
 * PacMan
 */

var PacMan = function() {
	var self = this;

	var x_ = -1, y_ = -1;
	var direction_ = LEFT;
	var next_direction_ = LEFT;
	var lifes_ = 3;
	var cheese_power_ = 0;
	var under_cheese_effect_ = 0;
	var combo_ = 0;
	var score_ = 0;
	var killed_recently_ = 0;

	this.restart = function(x, y, direction) {
		x_ = x;
		y_ = y;
		direction_ = direction;
		next_direction_ = direction;
		under_cheese_effect_ = 0;
	};

	this.kill = function() {
		lifes_--;
		cheese_power_ = 0;
		combo_ = 0;
	};
	
	this.setNextDirection = function(direction) {
		next_direction_ = direction;
	};

	this.goOppositeDirection = function() {
		next_direction_ = (direction_ +2) %4;
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

		if (under_cheese_effect_ == 0 || under_cheese_effect_ % 2 == 0) {
			var new_position = moveCharacter(map, x_, y_, direction_, true);
			x_ = new_position[0];
			y_ = new_position[1];
		}
		
		// Decrease cheese power
		if (cheese_power_ > 0) {
			cheese_power_--;
			if (cheese_power_ == 0) {
				combo_ = 0;
			}
		}
		if (under_cheese_effect_ > 0) {
			under_cheese_effect_--;
		}

		if (killed_recently_ > 0) {
			killed_recently_--;
		}
	};

	this.hasBeenKilledRecently = function() {
		return killed_recently_ != 0;
	};

	this.setKilledRecently = function(killed_recently) {
		killed_recently_ = killed_recently;
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

	this.hasCheesePower = function() {
		return cheese_power_ != 0;
	};
	
	this.getCheesePower = function() {
		return cheese_power_;
	};
	
	this.setCheesePower = function(cheese_power) {
		cheese_power_ = cheese_power;
		under_cheese_effect_ = 0;
	};

	this.setUnderCheeseEffect = function(under_cheese_effect) {
		if (! self.hasCheesePower()) {
			under_cheese_effect_ = under_cheese_effect;
		}
	};

	this.isUnderCheeseEffect = function() {
		return under_cheese_effect_ != 0;
	};

	this.getCombo = function() {
		return combo_;
	};
	
	this.increaseCombo = function() {
		combo_++;
	};

	this.increaseScore = function(points) {
		var increase = points * (1 + combo_);
		score_ += increase;
		return increase;
	};

	this.toDictionary = function() {
		return {
				'x': x_,
				'y': y_,
				'direction': direction_,
				'combo': combo_,
				'cheese_power': cheese_power_,
				'cheese_effect': under_cheese_effect_,
				'score': score_,
				'killed_recently': killed_recently_,
				'lifes': lifes_,
		};
	};
};

/*
 * Module definition
 */

module.exports.PacMan = PacMan;

}());

