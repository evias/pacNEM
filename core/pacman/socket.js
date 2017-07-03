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
 * @author     Grégory Saive <greg@evias.be> (https://github.com/evias)
 * @contributor Nicolas Dubien (https://github.com/dubzzz)
 * @license    MIT License
 * @copyright  (c) 2017, Grégory Saive <greg@evias.be>
 * @link       https://github.com/evias/pacNEM
 */
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

(function() {

    var config = require("config"),
        path = require('path'),
        __room = require('../room/room.js'),
        Room = __room.Room,
        RoomManager = require('../room/room_manager.js').RoomManager;

    var __smartfilename = path.basename(__filename);

    /**
     * class PacNEMProtocol provides a business layer for
     * Websockets management of Rooms and the Room Manager
     * responsible for the Frontend rooms.
     *
     * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
     */
    var PacNEMProtocol = function(io, logger, chainDataLayer, dataLayer, hallOfFame, sponsorEngine) {
        this.socketIO_ = io;
        this.logger_ = logger;
        this.blockchain_ = chainDataLayer;
        this.db_ = dataLayer;
        this.hallOfFame_ = hallOfFame;
        this.sponsorEngine_ = sponsorEngine;
        this.roomManager_ = new RoomManager(io);

        /**
         * Getter for the `roomManager_` object property
         * 
         * @return  {RoomManager}
         */
        this.getRoomManager = function() {
            return this.roomManager_;
        };

        /**
         * The initSockets method is called internally to start listening
         * for Websockets Subscriptions for the communication between
         * Frontend and Backend (PacNEM Game to PacNEM Server).
         * 
         * These websocket channels are also responsible for Rooms and management
         * of Rooms with the object property `roomManager_`.
         * 
         * There should always be only one instance of the PacNEMProtocol class for
         * Websockets but having multiple servers should also work.
         */
        this.initSockets_ = function() {
            var self = this;

            self.socketIO_
                .sockets.on('connection', function(socket) {
                    self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] ()');
                    self.roomManager_.register(socket.id);

                    // Unregister the socket from the underlying RoomManager
                    socket.on('disconnect', function() {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] ~()');
                        self.roomManager_.disconnect(socket.id);
                    });

                    // Rename the user
                    socket.on('change_username', function(details) {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] change_username(' + details + ')');

                        var parsed = JSON.parse(details);
                        self.roomManager_.changeUsername(socket.id, parsed);
                    });

                    // Join an existing room
                    socket.on('join_room', function(json) {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] join_room(' + json + ')');

                        var parsed = JSON.parse(json);
                        self.roomManager_.joinRoom(socket.id, parsed.room_id, parsed.details);
                    });

                    // Create a new room
                    socket.on('create_room', function(details) {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] create_room(' + details + ')');

                        var parsed = JSON.parse(details);
                        self.roomManager_.createRoom(socket.id, parsed);
                    });

                    // Leave a room
                    socket.on('leave_room', function() {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] leave_room()');
                        self.roomManager_.leaveRoom(socket.id);
                    });

                    // Acknowledge room membership
                    socket.on('ack_room', function(room_id) {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] ack_room(' + room_id + ')');
                        self.roomManager_.ackRoomMember(socket.id, room_id);
                    });

                    // Ask to launch the game inside the room
                    // The game will not start immediately and other members can cancel its launch
                    socket.on('run_game', function() {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] run_game()');
                        var room = self.roomManager_.getRoom(socket.id);

                        if (room) {
                            room.runGame();
                        }
                    });

                    // When the end_of_game event is pushed, potential hall of famer will
                    // be recognized and stored in the database.
                    // This event listener will also trigger the BURNING of evias.pacnem:heart
                    // Game Credits. There is no way around triggering this event so this should
                    // be a fairly well chosen endpoint for burned game credits.
                    socket.on("end_of_game", function(rawdata) {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] end_of_game(' + rawdata + ')');

                        var details = JSON.parse(rawdata);
                        if (typeof details.pacmans == 'undefined')
                            return false;

                        var addresses = [];
                        for (var i in details.pacmans)
                            addresses.push(details.pacmans[i].address);

                        if (!addresses.length)
                            return false;

                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] burn_credits([' + addresses.join(", ") + '])');

                        // load gamers by address
                        dataLayer.NEMGamer.find({ xem: { $in: addresses } }, function(err, gamers) {
                            if (err || !gamers || !gamers.length) {
                                //XXX should never happen, add error log, someone sent an EMPTY end_of_game event
                                return false;
                            }

                            self.blockchain_.processGameCreditsBurning(gamers);
                            self.hallOfFame_.processGameScores(details.pacmans);
                        });
                    });

                    // Cancel game
                    socket.on('cancel_game', function() {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] cancel_game()');
                        var room = self.roomManager_.getRoom(socket.id);
                        if (!room) {
                            self.logger_.warn("DEBUG", "[PLAY-SOCKETS]", 'Room is not defined for ' + socket.id);
                            return;
                        }
                        room.cancelGame();
                    });

                    // Start the game
                    socket.on('start', function() {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] start()');
                        var room = self.roomManager_.getRoom(socket.id);
                        if (!room) {
                            self.logger_.warn("DEBUG", "[PLAY-SOCKETS]", 'Room is not defined for ' + socket.id);
                            return;
                        }
                        room.startGame(socket.id);
                    });

                    // Update the direction of the player
                    socket.on('keydown', function(keycode) {
                        // [DEBUG] self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] keydown(' + keycode + ')');

                        var room = self.roomManager_.getRoom(socket.id);
                        if (!room) {
                            return;
                        }

                        var keyMap = {
                            37: __room.LEFT,
                            38: __room.UP,
                            39: __room.RIGHT,
                            40: __room.DOWN
                        };

                        if (keyMap.hasOwnProperty(keycode))
                            room.receiveKeyboard(socket.id, keyMap[keycode]);
                    });

                    // notify about any in-room changes
                    socket.on("notify", function() {
                        self.logger_.info("DEBUG", "[PLAY-SOCKETS]", '[' + socket.id + '] notify()');
                        self.roomManager_.notifyChanges(socket.id);
                    });
                });
        };

        var self = this; {
            self.initSockets_();
        }
    };

    module.exports.PacNEMProtocol = PacNEMProtocol;
}());