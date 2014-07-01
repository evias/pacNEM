var pc_DIFFICULTY = 1; // 0: easy, 1: hard
// Draw parameters
var pc_SIZE = 16;

// Legend:
//  #: wall
//   : no cheese
//  .: cheese
//  o: big cheese
//  s: starting point
//  g: ghost starting point
//  _: forbidden for player
var pc_grid_template = [
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
var pc_grid = new Array();
var pc_truefalse_grid_template = new Array();

var pc_LEFT = 0;
var pc_UP = 1;
var pc_RIGHT = 2;
var pc_DOWN = 3;
var pc_FPS = 20;
var pc_FRAMES_PER_CELL = 5;

/**
 * User position
 */

var pc_pacman_x = -1;
var pc_pacman_y = -1;
var pc_pacman_direction = pc_LEFT;
var pc_pacman_next_direction = pc_LEFT;
var pc_current_frame = -1;

/**
 * Requirements for A* implementation
 * used to find the "shortest path" to reach the PacMan
 */

function HeapElement(x, y, initial_direction, dist_from_start, dist_to_end) {
	this.x = x;
	this.y = y;
	this.initial_direction = initial_direction;
	this.dist_from_start = dist_from_start; // real distance
	this.dist_to_end = dist_to_end; // distance measured for a line
	this.dist = dist_from_start + dist_to_end;
}

function Heap() {
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
	}
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
}

/**
 * Ghosts
 */

