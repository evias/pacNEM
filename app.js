#!/usr/bin/node
/**
 *	Node.JS server for Online-PacMan game
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	path = require('path');

var _room = require('./www/room.js'),
	Room = _room.Room,
	RoomManager = require('./www/room_manager.js').RoomManager;

var __smartfilename = path.basename(__filename);

// Add ability to access line number
// http://stackoverflow.com/questions/11386492/accessing-line-number-in-v8-javascript-chrome-node-js
Object.defineProperty(global, '__stack', {
	get: function(){
		var orig = Error.prepareStackTrace;
		Error.prepareStackTrace = function(_, stack){ return stack; };
		var err = new Error;
		Error.captureStackTrace(err, arguments.callee);
		var stack = err.stack;
		Error.prepareStackTrace = orig;
		return stack;
	}
});
Object.defineProperty(global, '__line', {
	get: function(){
		return __stack[1].getLineNumber();
	}
});

var _log = function(line, description) {
	return __smartfilename + '\t:' + line + '\t' + description;
};

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
			console.log(_log(__line, 'Room is not defined for #' + socket.id));
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

		console.log('Update direction based on "' + keycode + '"');
		if (keycode == 37) {
			console.log('+-> Left');
			room.receiveKeyboard(socket.id, _room.LEFT);
		} else if (keycode == 38) {
			console.log('+-> Up');
			room.receiveKeyboard(socket.id, _room.UP);
		} else if (keycode == 39) {
			console.log('+-> Right');
			room.receiveKeyboard(socket.id, _room.RIGHT);
		} else if (keycode == 40) {
			console.log('+-> Down');
			room.receiveKeyboard(socket.id, _room.DOWN);
		}
	});
});

server.listen(8080);

