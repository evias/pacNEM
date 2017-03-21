#!/usr/bin/nodejs
/**
 *	Node.JS server for Online-PacMan game
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	path = require('path');

var logger = require('./www/logger.js'),
	__room = require('./www/room/room.js'),
	Room = __room.Room,
	RoomManager = require('./www/room/room_manager.js').RoomManager;

var __smartfilename = path.basename(__filename);

// Serve static files: homepage, js, css, favicon...
app
.get('/', function(req, res) {
	logger.info(__smartfilename, __line, 'Welcome to (' + (req.headers ? req.headers['x-forwarded-for'] : '?') + " - " + (req.connection ? req.connection.remoteAddress : '?') + " - " + (req.socket ? req.socket.remoteAddress : '?') + " - " + (req.connection && req.connection.socket ? req.connection.socket.remoteAddress : '?') + ')');
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
	logger.info(__smartfilename, __line, '[' + socket.id + '] ()');
	room_manager.register(socket.id);

	// Unregister the socket from the underlying RoomManager
	socket.on('disconnect', function () {
		logger.info(__smartfilename, __line, '[' + socket.id + '] ~()');
		room_manager.disconnect(socket.id);
	});

	// Rename the user
	socket.on('change_username', function(username) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] change_username(' + username + ')');
		room_manager.changeUsername(socket.id, username);
	});

	// Join an existing room
	socket.on('join_room', function(room_id) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] join_room(' + room_id + ')');
		room_manager.joinRoom(socket.id, room_id);
	});

	// Create a new room
	socket.on('create_room', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] create_room()');
		room_manager.createRoom(socket.id);
	});

	// Leave a room
	socket.on('leave_room', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] leave_room()');
		room_manager.leaveRoom(socket.id);
	});

	// Ask to launch the game inside the room
	// The game will not start immediately and other members can cancel its launch
	socket.on('run_game', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] run_game()');
		var room = room_manager.getRoom(socket.id);
		if (room) {
			room.runGame();
		}
	});

	// Cancel game
	socket.on('cancel_game', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] cancel_game()');
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			logger.warn(__smartfilename, __line, 'Room is not defined for ' + socket.id);
			return;
		}
		room.cancelGame();
	});

	// Start the game
	socket.on('start', function() {
		logger.info(__smartfilename, __line, '[' + socket.id + '] start()');
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			logger.warn(__smartfilename, __line, 'Room is not defined for ' + socket.id);
			return;
		}
		room.startGame(socket.id);
	});

	// Update the direction of the player
	socket.on('keydown', function(keycode) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] keydown(' + keycode + ')');
		var room = room_manager.getRoom(socket.id);
		if (! room) {
			return;
		}

		if (keycode == 37) {
			room.receiveKeyboard(socket.id, __room.LEFT);
		} else if (keycode == 38) {
			room.receiveKeyboard(socket.id, __room.UP);
		} else if (keycode == 39) {
			room.receiveKeyboard(socket.id, __room.RIGHT);
		} else if (keycode == 40) {
			room.receiveKeyboard(socket.id, __room.DOWN);
		}
	});
});

var port = process.env['PORT'] = process.env.PORT || 2908;
server.listen(port, function()
    {
        console.log("PacNEM Game Server listening on Port %d in %s mode", this.address().port, app.settings.env);
    });