function Ghost() {
	this.x = -1;
	this.y = -1;
	this.direction = -1;
	this.color = "#ff0000";
	this.restart = function() {
		var rand_starting_pt = Math.floor(Math.random() * pc_ghosts_starts_x.length);
		this.x = pc_ghosts_starts_x[rand_starting_pt];
		this.y = pc_ghosts_starts_y[rand_starting_pt];
		this.direction = Math.floor(Math.random() * 4);
	};
	this.changeDirectionStupid = function() {
		var height = pc_grid.length;
		var width = pc_grid[0].length;
		
		// Check if possible direction
		var cell_x = this.x/pc_FRAMES_PER_CELL;
		var cell_y = this.y/pc_FRAMES_PER_CELL;
		var available_directions = new Array();
		
		var cell_x_move, cell_y_move;

		//  Check LEFT
		if (cell_x > 0)
			cell_x_move = cell_x -1;
		else
			cell_x_move = width -1;
		cell_y_move = cell_y;
		if (! isForbiddenForGhost(pc_grid[cell_y_move][cell_x_move], pc_grid[cell_y][cell_x]))
			available_directions.push(pc_LEFT);
		
		//  Check UP
		cell_x_move = cell_x;
		if (cell_y > 0)
			cell_y_move = cell_y -1;
		else
			cell_y_move = height -1;
		if (! isForbiddenForGhost(pc_grid[cell_y_move][cell_x_move], pc_grid[cell_y][cell_x]))
			available_directions.push(pc_UP);
		
		//  Check RIGHT
		if (cell_x < width -1)
			cell_x_move = cell_x +1;
		else
			cell_x_move = 0;
		cell_y_move = cell_y;
		if (! isForbiddenForGhost(pc_grid[cell_y_move][cell_x_move], pc_grid[cell_y][cell_x]))
			available_directions.push(pc_RIGHT);
		
		//  Check DOWN
		cell_x_move = cell_x;
		if (cell_y < height -1)
			cell_y_move = cell_y +1;
		else
			cell_y_move = 0;
		if (! isForbiddenForGhost(pc_grid[cell_y_move][cell_x_move], pc_grid[cell_y][cell_x]))
			available_directions.push(pc_DOWN);

		// Remove the direction which is at the opposite of the current one
		// if there is at least another choice
		if (available_directions.length > 1) {
			var index = available_directions.indexOf((this.direction +2)%4);
			if (index > -1)
				available_directions.splice(index, 1);
		}
		
		// Update direction
		this.direction = available_directions[Math.floor(Math.random()*available_directions.length)];
	};
	this.distanceCells = function(x1, y1, x2, y2) {
		return Math.sqrt((x1-x2)*(x1-x2)+(y1-y2)*(y1-y2));
	};
	this.createHeapElement = function(x, y, truefalse_grid, previous, current_direction, target_x, target_y) {
		if (truefalse_grid[y][x]) {
			truefalse_grid[y][x] = false;
			var dist_to_target = this.distanceCells(x, y, target_x, target_y);
			var elt = new HeapElement(x, y, previous.initial_direction, previous.dist_from_start +1, dist_to_target);
			if (elt.initial_direction == -1)
				elt.initial_direction = current_direction;
			return elt;
		}
		return null;
	};
	this.changeDirectionAStar = function() {
		var height = pc_grid.length;
		var width = pc_grid[0].length;
		
		var cell_x = this.x/pc_FRAMES_PER_CELL;
		var cell_y = this.y/pc_FRAMES_PER_CELL;
		if (pc_grid[cell_y][cell_x] == "g" || pc_grid[cell_y][cell_x] == "_")
			return this.changeDirectionStupid();
		
		var target_x = Math.floor(pc_pacman_x/pc_FRAMES_PER_CELL);
		var target_y = Math.floor(pc_pacman_y/pc_FRAMES_PER_CELL);
		
		var heap = new Heap();
		heap.push(new HeapElement(cell_x, cell_y, -1, 0, this.distanceCells(cell_x, cell_y, target_x, target_y)));
		
		var truefalse_grid = new Array();
		for (var j=0 ; j!=pc_truefalse_grid_template.length ; j++) {
			truefalse_grid.push(pc_truefalse_grid_template[j].slice());
		}
		truefalse_grid[cell_y][cell_x] = false;
		
		var num_elts = 0;
		var height = pc_grid.length;
		var width = pc_grid[0].length;
		while (heap.size() > 0) {
			// Limit the number of loops
			num_elts++;
			if (num_elts >= 1000) {
				this.direction = current_elt.initial_direction;
			}

			var current_elt = heap.pop();
			var elt = null;

			elt = this.createHeapElement((current_elt.x -1 +width)%width, current_elt.y, truefalse_grid, current_elt, pc_LEFT, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					this.direction = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}

			elt = this.createHeapElement((current_elt.x +1)%width, current_elt.y, truefalse_grid, current_elt, pc_RIGHT, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					this.direction = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}

			elt = this.createHeapElement(current_elt.x, (current_elt.y -1 +height)%height, truefalse_grid, current_elt, pc_UP, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					this.direction = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}
			
			elt = this.createHeapElement(current_elt.x, (current_elt.y +1)%height, truefalse_grid, current_elt, pc_DOWN, target_x, target_y);
			if (elt != null) {
				if (elt.x == target_x && elt.y == target_y) {
					this.direction = elt.initial_direction;
					return;
				}
				heap.push(elt);
			}
			
			// if only one direction is possible from this point
			if (current_elt.initial_direction == -1 && heap.size() == 1) {
				this.direction = heap.pop().initial_direction;
				return;
			}
		}
	};
	this.changeDirection = function() {
		// if on the center of a cell: change direction?
		if (this.x%pc_FRAMES_PER_CELL == 0 && this.y%pc_FRAMES_PER_CELL == 0) {
			if (pc_DIFFICULTY == 0)
				this.changeDirectionStupid();
			else
				this.changeDirectionAStar();
		}
	};
	this.move = function() {
		// Change direction if necessary/possible
		this.changeDirection();

		// Move following this.direction
		new_position = moveCharacter(this.x, this.y, this.direction, false);
		this.x = new_position[0];
		this.y = new_position[1];
	};
}
var pc_NUM_GHOSTS = 4;
var pc_ghosts = new Array();
var pc_ghosts_starts_x = new Array();
var pc_ghosts_starts_y = new Array();
var pc_GHOSTS_COLORS = ["#ff0000", "#00ff00", "#0000ff", "#ff7700"];

/**
 * Initialize the game
 */

