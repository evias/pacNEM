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
 * @link       https://github.com/dubzzz/js-pacman
 */

(function() {

var assert = require('assert');
var Room = require('./room.js').Room;

var RoomManager = function(io) 
{
	assert(io);

	var io = io;
	var self = this;
	var start_time_ = Date.now();

	var last_room_id_ = 0;

	var map_member_username_ = {};
	var map_member_address_  = {};
	var map_member_roomid_   = {};
	var map_id_rooms_ = {};

	// Notify RoomManager members of changes in Room
	// @param sid is optional
	this.notifyChanges = function(sid) {
		var rooms = new Array();
		for (var room_id in map_id_rooms_) {
			var dict = map_id_rooms_[room_id].toDictionary();
			dict['id'] = room_id;
			rooms.push(dict);
		}
		var sid_list = sid === undefined ? Object.keys(map_member_roomid_) : [sid];
		for (var i = 0 ; i < sid_list.length ; i++) {
			io.sockets.to(sid_list[i]).emit('rooms_update', JSON.stringify({
				'sid': sid_list[i],
				'users': map_member_username_,
				'addresses': map_member_address_,
				'rooms': rooms,
				'time': Date.now() - start_time_,
			}));
		}
	};

	// Register a new user to the RoomManager
	this.register = function(sid) {
		assert(! map_member_roomid_.hasOwnProperty(sid));
		assert(! map_member_username_.hasOwnProperty(sid));
		assert(! map_member_address_.hasOwnProperty(sid));

		map_member_roomid_[sid] = undefined; // no room has been defined so far
		map_member_username_[sid] = undefined;
		map_member_address_[sid] = undefined;
		self.notifyChanges(sid);
	};

	// Change the username for sid
	this.changeUsername = function(sid, details) {
		assert(map_member_roomid_.hasOwnProperty(sid));
		assert(map_member_username_.hasOwnProperty(sid));
		assert(map_member_address_.hasOwnProperty(sid));
		assert(details.hasOwnProperty("username"));
		assert(details.hasOwnProperty("address"));

		map_member_username_[sid] = details.username.substr(0, 20);
		map_member_address_[sid]  = details.address;
		if (map_member_roomid_[sid] !== undefined) {
			self.notifyChanges();
		}
	};

	// @return Room instance associated to the user (if it exists)
	this.getRoom = function(sid) {
		assert(map_member_roomid_.hasOwnProperty(sid));
		var room_id = map_member_roomid_[sid];
		if (room_id === undefined) {
			return undefined;
		}
		assert(map_id_rooms_.hasOwnProperty(room_id));

		return map_id_rooms_[room_id];
	};

	// Join a room
	this.joinRoom = function(sid, room_id, details) {
		assert(map_member_roomid_.hasOwnProperty(sid));
		assert.strictEqual(map_member_roomid_[sid], undefined);
		assert(map_id_rooms_.hasOwnProperty(room_id));

		if (map_id_rooms_[room_id].join(sid, details)) {
			map_member_roomid_[sid] = room_id;
			self.notifyChanges();
		}
	};

	// Create a new room
	this.createRoom = function(sid, details) {
		assert(map_member_roomid_.hasOwnProperty(sid));

		var members = {};
		members[sid] = details;

		var room_id = last_room_id_++;
		var room = new Room(io, self, members);
		var hasJoined = room.join(sid, details);
		assert(hasJoined);
	   	map_member_roomid_[sid] = room_id;
		map_id_rooms_[room_id] = room;
		self.notifyChanges();
	};

	// Leave room
	this.leaveRoom = function(sid) {
		assert(map_member_roomid_.hasOwnProperty(sid));
		assert.notStrictEqual(map_member_roomid_[sid], undefined);
		assert(map_id_rooms_.hasOwnProperty(map_member_roomid_[sid]));

		var room_id = map_member_roomid_[sid];
		var room = map_id_rooms_[room_id];
		room.leave(sid);
		if (room.isEmpty()) {
			delete map_id_rooms_[room_id];
		}
		map_member_roomid_[sid] = undefined;
		self.notifyChanges();
	};

	// Acknowledge a room membership
	this.ackRoomMember = function(sid, rid)
	{
		assert(map_member_roomid_.hasOwnProperty(sid));

		var room_id = rid;
		var room = new Room(io, self);
		var hasJoined = room.join(sid);
		assert(hasJoined);

		map_member_roomid_[sid] = rid;
		map_id_rooms_[room_id] = room;
		self.notifyChanges();
	};

	// User has left the manager
	this.disconnect = function(sid) {
		assert(map_member_roomid_.hasOwnProperty(sid));
		assert(map_member_username_.hasOwnProperty(sid));

		if (map_member_roomid_[sid] !== undefined) {
			self.leaveRoom(sid);
		}
		delete map_member_roomid_[sid];
		delete map_member_username_[sid];
		delete map_member_address_[sid];
	};

	this.toDict = function(includeAddresses = false)
	{
		var players = {};
		for (var sock in map_member_username_) {
			assert(map_member_address_.hasOwnProperty(sock));

			var player = {"username": map_member_username_[sock]};

			if (map_member_roomid_.hasOwnProperty(sock))
				// user is in room
				player["room"] = map_member_roomid_[sock];

			if (includeAddresses === true)
				player["address"] = map_member_address_[sock];

			players[sock] = player;
		}

		var dict = {
			"rooms": map_id_rooms_,
			"players": players
		};

		return dict;
	};
};

module.exports.RoomManager = RoomManager;
}());

