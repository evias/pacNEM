/**
 *	Node.JS server for Online-PacMan game
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server);

var pc = require("./www/pacman");

// Serve static files: homepage, js, css, favicon...
app
.get('/', function(req, res) {
	res.sendfile(__dirname + '/templates/index.html');
})
.get('/favicon.ico', function(req, res) {
	res.sendfile(__dirname + '/static/favicon.ico');
})
.get('/css/style.css', function(req, res) {
	res.sendfile(__dirname + '/static/css/style.css');
})
.get('/js/pacman.js', function(req, res) {
	res.sendfile(__dirname + '/static/js/pacman.js');
});

var game = undefined;
io.sockets.on('connection', function(socket) {
	// New game
	socket.on('new', function() {
		console.log('New game session');
		game = new pc.Game(io, socket.id);
		game.refresh();
	});
	
	// Start the game
	socket.on('start', function() {
		if (! game) {
			console.error('Unable to start the session: game has not been initialized');
			return;
		}

		console.log('Start the session');
		game.start();
	});
	
	// Update the direction of the player
	socket.on('keydown', function(keycode) {
		if (! game) {
			console.warn('Unable to listen to keydown: game has not been initialized');
			return;
		}

		console.log('Update direction based on "' + keycode + '"');
		if (keycode == 37) {
			console.log('+-> Left');
			game.setPacmanDirection(pc.LEFT);
		} else if (keycode == 38) {
			console.log('+-> Up');
			game.setPacmanDirection(pc.UP);
		} else if (keycode == 39) {
			console.log('+-> Right');
			game.setPacmanDirection(pc.RIGHT);
		} else if (keycode == 40) {
			console.log('+-> Down');
			game.setPacmanDirection(pc.DOWN);
		}
	});
});

server.listen(8080);