function initGame() {
	// Already launched?
	if (pc_pacman_x != -1 || pc_pacman_y != -1 || pc_current_frame != -1)
		return;
	pc_pacman_direction = pc_LEFT;
	pc_pacman_next_direction = pc_LEFT;
	pc_current_frame = 0;
	pc_ghosts = new Array();
	pc_ghosts_starts_x = new Array();
	pc_ghosts_starts_y = new Array();

	// Copy the grid into local grid
	pc_grid = pc_grid_template.slice();
	pc_truefalse_grid_template = new Array();
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	for (var j=0 ; j!=height ; j++) {
		var line = new Array();
		for (var i=0 ; i!=width ; i++) {
			line.push(pc_grid[j][i] == "." || pc_grid[j][i] == "o" || pc_grid[j][i] == "s" || pc_grid[j][i] == " ");
		}
		pc_truefalse_grid_template.push(line);
	}

	// Find the starting point
	for (var i=0 ; i!=width ; i++) {
		for (var j=0 ; j!=height ; j++) {
			if (pc_grid[j][i] == 's') {
				pc_pacman_x = i * pc_FRAMES_PER_CELL;
				pc_pacman_y = j * pc_FRAMES_PER_CELL;
			} else if (pc_grid[j][i] == 'g') {
				pc_ghosts_starts_x.push(i * pc_FRAMES_PER_CELL);
				pc_ghosts_starts_y.push(j * pc_FRAMES_PER_CELL);
			}
		}
	}
	
	// Create ghosts
	for (var i=0 ; i!=pc_NUM_GHOSTS ; i++) {
		ghost = new Ghost();
		ghost.restart();
		ghost.color = pc_GHOSTS_COLORS[i%pc_GHOSTS_COLORS.length];
		pc_ghosts.push(ghost);
	}
	
	// Resize canvas
	var canvas = document.getElementById('myCanvas');
	if (! canvas.getContext)
		return;
	var ctx = canvas.getContext('2d');
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	canvas.width = width*pc_SIZE +10;
	canvas.height = height*pc_SIZE +10;
	
	// Launch the game
	iterateGame();
}

/**
 * Iterate inside the game
 */

function iterateGame() {
	var canvas = document.getElementById('myCanvas');
	if (! canvas.getContext)
		return;
	var ctx = canvas.getContext('2d');
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	
	// Change of direction
	// Opposite direction
	if (pc_pacman_direction == (pc_pacman_next_direction+2)%4)
		pc_pacman_direction = pc_pacman_next_direction;
	// Move ended? and possible direction
	else if (pc_pacman_x%pc_FRAMES_PER_CELL == 0 && pc_pacman_y%pc_FRAMES_PER_CELL == 0) {
		// Check if possible direction
		var cell_x = pc_pacman_x/pc_FRAMES_PER_CELL;
		var cell_y = pc_pacman_y/pc_FRAMES_PER_CELL;

		if (pc_pacman_next_direction == pc_LEFT) {
		       if ((cell_x > 0 && !isForbiddenForPacMan(pc_grid[cell_y][cell_x-1]) || (cell_x == 0 && !isForbiddenForPacMan(pc_grid[cell_y][width-1]))))
			       pc_pacman_direction = pc_pacman_next_direction;
		} else if (pc_pacman_next_direction == pc_UP) {
		       if ((cell_y > 0 && !isForbiddenForPacMan(pc_grid[cell_y-1][cell_x]) || (cell_y == 0 && !isForbiddenForPacMan(pc_grid[height-1][cell_x]))))
			       pc_pacman_direction = pc_pacman_next_direction;
		} else if (pc_pacman_next_direction == pc_RIGHT) {
		       if ((cell_x < width-1 && !isForbiddenForPacMan(pc_grid[cell_y][cell_x+1]) || (cell_x == width-1 && !isForbiddenForPacMan(pc_grid[cell_y][0]))))
			       pc_pacman_direction = pc_pacman_next_direction;
		} else {
		       if ((cell_y < height-1 && !isForbiddenForPacMan(pc_grid[cell_y+1][cell_x]) || (cell_y == height-1 && !isForbiddenForPacMan(pc_grid[0][cell_x]))))
			       pc_pacman_direction = pc_pacman_next_direction;
		}
	}
	
	// Move characters
	new_position = moveCharacter(pc_pacman_x, pc_pacman_y, pc_pacman_direction, true);
	pc_pacman_x = new_position[0];
	pc_pacman_y = new_position[1];
	for (var i=0 ; i!=pc_NUM_GHOSTS ; i++) {
		pc_ghosts[i].move();
	}

	// Draw game
	drawEmptyGameBoard(canvas, ctx);
	drawPacMan(canvas, ctx);
	for (var i=0 ; i!=pc_NUM_GHOSTS ; i++) {
		drawGhost(canvas, ctx, pc_ghosts[i]);
	}

	pc_current_frame++;
	setTimeout(iterateGame, 1000/pc_FPS);
}

/**
 * Compute the new position of the character
 * based on the current one and a given direction
 */

