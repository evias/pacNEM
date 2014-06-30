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
	"######.##.#gggggg#.##.######",
	"      ....#gggggg#....      ",
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

function drawEmptyGameBoard(pc_grid) {
	/**
	 * Draw the Game Board based on pc_grid
	 */

	var canvas = document.getElementById('myCanvas');
	if (! canvas.getContext)
		return;
	var ctx = canvas.getContext('2d');
	
	// Retrieve grid dimensions
	var height = pc_grid.length;
	var width = pc_grid[0].length;
	canvas.width = width*pc_SIZE +10;
	canvas.height = height*pc_SIZE +10;

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
	
	for (i=0 ; i!=width ; i++) {
		for (j=0 ; j!=height ; j++) {
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
