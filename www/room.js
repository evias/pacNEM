(function() {

var assert = require('assert');

var pc = require('./pacman.js'),
	Game = pc.Game;

var Room = function(io, manager) {
	assert(io);
	assert(manager);

	Room.STATUS_JOIN = 0;
	Room.STATUS_WAIT = 1;
	Room.STATUS_PLAY = 2;

	Room.WAIT_TIME_MS = 10000;

	Room.MAX_NUM_PLAYERS = 4;
	
	var io = io;
	var self = this;
	var manager_ = manager;
	
	var status_ = Room.STATUS_JOIN;
	var members_ = new Array();
	var game_ = undefined;
	var timeout_run_ = undefined;

	// Serialize current object for JSON export
	// @return dictionary representing the room
	this.toDictionary = function() {
		return {
				'status': status_ == Room.STATUS_JOIN
					? 'join'
					: (status_ == Room.STATUS_WAIT
						? 'wait'
						: 'play'),
				'users': members_,
				'is_full': self.isFull(),
		};
	};

	// Does the Room contain members?
	// @return true if the room does not have any members
	this.isEmpty = function() {
		return members_.length == 0;
	};

	// Does the room is fully populated?
	// @return true if the room is full
	this.isFull = function() {
		return members_.length == Room.MAX_NUM_PLAYERS;
	};
	
	// Instantiate a Game
	// Launch the game session
	var realRunGame = function() {
		assert.equal(status_, Room.STATUS_WAIT);
		assert(members_.length);
		
		status_ = Room.STATUS_PLAY;
		game_ = new Game(io, members_[0]);
		game_.refresh();

		manager.notifyChanges();
	};

	// Run a new game session
	// The game is not started immediately and can still be canceled by other players of the room
	// during Room.WAIT_TIME_MS ms
	// @warning makes a call to manager.notifyChanges
	// 			please keep in mind to keep a stable state for manager when calling this method
	this.runGame = function() {
		assert.equal(status_, Room.STATUS_JOIN);
		assert(members_.length);
		
		status_ = Room.STATUS_WAIT;
		timeout_run_ = setTimeout(realRunGame, Room.WAIT_TIME_MS);

		manager.notifyChanges();
	};
	
	// Cancel the Game (before it started)
	// @warning makes a call to manager.notifyChanges
	// 			please keep in mind to keep a stable state for manager when calling this method
	this.cancelGame = function() {
		assert.equal(status_, Room.STATUS_WAIT);
		assert(timeout_run_);
		
		clearTimeout(timeout_run_);
		status_ = Room.STATUS_JOIN;

		manager.notifyChanges();
	};
	
	// Transfer the start message directly towards the Game
	this.startGame = function(sid) {
		assert.equal(status_, Room.STATUS_PLAY);
		assert.notEqual(members_.indexOf(sid), -1);
		assert(game_);

		game_.start();
	};

	// Add a player to the Room (if and only if the room is not already full)
	// Throw an assert if the player if already in the room
	// @return true if the player was successfully added
	this.join = function(sid) {
		assert.equal(status_, Room.STATUS_JOIN);
		assert.equal(members_.indexOf(sid), -1);

		if (self.isFull()) {
			return false;
		}

		members_.push(sid);
		return true;
	};

	// Remove a player from the room
	this.leave = function(sid) {
		assert.notEqual(status_, Room.STATUS_PLAY); //TODO remove and kill the game
		var id = members_.indexOf(sid);
		assert.notEqual(id, -1);

		if (status_ == Room.STATUS_WAIT) {
			self.cancelGame();
		}
		members_.splice(id, 1);
	};

	// Send arrows to the game
	this.receiveKeyboard = function(sid, arrow) {
		assert.notEqual(members_.indexOf(sid), -1);

		if (status_ == Room.STATUS_PLAY) {
			game_.setPacmanDirection(arrow);
		}
	};
};

module.exports.Room = Room;
module.exports.LEFT = pc.LEFT;
module.exports.RIGHT = pc.RIGHT;
module.exports.UP = pc.UP;
module.exports.DOWN = pc.DOWN;
}());

