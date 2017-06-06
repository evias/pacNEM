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
    i18nMiddleware = require('i18next-express-middleware'),
    fs = require("fs");

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
i18n.use(i18nFileSystemBackend)
	.init({
		lng: "en",
		fallbackLng: "en",
		defaultNS: "translation",
		whitelist: ["en", "de", "fr"],
		nonExplicitWhitelist: true,
		preload: ["en", "de", "fr"],
		backend: {
			loadPath: "locales/{{lng}}/{{ns}}.json"
		}
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
var blockchain = require('./core/blockchain/service.js');
var chainDataLayer = new blockchain.service(io, nem, logger);

// configure database layer
var models = require('./core/db/models.js');
var dataLayer = new models.pacnem(io, chainDataLayer);

// configure our PaymentsCore implementation, handling payment
// processor NEMBot communication
var PaymentsCore = require("./core/blockchain/payments-core.js").PaymentsCore;
var PaymentsProtocol = new PaymentsCore(io, logger, chainDataLayer, dataLayer);

var JobsScheduler = require("./core/scheduler.js").JobsScheduler;
var PacNEM_Crons  = new JobsScheduler(logger, chainDataLayer, dataLayer);
PacNEM_Crons.hourly();

var PacNEM_Frontend_Config = {
	"business": chainDataLayer.getVendorWallet(),
	"application": chainDataLayer.getPublicWallet(),
	"namespace": chainDataLayer.getNamespace()
};

/**
 * View Engine Customization
 *
 * - handlebars t() helper for template translations handling with i18next
 **/
handlebars.registerHelper('t', function(key, sub)
{
	if (typeof sub != "undefined" && sub !== undefined && typeof sub === "string" && sub.length)
		// dynamic subnamespace
		var key = key + "." + sub;

	return new handlebars.SafeString(i18n.t(key));
});

/**
 * Static Files (assets) Serving
 *
 * Also includes asynchronously loaded templates,
 * those are stored in views/partials/*.hbs files.
 */
app.get('/favicon.ico', function(req, res)
	{
		res.sendfile(__dirname + '/www/favicon.ico');
	})
.get('/img/flags/:country.png', function(req, res)
	{
		res.sendfile(__dirname + '/img/flags/' + req.params.country + ".png");
	})
.get('/img/:image', function(req, res)
	{
		res.sendfile(__dirname + '/img/' + req.params.image);
	})
.get('/css/:sheet.css', function(req, res)
	{
		res.sendfile(__dirname + '/www/css/' + req.params.sheet + '.css');
	})
.get('/js/:source.js', function(req, res)
	{
		res.sendfile(__dirname + '/www/js/' + req.params.source + '.js');
	});

/**
 * Third Party assets Serving
 * - Bootstrap
 * - Handlebars
 * - i18next
 * - jQuery
 */
app.get('/css/3rdparty/:sheet.css', function(req, res)
	{
		res.sendfile(__dirname + '/www/css/3rdparty/' + req.params.sheet + '.css');
	})
.get('/js/3rdparty/:source.js', function(req, res)
	{
		res.sendfile(__dirname + '/www/js/3rdparty/' + req.params.source + '.js');
	});

/**
 * - Asynchronous Template Serving
 * - XHR Translations loading
 *
 * The templates present in views/partials can be rendered
 * using the jQFileTemplate frontend implementation.
 */
app.get('/resources/templates/:name', function(req, res)
	{
		res.sendfile(__dirname + '/views/partials/' + req.params.name + '.hbs');
	})
.get('/locales/:lang', function(req, res)
	{
		var json = fs.readFileSync(__dirname + '/locales/' + req.params.lang + '/translation.json');

		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.send(json);
	});

/**
 * Frontend Web Application Serving
 *
 * This part of the game is where the end-user is active.
 */
app.get("/:lang", function(req, res)
	{
		var currentLanguage = req.params.lang;
		var currentNetwork  = chainDataLayer.getNetwork();

		i18n.changeLanguage(currentLanguage);

		var viewData = {
			currentNetwork: currentNetwork,
			currentLanguage: currentLanguage,
			PacNEM_Frontend_Config: PacNEM_Frontend_Config
		};

		res.render("play", viewData);
	})
.get("/", function(req, res)
	{
		var currentLanguage = i18n.language;
		var currentNetwork  = chainDataLayer.getNetwork();

		var viewData = {
			currentNetwork: currentNetwork,
			currentLanguage: currentLanguage,
			PacNEM_Frontend_Config: PacNEM_Frontend_Config
		};

		res.render("play", viewData);
	});

/**
 * API Routes
 *
 * Following routes are used for handling the business/data
 * layer.
 *
 * localStorage does not need any API requests to be
 * executed, only the database synchronization needs
 * these API endpoints.
 *
 * The sponsoring feature will also be built using API
 * routes.
 */
app.get("/api/v1/sessions/get", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		if (! req.query.address || ! req.query.address.length)
			return res.send(JSON.stringify({"status": "error", "message": "Mandatory field `address` is missing."}));

		var input = {
			"xem" : req.query.address.replace(/-/g, ""),
			"username" : req.query.username
		};

		// fetch an existing NEMGamer entry by XEM address, this
		dataLayer.NEMGamer.findOne({"xem": input.xem, "username": input.username}, function(err, player)
		{
			if (err || ! player) {
				// error mode
				var errorMessage = "Error occured on NEMGamer READ: " + err;

				serverLog(req, errorMessage, "ERROR");
				return res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}

			// read blockchain for evias.pacnem:heart mosaic on the given NEMGamer model.
			chainDataLayer.fetchHeartsByGamer(player);

			// session retrieved.
			return res.send(JSON.stringify({item: player}));
		});
	});

app.post("/api/v1/sessions/store", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var input = {
			"xem" : req.body.xem.replace(/-/g, ""),
			"username" : req.body.username.replace(/[^A-Za-z0-9\-_\.]/g, ""),
			"score": parseInt(req.body.score),
			"type": req.body.type.replace(/[^a-z0-9\-]/g, ""),
			"sid": req.body.sid.replace(/[^A-Za-z0-9\-_\.#~]/g, ""),
			"validateHearts": parseInt(req.body.validateHearts) === 1
		};

		// mongoDB model NEMGamer unique on xem address + username pair.
		dataLayer.NEMGamer.findOne({"xem": input.xem, "username": input.username}, function(err, player)
		{
			if (! err && player) {
			// update mode
				var highScore = input.score > player.highScore ? input.score : player.highScore;

				player.username  = input.username;
				player.xem 		 = input.xem;
				player.lastScore = input.score;
				player.highScore = highScore;
				player.updatedAt = new Date().valueOf();

				if (! player.socketIds || ! player.socketIds.length)
					player.socketIds = [input.sid];
				else {
					var sockets = player.socketIds;
					sockets.push(input.sid);

					player.socketIds = sockets;
				}

				player.save();

				if (input.validateHearts === true) {
					// read blockchain for evias.pacnem:heart mosaic on the given NEMGamer model.
					chainDataLayer.fetchHeartsByGamer(player);
				}

				return res.send(JSON.stringify({item: player}));
			}
			else if (! player) {
			// creation mode
				var player = new dataLayer.NEMGamer({
					username: input.username,
					xem: input.xem,
					lastScore: input.score,
					highScore: input.score,
					socketIds: [input.sid],
					countGames: 0,
					createdAt: new Date().valueOf()
				});
				player.save();

				if (input.validateHearts === true) {
					// read blockchain for evias.pacnem:heart mosaic on the given NEMGamer model.
					chainDataLayer.fetchHeartsByGamer(player);
				}

				return res.send(JSON.stringify({item: player}));
			}
			else {
			// error mode
				var errorMessage = "Error occured on NEMGamer update: " + err;

				serverLog(req, errorMessage, "ERROR");
				return res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}
		});
	});

//XXX implement actual model
app.get("/api/v1/scores", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		//XXX implement chainDataLayer.fetchScores
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

//XXX implement actual model
app.get("/api/v1/sponsors/random", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		//XXX implement dataLayer.NEMSponsor features
		var sponsor   = {};
		var slugs 	  = ["easport", "atari", "nem", "evias"];
		var names     = ["EA Sports", "Atari", "nem", "eVias"];
		var addresses = [
			"TD2WIZ-UPOHCE-65RJ72-ICJCAO-GGWX7S-NORJCD-2Y6J",
			"TBY4WF-4LSRAI-7REVQP-P3MBD3-BN4IZE-EDMY7K-IYXV",
			"TAS5KA-R4WWIB-7JX64U-DPGMCX-ZGQ77U-ZIRY3D-BJB6",
			"TBWZKN-LDTIVE-GBQ5OG-BGY3NI-JWLAHB-I2RS5B-YV7M"];

		var rId = Math.floor(Math.random() * 99999);
		var rAddr = Math.floor(Math.random() * 4);

		sponsor.slug = slugs[rAddr];
		sponsor.name = names[rAddr];
		sponsor.xem  = addresses[rAddr];
		sponsor.description = i18n.t("sponsors.example_description");
		sponsor.imageUrl    = "https://placeholdit.imgix.net/~text?txtsize=47&txt=500%C3%97300&w=500&h=300";
		sponsor.websiteUrl  = "https://github.com/evias";

		res.send(JSON.stringify({item: sponsor}));
	});

app.get("/api/v1/credits/buy", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var amount = req.query.amount ? parseInt(req.query.amount) : 16; // 16 XEM to Pay for Pay per Play.
		if (isNaN(amount) || amount <= 0)
			return res.send(JSON.stringify({"status": "error", "message": "Mandatory field `amount` is invalid."}));

		var clientSocketId = req.query.usid ? req.query.usid : null;
		if (! clientSocketId || ! clientSocketId.length)
			return res.send(JSON.stringify({"status": "error", "message": "Mandatory field `Client Socket ID` is invalid."}));

		var invoiceNumber = req.query.num ? req.query.num : null;

		var payer = req.query.payer ? req.query.payer : undefined;
		if (! payer.length || dataLayer.isApplicationWallet(payer))
			// cannot be one of the application wallets
			return res.send(JSON.stringify({"status": "error", "message": "Invalid value for field `payer`."}));

		var recipient = req.query.recipient ? req.query.recipient : config.get("pacnem.business"); // the App's MultiSig wallet
		if (! recipient.length || !dataLayer.isApplicationWallet(recipient))
			// must be one of the application wallets
			return res.send(JSON.stringify({"status": "error", "message": "Invalid value for field `recipient`."}));

		var heartPrice = parseFloat(config.get("prices.heart")); // in XEM
		var receivingHearts = Math.ceil(amount * heartPrice); // XEM price * (1 Heart / x XEM)
		var invoiceAmount   = amount * 1000000; // convert amount to micro XEM
		var currentNetwork  = chainDataLayer.getNetwork();
		var disableChannel  = req.query.chan ? req.query.chan == "0" : false;

		var dbConditions = {
			payerXEM: payer,
			recipientXEM: recipient
		};

		// when no invoiceNumber is given, create or retrieve in following statuses
		dbConditions["status"] = { $in: ["not_paid", "unconfirmed", "paid_partly"] };
		if (invoiceNumber && invoiceNumber.length) {
			// load invoice by number
			dbConditions["number"] = decodeURIComponent(invoiceNumber);
			delete dbConditions["status"];
		}

		//serverLog("DEBUG", JSON.stringify(dbConditions), "DEBUG");

		// mongoDB model NEMPaymentChannel unique on xem address + message pair.
		dataLayer.NEMPaymentChannel.findOne(dbConditions, function(err, invoice)
		{
			if (!err && ! invoice) {
				// creation mode

				var invoice = new dataLayer.NEMPaymentChannel({
					recipientXEM: recipient,
					payerXEM: payer,
					amount: invoiceAmount,
					amountPaid: 0,
					amountUnconfirmed: 0,
					status: "not_paid",
					countHearts: receivingHearts,
					createdAt: new Date().valueOf()
				});
				invoice.save(function(err)
					{
						PaymentsProtocol.startPaymentChannel(invoice, clientSocketId, function(invoice)
							{
								// payment channel created, end create-invoice response.

								res.send(JSON.stringify({
									status: "ok",
									item: {
										network: currentNetwork,
										qrData: invoice.getQRData(),
										invoice: invoice
									}
								}));
							});
					});

				return false;
			}
			else if (err) {
				// error mode
				var errorMessage = "Error occured on NEMPaymentChannel update: " + err;

				serverLog(req, errorMessage, "ERROR");
				return res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}

			if (disableChannel === true) {
				res.send(JSON.stringify({
					status: "ok",
					item: {
						network: currentNetwork,
						qrData: invoice.getQRData(),
						invoice: invoice
					}
				}));
			}
			else {

				// update mode, invoice already exists, create payment channel proxy

				PaymentsProtocol.startPaymentChannel(invoice, clientSocketId, function(invoice)
					{
						// payment channel created, end create-invoice response.

						res.send(JSON.stringify({
							status: "ok",
							item: {
								network: currentNetwork,
								qrData: invoice.getQRData(),
								invoice: invoice
							}
						}));
					});
			}
		});
	});

app.get("/api/v1/credits/history", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var payer = req.query.payer ? req.query.payer : undefined;
		if (! payer.length || dataLayer.isApplicationWallet(payer))
			// cannot be one of the application wallets
			return res.send(JSON.stringify({"status": "error", "message": "Invalid value for field `payer`."}));

		dataLayer.NEMPaymentChannel.find({
			payerXEM: payer,
			status: {$in: ["not_paid", "expired", "unconfirmed", "paid_partly", "paid"]}
		}, function(err, invoices)
		{
			if (err) {
				var errorMessage = "Error occured on /credits/history: " + err;
				serverLog(req, errorMessage, "ERROR");
				return res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}

			// return list of invoices
			var invoicesHistory = [];
			if (invoices && invoices.length) {
				for (var i = 0; i < invoices.length; i++) {
					var currentInvoice = invoices[i];
					var statusLabelClass = "label-default";
					var statusLabelIcon  = "glyphicon glyphicon-time";

					if (currentInvoice.isPaid) {
						statusLabelClass = "label-success";
						statusLabelIcon  = "glyphicon glyphicon-ok";
					}
					else if (currentInvoice.status == "paid_partly") {
						statusLabelClass = "label-info";
						statusLabelIcon  = "glyphicon glyphicon-download-alt";
					}

					var fmtCreatedAt = new Date(currentInvoice.createdAt).toISOString().replace(/T/, ' ').replace(/\..+/, '');
					var fmtUpdatedAt = new Date(currentInvoice.createdAt).toISOString().replace(/T/, ' ').replace(/\..+/, '');

					invoicesHistory.push({
						number: currentInvoice.number,
						recipient: currentInvoice.recipientXEM,
						truncRecipient: currentInvoice.getTruncatedRecipient(),
						amount: (currentInvoice.amount / Math.pow(10, 6)),
						amountPaid: (currentInvoice.amountPaid / Math.pow(10, 6)),
						status: currentInvoice.status,
						createdAt: fmtCreatedAt,
						updatedAt: fmtUpdatedAt,
						statusLabelClass: statusLabelClass,
						statusLabelIcon: statusLabelIcon
					});
				}
			}

			res.send(JSON.stringify({data: invoicesHistory}));
		});
	});

