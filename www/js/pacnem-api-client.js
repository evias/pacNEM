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

/**
 * class GameAPI is used for in-game assets management
 * and storage.
 *
 * Sponsoring / Pay per Play is handled with the MongoDB
 * database.
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var GameAPI = function(config, socket, controller, $, jQFileTemplate)
{
    this.config_ = config;
	this.socket_ = socket;
	this.ctrl_   = controller;
	this.jquery_ = $;
	this.template_ = jQFileTemplate;

	this.getSocket = function()
	{
		return this.socket_;
	};

	this.storeSession = function(details, callback)
	{
		this.jquery_.ajax({
			url: "/api/v1/sessions/store",
			type: "POST",
			dataType: "json",
			data: details,
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
				// var player = response.item
				callback(response);
			}
		});
	};

	this.getSession = function(details, callback)
	{
		this.jquery_.ajax({
			url: "/api/v1/sessions/get?address=" + details.xem.replace(/\-/g, "") + "&username=" + encodeURIComponent(details.username),
			type: "GET",
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
				// var session = response.item
				callback(response);
			}
		});
	};

	this.fetchScores = function(callback)
	{
		var self = this;
		self.jquery_.ajax({
			url: "/api/v1/scores",
			type: "GET",
			dataType: "json",
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
				var scores = response.data;

				self.template_.render("scores-container", function(compileWith)
				{
					$("#pacnem-scores-wrapper").html(compileWith(response));
					callback(scores);
				});
			}
		});
	};

	this.getRandomSponsor = function(callback)
	{
		var self = this;
		self.jquery_.ajax({
			url: "/api/v1/sponsors/random",
			type: "GET",
			dataType: "json",
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
				var sponsor = response.item;
				callback(sponsor);
			}
		});
	};

	this.createInvoice = function(player, socketId, callback)
	{
		$.ajax({
	        url: "/api/v1/credits/buy?payer=" + player.address + "&usid=" + socketId,
	        type: "GET",
	        success: function(res)
	        {
	            if (res.status == "error") {
	                console.log("Error occured on Invoice creation: " + res.message);
	                return false;
	            }
	            else if (res.status == "ok") {
	            	return callback(res.item);
	            }
	        }
	    });
	};
};