function moveCharacter(x, y, direction, pacman) {
	var x_old = x;
	var y_old = y;
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	
	if (direction == pc_LEFT) {
		x--;
		// out of the grid
		if (x < 0) {
			x = (width -1) * pc_FRAMES_PER_CELL;
			if (isForbiddenFor(pc_grid[y/pc_FRAMES_PER_CELL][x/pc_FRAMES_PER_CELL], x_old, y_old, direction, pacman))
				x = 0;
		// into a wall
		} else if (isForbiddenFor(pc_grid[y/pc_FRAMES_PER_CELL][Math.floor(1.*x/pc_FRAMES_PER_CELL)], x_old, y_old, direction, pacman))
			x++;
	} else if (direction == pc_UP) {
		y--;
		// out of the grid
		if (y < 0) {
			y = (height -1) * pc_FRAMES_PER_CELL;
			if (isForbiddenFor(pc_grid[y/pc_FRAMES_PER_CELL][x/pc_FRAMES_PER_CELL], x_old, y_old, direction, pacman))
				y = 0;
		// into a wall
		} else if (isForbiddenFor(pc_grid[Math.floor(1.*y/pc_FRAMES_PER_CELL)][x/pc_FRAMES_PER_CELL], x_old, y_old, direction, pacman))
			y++;
	} else if (direction == pc_RIGHT) {
		x++;
		// out of the grid
		if (x > (width -1) * pc_FRAMES_PER_CELL) {
			x = 0;
			if (isForbiddenFor(pc_grid[y/pc_FRAMES_PER_CELL][x/pc_FRAMES_PER_CELL], x_old, y_old, direction, pacman))
				x = (width -1) * pc_FRAMES_PER_CELL;
		// into a wall
		} else if (isForbiddenFor(pc_grid[y/pc_FRAMES_PER_CELL][Math.ceil(1.*x/pc_FRAMES_PER_CELL)], x_old, y_old, direction, pacman))
			x--;
	} else {
		y++;
		// out of the grid
		if (y > (height -1) * pc_FRAMES_PER_CELL) {
			y = 0;
			if (isForbiddenFor(pc_grid[y/pc_FRAMES_PER_CELL][x/pc_FRAMES_PER_CELL], x_old, y_old, direction, pacman))
				y = (height -1) * pc_FRAMES_PER_CELL;
		// into a wall
		} else if (isForbiddenFor(pc_grid[Math.ceil(1.*y/pc_FRAMES_PER_CELL)][x/pc_FRAMES_PER_CELL], x_old, y_old, direction, pacman))
			y--;
	}
	return [x, y];
}

/**
 * Is forbidden for PacMan/Ghost
 */

function isForbiddenForGhost(target_cell_type, current_cell_type) {
	if (current_cell_type == "g")
		return target_cell_type == "#";
	if (current_cell_type == "_")
		return target_cell_type == "#" || target_cell_type == "g";
	return target_cell_type == "#" || target_cell_type == "g" || target_cell_type == "_";
}

function isForbiddenForPacMan(target_cell_type) {
	return target_cell_type == "#" || target_cell_type == "g" || target_cell_type == "_";
}

function isForbiddenFor(target_cell_type, x_old, y_old, direction, pacman) {
	if (! pacman) {
		if (direction == pc_LEFT)
			current_cell_type = pc_grid[y_old/pc_FRAMES_PER_CELL][Math.ceil(1.*x_old/pc_FRAMES_PER_CELL)];
		else if (direction == pc_UP)
			current_cell_type = pc_grid[Math.ceil(1.*y_old/pc_FRAMES_PER_CELL)][x_old/pc_FRAMES_PER_CELL];
		else if (direction == pc_RIGHT)
			current_cell_type = pc_grid[y_old/pc_FRAMES_PER_CELL][Math.floor(1.*x_old/pc_FRAMES_PER_CELL)];
		else
			current_cell_type = pc_grid[Math.floor(1.*y_old/pc_FRAMES_PER_CELL)][x_old/pc_FRAMES_PER_CELL];
		
		return isForbiddenForGhost(target_cell_type, current_cell_type);
	}
	return isForbiddenForPacMan(target_cell_type);
}

/**
 * Draw an empty game board
 */

