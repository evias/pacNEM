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

	/**
	 * This method saves the player details and will issue a check on the blockchain
	 * for available Game Credits.
	 * 
	 * The 3rd parameter `validateHeartsPerBlockchain` defines whether the saving 
	 * process should validate the Blockchain Available Game Credits or if this 
	 * was already done.
	 * 
	 * @param 	{object} 	details
	 * @param	{Function} 	callback
	 * @param 	{boolean}	validateHeartsPerBlockchain
	 */
	this.storeSession = function(details, callback, validateHeartsPerBlockchain = true)
	{
		this.jquery_.ajax({
			url: "/api/v1/sessions/store",
			type: "POST",
			dataType: "json",
			data: extendObj(details, {validateHearts: validateHeartsPerBlockchain ? 1 : 0}),
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

	/**
	 * This method reads session details with the given address and
	 * username in the `details` object.
	 * 
	 * @param 	{object} 	details
	 * @param	{Function} 	callback
	 */
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

	/**
	 * This method read the Scores from the PacNEM API
	 * and renders the `scores-container` partial view
	 * when the AJAX request is done.
	 * 
	 * @param 	{object} 	details
	 * @param	{Function} 	callback
	 */
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

	/**
	 * This method will read a random sponsor from the PacNEM API.
	 * 
	 * This method is used when the game needs a random sponsor to 
	 * display details.
	 * 
	 * @param	{Function} 	callback
	 */
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

	/**
	 * This method reads or creates an Invoice given the details
	 * provided. If there is currently an open invoice for the given
	 * player details, it will be returned by the PacNEM API. If not,
	 * a new one will be created so that the Player can buy Game Credits.
	 * 
	 * @param 	{object} 	player 		Should contain value for `address`
	 * @param 	{string} 	socketId
	 * @param 	{string} 	invoiceNum
	 * @param	{Function} 	callback
	 */
	this.getInvoice = function(player, socketId, invoiceNumber, callback)
	{
		var numSuffix = invoiceNumber && invoiceNumber.length ? "&num=" + encodeURIComponent(invoiceNumber) : "";
		var chanSuffix = invoiceNumber && invoiceNumber.length ? "&chan=0" : "";

		$.ajax({
	        url: "/api/v1/credits/buy?payer=" + player.address + "&usid=" + socketId + numSuffix + chanSuffix,
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

	/**
	 * This method reads a given invoice's status.
	 * 
	 * The `invoiceNum` parameter is used to load the Invoice. You must
	 * also provide a `player` object containing `address` and a `socketId`
	 * 
	 * @param 	{object} 	player 		Should contain value for `address`
	 * @param 	{string} 	socketId
	 * @param 	{string} 	invoiceNum
	 * @param	{Function} 	callback
	 */
	this.checkInvoiceStatus = function(player, socketId, invoiceNum, callback)
	{
		var numberSuffix = invoiceNum && invoiceNum.length ? "&number=" + encodeURIComponent(invoiceNum) : "";

		$.ajax({
	        url: "/api/v1/credits/history?payer=" + player.address + "&usid=" + socketId + numberSuffix,
	        type: "GET",
	        success: function(res)
	        {
	            if (res.status == "error") {
	                console.log("Error occured on Invoice History: " + res.message);
	                return false;
	            }
	            else if (res.status == "ok") {
					return callback(res.item || res.data.pop());
	            }
	        }
	    });
	};

	/**
	 * This method reads the Game Credits History for
	 * the given `player` address.
	 *
	 * @param 	{object} 	player 		Should contain value for `address`
	 * @param	{Function} 	callback
	 */
	this.fetchPurchaseHistory = function(player, callback)
	{
		var self = this;
		self.jquery_.ajax({
			url: "/api/v1/credits/history?payer=" + player.address,
			type: "GET",
			dataType: "json",
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
				var history = response.data;

				self.template_.render("invoice-history-container", function(compileWith)
				{
					$("#pacnem-invoice-history-wrapper").html(compileWith(response));
					callback(history);
				});
			}
		});
	};

	/**
	 * This method reads the remaining Game Credits from
	 * the PacNEM API.
	 * 
	 * @param 	{object} 	player 		Should contain value for `address`
	 * @param	{Function} 	callback
	 */
	this.fetchRemainingHearts = function(player, callback)
	{
		var self = this;
		self.jquery_.ajax({
			url: "/api/v1/credits/remaining?payer=" + player.address,
			type: "GET",
			dataType: "json",
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
	            if (response.status == "error") {
	                console.log("Error occured on Credits Read: " + response.message);
	                return false;
	            }
	            else if (response.status == "ok") {
	            	return callback(response.item);
	            }
			}
		});
	};

	/**
	 * This method reads the PacNEM Lounge Informations.
	 *
	 * @param 	{object} 	player 		Should contain value for `address`
	 * @param	{Function} 	callback
	 */
	this.fetchLoungeInformations = function(player, callback)
	{
		var self = this;
		self.jquery_.ajax({
			url: "/api/v1/lounge/get?player=" + player.address,
			type: "GET",
			dataType: "json",
			beforeSend: function(req) {
				if (req && req.overrideMimeType)
					req.overrideMimeType("application/json;charset=UTF-8");
			},
			success: function(response) {
				var loungeData = response.data;

				self.template_.render("lounge-container", function(compileWith)
				{
					$("#pacnem-lounge-wrapper").html(compileWith(response));
					return callback(loungeData);
				});
			}
		});
	};
};
