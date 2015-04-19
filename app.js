#!/usr/bin/node
/**
 *	Node.JS server for Online-PacMan game
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	path = require('path');

var logger = require('./www/logger.js'),
	_room = require('./www/room.js'),
	Room = _room.Room,
	RoomManager = require('./www/room_manager.js').RoomManager;

var __smartfilename = path.basename(__filename);

// Serve static files: homepage, js, css, favicon...
app
.get('/', function(req, res) {
	res.sendfile(__dirname + '/templates/index.html');
})
.get('/favicon.ico', function(req, res) {
	res.sendfile(__dirname + '/static/favicon.ico');
})
.get('/img/user.svg', function(req, res) {
	res.sendfile(__dirname + '/img/user.svg');
})
.get('/css/style.css', function(req, res) {
	res.sendfile(__dirname + '/static/css/style.css');
})
.get('/js/pacman.js', function(req, res) {
	res.sendfile(__dirname + '/static/js/pacman.js');
});

var room_manager = new RoomManager(io);

io.sockets.on('connection', function(socket) {
	room_manager.register(socket.id);
	
	// Unregister the socket from the underlying RoomManager
	socket.on('close', function () {
		room_manager.disconnect(socket.id);
	});

	// Rename the user
	socket.on('change_username', function(username) {
		room_manager.changeUsername(socket.id, username);
	});

	// Join an existing room
	socket.on('join_room', function(room_id) {
		room_manager.joinRoom(socket.id, room_id);
	});

	// Create a new room
	socket.on('create_room', function() {
		room_manager.createRoom(socket.id);
	});

	// Leave a room
	socket.on('leave_room', function() {
		room_manager.leaveRoom(socket.id);
	});

	// Ask to launch the game inside the room
	// The game will not start immediately and other members can cancel its launch
	socket.on('run_game', function() {
		var room = room_manager.getRoom(socket.id);
		if (room) {
			room.runGame();
		}
	});
	
	// Cancel game
	socket.on('cancel_game', function() {
		var room = room_manager.getRoom(socket.id);
		if (room) {
			room.cancelGame();
		}
	});

	// Run the game @depreciated
	socket.on('new', function() {
		room_manager.createRoom(socket.id);
		var room = room_manager.getRoom(socket.id);
		room.runGame();
	});

	// Start the game
	socket.on('start', function() {
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			logger.warn(__smartfilename, __line, 'Room is not defined for ' + socket.id);
			return;
		}
		room.startGame(socket.id);
	});
	
	// Update the direction of the player
	socket.on('keydown', function(keycode) {
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			return;
		}

		if (keycode == 37) {
			room.receiveKeyboard(socket.id, _room.LEFT);
		} else if (keycode == 38) {
			room.receiveKeyboard(socket.id, _room.UP);
		} else if (keycode == 39) {
			room.receiveKeyboard(socket.id, _room.RIGHT);
		} else if (keycode == 40) {
			room.receiveKeyboard(socket.id, _room.DOWN);
		}
	});
});

server.listen(8080);