function drawEmptyGameBoard(canvas, ctx) {
	/**
	 * Draw the Game Board based on pc_grid
	 */

	// Retrieve grid dimensions
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	
	// Draw Game Board
	ctx.beginPath();
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, width*pc_SIZE +10, height*pc_SIZE +10);
	ctx.fill();
	
	ctx.beginPath();
	ctx.lineWidth = 3;
	ctx.strokeStyle = "black";
	ctx.moveTo(2, 2);
	ctx.lineTo(2, height*pc_SIZE +8);
	ctx.lineTo(width*pc_SIZE +8, height*pc_SIZE +8);
	ctx.lineTo(width*pc_SIZE +8, 2);
	ctx.closePath();
	ctx.stroke();
	
	for (var i=0 ; i!=width ; i++) {
		for (var j=0 ; j!=height ; j++) {
			if (pc_grid[j][i] == '#') {
				ctx.fillStyle = "#777777";
				ctx.fillRect(i*pc_SIZE +5, j*pc_SIZE +5, pc_SIZE, pc_SIZE);
			} else if (pc_grid[j][i] == '.') {
				ctx.beginPath();
				ctx.fillStyle = "#aaaa00";
				ctx.arc((i+.5)*pc_SIZE +5, (j+.5)*pc_SIZE +5, .2*pc_SIZE, 0, 2*Math.PI, false);
				ctx.fill();
			} else if (pc_grid[j][i] == 'o') {
				ctx.beginPath();
				ctx.fillStyle = "#aaaa00";
				ctx.arc((i+.5)*pc_SIZE +5, (j+.5)*pc_SIZE +5, .4*pc_SIZE, 0, 2*Math.PI, false);
				ctx.fill();
			}
		}
	}
}

/**
 * Draw the PacMan
 */

function drawPacMan(canvas, ctx) {
	var pacman_px_x = (1.*pc_pacman_x/pc_FRAMES_PER_CELL +.5)*pc_SIZE +5;
	var pacman_px_y = (1.*pc_pacman_y/pc_FRAMES_PER_CELL +.5)*pc_SIZE +5;
	var pacman_mouth = pc_current_frame%pc_FRAMES_PER_CELL +3;

	ctx.beginPath();
	ctx.fillStyle = "#777700";
	if (pc_pacman_direction == pc_LEFT)
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, Math.PI+Math.PI/pacman_mouth, Math.PI-Math.PI/pacman_mouth,false);
	else if (pc_pacman_direction == pc_UP)
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, -Math.PI/2+Math.PI/pacman_mouth, -Math.PI/2-Math.PI/pacman_mouth,false);
	else if (pc_pacman_direction == pc_RIGHT)
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, Math.PI/pacman_mouth, -Math.PI/pacman_mouth,false);
	else
		ctx.arc(pacman_px_x, pacman_px_y, .45*pc_SIZE, Math.PI/2+Math.PI/pacman_mouth, Math.PI/2-Math.PI/pacman_mouth,false);
	ctx.lineTo(pacman_px_x, pacman_px_y);
	ctx.fill();
}

/**
 * Draw a ghost
 */

function drawGhost(canvas, ctx, ghost) {
	var ghost_px_x = (1.*ghost.x/pc_FRAMES_PER_CELL +.5)*pc_SIZE +5;
	var ghost_px_y = (1.*ghost.y/pc_FRAMES_PER_CELL +.5)*pc_SIZE +5;

	ctx.beginPath();
	ctx.fillStyle = ghost.color;
	ctx.arc(ghost_px_x, ghost_px_y -.05*pc_SIZE, .4*pc_SIZE, Math.PI, 2*Math.PI, false);
	var begin_x = ghost_px_x +.4*pc_SIZE;
	var end_x = ghost_px_x -.4*pc_SIZE;
	var min_x = ghost_px_y +.25*pc_SIZE;
	var max_x = ghost_px_y +.45*pc_SIZE;
	var num_min = 3;
	var animate_padding = (end_x-begin_x)/(2*num_min) * ((pc_current_frame%pc_FRAMES_PER_CELL)/(pc_FRAMES_PER_CELL-1) -.5);

	ctx.lineTo(begin_x, max_x);
	for (var i=0 ; i!=2*num_min-1 ; i++) {
		var current_x = begin_x + (end_x-begin_x)*(i+1)/(2*num_min) + animate_padding;
		if (i%2 == 0)
			ctx.lineTo(current_x, min_x);
		else
			ctx.lineTo(current_x, max_x);
	}
	ctx.lineTo(end_x, max_x);
	ctx.fill();
}
