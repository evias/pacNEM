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

(function() {

var config = require("config"),
    path = require('path');

var __smartfilename = path.basename(__filename);
var NEMBot_for_pacNEM = {
    "paymentBot": {host: process.env["PAYMENT_BOT_HOST"] || config.get("pacnem.bots.paymentBot")}
};

var botChannelSockets_ = {};

/**
 * class PaymentsCore provides a business layer for
 * payments management features. (Invoices, Payment updates, etc.)
 *
 * @author  Grégory Saive <greg@evias.be> (https://github.com/evias)
 */
var PaymentsCore = function(io, logger, chainDataLayer, dataLayer)
{
    this.socketIO_ = io;
    this.blockchain_ = chainDataLayer;
    this.db_ = dataLayer;

    this.logger_ = logger;

    /**
     * The startPaymentChannel function is used to open the communication
     * channel between this backend and the NEMBot responsible for Payment
     * Processing of the pacNEM game invoices.
     *
     * This function will emit `pacnem_payment_status_update` to `clientSocketId`
     * in case the NEMBot sends a payment update to this backend (through
     * the previously created communication channel).
     *
     * @param  {NEMPaymentChannel}   invoice
     * @param  {string}   clientSocketId  - Frontend SocketIO socket ID (Frontend to Backend communication)
     * @param  {Function} callback       [description]
     * @return {void}
     */
    this.startPaymentChannel = function(invoice, clientSocketId, callback)
    {
        var self = this;
        // Now the BACKEND will subscribe to a direct channel to the NEMBot responsible
        // for Payment Reception Listening. Here we will link the BACKEND SOCKET ID
        // with the CLIENT SOCKET ID. The client should never request directly to the
        // NEMBot, so we proxy the whole event chain to avoid this.

        // First we emit a `nembot_open_payment_channel` with the given invoice NUMBER and payer XEM address.
        // Then we register a listener on `nembot_payment_status_update` which will be triggered when a
        // Transaction with MESSAGE being the invoiceNumber OR SENDER PUBLIC KEY being the payerXEM, is received
        // (/unconfirmed &  /transactions). When the transaction is included in a block, another event will be
        // will be triggered (`nembot_payment_status_update` again) with status `completed`, this time.
        // Only the second call with completed status should be trusted as a paid amount for the invoice.

        var socket = require("socket.io-client");
        var channelSocket = socket.connect(NEMBot_for_pacNEM.paymentBot.host);
        var channelParams = {
            message: invoice.number,
            sender: invoice.payerXEM,
            recipient: invoice.recipientXEM,
            amount: invoice.amount,
            maxDuration: 5 * 60 * 1000
        };

        self.logger_.info(__smartfilename, __line, '[BOT] open_channel(' + JSON.stringify(channelParams) + ') with NEMBot host: ' + NEMBot_for_pacNEM.paymentBot.host);
        channelSocket.emit("nembot_open_payment_channel", JSON.stringify(channelParams));

        // configure payment status update event FORWARDING (comes from NEMBot and forwards to Frontend)
        channelSocket.on("nembot_payment_status_update", function(rawdata)
            {
                self.logger_.info(__smartfilename, __line, '[' + channelSocket.id + '] [BOT] nembot_payment_status_update(' + rawdata + ')');

                var data = JSON.parse(rawdata);

                // forward to client..
                var clientData = {
                    status: data.status,
                    paymentData: data
                };
                io.sockets.to(clientSocketId)
                  .emit("pacnem_payment_status_update", JSON.stringify(clientData));

                // do the UI magic
                self.storeInvoiceStatusUpdate(data);
            });

        // save new backend socket ID to invoice.
        if (! invoice.socketIds || ! invoice.socketIds.length)
            invoice.socketIds = [channelSocket.id];
        else {
            var sockets = invoice.socketIds;
            sockets.push(channelSocket.id);

            invoice.socketIds = sockets;
        }

        if (! botChannelSockets_.hasOwnProperty(invoice.number))
            botChannelSockets_[invoice.number] = [];

        botChannelSockets_[invoice.number].push({socket: channelSocket, clientId: clientSocketId});

        invoice.save(function(err)
            {
                callback(invoice);
            });
    };

    /**
     * This function saves an invoice status update to the
     * database. It helps keeping track of the payment states.
     *
     * When the data is saved to the database, a custom callback
     * will be executed to send a transaction using our pacNEM
     * Multi Signature Account so that the the buyer receives
     * the bought evias.pacnem:heart Mosaics.
     *
     * @param  {object} data
     * @return {void}
     */
    this.storeInvoiceStatusUpdate = function(data)
    {
        var self = this;
        var invoiceQuery = {};

        if (typeof data.invoice != 'undefined' && data.invoice.length) {
            // Player sent message along with transaction.
            invoiceQuery["number"] = data.invoice;
        }
        else if (typeof data.sender != 'undefined' && data.sender.length) {
            // Player didn't send a Message with the transaction..
            invoiceQuery["payerXEM"] = data.sender;
        }

        // find invoice and update status and amounts
        self.db_.NEMPaymentChannel.findOne(invoiceQuery, function(err, invoice)
        {
            if (! err && invoice) {
                invoice.status = data.status;

                if (data.status == "unconfirmed")
                    invoice.amountUnconfirmed = data.amountUnconfirmed;
                else if (data.amountPaid)
                    invoice.amountPaid = data.amountPaid;

                if (data.status == "paid") {
                    invoice.isPaid = true;
                    invoice.paidAt = new Date().valueOf();
                }

                invoice.save(function(err)
                {
                    if (err) {
                        self.logger_.error(__smartfilename, __line, '[ERROR] Invoice status update error: ' + err);
                        return false;
                    }

                    if (data.status == "paid" && invoice.isPaid === true) {
                        self.closePaymentChannel(invoice);
                    }
                });
            }
        });
    }

    this.closePaymentChannel = function(paymentChannel)
    {
        var self = this;
        self.blockchain_.sendHeartsForPayment(paymentChannel, function(paymentChannel)
        {
            // forward "DONE PAYMENT" to client..
            var clientData = {
                status: data.status,
                number: paymentChannel.number
            };

            if (botChannelSockets_.hasOwnProperty(paymentChannel.number)) {
                //var clientSocketId = botChannelSockets_[paymentChannel.number].clientId;
                var socketsForPayment = botChannelSockets_[paymentChannel.number];

                for (var i in socketsForPayment)
                    self.socketIO_.sockets.to(socketsForPayments[i].clientId)
                        .emit("pacnem_payment_success", JSON.stringify(clientData));
            }
        });
    };

};

module.exports.PaymentsCore = PaymentsCore;
}());
