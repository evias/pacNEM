#!/usr/bin/nodejs
/**
 * Part of the evias/pacNEM package.
 *
 * NOTICE OF LICENSE
 *
 * Licensed under MIT License.
 *
 * This source file is subject to the MIT License that is
 * bundled with this package in the LICENSE file.
 *
 * @package    evias/pacNEM
 * @author     Grégory Saive <greg@evias.be>
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       http://github.com/evias/pacNEM
 */

var app = require('express')(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	path = require('path'),
	handlebars = require("handlebars"),
	expressHbs = require("express-handlebars"),
	auth = require("http-auth"),
	mongoose = require("mongoose"),
	bodyParser = require("body-parser"),
	config = require("config"),
	nem = require("nem-sdk").default,
	i18n = require("i18next"),
    i18nFileSystemBackend = require('i18next-node-fs-backend'),
    i18nMiddleware = require('i18next-express-middleware');

// core dependencies
var logger = require('./core/logger.js'),
	__room = require('./core/room/room.js'),
	Room = __room.Room,
	RoomManager = require('./core/room/room_manager.js').RoomManager;

var __smartfilename = path.basename(__filename);

var serverLog = function(req, msg, type)
{
	var logMsg = "[" + type + "] " + msg + " (" + (req.headers ? req.headers['x-forwarded-for'] : "?") + " - "
			   + (req.connection ? req.connection.remoteAddress : "?") + " - "
			   + (req.socket ? req.socket.remoteAddress : "?") + " - "
			   + (req.connection && req.connection.socket ? req.connection.socket.remoteAddress : "?") + ")";
	logger.info(__smartfilename, __line, logMsg);
};

// configure view engine (handlebars)
app.engine(".hbs", expressHbs({
	extname: ".hbs",
	defaultLayout: "default.hbs",
	layoutPath: "views/layouts"}));
app.set("view engine", "hbs");

// configure translations with i18next
i18n.use(i18nMiddleware.LanguageDetector)
	.use(i18nFileSystemBackend)
	.init({
		lng: "en",
		fallbackLng: "en",
		defaultNS: "translation",
		whitelist: ["en", "de"],
		nonExplicitWhitelist: true,
		backend: {
			loadPath: "locales/{{lng}}/{{ns}}.json"
		}
	});

// handlebars t() helper for template translations handling with i18next
handlebars.registerHelper('t', function(key)
{
	var result = i18n.t(key);
	return new handlebars.SafeString(result);
});


// configure body-parser usage for POST API calls.
app.use(bodyParser.urlencoded({ extended: true }));

/**
 * Basic HTTP Authentication
 *
 * COMMENT BLOCK if you wish to open the website
 * to the public.
 */
var basicAuth = auth.basic({
    realm: "This is a Highly Secured Area - Monkey at Work.",
    file: __dirname + "/pacnem.htpasswd"
});
app.use(auth.connect(basicAuth));
/**
 * End Basic HTTP Authentication BLOCK
 */

// configure blockchain layer
var blockchain = require('./core/db/blockchain.js');
var chainDataLayer = new blockchain.service(io, nem);

// configure database layer
var models = require('./core/db/models.js');
var dataLayer = new models.pacnem(io, chainDataLayer);

/**
 * Static Files Serving
 *
 * Following routes define static files serving routes
 * such as the CSS, JS and images files.
 */
app.get('/favicon.ico', function(req, res)
	{
		res.sendfile(__dirname + '/static/favicon.ico');
	})
.get('/img/:image', function(req, res)
	{
		res.sendfile(__dirname + '/img/' + req.params.image);
	})
.get('/css/style.css', function(req, res)
	{
		res.sendfile(__dirname + '/static/css/style.css');
	})
.get('/js/:source.js', function(req, res)
	{
		res.sendfile(__dirname + '/static/js/' + req.params.source + '.js');
	})
.get('/resources/templates/:name', function(req, res)
	{
		res.sendfile(__dirname + '/views/partials/' + req.params.name + '.hbs');
	});

/**
 * Frontend Web Application Serving
 *
 * Following routes define several entry points
 * like / and /scores.
 */
app.get("/", function(req, res)
	{
		var currentNetwork = chainDataLayer.getNetwork();

		res.render("play", {currentNetwork: currentNetwork});
	});

/**
 * API Routes
 *
 * Following routes are used for handling the business
 * layer and managing the data layer.
 *
 * localStorage does not need any API requests to be
 * executed, only the database synchronization needs
 * these API endpoints.
 *
 * The sponsoring feature will also be built using API
 * routes.
 */
app.post("/api/v1/sessions/store", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var input = {
			"xem" : req.body.xem.replace(/-/g, ""),
			"username" : req.body.username.replace(/[^A-Za-z0-9\-_\.]/g, ""),
			"score": parseInt(req.body.score),
			"type": req.body.type.replace(/[^a-z0-9\-]/g, ""),
			"sid": req.body.sid.replace(/[^A-Za-z0-9\-_\.#~]/g, "")
		};

		// mongoDB model NEMGamer unique on username + xem address pair.
		dataLayer.NEMGamer.findOne({"xem": input.xem}, function(err, player)
		{
			if (! err && player) {
			// update mode
				var highScore = input.score > player.highScore ? input.score : player.highScore;

				player.username  = input.username;
				player.xem 		 = input.xem;
				player.lastScore = input.score;
				player.highScore = highScore;

				if (! player.socketIds || ! player.socketIds.length)
					player.socketIds = [input.sid];
				else {
					var sockets = player.socketIds;
					sockets.push(input.sid);

					player.socketIds = sockets;
				}

				player.save();

				res.send(JSON.stringify({item: player}));
			}
			else if (! player) {
			// creation mode
				var player = new dataLayer.NEMGamer({
					username: input.username,
					xem: input.xem,
					lastScore: input.score,
					highScore: input.score,
					socketIds: [input.sid],
					countGames: 0
				});
				player.save();

				res.send(JSON.stringify({item: player}));
			}
			else {
			// error mode
				var errorMessage = "Error occured on NEMGamer update: " + err;

				serverLog(req, errorMessage, "ERROR");
				res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}
		});
	});

app.get("/api/v1/scores", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var scores = [];
		for (var i = 0; i < 10; i++) {
			var rScore = Math.floor(Math.random() * 20001);
			var rUser  = Math.floor(Math.random() * 15);
			var rDay   = Math.floor(Math.random() * 32);

			scores.push({
				position: i+1,
				score: Math.floor(Math.random() * 20001),
				username: "greg" + Math.floor(Math.random() * 15),
				address: "TATKHV5JJTQXCUCXPXH2WPHLAYE73REUMGDOZKUW",
				truncAddress: ("TATKHV5JJTQXCUCXPXH2WPHLAYE73REUMGDOZKUW").substr(0, 8),
				scoreDate: "2017-03-" + (rDay > 9 ? rDay : "0" + rDay) + " at 00:01"
			});
		}

		res.send(JSON.stringify({data: scores}));
	});

/**
 * Socket.IO RoomManager implementation
 *
 * The following code block defines Socket.IO room
 * event listeners.
 *
 * Following Socket Events are implemented:
 * 	- disconnect
 * 	- change_username
 * 	- join_room
 * 	- create_room
 * 	- leave_room
 * 	- run_game
 * 	- cancel_game
 * 	- start
 * 	- keydown
 *
 * @link https://github.com/dubzzz/js-pacman
 */
var room_manager = new RoomManager(io);

io.sockets.on('connection', function(socket)
{
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

	// Acknowledge room membership
	socket.on('ack_room', function(room_id) {
		logger.info(__smartfilename, __line, '[' + socket.id + '] ack_room(' + room_id + ')');
		room_manager.ackRoomMember(socket.id, room_id);
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

	socket.on("notify", function()
	{
		logger.info(__smartfilename, __line, '[' + socket.id + '] notify()');
		room_manager.notifyChanges(socket.id);
	});
});

/**
 * Now listen for connections on the Web Server.
 *
 * This starts the NodeJS server and makes the Game
 * available from the Browser.
 */
var port = process.env['PORT'] = process.env.PORT || 2908;
server.listen(port, function()
    {
        console.log("PacNEM Game Server listening on Port %d in %s mode", this.address().port, app.settings.env);
    });