app.get("/api/v1/credits/remaining", function(req, res)
	{
		res.setHeader('Content-Type', 'application/json');

		var payer = req.query.payer ? req.query.payer : undefined;
		if (! payer.length || dataLayer.isApplicationWallet(payer))
			// cannot be one of the application wallets
			return res.send(JSON.stringify({"status": "error", "message": "Invalid value for field `payer`."}));

		// fetch an existing NEMGamer entry by XEM address, this
		dataLayer.NEMGamer.findOne({"xem": payer}, function(err, player)
		{
			if (err || ! player) {
				// error mode
				var errorMessage = "Error occured on NEMGamer READ: " + err;

				serverLog(req, errorMessage, "ERROR");
				return res.send(JSON.stringify({"status": "error", "message": errorMessage}));
			}

			chainDataLayer.fetchHeartsByGamer(player, function(creditsDetails)
			{
				res.send(JSON.stringify({
					"status": "ok",
					"item": creditsDetails.countHearts
				}));
			});
		});
	});

/**
 * Socket.IO RoomManager implementation
 *
 * The following code block defines Socket.IO room
 * event listeners and configures the WebSocket
 * connections for Multiplayer features.
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
 * 	- notify
 *
 * @link https://github.com/dubzzz/js-pacman
 * @link https://github.com/pacNEM/evias
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

	// notify about any in-room changes
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
		var network    = chainDataLayer.getNetwork();
		var blockchain = network.isTest ? "Testnet Blockchain" : network.isMijin ? "Mijin Private Blockchain" : "NEM Mainnet Public Blockchain";
		var vendor 		= chainDataLayer.getVendorWallet();
		var application = chainDataLayer.getPublicWallet();
		var namespace   = chainDataLayer.getNamespace();

		console.log("------------------------------------------------------------------------");
		console.log("--                       PacNEM Blockchain DAG                        --");
		console.log("--                                                                    --");
		console.log("--   Decentralized Autonomous Game project using the NEM Blockchain   --")
		console.log("------------------------------------------------------------------------");
		console.log("-");
		console.log("- PacNEM Game Server listening on Port %d in %s mode", this.address().port, app.settings.env);
		console.log("- PacNEM Game is using blockchain: " + blockchain);
		console.log("- PacNEM Vendor Wallet is: " + vendor);
		console.log("- PacNEM Application Wallet is: " + application);
		console.log("- PacNEM is using Namespace: " + namespace);
		console.log("-")
		console.log("------------------------------------------------------------------------");
	});
